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
} satisfies ExportedHandler<Env>;
