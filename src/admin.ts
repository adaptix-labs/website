import { accessConfigured, verifyAccessToken, type Identity } from "./access";
import type { Outbound } from "./enquiry";
import type { Env } from "./env";

export const STATUSES = ["new", "contacted", "closed"] as const;
type Status = (typeof STATUSES)[number];

interface EnquiryRow {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string | null;
  organisation: string | null;
  interest: string;
  message: string | null;
  status: Status;
  email_status: string;
  email_error: string | null;
}

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
  const filter = url.searchParams.get("status");
  const status = (STATUSES as readonly string[]).includes(filter ?? "") ? (filter as Status) : null;
  const rows = status
    ? await env.DB.prepare("SELECT * FROM enquiries WHERE status = ? ORDER BY created_at DESC LIMIT 500").bind(status).all<EnquiryRow>()
    : await env.DB.prepare("SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 500").all<EnquiryRow>();
  const counts = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM enquiries GROUP BY status").all<{ status: Status; n: number }>();
  const countFor = (s: Status) => counts.results.find((c) => c.status === s)?.n ?? 0;
  const total = counts.results.reduce((sum, c) => sum + c.n, 0);

  const filterLink = (label: string, value: Status | null, n: number) => {
    const active = value === status;
    const href = value ? `/admin?status=${value}` : "/admin";
    return `<a class="chip${active ? " on" : ""}" href="${href}"${active ? ' aria-current="page"' : ""}>${label} <span>${n}</span></a>`;
  };

  const body = `
<header>
  <div>
    <p class="eb">Adaptix admin</p>
    <h1>Enquiries</h1>
  </div>
  <p class="who">Signed in as <strong>${esc(identity.email)}</strong> (${identity.isAdmin ? "administrator" : "viewer"}) · <a href="/cdn-cgi/access/logout">Sign out</a></p>
</header>
<nav class="filters" aria-label="Filter by status">
  ${filterLink("All", null, total)}${filterLink("New", "new", countFor("new"))}${filterLink("Contacted", "contacted", countFor("contacted"))}${filterLink("Closed", "closed", countFor("closed"))}
  <a class="btn" href="/admin/export.csv">Download CSV</a>
</nav>
${rows.results.length === 0 ? '<p class="empty">No enquiries to show.</p>' : table(rows.results, identity)}`;
  return html(page("Enquiries", body));
}

function table(rows: EnquiryRow[], identity: Identity): string {
  const head = `<tr><th scope="col">Received</th><th scope="col">Name</th><th scope="col">Contact</th><th scope="col">Organisation</th><th scope="col">Interest</th><th scope="col">Message</th><th scope="col">Email</th><th scope="col">Status</th>${identity.isAdmin ? '<th scope="col"><span class="vh">Actions</span></th>' : ""}</tr>`;
  const body = rows
    .map((r) => {
      const statusCell = identity.isAdmin
        ? `<form method="post" action="/admin/enquiries/${esc(r.id)}/status" class="inline">
<label><span class="vh">Status for ${esc(r.name)}</span><select name="status">${STATUSES.map((s) => `<option value="${s}"${s === r.status ? " selected" : ""}>${label(s)}</option>`).join("")}</select></label>
<button type="submit">Save</button></form>`
        : `<span class="status ${r.status}">${label(r.status)}</span>`;
      const actions = identity.isAdmin
        ? `<td><details><summary>Delete…</summary><form method="post" action="/admin/enquiries/${esc(r.id)}/delete" class="inline"><p>Permanently delete this enquiry?</p><button type="submit" class="danger">Delete</button></form></details></td>`
        : "";
      return `<tr>
<td><time datetime="${esc(r.created_at)}">${esc(formatDate(r.created_at))}</time></td>
<td>${esc(r.name)}</td>
<td><a href="mailto:${esc(r.email)}">${esc(r.email)}</a>${r.phone ? `<br>${esc(r.phone)}` : ""}</td>
<td>${esc(r.organisation ?? "")}</td>
<td>${esc(r.interest)}</td>
<td class="msg">${esc(r.message ?? "")}</td>
<td>${r.email_status === "sent" ? "Sent" : r.email_status === "failed" ? `<span class="warn" title="${esc(r.email_error ?? "")}">Failed</span>` : "Pending"}</td>
<td>${statusCell}</td>${actions}
</tr>`;
    })
    .join("");
  return `<div class="wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
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

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · Adaptix admin</title>
<style>
:root{color-scheme:light}
body{margin:0;font:16px/1.5 Inter,system-ui,sans-serif;color:#172e44;background:#f8f7f2}
header,nav,.wrap,.empty{max-width:1400px;margin:0 auto;padding:0 24px}
header{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:end;padding-top:28px}
h1{margin:0;font-size:32px;color:#102b48;letter-spacing:-.02em}
.eb{margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#1c5a9c}
.who{margin:0;color:#43596a}
.filters{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:20px auto}
.chip{display:inline-flex;gap:8px;align-items:center;padding:8px 14px;border-radius:999px;border:1.5px solid #cfe0ec;background:#fff;color:#102b48;text-decoration:none;font-weight:600}
.chip.on{background:#102b48;border-color:#102b48;color:#fff}
.chip span{opacity:.7;font-weight:500}
.btn{margin-left:auto;padding:10px 18px;border-radius:999px;background:#f9c742;color:#102b48;font-weight:700;text-decoration:none}
.wrap{overflow-x:auto;padding-bottom:40px}
table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #dde5ea;border-radius:16px;overflow:hidden;font-size:15px}
th,td{padding:12px 14px;text-align:left;vertical-align:top;border-bottom:1px solid #e8eef2}
th{background:#eaf4f7;color:#102b48;font-size:13px;letter-spacing:.06em;text-transform:uppercase}
.msg{white-space:pre-wrap;max-width:36ch}
.status{display:inline-block;padding:3px 10px;border-radius:999px;font-size:13px;font-weight:700;background:#eaf4f7;color:#1c5a9c}
.status.contacted{background:#fff4d6;color:#7a5a00}.status.closed{background:#e8f0e8;color:#2f6b3a}
.warn{color:#b42318;font-weight:700;cursor:help}
form.inline{display:flex;gap:6px;align-items:center;margin:0}
select,button{font:inherit;padding:6px 10px;border-radius:8px;border:1.5px solid #cfe0ec;background:#fff;color:#102b48}
button{cursor:pointer;font-weight:600}button:hover{background:#eaf4f7}
button.danger{border-color:#b42318;color:#b42318}button.danger:hover{background:#fdecec}
details p{margin:8px 0}
summary{cursor:pointer;color:#43596a}
.empty{padding:40px 24px;color:#43596a}
a:focus-visible,button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #1c5a9c;outline-offset:2px}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
</style>
</head>
<body>
<main>${body}</main>
</body>
</html>`;
}

function label(status: Status): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
