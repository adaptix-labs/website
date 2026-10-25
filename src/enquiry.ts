import type { Env } from "./env";
import { validateEnquiry, type EnquiryInput } from "./validate";

export type Outbound = typeof fetch;

const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const RESEND_EMAILS = "https://api.resend.com/emails";

export async function handleEnquiry(request: Request, env: Env, outbound: Outbound = fetch): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
  }
  if (request.headers.get("origin") !== env.ALLOWED_ORIGIN) {
    return json({ ok: false, error: "Forbidden" }, 403);
  }

  const reply = responder(request, env);
  const fields = await readFields(request);

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

  const email = await sendEmail(validation.value, env, outbound);
  await env.DB.prepare("UPDATE enquiries SET email_status = ?, email_error = ? WHERE id = ?")
    .bind(email.ok ? "sent" : "failed", email.ok ? null : email.error, id)
    .run();

  return reply.ok();
}

async function readFields(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  const fields: Record<string, string> = {};
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    for (const [k, v] of Object.entries(body)) if (typeof v === "string") fields[k] = v;
    return fields;
  }
  const form = await request.formData().catch(() => new FormData());
  for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
  return fields;
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

async function sendEmail(e: EnquiryInput, env: Env, outbound: Outbound): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = [
    `Name: ${e.name}`,
    `Email: ${e.email}`,
    `Phone: ${e.phone ?? "-"}`,
    `School or organisation: ${e.organisation ?? "-"}`,
    `Interested in: ${e.interest}`,
    "",
    e.message ?? "(no message)",
  ].join("\n");
  try {
    const res = await outbound(RESEND_EMAILS, {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.ENQUIRY_FROM,
        to: [env.ENQUIRY_TO],
        reply_to: e.email,
        subject: `New enquiry: ${e.interest} from ${e.name}`,
        text,
      }),
    });
    if (!res.ok) return { ok: false, error: `Resend responded ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Resend request failed: ${(err as Error).message}` };
  }
}

/** Browsers submitting the form without JavaScript get a redirect; the page script gets JSON. */
function responder(request: Request, env: Env) {
  const accept = request.headers.get("accept") ?? "";
  const wantsHtml = accept.includes("text/html") && !accept.includes("application/json");
  const back = (query: string) => Response.redirect(`${env.ALLOWED_ORIGIN}/?${query}#contact`, 303);
  return {
    ok: () => (wantsHtml ? back("sent=1") : json({ ok: true })),
    invalid: (errors: Record<string, string>) => (wantsHtml ? back("error=invalid") : json({ ok: false, errors }, 400)),
    forbidden: (message: string) => (wantsHtml ? back("error=check") : json({ ok: false, error: message }, 403)),
    tooMany: () =>
      wantsHtml ? back("error=busy") : json({ ok: false, error: "Too many enquiries from this connection. Please try again later." }, 429),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
