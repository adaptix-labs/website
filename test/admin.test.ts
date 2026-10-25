import { env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handleAdmin } from "../src/admin";
import { certsOutbound, generateKeys, signJwt, type TestKeys } from "./access-helpers";
import { clearRows, countRows } from "./helpers";

const ORIGIN = "https://adaptix.uk";
let keys: TestKeys;

beforeAll(async () => {
  keys = await generateKeys();
});
beforeEach(async () => {
  await clearRows();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO enquiries (id, created_at, name, email, phone, organisation, interest, message, status, email_status)
       VALUES ('id-1', '2026-10-01T09:00:00.000Z', 'Jane Teacher', 'jane@example-school.sch.uk', NULL, 'Example Primary', 'School workshop', 'Spring term?', 'new', 'sent')`,
    ),
    env.DB.prepare(
      `INSERT INTO enquiries (id, created_at, name, email, phone, organisation, interest, message, status, email_status)
       VALUES ('id-2', '2026-10-02T09:00:00.000Z', 'Sam <Partner>', 'sam@partner.example', '0115 1', 'Partner & Co', 'Business partnership', NULL, 'contacted', 'failed')`,
    ),
  ]);
});

function admin(
  path: string,
  init: { token?: string; method?: string; body?: Record<string, string>; origin?: string | null } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (init.token) headers["cf-access-jwt-assertion"] = init.token;
  if (init.method === "POST") {
    headers["content-type"] = "application/x-www-form-urlencoded";
    if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  }
  const request = new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.method === "POST" ? new URLSearchParams(init.body ?? {}).toString() : undefined,
  });
  return handleAdmin(request, env, certsOutbound(keys));
}

describe("admin authentication", () => {
  it("is routed by the Worker and refuses requests without an Access token", async () => {
    const res = await SELF.fetch(`${ORIGIN}/admin`);
    expect(res.status).toBe(401);
  });

  it("refuses a token for a different audience", async () => {
    const res = await admin("/admin", { token: await signJwt(keys, { aud: ["other-app"] }) });
    expect(res.status).toBe(401);
  });

  it("refuses an expired token", async () => {
    const res = await admin("/admin", { token: await signJwt(keys, { exp: Math.floor(Date.now() / 1000) - 60 }) });
    expect(res.status).toBe(401);
  });

  it("refuses a token signed by an unknown key", async () => {
    const other = await generateKeys("rogue-key");
    const res = await admin("/admin", { token: await signJwt(other, {}, keys.kid) });
    expect(res.status).toBe(401);
  });

  it("fails closed when Access is not configured", async () => {
    const request = new Request(`${ORIGIN}/admin`, { headers: { "cf-access-jwt-assertion": await signJwt(keys, {}) } });
    const res = await handleAdmin(request, { ...env, ACCESS_AUD: "" }, certsOutbound(keys));
    expect(res.status).toBe(503);
  });
});

describe("admin listing", () => {
  it("lists enquiries for a signed-in viewer with values escaped", async () => {
    const res = await admin("/admin", { token: await signJwt(keys, {}) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("Jane Teacher");
    expect(html).toContain("Sam &lt;Partner&gt;");
    expect(html).toContain("Partner &amp; Co");
    expect(html).toContain("viewer@adaptix.uk");
    expect(html).not.toContain("<Partner>");
  });

  it("hides status and delete controls from viewers", async () => {
    const html = await (await admin("/admin", { token: await signJwt(keys, {}) })).text();
    expect(html).not.toContain('name="status"');
    expect(html).not.toContain("/delete");
  });

  it("shows status and delete controls to admins", async () => {
    const html = await (await admin("/admin", { token: await signJwt(keys, { email: "Boss@Adaptix.uk" }) })).text();
    expect(html).toContain('name="status"');
    expect(html).toContain("/admin/enquiries/id-1/delete");
    // the delete disclosure reads as a button, with an icon hidden from assistive tech
    expect(html).toMatch(/<summary class="btn del"[^>]*>\s*<svg[^>]*aria-hidden="true"/);
  });

  it("is structured for screen readers and small screens", async () => {
    const html = await (await admin("/admin", { token: await signJwt(keys, { email: "boss@adaptix.uk" }) })).text();
    expect(html).toContain('<html lang="en-GB"');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain('href="#enquiries"'); // skip link
    expect(html).toMatch(/<header[\s>]/);
    expect(html).toMatch(/<main[\s>]/);
    expect(html).toMatch(/<nav[^>]*aria-label="Filter by status"/);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('<img src="/assets/adaptix-logo.png"');
    expect(html).toContain('alt="Adaptix"');
    expect(html).toMatch(/<article[^>]*aria-labelledby="enquiry-id-1-name"/);
    expect(html).toMatch(/<h2[^>]*id="enquiry-id-1-name"[^>]*>Jane Teacher<\/h2>/);
    expect(html).toMatch(/<time datetime="2026-10-01T09:00:00.000Z"/);
    expect(html).toMatch(/<label[^>]*for="status-id-1"/);
    expect(html).toMatch(/<select[^>]*id="status-id-1"/);
    expect(html).toMatch(/@media[^{]*max-width/);
    expect(html).not.toMatch(/title="[^"]*Resend/); // failures are shown as text, not tooltips
    expect(html).toContain("Email not sent");
  });

  it("explains a failed notification inline", async () => {
    const html = await (await admin("/admin", { token: await signJwt(keys, {}) })).text();
    expect(html).toContain("Email not sent");
    expect(html).toContain("Email sent");
  });

  it("filters by status", async () => {
    const html = await (await admin("/admin?status=contacted", { token: await signJwt(keys, {}) })).text();
    expect(html).toContain("Sam &lt;Partner&gt;");
    expect(html).not.toContain("Jane Teacher");
  });

  it("exports CSV for viewers", async () => {
    const res = await admin("/admin/export.csv", { token: await signJwt(keys, {}) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("enquiries");
    const csv = await res.text();
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("id,created_at,name,email,phone,organisation,interest,message,status,email_status");
    expect(lines).toHaveLength(3);
    expect(csv).toContain('"Sam <Partner>"');
    expect(csv).toContain('"Partner & Co"');
  });
});

describe("admin actions", () => {
  const boss = () => signJwt(keys, { email: "boss@adaptix.uk" });

  it("lets an admin change the status", async () => {
    const res = await admin("/admin/enquiries/id-1/status", { token: await boss(), method: "POST", body: { status: "contacted" } });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin");
    const row = await env.DB.prepare("SELECT status FROM enquiries WHERE id = 'id-1'").first<{ status: string }>();
    expect(row?.status).toBe("contacted");
  });

  it("rejects an unknown status", async () => {
    const res = await admin("/admin/enquiries/id-1/status", { token: await boss(), method: "POST", body: { status: "spam" } });
    expect(res.status).toBe(400);
  });

  it("refuses status changes from viewers", async () => {
    const res = await admin("/admin/enquiries/id-1/status", { token: await signJwt(keys, {}), method: "POST", body: { status: "closed" } });
    expect(res.status).toBe(403);
    const row = await env.DB.prepare("SELECT status FROM enquiries WHERE id = 'id-1'").first<{ status: string }>();
    expect(row?.status).toBe("new");
  });

  it("lets an admin delete an enquiry", async () => {
    const res = await admin("/admin/enquiries/id-2/delete", { token: await boss(), method: "POST" });
    expect(res.status).toBe(303);
    expect(await countRows()).toBe(1);
  });

  it("refuses deletion from viewers", async () => {
    const res = await admin("/admin/enquiries/id-2/delete", { token: await signJwt(keys, {}), method: "POST" });
    expect(res.status).toBe(403);
    expect(await countRows()).toBe(2);
  });

  it("refuses cross-site posts even from admins", async () => {
    const res = await admin("/admin/enquiries/id-2/delete", { token: await boss(), method: "POST", origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(await countRows()).toBe(2);
  });

  it("returns 404 for an unknown enquiry", async () => {
    const res = await admin("/admin/enquiries/nope/status", { token: await boss(), method: "POST", body: { status: "closed" } });
    expect(res.status).toBe(404);
  });
});
