import { handleAdmin } from "./admin";
import { handleEnquiry } from "./enquiry";
import type { Env } from "./env";
import { withSecurityHeaders } from "./headers";

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/enquiry") {
      return withSecurityHeaders(await handleEnquiry(request, env));
    }
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      return withSecurityHeaders(await handleAdmin(request, env));
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(purgeOldEnquiries(env));
  },
} satisfies ExportedHandler<Env>;

/** Data retention: enquiries older than RETENTION_DAYS are deleted each night. */
async function purgeOldEnquiries(env: Env): Promise<void> {
  const days = Number.parseInt(env.RETENTION_DAYS, 10) || 365;
  await env.DB.prepare("DELETE FROM enquiries WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)")
    .bind(`-${days} days`)
    .run();
}
