import type { EnquiryInput } from "./validate";

export interface EnquiryEmail {
  subject: string;
  text: string;
  html: string;
}

/** Notification sent to the team for each stored enquiry: plain text plus a formatted HTML version. */
const LOGO_URL = "https://adaptix.uk/assets/adaptix-logo.png";

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
    `Reply to this email to answer ${e.name} directly, or open ${adminUrl}`,
  ].join("\n");

  const rows: Array<[string, string]> = [
    ["Name", esc(e.name)],
    ["Email", `<a href="mailto:${esc(e.email)}" style="color:#1c5a9c">${esc(e.email)}</a>`],
    ["Phone", e.phone ? esc(e.phone) : "<span style=\"color:#8a9aa8\">Not given</span>"],
    ["School or organisation", e.organisation ? esc(e.organisation) : "<span style=\"color:#8a9aa8\">Not given</span>"],
    ["Interested in", esc(e.interest)],
  ];
  const rowHtml = rows
    .map(
      ([label, value], i) => `
        <tr>
          <td style="padding:12px 16px;border-top:${i === 0 ? "0" : "1px solid #e8eef2"};font:600 13px/1.4 Arial,Helvetica,sans-serif;color:#43596a;width:40%;vertical-align:top">${label}</td>
          <td style="padding:12px 16px;border-top:${i === 0 ? "0" : "1px solid #e8eef2"};font:16px/1.5 Arial,Helvetica,sans-serif;color:#102b48;vertical-align:top">${value}</td>
        </tr>`,
    )
    .join("");
  const messageHtml = e.message
    ? esc(e.message).replace(/\r?\n/g, "<br>")
    : "<span style=\"color:#8a9aa8\">No message was written.</span>";

  const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f8f7f2">
  <div style="display:none;max-height:0;overflow:hidden;color:#f8f7f2">${esc(e.name)} is interested in ${esc(e.interest.toLowerCase())}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7f2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dde5ea">
        <tr>
          <td style="padding:22px 28px 18px;border-bottom:4px solid #f9c742">
            <img src="${LOGO_URL}" width="160" height="48" alt="Adaptix" style="display:block;height:48px;width:auto;border:0">
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 8px">
            <div style="margin:0 0 10px;font:700 12px/1.4 Arial,Helvetica,sans-serif;color:#1c5a9c;letter-spacing:1.5px;text-transform:uppercase">New enquiry</div>
            <h1 style="margin:0 0 6px;font:700 24px/1.25 Arial,Helvetica,sans-serif;color:#102b48">${esc(e.name)}</h1>
            <p style="margin:0;font:16px/1.5 Arial,Helvetica,sans-serif;color:#43596a">is interested in <strong style="color:#102b48">${esc(e.interest)}</strong></p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8eef2;border-radius:12px;overflow:hidden">${rowHtml}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 0">
            <div style="font:600 13px/1.4 Arial,Helvetica,sans-serif;color:#43596a;margin-bottom:8px">Message</div>
            <div style="padding:16px;background:#eaf4f7;border-left:4px solid #f9c742;border-radius:0 12px 12px 0;font:16px/1.6 Arial,Helvetica,sans-serif;color:#102b48">${messageHtml}</div>
          </td>
        </tr>
        <tr><td style="height:28px"></td></tr>
        <tr>
          <td style="padding:16px 28px;background:#f8f7f2;border-top:1px solid #e8eef2;font:13px/1.5 Arial,Helvetica,sans-serif;color:#6b7c8a">
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
