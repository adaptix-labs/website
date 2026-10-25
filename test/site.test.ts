import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("static site", () => {
  it("serves the landing page at /", async () => {
    const res = await SELF.fetch("https://adaptix.uk/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("Adaptix Educational Solutions");
  });

  it("serves image assets", async () => {
    const res = await SELF.fetch("https://adaptix.uk/assets/adaptix-logo.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("returns 404 for unknown paths", async () => {
    const res = await SELF.fetch("https://adaptix.uk/no-such-page");
    expect(res.status).toBe(404);
  });

  it("sends security headers on every response", async () => {
    const res = await SELF.fetch("https://adaptix.uk/");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });
});
