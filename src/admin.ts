import { accessConfigured, verifyAccessToken, type Identity } from "./access";
import type { Outbound } from "./enquiry";
import type { Env } from "./env";

import { renderAdminPage, STATUSES, type EnquiryRow, type Status } from "./admin-view";

export async function handleAdmin(request: Request, env: Env, outbound: Outbound = fetch): Promise<Response> {
  if (!accessConfigured(env)) {
    return text("Admin access is not configured.", 503);
  }
  const token = request.headers.get("cf-access-jwt-assertion") ?? "";
  const identity = token ? await verifyAccessToken(token, env, outbound) : null;
  if (!identity) return text("Unauthorised. Sign in through Cloudflare Access.", 401);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/admin";

  if (request.method === "GET" && path === "/admin") return listPage(url, env, identity);
  if (request.method === "GET" && path === "/admin/export.csv") return exportCsv(env);

  const action = path.match(/^\/admin\/enquiries\/([^/]+)\/(status|delete)$/);
  if (action && request.method === "POST") {
    if (!identity.isAdmin) return text("Only administrators can change enquiries.", 403);
    const origin = request.headers.get("origin");
    if (!origin || origin !== url.origin) return text("Forbidden", 403);
    const [, id, verb] = action;
    const exists = await env.DB.prepare("SELECT 1 FROM enquiries WHERE id = ?").bind(id).first();
    if (!exists) return text("Enquiry not found.", 404);
    if (verb === "delete") {
      await env.DB.prepare("DELETE FROM enquiries WHERE id = ?").bind(id).run();
    } else {
      const form = await request.formData().catch(() => new FormData());
      const status = String(form.get("status") ?? "");
      if (!(STATUSES as readonly string[]).includes(status)) return text("Unknown status.", 400);
      await env.DB.prepare("UPDATE enquiries SET status = ? WHERE id = ?").bind(status, id).run();
    }
    return new Response(null, { status: 303, headers: { location: "/admin" } });
  }

  return text("Not found.", 404);
}

async function listPage(url: URL, env: Env, identity: Identity): Promise<Response> {
  const requested = url.searchParams.get("status");
  const filter = (STATUSES as readonly string[]).includes(requested ?? "") ? (requested as Status) : null;
  const rows = filter
    ? await env.DB.prepare("SELECT * FROM enquiries WHERE status = ? ORDER BY created_at DESC LIMIT 500").bind(filter).all<EnquiryRow>()
    : await env.DB.prepare("SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 500").all<EnquiryRow>();
  const grouped = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM enquiries GROUP BY status").all<{ status: Status; n: number }>();
  const counts = { new: 0, contacted: 0, closed: 0 } as Record<Status, number>;
  for (const g of grouped.results) if (g.status in counts) counts[g.status] = g.n;
  return html(renderAdminPage({ rows: rows.results, counts, filter, identity }));
}

async function exportCsv(env: Env): Promise<Response> {
  const rows = await env.DB.prepare("SELECT * FROM enquiries ORDER BY created_at DESC").all<EnquiryRow>();
  const columns = ["id", "created_at", "name", "email", "phone", "organisation", "interest", "message", "status", "email_status"] as const;
  const lines = [columns.join(",")];
  for (const r of rows.results) lines.push(columns.map((c) => csvCell(r[c])).join(","));
  const date = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="enquiries-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}

function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}



function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
