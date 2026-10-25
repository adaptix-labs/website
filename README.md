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
5. **Resend.** The DNS records Resend requires are in `infra/main.tf`; click Verify in Resend once they are applied. Create a sending-only API key and add it as the GitHub secret `RESEND_API_KEY`; the deploy workflow writes it to the Worker. Store the address that receives enquiry notifications as a secret: `npx wrangler secret put ENQUIRY_TO` (use `hello@adaptix.uk`, so the private inbox appears nowhere). `ENQUIRY_FROM` in `wrangler.jsonc` is the sending address on the domain.
6. **IP hash salt.** `openssl rand -hex 32 | npx wrangler secret put IP_HASH_SALT`.
7. **Access for /admin** is applied by OpenTofu (the Zero Trust team domain is keyvault.cloudflareaccess.com, set once in the dashboard). `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` in `wrangler.jsonc` come from the apply outputs. The administrators come from the GitHub secret `ADMIN_EMAILS` (comma-separated), written to the Worker by the deploy workflow. Until all three are set, `/admin` returns 503.
8. **GitHub secrets.** Add `CLOUDFLARE_API_TOKEN` (Workers Scripts, D1, Workers Routes and Zone DNS edit) and `CLOUDFLARE_ACCOUNT_ID` to the repository. Pushes to `main` then run migrations and deploy.

`workers_dev` is disabled, so the Worker is reachable only on the custom domains. The admin page verifies the Access token itself, so a request that somehow bypasses Access is still refused.

## Infrastructure as code

Everything around the Worker that lives in the Cloudflare account is declared in `infra/` with OpenTofu and the Cloudflare provider: the D1 database, the Turnstile widget, Email Routing (hello@ forwarding and the drop catch-all), Resend's DNS records, and the Access application and policy for `/admin`. The Worker itself, its bindings, custom domains, cron and secrets stay with Wrangler so each tool owns distinct things.

Changes flow through GitHub Actions (`.github/workflows/infra.yml`): a pull request touching `infra/` gets a `tofu plan` posted as a comment; merging to `main` runs `tofu apply` of that plan in the `infrastructure` environment, which is configured to require a manual approval. State is kept in the private R2 bucket `adaptix-terraform-state`. Personal data never enters git: the destination inbox and the list of people allowed into `/admin` are repository secrets passed as `TF_VAR_*`.

Repository secrets the workflow needs:

| Secret | Value |
| --- | --- |
| `TF_CLOUDFLARE_API_TOKEN` | Custom token: Account → D1, Turnstile, Email Routing Addresses, Access: Apps and Policies (Edit), Access: Organizations, Identity Providers, and Groups (Edit), Account Settings (Read); Zone (adaptix.uk) → Zone Read, Zone Settings Edit, Zone WAF Edit, DNS Edit, Email Routing Rules Edit |
| `CLOUDFLARE_ACCOUNT_ID` | Shared with the deploy workflow |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 account API token with Object Read & Write on the state bucket |
| `TF_VAR_ENQUIRY_DESTINATION_EMAIL` | The private inbox hello@ forwards to |
| `ADMIN_EMAILS` | Comma-separated emails allowed to change or delete enquiries; written to the Worker on deploy |
| `RESEND_API_KEY` | Resend sending-only key for adaptix.uk; written to the Worker on deploy |
| `TF_VAR_ACCESS_ALLOWED_EMAILS` | JSON list of emails allowed into `/admin`, e.g. `["a@example.com","b@example.com"]` |

The zone id and team name are not secret and sit in the workflow file. `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.jsonc` come from the apply outputs `access_team_domain` and `access_aud`.

Running locally is still possible (`brew install opentofu`, copy the `.example` files in `infra/` and fill them in, `tofu init -backend-config=backend.hcl`), but the pipeline is the normal path.

## Changing who can use the admin page

Both lists are GitHub repository secrets, so no local tooling is needed:

- **Who can sign in** is `TF_VAR_ACCESS_ALLOWED_EMAILS` (a JSON list). After editing it, run the **Infrastructure** workflow from the Actions tab; the plan shows the policy change and the apply waits for approval.
- **Who can change or delete enquiries** is `ADMIN_EMAILS` (comma-separated). After editing it, run the **Test and deploy** workflow; the deploy step writes it to the Worker.

Someone on the first list but not the second can read and export enquiries but not alter them.

## Data protection

Enquiries hold only what the form asks for plus a salted hash of the sender's IP for rate limiting. Rows are deleted after `RETENTION_DAYS`. Deleting a single enquiry on request is a button in `/admin` or one SQL statement with `wrangler d1 execute`.
