/* Transactional email templates — Internal Packages (CEO, 2026-09-02).
 * Two premium, mobile-responsive HTML emails built the transactional way:
 * 600px table layout, inline styles only (email clients strip stylesheets),
 * the real Routely logo, brand blue used sparingly, clear hierarchy, zero
 * decoration. Rendering lives here so the future send integration (n8n /
 * SMTP on the VPS) only has to pipe HTML — see notifications.ts. */

import { BRAND_PRIMARY } from "@/lib/brand";

const LOGO_URL = "https://app.routelypro.com/img/labelLogo.png";
const TRACK_BASE = "https://app.routelypro.com/track";

export type InternalPackageEmailData = {
  trackingId: string;
  recipientName: string;
  deliveryAddress: string; // full one-line address
  senderName: string | null;
  fromOffice: string | null;
  contents?: string | null;
  status?: string; // default "Ready to deliver"
};

const font =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

function row(label: string, value: string): string {
  return `<tr>
    <td style="${font}padding:7px 0;font-size:13px;color:#6b7280;vertical-align:top;white-space:nowrap;padding-right:24px;">${label}</td>
    <td style="${font}padding:7px 0;font-size:13px;color:#111827;font-weight:600;text-align:right;">${value}</td>
  </tr>`;
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Shared shell: logo header, white card, footer. */
function shell(title: string, preheader: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
      <tr><td style="padding:0 4px 20px;" align="left">
        <img src="${LOGO_URL}" alt="Routely" height="28" style="display:block;height:28px;width:auto;" />
      </td></tr>
      <tr><td style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px 32px 28px;">
        ${body}
      </td></tr>
      <tr><td style="${font}padding:20px 4px 0;font-size:11px;line-height:1.6;color:#9ca3af;" align="left">
        Routely · Healthcare logistics, unified<br />
        This is a transactional message about a shipment on your account.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function trackButton(trackingId: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;"><tr>
    <td style="border-radius:8px;background-color:${BRAND_PRIMARY};">
      <a href="${TRACK_BASE}/${encodeURIComponent(trackingId)}"
         style="${font}display:inline-block;padding:11px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
        Track shipment
      </a>
    </td>
  </tr></table>`;
}

function trackingBlock(trackingId: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr><td align="center" style="background-color:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
      <div style="${font}font-size:10px;font-weight:700;letter-spacing:0.12em;color:#6b7280;">TRACKING NUMBER</div>
      <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:22px;font-weight:700;color:#111827;margin-top:4px;">${esc(trackingId)}</div>
    </td></tr>
  </table>`;
}

/** Email #1 — Sender confirmation: the shipment was created. */
export function senderConfirmationEmailHtml(d: InternalPackageEmailData): string {
  const status = d.status ?? "Ready to deliver";
  const body = `
    <h1 style="${font}margin:0;font-size:20px;line-height:1.3;font-weight:700;color:#111827;">Your internal package was created</h1>
    <p style="${font}margin:10px 0 0;font-size:14px;line-height:1.6;color:#4b5563;">
      Hi${d.senderName ? ` ${esc(d.senderName)}` : ""}, your shipment has been created and dispatched to the driver network. Here are the details.
    </p>
    ${trackingBlock(d.trackingId)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f0f1f3;">
      ${row("Recipient", esc(d.recipientName))}
      ${row("Delivery address", esc(d.deliveryAddress))}
      ${d.fromOffice ? row("From office", esc(d.fromOffice)) : ""}
      ${d.contents ? row("Contents", esc(d.contents)) : ""}
      ${row("Ready time", "Ready Now")}
      ${row("Type", "Internal delivery · Office-to-office")}
      ${row("Status", esc(status))}
    </table>
    ${trackButton(d.trackingId)}
  `;
  return shell(
    `Shipment ${d.trackingId} created`,
    `Your internal package ${d.trackingId} was created and is ready to deliver.`,
    body,
  );
}

/** Email #2 — Recipient notification: a package is on its way. */
export function recipientNotificationEmailHtml(d: InternalPackageEmailData): string {
  const status = d.status ?? "Ready to deliver";
  const body = `
    <h1 style="${font}margin:0;font-size:20px;line-height:1.3;font-weight:700;color:#111827;">A package is on its way to you</h1>
    <p style="${font}margin:10px 0 0;font-size:14px;line-height:1.6;color:#4b5563;">
      Hi ${esc(d.recipientName)},${d.senderName ? ` ${esc(d.senderName)}${d.fromOffice ? ` (${esc(d.fromOffice)})` : ""} has` : " a package has been"} sent you an internal package through Routely. You can follow it in real time below.
    </p>
    ${trackingBlock(d.trackingId)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f0f1f3;">
      ${row("Delivery address", esc(d.deliveryAddress))}
      ${d.senderName ? row("Sender", esc(d.senderName)) : ""}
      ${d.fromOffice ? row("From office", esc(d.fromOffice)) : ""}
      ${row("Current status", esc(status))}
      ${row("Ready time", "Ready Now")}
    </table>
    ${trackButton(d.trackingId)}
    <p style="${font}margin:20px 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">
      No action is needed — this message keeps you informed about an incoming delivery.
    </p>
  `;
  return shell(
    `Package ${d.trackingId} is on its way`,
    `${d.senderName ?? "Your office"} sent you a package — track ${d.trackingId} in real time.`,
    body,
  );
}
