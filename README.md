# Adaptix website

The public site for Adaptix Educational Solutions (adaptix.uk) and its enquiry service, deployed as a single Cloudflare Worker.

- `public/` is the static site, served by the Worker as assets with security headers.
- `POST /api/enquiry` validates the contact form, checks Turnstile, stores the enquiry in D1 and emails it through Resend.
- `/admin` lists enquiries for people admitted by Cloudflare Access. Listed administrators can change status or delete.
- A nightly job deletes enquiries older than `RETENTION_DAYS` (365 by default).

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars        # Turnstile test secret, dummy Resend key
npm run migrate:local                  # create the local D1 tables
npm run dev                            # http://127.0.0.1:8787
npm test                               # Vitest, inside the Workers runtime
npm run typecheck
```

The page ships with Cloudflare's always-passing Turnstile **test** site key, so the form works locally. Email sending fails locally (dummy key) and the row records `email_status = failed`, which is expected.

## First deployment

1. **Cloudflare zone.** Add `adaptix.uk` to the Cloudflare account and point the registrar's nameservers at Cloudflare.
2. **Database, Turnstile widget, Email Routing and Access** are created by the OpenTofu configuration in `infra/` (see "Infrastructure as code" below). Paste the database id into `database_id` in `wrangler.jsonc` and the Turnstile site key into `public/index.html`.
3. **Turnstile secret.** Read the widget's secret key in the dashboard and store it: `npx wrangler secret put TURNSTILE_SECRET`.
4. **Email Routing** is applied by OpenTofu; the private inbox must click the verification link Cloudflare emails it before forwarding starts. hello@adaptix.uk is the public contact address on the page.
5. **Resend.** Verify `adaptix.uk` in Resend (two DNS records) and store the key: `npx wrangler secret put RESEND_API_KEY`. Store the address that receives enquiry notifications as a secret: `npx wrangler secret put ENQUIRY_TO` (use `hello@adaptix.uk`, so the private inbox appears nowhere). `ENQUIRY_FROM` in `wrangler.jsonc` is the sending address on the domain.
6. **IP hash salt.** `openssl rand -hex 32 | npx wrangler secret put IP_HASH_SALT`.
7. **Access for /admin** is applied by OpenTofu (choose the Zero Trust team name once in the dashboard first). Copy the `access_aud` and `access_team_domain` outputs into `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` in `wrangler.jsonc`, and put the administrators' emails in `ADMIN_EMAILS`. Until these are set, `/admin` returns 503.
8. **GitHub secrets.** Add `CLOUDFLARE_API_TOKEN` (Workers Scripts, D1, Workers Routes and Zone DNS edit) and `CLOUDFLARE_ACCOUNT_ID` to the repository. Pushes to `main` then run migrations and deploy.

`workers_dev` is disabled, so the Worker is reachable only on the custom domains. The admin page verifies the Access token itself, so a request that somehow bypasses Access is still refused.

## Infrastructure as code

Everything around the Worker that lives in the Cloudflare account is declared in `infra/` with OpenTofu and the Cloudflare provider: the D1 database, the Turnstile widget, Email Routing (hello@ forwarding and the drop catch-all), Resend's DNS records, and the Access application and policy for `/admin`. The Worker itself, its bindings, custom domains, cron and secrets stay with Wrangler so each tool owns distinct things.

Personal data never enters git: the destination inbox and the list of people allowed into `/admin` are variables set in the git-ignored `infra/terraform.tfvars`. State is kept in a private R2 bucket.

One-time setup:

```bash
brew install opentofu
cd infra
cp terraform.tfvars.example terraform.tfvars    # fill in ids, inbox, admin emails, Resend records
cp backend.hcl.example backend.hcl              # R2 endpoint and an R2 API token (Object Read & Write)
export CLOUDFLARE_API_TOKEN=...                  # the Terraform token described below
scripts/lookup-ids.sh <account_id> <zone_id>     # ids of pre-existing resources, paste into terraform.tfvars
tofu init -backend-config=backend.hcl
tofu plan                                        # first run shows imports plus the new Access resources
tofu apply
```

After the first apply, copy `access_aud` and `access_team_domain` from the outputs into `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.jsonc`, then delete `infra/imports.tf`.

The Terraform token needs: Account → D1 Edit, Turnstile Edit, Email Routing Addresses Edit, Access: Apps and Policies Edit, Account Settings Read; Zone (adaptix.uk) → Zone Read, DNS Edit, Email Routing Rules Edit. The R2 state bucket `adaptix-terraform-state` is created once by hand (it cannot sensibly manage itself). Pull requests run `tofu fmt -check` and `tofu validate`; applies are run by a person, because these resources change rarely and a CI credential able to edit Access policies would be a needless risk.

## Data protection

Enquiries hold only what the form asks for plus a salted hash of the sender's IP for rate limiting. Rows are deleted after `RETENTION_DAYS`. Deleting a single enquiry on request is a button in `/admin` or one SQL statement with `wrangler d1 execute`.
