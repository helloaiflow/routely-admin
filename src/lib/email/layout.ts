/* Routely email base (M18): the one layout every web email uses — logo centered above a 600px card, status chip,
 * title with a blue period, optional meta strip, full-width blue button with the fallback link in gray under it,
 * help row and footer (ROS 08_TECH/assets/onboarding/emails-v2/REFERENCIA_DISENO_EMAILS_DOMIS.png). It is the
 * Routely Drivers email structure (emails-v3); the drivers' own emails stay untouched. Email clients need tables and
 * inline styles. This file is byte-identical in routely-client and routely-admin (src/lib/email/layout.ts) and
 * routely-web (lib/email-layout.ts) — change all three together. */

export type Email = { subject: string; html: string; text: string };

export const APP_URL = "https://app.routelypro.com";
export const SITE_URL = "https://www.routelypro.com";
const LOGO_URL = "https://nnjvcvthgzbwmqhquinn.supabase.co/storage/v1/object/public/email-assets/routely-logo-blue.png";
// Customer support line from SUPPORT_PHONE (Vercel), never written in the templates. Unset → the emails only say "Reply".
const PHONE_TEL = (process.env.SUPPORT_PHONE ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const PHONE_DISPLAY = /^\d{10}$/.test(PHONE_TEL)
  ? `${PHONE_TEL.slice(0, 3)}-${PHONE_TEL.slice(3, 6)}-${PHONE_TEL.slice(6)}`
  : "";

const PAGE_BG = "#F5F7FA";
const INK = "#0A1024";
const TEXT2 = "#5B6475";
const TEXT3 = "#98A0AE";
const LINE = "#E6E9EF";
const BLUE = "#0167FF";
const BOX_BG = "#F5F7FA";
const FAINT_BG = "#FAFBFC";
const BLUE_BG = "#EAF2FF";
const AMBER_BG = "#FFF5E0";
const AMBER_TEXT = "#7A4A00";
const FONT = "'Geist',Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,monospace";

export type ChipVariant = "amber" | "mint" | "gray" | "blue" | "rose";
const CHIP_STYLES: Record<ChipVariant, { bg: string; text: string; dot: string }> = {
  amber: { bg: "#FFF5E0", text: "#A15F00", dot: "#F59E0B" },
  mint: { bg: "#E1FFF3", text: "#0B8562", dot: "#2BD9A0" },
  gray: { bg: "#EEF1F5", text: "#5B6475", dot: "#98A0AE" },
  blue: { bg: BLUE_BG, text: "#0050C8", dot: BLUE },
  rose: { bg: "#FFE8EC", text: "#B4233D", dot: "#F43F5E" },
};

export type Meta = { label: string; value: string; mono?: boolean };
export type Mail = {
  subject: string;
  chip: { variant: ChipVariant; label: string };
  title: string;
  name?: string | null;
  lead: string;
  meta?: Meta[];
  code?: { value: string; expiry: string };
  sectionLabel?: string;
  rows?: [label: string, value: string][];
  steps?: { title: string; desc: string }[];
  cta?: { label: string; href: string; showUrl?: boolean };
  ctaNote?: string;
  note?: string;
  reason: string;
};

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function chip(variant: ChipVariant, label: string) {
  const s = CHIP_STYLES[variant];
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 16px;"><tr><td style="background:${s.bg};border-radius:999px;padding:5px 12px;">
<table cellpadding="0" cellspacing="0" role="presentation"><tr>
<td style="padding-right:7px;"><div style="width:7px;height:7px;border-radius:7px;background:${s.dot};font-size:0;line-height:0;">&nbsp;</div></td>
<td style="font-size:12.5px;font-weight:650;color:${s.text};font-family:${FONT};white-space:nowrap;">${escapeHtml(label)}</td>
</tr></table></td></tr></table>`;
}

function hero(m: Mail) {
  const greet = m.name
    ? `<p style="margin:18px 0 0;font-size:16px;font-weight:600;color:${INK};font-family:${FONT};">Hi ${escapeHtml(m.name)},</p>`
    : "";
  return `<tr><td style="padding:34px 36px 26px;">
${chip(m.chip.variant, m.chip.label)}
<h1 style="margin:16px 0 0;font-size:28px;line-height:1.12;font-weight:800;letter-spacing:-0.03em;color:${INK};font-family:${FONT};">${escapeHtml(m.title)}<span style="color:${BLUE};">.</span></h1>
${greet}
<p style="margin:14px 0 0;font-size:16px;line-height:1.5;color:${TEXT2};font-family:${FONT};">${escapeHtml(m.lead)}</p>
</td></tr>`;
}

function metaStrip(cols: Meta[]) {
  const cells = cols
    .map(
      (
        c,
        i,
      ) => `<td style="padding:14px 18px 14px ${i === 0 ? "36" : "20"}px;${i > 0 ? `border-left:1px solid ${LINE};` : ""}" valign="top">
<p style="margin:0;font-family:${MONO};font-size:10.5px;letter-spacing:0.08em;color:${TEXT3};text-transform:uppercase;font-weight:600;">${escapeHtml(c.label)}</p>
<p style="margin:4px 0 0;font-size:15px;font-weight:650;letter-spacing:-0.01em;color:${INK};font-family:${c.mono ? MONO : FONT};">${escapeHtml(c.value)}</p>
</td>`,
    )
    .join("");
  return `<tr><td style="border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};background:${FAINT_BG};">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${cells}</tr></table>
</td></tr>`;
}

const sectionLabel = (t: string) =>
  `<p style="margin:4px 0 14px;font-size:11px;font-weight:650;letter-spacing:0.08em;text-transform:uppercase;color:${TEXT3};font-family:${FONT};">${escapeHtml(t)}</p>`;

function codeBlock(code: { value: string; expiry: string }) {
  return `<p style="margin:0 0 10px;text-align:center;"><span style="display:inline-block;width:100%;padding:22px 0;font-size:34px;font-weight:650;letter-spacing:0.3em;color:${INK};background:${BOX_BG};border-radius:16px;font-family:${MONO};box-sizing:border-box;">${escapeHtml(code.value)}</span></p>
<p style="margin:0 0 20px;text-align:center;font-size:13.5px;color:${TEXT2};font-family:${FONT};">${escapeHtml(code.expiry)}</p>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;background:${AMBER_BG};border-radius:14px;"><tr><td style="padding:13px 16px;font-size:14px;line-height:1.5;color:${AMBER_TEXT};font-family:${FONT};"><strong>Keep this code private.</strong> Routely will never call, text or email you to ask for it.</td></tr></table>`;
}

/** Label/value pairs in the bordered list of the drivers' emails. */
function rowsList(rows: [string, string][]) {
  const cells = rows
    .map(
      ([label, value], i) =>
        `<tr><td style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${LINE};` : ""}font-size:14px;color:${TEXT2};font-family:${FONT};">${escapeHtml(label)}</td><td align="right" style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${LINE};` : ""}font-size:14px;font-weight:650;color:${INK};font-family:${FONT};">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid ${LINE};border-radius:16px;border-collapse:separate;margin:0 0 24px;">${cells}</table>`;
}

function stepsList(items: { title: string; desc: string }[]) {
  const rows = items
    .map(
      (s, i) => `<tr><td style="padding:14px 16px;${i > 0 ? `border-top:1px solid ${LINE};` : ""}" valign="top">
<table cellpadding="0" cellspacing="0" role="presentation" width="100%"><tr>
<td width="26" valign="top" style="padding-top:1px;"><table cellpadding="0" cellspacing="0" role="presentation"><tr><td width="26" height="26" align="center" valign="middle" style="background:${BLUE_BG};border-radius:999px;color:${BLUE};font-size:12.5px;font-weight:750;font-family:${FONT};">${i + 1}</td></tr></table></td>
<td valign="top" style="padding-left:14px;">
<p style="margin:0;font-size:15px;font-weight:650;color:${INK};font-family:${FONT};">${escapeHtml(s.title)}</p>
<p style="margin:2px 0 0;font-size:14px;line-height:1.5;color:${TEXT2};font-family:${FONT};">${escapeHtml(s.desc)}</p>
</td></tr></table>
</td></tr>`,
    )
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid ${LINE};border-radius:16px;border-collapse:separate;margin:0 0 24px;">${rows}</table>`;
}

function button(cta: { label: string; href: string }) {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:4px 0 0;"><tr><td style="background:${BLUE};border-radius:14px;" align="center">
<a href="${escapeHtml(cta.href)}" style="display:block;width:100%;box-sizing:border-box;padding:15px 22px;font-size:16.5px;font-weight:650;color:#ffffff;text-decoration:none;font-family:${FONT};text-align:center;">${escapeHtml(cta.label)}</a>
</td></tr></table>`;
}

const smallCenter = (html: string) =>
  `<p style="margin:10px 0 24px;font-size:12.5px;line-height:1.5;color:${TEXT3};text-align:center;font-family:${FONT};overflow-wrap:anywhere;">${html}</p>`;

function help() {
  const tel = PHONE_DISPLAY
    ? ` or call <a href="tel:+1${PHONE_TEL}" style="color:${BLUE};text-decoration:none;font-weight:600;white-space:nowrap;">${PHONE_DISPLAY}</a>`
    : ".";
  return `<tr><td style="border-top:1px solid ${LINE};background:${FAINT_BG};padding:20px 36px;">
<p style="margin:0;font-size:14.5px;font-weight:650;color:${INK};font-family:${FONT};">Questions? We’re here.</p>
<p style="margin:2px 0 0;font-size:13.5px;color:${TEXT2};font-family:${FONT};">Reply to this email${tel}</p>
</td></tr>`;
}

function footer(reason: string) {
  const link = `color:${TEXT2};text-decoration:none;font-weight:550;font-family:${FONT};`;
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${PAGE_BG};"><tr><td align="center" style="padding:22px 24px 28px;">
<p style="margin:0 0 8px;font-size:12px;line-height:1.7;font-family:${FONT};"><a href="${APP_URL}/dashboard" style="${link}">Dashboard</a>&nbsp;&middot;&nbsp;<a href="${SITE_URL}/privacy" style="${link}">Privacy</a>&nbsp;&middot;&nbsp;<a href="${SITE_URL}/terms" style="${link}">Terms</a></p>
<p style="margin:0;font-size:12px;line-height:1.7;color:${TEXT3};font-family:${FONT};">Routely LLC &middot; 1817 Mears Pkwy, Margate, FL 33063</p>
<p style="margin:0;font-size:12px;line-height:1.7;color:${TEXT3};font-family:${FONT};">${escapeHtml(reason)}</p>
</td></tr></table>`;
}

export function render(m: Mail): Email {
  const body = [
    m.code ? codeBlock(m.code) : "",
    m.sectionLabel ? sectionLabel(m.sectionLabel) : "",
    m.rows ? rowsList(m.rows) : "",
    m.steps ? stepsList(m.steps) : "",
    m.cta ? button(m.cta) : "",
    m.cta?.showUrl
      ? smallCenter(
          `If the button doesn't open, use this link:<br><a href="${escapeHtml(m.cta.href)}" style="color:${BLUE};">${escapeHtml(m.cta.href)}</a>`,
        )
      : m.ctaNote
        ? smallCenter(escapeHtml(m.ctaNote))
        : m.cta
          ? `<div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>`
          : "",
    m.note
      ? `<p style="margin:0 0 24px;font-size:14px;line-height:1.55;color:${TEXT2};font-family:${FONT};">${escapeHtml(m.note)}</p>`
      : "",
  ].join("");

  // Hybrid fluid table, as in the drivers' emails: width="600" for Outlook, max-width:600px for every other client.
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(m.subject)}</title></head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:${FONT};">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${PAGE_BG};"><tr><td align="center" style="padding:32px 16px 0;">
<table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;"><tr><td align="center">
<img src="${LOGO_URL}" width="120" alt="Routely" style="display:block;border:0;height:auto;" />
</td></tr></table>
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:22px;overflow:hidden;">
${hero(m)}
${m.meta ? metaStrip(m.meta) : ""}
<tr><td style="padding:26px 36px 8px;">${body}</td></tr>
${help()}
</table>
</td></tr></table>
${footer(m.reason)}
</body></html>`;

  const text = [
    `${m.title}.`,
    "",
    ...(m.name ? [`Hi ${m.name},`, ""] : []),
    m.lead,
    ...(m.meta ? ["", ...m.meta.map((c) => `${c.label}: ${c.value}`)] : []),
    ...(m.code
      ? [
          "",
          m.code.value,
          m.code.expiry,
          "Keep this code private. Routely will never call, text or email you to ask for it.",
        ]
      : []),
    ...(m.rows ? ["", ...m.rows.map(([label, value]) => `${label}: ${value}`)] : []),
    ...(m.steps ? ["", ...m.steps.map((s, i) => `${i + 1}. ${s.title} — ${s.desc}`)] : []),
    ...(m.cta ? ["", `${m.cta.label}: ${m.cta.href}`] : []),
    ...(m.ctaNote ? [m.ctaNote] : []),
    ...(m.note ? ["", m.note] : []),
    "",
    "--",
    `Questions? Reply to this email${PHONE_DISPLAY ? ` or call ${PHONE_DISPLAY}` : ""}.`,
    "Routely LLC · 1817 Mears Pkwy, Margate, FL 33063",
    m.reason,
  ].join("\n");

  return { subject: m.subject, html, text };
}
