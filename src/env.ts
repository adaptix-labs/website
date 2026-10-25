export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ENQUIRY_TO: string;
  ENQUIRY_FROM: string;
  TURNSTILE_SECRET: string;
  RESEND_API_KEY: string;
  IP_HASH_SALT: string;
  /** Cloudflare Access team domain, e.g. adaptix.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN: string;
  /** Audience tag of the Access application protecting /admin */
  ACCESS_AUD: string;
  /** Comma-separated emails allowed to change or delete enquiries */
  ADMIN_EMAILS: string;
}
