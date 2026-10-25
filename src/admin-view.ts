import type { Identity } from "./access";

export const STATUSES = ["new", "contacted", "closed"] as const;
export type Status = (typeof STATUSES)[number];

export interface EnquiryRow {
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

export interface AdminPageModel {
  rows: EnquiryRow[];
  counts: Record<Status, number>;
  filter: Status | null;
  identity: Identity;
}

/** Server-rendered admin page: a list of enquiry cards that works from phone width up, with no scripts. */
export function renderAdminPage(m: AdminPageModel): string {
  const total = STATUSES.reduce((sum, s) => sum + m.counts[s], 0);
  const heading = m.filter ? `${label(m.filter)} enquiries` : "Enquiries";
  const body = `
<a class="skip" href="#enquiries">Skip to enquiries</a>
<header class="top">
  <a class="brand" href="/admin"><img src="/assets/adaptix-logo.png" alt="Adaptix" width="134" height="40"></a>
  <div class="account">
    <p class="who"><span class="vh">Signed in as </span><strong>${esc(m.identity.email)}</strong><span class="role">${m.identity.isAdmin ? "administrator" : "viewer"}</span></p>
    <a class="btn small" href="/cdn-cgi/access/logout">Sign out</a>
  </div>
</header>
<main>
  <div class="title">
    <div>
      <p class="eb">Adaptix admin</p>
      <h1>${heading}</h1>
      <p class="sub">${total === 0 ? "Nothing has arrived yet." : `${total} ${total === 1 ? "enquiry" : "enquiries"} in total, ${m.counts.new} new.`}</p>
    </div>
    <a class="btn primary" href="/admin/export.csv">Download CSV</a>
  </div>
  <nav class="filters" aria-label="Filter by status">
    ${chip("All", null, total, m.filter)}${STATUSES.map((s) => chip(label(s), s, m.counts[s], m.filter)).join("")}
  </nav>
  <section id="enquiries" aria-label="Enquiry list" tabindex="-1">
    ${m.rows.length === 0 ? `<p class="empty">No ${m.filter ? label(m.filter).toLowerCase() + " " : ""}enquiries to show.</p>` : `<ol class="cards">${m.rows.map((r) => card(r, m.identity)).join("")}</ol>`}
  </section>
</main>`;
  return page(heading, body);
}

function chip(text: string, value: Status | null, n: number, active: Status | null): string {
  const on = value === active;
  const href = value ? `/admin?status=${value}` : "/admin";
  return `<a class="chip${on ? " on" : ""}" href="${href}"${on ? ' aria-current="page"' : ""}>${text} <span class="n">${n}</span></a>`;
}

function card(r: EnquiryRow, who: Identity): string {
  const id = esc(r.id);
  const delivery =
    r.email_status === "sent"
      ? `<p class="mail ok">Email sent</p>`
      : r.email_status === "failed"
        ? `<details class="mail bad"><summary>Email not sent</summary><p>${esc(r.email_error ?? "No reason was recorded.")} The enquiry is stored here regardless.</p></details>`
        : `<p class="mail">Email pending</p>`;
  const controls = who.isAdmin
    ? `
      <form method="post" action="/admin/enquiries/${id}/status" class="status">
        <label for="status-${id}">Status</label>
        <select id="status-${id}" name="status">${STATUSES.map((s) => `<option value="${s}"${s === r.status ? " selected" : ""}>${label(s)}</option>`).join("")}</select>
        <button type="submit" class="btn">Save</button>
      </form>
      <details class="danger">
        <summary>Delete</summary>
        <form method="post" action="/admin/enquiries/${id}/delete">
          <p>Permanently delete this enquiry from ${esc(r.name)}?</p>
          <button type="submit" class="btn del">Yes, delete it</button>
        </form>
      </details>`
    : "";
  return `
    <li>
      <article class="card" aria-labelledby="enquiry-${id}-name">
        <div class="head">
          <div>
            <h2 id="enquiry-${id}-name">${esc(r.name)}</h2>
            <p class="meta"><span class="badge ${r.status}">${label(r.status)}</span> <span class="interest">${esc(r.interest)}</span></p>
          </div>
          <p class="when">Received <time datetime="${esc(r.created_at)}">${esc(formatDate(r.created_at))}</time></p>
        </div>
        <dl class="facts">
          <div><dt>Email</dt><dd><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></dd></div>
          <div><dt>Phone</dt><dd>${r.phone ? esc(r.phone) : '<span class="muted">Not given</span>'}</dd></div>
          <div><dt>School or organisation</dt><dd>${r.organisation ? esc(r.organisation) : '<span class="muted">Not given</span>'}</dd></div>
        </dl>
        <h3 class="vh">Message</h3>
        <p class="msg">${r.message ? esc(r.message) : '<span class="muted">No message was written.</span>'}</p>
        <div class="foot">
          ${delivery}
          ${controls}
        </div>
      </article>
    </li>`;
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light">
<title>${esc(title)} · Adaptix admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@700;800&display=swap" rel="stylesheet">
<style>
:root{--navy:#102b48;--blue:#1c5a9c;--yellow:#f9c742;--ink:#172e44;--muted:#5b6f7f;--line:#dde5ea;--paper:#f8f7f2;--card:#fff;--focus:#1c5a9c}
*{box-sizing:border-box}
body{margin:0;font:16px/1.55 Inter,system-ui,sans-serif;color:var(--ink);background:var(--paper)}
a{color:var(--blue)}
.skip{position:absolute;top:8px;left:-9999px;z-index:30;background:var(--navy);color:#fff;padding:10px 16px;border-radius:8px;font-weight:600}.skip:focus{left:16px}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
.top{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center;justify-content:space-between;padding:14px 20px;background:#fff;border-bottom:1px solid var(--line)}
.brand img{display:block;height:40px;width:auto}
.account{display:flex;align-items:center;gap:14px;margin-left:auto;min-width:0}
.who{display:flex;align-items:center;gap:10px;margin:0;min-width:0;font-size:14px;color:var(--ink)}
.who strong{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.role{flex:none;padding:3px 10px;border-radius:999px;background:#eaf4f7;color:var(--blue);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.btn.small{min-height:40px;padding:0 16px;font-size:14px;flex:none}
main{max-width:920px;margin:0 auto;padding:28px 20px 64px}
.title{display:flex;flex-wrap:wrap;gap:16px 24px;align-items:flex-end;justify-content:space-between}
.eb{margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--blue)}
h1{margin:0;font:800 32px/1.1 Sora,Inter,sans-serif;color:var(--navy);letter-spacing:-.02em}
.sub{margin:6px 0 0;color:var(--muted)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 20px;border-radius:999px;border:2px solid var(--navy);background:#fff;color:var(--navy);font:600 15px Inter,sans-serif;text-decoration:none;cursor:pointer}
.btn:hover{background:#eaf4f7}
.btn.primary{background:var(--yellow);border-color:var(--yellow)}.btn.primary:hover{background:#ffd966}
.btn.del{border-color:#b42318;color:#b42318}.btn.del:hover{background:#fdecec}
.filters{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0}
.chip{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:999px;border:1.5px solid #cfe0ec;background:#fff;color:var(--navy);font-weight:600;text-decoration:none}
.chip .n{font-weight:500;color:var(--muted)}
.chip.on{background:var(--navy);border-color:var(--navy);color:#fff}.chip.on .n{color:#cfe0ec}
.cards{list-style:none;margin:0;padding:0;display:grid;gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:22px 24px}
.head{display:flex;flex-wrap:wrap;gap:8px 24px;justify-content:space-between;align-items:flex-start}
h2{margin:0;font:700 22px/1.25 Sora,Inter,sans-serif;color:var(--navy);letter-spacing:-.01em;overflow-wrap:anywhere}
.meta{margin:8px 0 0;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;color:var(--muted)}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:13px;font-weight:700;background:#eaf4f7;color:var(--blue)}
.badge.contacted{background:#fff4d6;color:#7a5a00}.badge.closed{background:#e8f0e8;color:#2f6b3a}
.when{margin:0;font-size:14px;color:var(--muted)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px 24px;margin:18px 0 0;padding:16px 0 0;border-top:1px solid #eef2f5}
.facts div{margin:0}.facts dt{font-size:13px;font-weight:600;color:var(--muted)}.facts dd{margin:2px 0 0;overflow-wrap:anywhere}
.msg{margin:16px 0 0;padding:14px 16px;background:#eaf4f7;border-left:4px solid var(--yellow);border-radius:0 12px 12px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.muted{color:var(--muted)}
.foot{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;justify-content:space-between;margin-top:18px;padding-top:14px;border-top:1px solid #eef2f5}
.mail{margin:0;font-size:14px;font-weight:600;color:var(--muted)}.mail.ok{color:#2f6b3a}.mail.bad summary{color:#b42318;cursor:pointer;font-weight:600;min-height:44px;display:inline-flex;align-items:center}.mail.bad p{margin:4px 0 8px;font-weight:400;color:var(--ink)}
.status{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0}
.status label{font-size:14px;font-weight:600;color:var(--muted)}
select{min-height:44px;padding:0 36px 0 12px;border-radius:10px;border:1.5px solid #9fb2c1;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%23102b48' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 6l5 5 5-5'/%3E%3C/svg%3E") no-repeat right 12px center;appearance:none;-webkit-appearance:none;font:inherit;color:var(--navy)}
.danger summary{cursor:pointer;color:var(--muted);font-size:14px;font-weight:600;min-height:44px;display:inline-flex;align-items:center}
.danger form{margin:8px 0 0;padding:14px 16px;background:#fdecec;border-radius:12px}.danger p{margin:0 0 10px}
.empty{padding:40px 24px;text-align:center;color:var(--muted);background:#fff;border:1px dashed var(--line);border-radius:20px}
@media(max-width:600px){.top{padding:12px 16px}.account{width:100%;justify-content:space-between;margin:0;padding-top:12px;border-top:1px solid var(--line)}main{padding:20px 16px 48px}.card{padding:18px 16px;border-radius:16px}h1{font-size:28px}.title .btn{width:100%}.foot{flex-direction:column;align-items:stretch}.status{justify-content:space-between}.status select{flex:1}}
</style>
</head>
<body>${body}
</body>
</html>`;
}

export function label(status: Status): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
