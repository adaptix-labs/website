import { renderEnquiryEmail } from "./email";
import type { Env } from "./env";
import { validateEnquiry, type EnquiryInput } from "./validate";

export type Outbound = typeof fetch;

const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** A legitimate submission is a few kilobytes; anything beyond this is refused before parsing. */
const MAX_BODY_BYTES = 16 * 1024;
const RESEND_EMAILS = "https://api.resend.com/emails";

export async function handleEnquiry(request: Request, env: Env, outbound: Outbound = fetch): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
  }
  // Only the page served by this Worker may post to it, on whichever host it is served from.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return json({ ok: false, error: "Forbidden" }, 403);
  }

  const reply = responder(request);
  const fields = await readFields(request);
  if (fields === null) return reply.tooLarge();

  // Honeypot: bots fill the hidden "website" field. Pretend it worked and store nothing.
  if ((fields.website ?? "") !== "") return reply.ok();

  const validation = validateEnquiry(fields);
  if (!validation.ok) return reply.invalid(validation.errors);

  const token = (fields["cf-turnstile-response"] ?? "").trim();
  if (token === "") return reply.invalid({ turnstile: "Please complete the security check." });

  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const ipHash = await hashIp(ip, env.IP_HASH_SALT);
  if (await overRateLimit(env.DB, ipHash)) {
    return reply.tooMany();
  }
  if (!(await verifyTurnstile(token, ip, env, outbound))) {
    return reply.forbidden("The security check failed. Please try again.");
  }

  const id = crypto.randomUUID();
  await storeEnquiry(env.DB, id, validation.value, ipHash);

  const email = await sendEmail(validation.value, `${new URL(request.url).origin}/admin`, env, outbound);
  await env.DB.prepare("UPDATE enquiries SET email_status = ?, email_error = ? WHERE id = ?")
    .bind(email.ok ? "sent" : "failed", email.ok ? null : email.error, id)
    .run();

  return reply.ok();
}

/** Reads the body with a hard size cap. Returns null when the body is too large. */
async function readFields(request: Request): Promise<Record<string, string> | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;

  const bytes = await readLimited(request.body, MAX_BODY_BYTES);
  if (bytes === null) return null;

  const type = request.headers.get("content-type") ?? "";
  const fields: Record<string, string> = {};
  if (type.includes("application/json")) {
    try {
      const body = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
      for (const [k, v] of Object.entries(body)) if (typeof v === "string") fields[k] = v;
    } catch {
      /* unreadable JSON: treat as empty submission */
    }
    return fields;
  }
  if (type.includes("multipart/form-data")) {
    const form = await new Request(request.url, { method: "POST", headers: request.headers, body: bytes })
      .formData()
      .catch(() => new FormData());
    for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
    return fields;
  }
  for (const [k, v] of new URLSearchParams(new TextDecoder().decode(bytes)).entries()) fields[k] = v;
  return fields;
}

async function readLimited(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function verifyTurnstile(token: string, ip: string, env: Env, outbound: Outbound): Promise<boolean> {
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await outbound(TURNSTILE_VERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

const RATE_LIMIT = { max: 5, windowMinutes: 60 };

async function overRateLimit(db: D1Database, ipHash: string | null): Promise<boolean> {
  if (!ipHash) return false;
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM enquiries
       WHERE ip_hash = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`,
    )
    .bind(ipHash, `-${RATE_LIMIT.windowMinutes} minutes`)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= RATE_LIMIT.max;
}

async function hashIp(ip: string, salt: string): Promise<string | null> {
  if (!ip) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function storeEnquiry(db: D1Database, id: string, e: EnquiryInput, ipHash: string | null): Promise<void> {
  await db
    .prepare(
      `INSERT INTO enquiries (id, name, email, phone, organisation, interest, message, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, e.name, e.email, e.phone, e.organisation, e.interest, e.message, ipHash)
    .run();
}

async function sendEmail(
  e: EnquiryInput,
  adminUrl: string,
  env: Env,
  outbound: Outbound,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { subject, text, html } = renderEnquiryEmail(e, adminUrl);
  try {
    const res = await outbound(RESEND_EMAILS, {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.ENQUIRY_FROM, to: [env.ENQUIRY_TO], reply_to: e.email, subject, text, html }),
    });
    if (!res.ok) return { ok: false, error: `Resend responded ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Resend request failed: ${(err as Error).message}` };
  }
}

/** Browsers submitting the form without JavaScript get a redirect; the page script gets JSON. */
function responder(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  const wantsHtml = accept.includes("text/html") && !accept.includes("application/json");
  const back = (query: string) => new Response(null, { status: 303, headers: { location: `/?${query}#contact` } });
  return {
    ok: () => (wantsHtml ? back("sent=1") : json({ ok: true })),
    invalid: (errors: Record<string, string>) => (wantsHtml ? back("error=invalid") : json({ ok: false, errors }, 400)),
    forbidden: (message: string) => (wantsHtml ? back("error=check") : json({ ok: false, error: message }, 403)),
    tooMany: () =>
      wantsHtml ? back("error=busy") : json({ ok: false, error: "Too many enquiries from this connection. Please try again later." }, 429),
    tooLarge: () => (wantsHtml ? back("error=invalid") : json({ ok: false, error: "That submission is too large." }, 413)),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
