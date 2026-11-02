import type { Email } from "./send";

/* E-01…E-06, from 08_TECH/assets/onboarding/emails-prototype.dc.html. Email clients need tables and inline styles.
 * routely-client keeps an identical copy of this file. */
const APP_URL = "https://app.routelypro.com";
const FONT = "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BLUE = "#0167ff";
const INK = "#0b0f14";
const RED = "#be123c";
const FOOTER = "Routely · HIPAA-ready medical delivery";
const QUESTIONS = "Questions? Reply to this email or write to support@routelypro.com";

type Row = [label: string, value: string];
type Mail = {
  subject: string;
  title: string;
  body: string;
  code?: string;
  rows?: Row[];
  cta?: { label: string; href: string; color?: string };
  note: string;
};

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function rowsHtml(rows: Row[]) {
  const cells = rows.map(([label, value], i) => {
    const line = i < rows.length - 1 ? "border-bottom:1px solid #f1f3f5;" : "";
    return `<tr><td style="${line}padding:10px 14px;font-size:14px;color:#3d454d">${escapeHtml(label)}</td><td align="right" style="${line}padding:10px 14px;font-size:14px;font-weight:700;color:${INK}">${escapeHtml(value)}</td></tr>`;
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef0f3;border-radius:12px;border-collapse:separate;margin:0 0 16px">${cells.join("")}</table>`;
}

function render(m: Mail): Email {
  const code = m.code
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="padding:14px 22px;border-radius:12px;background:#f5f8ff;border:1px solid #dbe6ff;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;font-weight:800;letter-spacing:10px;color:${INK}">${m.code}</td></tr></table>`
    : "";
  const button = m.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="border-radius:999px;background:${m.cta.color ?? BLUE}"><a href="${escapeHtml(m.cta.href)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(m.cta.label)}</a></td></tr></table>`
    : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(m.subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f5;font-family:${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:576px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="padding:24px 32px;border-bottom:1px solid #eef0f3"><img src="${APP_URL}/onboarding/routely-wordmark-dark.png" alt="Routely" height="26" style="height:26px;width:auto;display:block;border:0"></td></tr>
<tr><td style="padding:28px 32px 12px;font-size:15px;line-height:1.55;color:#3d454d">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-0.4px;color:${INK}">${escapeHtml(m.title)}</h1>
<p style="margin:0 0 16px">${escapeHtml(m.body)}</p>
${code}${m.rows ? rowsHtml(m.rows) : ""}${button}
<p style="margin:0 0 16px;font-size:13px;color:#8a929a">${escapeHtml(m.note)}</p>
</td></tr>
<tr><td style="padding:18px 32px;background:#fbfbfc;border-top:1px solid #eef0f3;font-size:12px;line-height:1.6;color:#8a929a">${FOOTER}<br>${QUESTIONS}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    m.title,
    "",
    m.body,
    ...(m.code ? ["", m.code] : []),
    ...(m.rows ? ["", ...m.rows.map(([label, value]) => `${label}: ${value}`)] : []),
    ...(m.cta ? ["", `${m.cta.label}: ${m.cta.href}`] : []),
    "",
    m.note,
    "",
    "--",
    FOOTER,
    QUESTIONS,
  ].join("\n");

  return { subject: m.subject, html, text };
}

const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

export function verifyEmail(a: { code: string; name?: string | null; company?: string | null }) {
  const name = firstName(a.name);
  const what = a.company ? `your ${a.company} workspace` : "your workspace";
  return render({
    subject: `Your Routely verification code: ${a.code}`,
    title: "Verify your email",
    body: `${name ? `Hi ${name}, enter` : "Enter"} this code in Routely to finish creating ${what}.`,
    code: a.code,
    note: "The code expires in 15 minutes. Didn't sign up? You can ignore this email.",
  });
}

/** Without resetUrl (routely-admin) the code is the only way in. */
export function resetPassword(a: { code: string; email: string; resetUrl?: string }) {
  return render({
    subject: "Reset your Routely password",
    title: "Reset your password",
    body: a.resetUrl
      ? `We got a request to reset the password for ${a.email}. Use the button, or enter this code on the reset page.`
      : `We got a request to reset the password for ${a.email}. Enter this code on the sign in page.`,
    code: a.code,
    cta: a.resetUrl ? { label: "Reset password", href: a.resetUrl } : undefined,
    note: `${a.resetUrl ? "The link and code expire" : "The code expires"} in 15 minutes. If you didn't ask for this, your password stays the same.`,
  });
}

export function teamInvite(a: {
  company: string;
  role: string;
  inviter?: string | null;
  url: string;
  expires: string;
}) {
  const from = a.inviter || a.company;
  return render({
    subject: `${from} invited you to ${a.inviter ? `${a.company} on ` : ""}Routely`,
    title: `Join ${a.company}`,
    body: `${from} invited you to ${a.inviter ? `${a.company} on ` : ""}Routely as ${/^[AEIOU]/.test(a.role) ? "an" : "a"} ${a.role}.`,
    rows: [
      ["Company", a.company],
      ["Role", a.role],
    ],
    cta: { label: "Accept invitation", href: a.url },
    note: a.expires,
  });
}

export function staffInvite(a: { role: string; inviter?: string | null; url: string; expires: string }) {
  const from = a.inviter || "Routely";
  return render({
    subject: `${from} invited you to the Routely admin console`,
    title: "Join the RoutelyPro team",
    body: `${from} invited you to the Routely admin console with the ${a.role} role.`,
    rows: [["Role", a.role]],
    cta: { label: "Accept invitation", href: a.url },
    note: a.expires,
  });
}

export function welcome(a: {
  name?: string | null;
  company: string;
  plan: string;
  price: string;
  trialEnds: string;
  hub?: string | null;
}) {
  const name = firstName(a.name);
  return render({
    subject: "Your Routely workspace is ready",
    title: name ? `Welcome to Routely, ${name}` : "Welcome to Routely",
    body: `${a.company} is set up. Your 14-day trial of the ${a.plan} plan is active.`,
    rows: [
      ["Plan", `${a.plan} · ${a.price}/mo`],
      ["Trial ends", a.trialEnds],
      ...(a.hub ? ([["First hub", a.hub]] as Row[]) : []),
    ],
    cta: { label: "Go to dashboard", href: `${APP_URL}/dashboard/default` },
    note: "Next: create your first stop or invite your drivers.",
  });
}

export function trialEnding(a: {
  shortDate: string;
  date: string;
  plan: string;
  amount: string;
  last4?: string | null;
}) {
  return render({
    subject: `Your Routely trial ends on ${a.shortDate}`,
    title: "Your trial ends in 3 days",
    body: `On ${a.date} we'll charge your card for the ${a.plan} plan. No action needed to keep going.`,
    rows: [
      ["Plan", a.plan],
      ["Amount", `${a.amount} / month`],
      ...(a.last4 ? ([["Card", `•••• ${a.last4}`]] as Row[]) : []),
    ],
    cta: { label: "Manage billing", href: `${APP_URL}/dashboard/billing`, color: INK },
    note: `Want to change plans or cancel? Do it before ${a.shortDate} in Billing.`,
  });
}

export function paymentFailed(a: { amount: string; pausedOn: string; last4?: string | null }) {
  const card = a.last4 ? `the card ending in ${a.last4}` : "your card";
  return render({
    subject: "Action needed: your Routely payment failed",
    title: "Your payment didn't go through",
    body: `We couldn't charge ${a.amount} to ${card}. Update your card to keep creating stops.`,
    rows: [
      ["Amount", a.amount],
      ["New stops paused on", a.pausedOn],
    ],
    cta: { label: "Update card", href: `${APP_URL}/dashboard/billing`, color: RED },
    note: "Your data, routes in progress and drivers are not affected.",
  });
}
