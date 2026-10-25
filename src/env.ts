export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  ENQUIRY_TO: string;
  ENQUIRY_FROM: string;
  TURNSTILE_SECRET: string;
  RESEND_API_KEY: string;
  IP_HASH_SALT: string;
}
