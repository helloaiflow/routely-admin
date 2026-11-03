export type Email = { subject: string; html: string; text: string };

/** The one sender of the SaaS emails. dispatch@ stays for operational notices. */
export async function sendEmail(to: string, email: Email) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY?.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Routely <noreply@routelypro.com>",
      reply_to: "support@routelypro.com",
      to,
      ...email,
    }),
  }).catch(() => null);
  if (!res?.ok) console.error("[email] send failed:", res?.status, await res?.text().catch(() => ""));
  return Boolean(res?.ok);
}
