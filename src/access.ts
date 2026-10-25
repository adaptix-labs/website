import type { Outbound } from "./enquiry";
import type { Env } from "./env";

export interface Identity {
  email: string;
  isAdmin: boolean;
}

type JwkWithKid = JsonWebKey & { kid?: string };

const CERTS_TTL_MS = 10 * 60 * 1000;
const certsCache = new Map<string, { keys: JwkWithKid[]; fetchedAt: number }>();

export function accessConfigured(env: Pick<Env, "ACCESS_TEAM_DOMAIN" | "ACCESS_AUD">): boolean {
  return Boolean(env.ACCESS_TEAM_DOMAIN?.trim() && env.ACCESS_AUD?.trim());
}

/**
 * Verifies the JWT Cloudflare Access attaches to proxied requests. Checking it here (rather than
 * trusting the request reached us) means a request that bypasses Access, for example through a
 * workers.dev hostname, is still refused.
 */
export async function verifyAccessToken(token: string, env: Env, outbound: Outbound): Promise<Identity | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [rawHeader, rawPayload, rawSignature] = parts;

  let header: { alg?: string; kid?: string };
  let payload: { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; email?: string };
  try {
    header = JSON.parse(decodeText(rawHeader));
    payload = JSON.parse(decodeText(rawPayload));
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  if (payload.iss !== issuer) return null;
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(env.ACCESS_AUD)) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) return null;

  const jwk = await findKey(issuer, header.kid, outbound);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBytes(rawSignature),
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
  );
  if (!valid) return null;

  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!email) return null;
  return { email, isAdmin: adminEmails(env).includes(email) };
}

export function adminEmails(env: Pick<Env, "ADMIN_EMAILS">): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function findKey(issuer: string, kid: string, outbound: Outbound): Promise<JwkWithKid | undefined> {
  const cached = certsCache.get(issuer);
  const fresh = cached && Date.now() - cached.fetchedAt < CERTS_TTL_MS;
  let keys = fresh ? cached.keys : await fetchCerts(issuer, outbound);
  let key = keys.find((k) => k.kid === kid);
  if (!key && fresh) {
    // Possible key rotation: refetch once.
    keys = await fetchCerts(issuer, outbound);
    key = keys.find((k) => k.kid === kid);
  }
  return key;
}

async function fetchCerts(issuer: string, outbound: Outbound): Promise<JwkWithKid[]> {
  try {
    const res = await outbound(`${issuer}/cdn-cgi/access/certs`);
    if (!res.ok) return [];
    const body = (await res.json()) as { keys?: JwkWithKid[] };
    const keys = body.keys ?? [];
    certsCache.set(issuer, { keys, fetchedAt: Date.now() });
    return keys;
  } catch {
    return [];
  }
}

function decodeBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeText(b64url: string): string {
  return new TextDecoder().decode(decodeBytes(b64url));
}
