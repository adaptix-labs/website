import type { EnquiryInput } from "./validate";

export interface EnquiryEmail {
  subject: string;
  text: string;
  html: string;
}

const LOGO_URL = "https://adaptix.uk/assets/adaptix-logo.png";
const FONT = "Arial,Helvetica,sans-serif";

/** Notification sent to the team for each stored enquiry: plain text plus a formatted HTML version. */
export function renderEnquiryEmail(e: EnquiryInput, adminUrl: string): EnquiryEmail {
  const subject = `New enquiry from ${e.name} · ${e.interest}`;

  const text = [
    `New enquiry from the adaptix.uk contact form`,
    ``,
    `Name: ${e.name}`,
    `Email: ${e.email}`,
    `Phone: ${e.phone ?? "-"}`,
    `School or organisation: ${e.organisation ?? "-"}`,
    `Interested in: ${e.interest}`,
    ``,
    e.message ?? "(no message)",
    ``,
    `Reply to this email to answer ${e.name} directly, or update its status at ${adminUrl}`,
  ].join("\n");

  const notGiven = `<span style="color:#5b6f7f">Not given</span>`;
  const rows: Array<[string, string]> = [
    ["Name", esc(e.name)],
    ["Email", `<a href="mailto:${esc(e.email)}" style="color:#1c5a9c">${esc(e.email)}</a>`],
    ["Phone", e.phone ? esc(e.phone) : notGiven],
    ["School or organisation", e.organisation ? esc(e.organisation) : notGiven],
    ["Interested in", esc(e.interest)],
  ];
  const rowHtml = rows
    .map(
      ([label, value], i) => `
              <tr>
                <th scope="row" align="left" class="lbl muted" style="padding:12px 16px;border-top:${i === 0 ? "0" : "1px solid #e8eef2"};font:600 14px/1.4 ${FONT};color:#43596a;width:40%;vertical-align:top;text-align:left">${label}</th>
                <td class="val ink" style="padding:12px 16px;border-top:${i === 0 ? "0" : "1px solid #e8eef2"};font:16px/1.5 ${FONT};color:#102b48;vertical-align:top">${value}</td>
              </tr>`,
    )
    .join("");
  const messageHtml = e.message
    ? esc(e.message).replace(/\r?\n/g, "<br>")
    : `<span style="color:#5b6f7f">No message was written.</span>`;

  const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(subject)}</title>
<style>
  @media only screen and (max-width: 480px) {
    .outer { padding: 12px 8px !important; }
    .pad { padding-left: 20px !important; padding-right: 20px !important; }
    .stack .lbl, .stack .val { display: block !important; width: 100% !important; box-sizing: border-box; }
    .stack .lbl { padding: 12px 16px 2px !important; }
    .stack .val { padding: 0 16px 12px !important; border-top: 0 !important; }
    h1 { font-size: 22px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bg { background: #0f1b2a !important; }
    .card { background: #16263a !important; border-color: #2a3b52 !important; }
    .ink { color: #eef3f8 !important; }
    .muted { color: #b3c2d1 !important; }
    .lines, .lines th, .lines td { border-color: #2a3b52 !important; }
    .msgbox { background: #1d2f45 !important; }
    .footer { background: #0f1b2a !important; border-color: #2a3b52 !important; }
    a { color: #9cc7ff !important; }
  }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#f8f7f2;-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;color:#f8f7f2">${esc(e.name)} is interested in ${esc(e.interest.toLowerCase())}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="outer bg" style="background:#f8f7f2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dde5ea">
        <tr>
          <td class="pad" style="padding:22px 28px 18px;border-bottom:4px solid #f9c742">
            <span class="logo-plate" style="display:inline-block;background:#ffffff;padding:8px 12px;border-radius:12px;line-height:0"><img src="${LOGO_URL}" width="160" height="48" alt="Adaptix" style="display:block;height:48px;width:auto;border:0"></span>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:28px 28px 8px">
            <p style="margin:0 0 10px;font:700 12px/1.4 ${FONT};color:#1c5a9c;letter-spacing:1.5px;text-transform:uppercase">New enquiry</p>
            <h1 class="ink" style="margin:0 0 6px;font:700 24px/1.25 ${FONT};color:#102b48">${esc(e.name)}</h1>
            <p class="muted" style="margin:0;font:16px/1.5 ${FONT};color:#43596a">is interested in <strong class="ink" style="color:#102b48">${esc(e.interest)}</strong></p>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:16px 28px 0">
            <table width="100%" cellpadding="0" cellspacing="0" class="stack lines" style="border:1px solid #e8eef2;border-radius:12px;overflow:hidden;border-collapse:separate">
              <caption style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Enquiry details</caption>${rowHtml}
            </table>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:20px 28px 0">
            <h2 class="muted" style="margin:0 0 8px;font:600 14px/1.4 ${FONT};color:#43596a">Message</h2>
            <div class="msgbox ink" style="padding:16px;background:#eaf4f7;border-left:4px solid #f9c742;border-radius:0 12px 12px 0;font:16px/1.6 ${FONT};color:#102b48">${messageHtml}</div>
          </td>
        </tr>
        <tr><td style="height:28px;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr>
          <td class="pad footer muted" style="padding:16px 28px;background:#f8f7f2;border-top:1px solid #e8eef2;font:14px/1.5 ${FONT};color:#4f6373">
            Sent by the contact form on <a href="https://adaptix.uk" style="color:#1c5a9c">adaptix.uk</a>. Reply to this email to answer ${esc(e.name)} directly, or <a href="${esc(adminUrl)}" style="color:#1c5a9c">update its status in the admin page</a>.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
