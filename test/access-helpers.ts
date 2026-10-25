import type { Outbound } from "../src/enquiry";

const CERTS_URL = "https://adaptix.cloudflareaccess.com/cdn-cgi/access/certs";

type PublishedJwk = JsonWebKey & { kid: string; alg: string; use: string };

export interface TestKeys {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: PublishedJwk;
}

export async function generateKeys(kid = "test-key-1"): Promise<TestKeys> {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const exported = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  const publicJwk: PublishedJwk = { ...exported, kid, alg: "RS256", use: "sig" };
  return { kid, privateKey: pair.privateKey, publicJwk };
}

function b64url(bytes: ArrayBuffer | Uint8Array | string): string {
  const u8 = typeof bytes === "string" ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signJwt(keys: TestKeys, claims: Record<string, unknown>, kid = keys.kid): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "https://adaptix.cloudflareaccess.com",
    aud: ["test-audience-tag"],
    iat: now,
    exp: now + 3600,
    email: "viewer@adaptix.uk",
    ...claims,
  };
  const signingInput = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }))}.${b64url(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(sig)}`;
}

/** Outbound fetch that serves the Access public keys and nothing else. */
export function certsOutbound(keys: TestKeys): Outbound {
  return async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === CERTS_URL) return Response.json({ keys: [keys.publicJwk], public_cert: {}, public_certs: [] });
    throw new Error(`Unexpected outbound request: ${url}`);
  };
}
