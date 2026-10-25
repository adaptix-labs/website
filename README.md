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
2. **Database.** `npx wrangler d1 create adaptix-enquiries --location weur` and paste the printed id into `database_id` in `wrangler.jsonc`. Western Europe keeps the data in the EU.
3. **Turnstile.** Create a widget for `adaptix.uk` in the Cloudflare dashboard. Replace the test `data-sitekey` in `public/index.html` with the real site key and store the secret: `npx wrangler secret put TURNSTILE_SECRET`.
4. **Resend.** Verify `adaptix.uk` in Resend (two DNS records) and store the key: `npx wrangler secret put RESEND_API_KEY`. Set `ENQUIRY_TO` and `ENQUIRY_FROM` in `wrangler.jsonc` to the real addresses.
5. **IP hash salt.** `openssl rand -hex 32 | npx wrangler secret put IP_HASH_SALT`.
6. **Access for /admin.** In Zero Trust, add a self-hosted application for `adaptix.uk/admin` with a policy listing who may sign in. Copy the application's Audience (AUD) tag and the team domain into `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` in `wrangler.jsonc`, and put the administrators' emails in `ADMIN_EMAILS`. Until these are set, `/admin` returns 503.
7. **GitHub secrets.** Add `CLOUDFLARE_API_TOKEN` (Workers Scripts, D1, Workers Routes and Zone DNS edit) and `CLOUDFLARE_ACCOUNT_ID` to the repository. Pushes to `main` then run migrations and deploy.

`workers_dev` is disabled, so the Worker is reachable only on the custom domains. The admin page verifies the Access token itself, so a request that somehow bypasses Access is still refused.

## Data protection

Enquiries hold only what the form asks for plus a salted hash of the sender's IP for rate limiting. Rows are deleted after `RETENTION_DAYS`. Deleting a single enquiry on request is a button in `/admin` or one SQL statement with `wrangler d1 execute`.
