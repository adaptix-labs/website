import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { clearRows, countRows, fakeOutbound, ORIGIN, postEnquiry, postViaWorker, validFields } from "./helpers";

beforeEach(clearRows);

describe("POST /api/enquiry", () => {
  it("stores a valid enquiry and replies ok", async () => {
    const res = await postEnquiry(validFields);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const row = await env.DB.prepare("SELECT * FROM enquiries").first<Record<string, unknown>>();
    expect(row).toMatchObject({
      name: "Jane Teacher",
      email: "jane@example-school.sch.uk",
      phone: "0115 000 0000",
      organisation: "Example Primary School",
      interest: "School workshop",
      message: "We would like a Year 5 workshop in the spring term.",
      status: "new",
      email_status: "sent",
    });
    expect(row?.ip_hash).toBeTruthy();
    expect(String(row?.ip_hash)).not.toContain("203.0.113.10");
  });

  it("verifies the Turnstile token with the secret and the visitor IP", async () => {
    const outbound = fakeOutbound();
    await postEnquiry(validFields, outbound);
    expect(outbound.turnstileCalls).toHaveLength(1);
    const params = outbound.turnstileCalls[0];
    expect(params.get("secret")).toBe(env.TURNSTILE_SECRET);
    expect(params.get("response")).toBe("turnstile-token");
    expect(params.get("remoteip")).toBe("203.0.113.10");
  });

  it("emails the enquiry with the visitor as reply-to", async () => {
    const outbound = fakeOutbound();
    await postEnquiry(validFields, outbound);
    expect(outbound.resendCalls).toHaveLength(1);
    const email = outbound.resendCalls[0];
    expect(email.to).toEqual([env.ENQUIRY_TO]);
    expect(email.from).toBe(env.ENQUIRY_FROM);
    expect(email.reply_to).toBe("jane@example-school.sch.uk");
    expect(String(email.subject)).toContain("School workshop");
    expect(String(email.text)).toContain("Example Primary School");
    expect(String(email.text)).toContain("Year 5 workshop");
  });

  it("keeps the enquiry and reports success when the email fails", async () => {
    const res = await postEnquiry(validFields, fakeOutbound({ resendStatus: 500 }));
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT email_status, email_error FROM enquiries").first<Record<string, string>>();
    expect(row?.email_status).toBe("failed");
    expect(row?.email_error).toContain("500");
  });

  it("rejects missing required fields with per-field errors", async () => {
    const res = await postEnquiry({ ...validFields, name: "  ", email: "", interest: "" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; errors: Record<string, string> };
    expect(body.ok).toBe(false);
    expect(Object.keys(body.errors).sort()).toEqual(["email", "interest", "name"]);
    expect(await countRows()).toBe(0);
  });

  it("rejects an invalid email address", async () => {
    const res = await postEnquiry({ ...validFields, email: "not-an-email" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors: Record<string, string> };
    expect(body.errors.email).toBeTruthy();
  });

  it("rejects an interest outside the offered options", async () => {
    const res = await postEnquiry({ ...validFields, interest: "Something else" });
    expect(res.status).toBe(400);
  });

  it("rejects over-long messages", async () => {
    const res = await postEnquiry({ ...validFields, message: "x".repeat(4001) });
    expect(res.status).toBe(400);
  });

  it("rejects a submission that fails Turnstile and stores nothing", async () => {
    const res = await postEnquiry(validFields, fakeOutbound({ turnstile: false }));
    expect(res.status).toBe(403);
    expect(await countRows()).toBe(0);
  });

  it("rejects a submission with no Turnstile token", async () => {
    const { "cf-turnstile-response": _token, ...fields } = validFields;
    const res = await postEnquiry(fields);
    expect(res.status).toBe(400);
    expect(await countRows()).toBe(0);
  });

  it("silently drops honeypot submissions", async () => {
    const outbound = fakeOutbound();
    const res = await postEnquiry({ ...validFields, website: "http://spam.example" }, outbound);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await countRows()).toBe(0);
    expect(outbound.resendCalls).toHaveLength(0);
  });

  it("rejects posts from other origins", async () => {
    const res = await postViaWorker(validFields, { headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    expect(await countRows()).toBe(0);
  });

  it("accepts posts from whichever host the Worker is served on", async () => {
    const res = await postEnquiry(validFields, fakeOutbound(), { origin: "https://www.adaptix.uk" });
    expect(res.status).toBe(200);
    expect(await countRows()).toBe(1);
  });

  it("rejects posts with no Origin header", async () => {
    const res = await postEnquiry(validFields, fakeOutbound(), { headers: { origin: "" } });
    expect(res.status).toBe(403);
    expect(await countRows()).toBe(0);
  });

  it("redirects plain form posts back to the page with a relative location", async () => {
    const res = await postEnquiry(validFields, fakeOutbound(), {
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/?sent=1#contact");
    expect(await countRows()).toBe(1);
  });

  it("is routed by the Worker and only accepts POST", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/enquiry`);
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });
});
