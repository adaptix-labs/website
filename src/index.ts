import type { Env } from "./env";
import { withSecurityHeaders } from "./headers";

export default {
  async fetch(request, env): Promise<Response> {
    const response = await env.ASSETS.fetch(request);
    return withSecurityHeaders(response);
  },
} satisfies ExportedHandler<Env>;
