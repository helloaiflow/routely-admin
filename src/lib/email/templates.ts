import { APP_URL, render } from "./layout";

/* Emails v2 (M17j): the account emails. The shared layout lives in ./layout (M18); E-02 carries the code
 * because admin has no /reset page, and staffInvite is admin's own. */
const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || null;
const ACCOUNT_REASON = "You’re receiving this because you have a Routely account.";
const SIGNUP_REASON = "You’re receiving this because this email was used to sign up for Routely.";

/** E-01 */
export function verifyEmail(a: { code: string; name?: string | null; company?: string | null }) {
  const what = a.company ? `your ${a.company} workspace` : "your workspace";
  return render({
    subject: `Your Routely verification code: ${a.code}`,
    chip: { variant: "blue", label: "Verification code" },
    title: "Verify your email",
    name: firstName(a.name),
    lead: `Enter this code in Routely to finish creating ${what}.`,
    code: { value: a.code, expiry: "This code expires in 15 minutes." },
    note: "Didn't sign up? You can ignore this email — no account is created without the code.",
    reason: SIGNUP_REASON,
  });
}

/** E-02. Without resetUrl the code is the only way in. */
export function resetPassword(a: { code: string; email: string; resetUrl?: string }) {
  return render({
    subject: "Reset your Routely password",
    chip: { variant: "blue", label: "Password reset" },
    title: "Reset your password",
    lead: a.resetUrl
      ? `We got a request to reset the password for ${a.email}. Use the button, or enter this code on the reset page.`
      : `We got a request to reset the password for ${a.email}. Enter this code on the sign in page.`,
    code: { value: a.code, expiry: `${a.resetUrl ? "The link and code expire" : "This code expires"} in 15 minutes.` },
    cta: a.resetUrl ? { label: "Reset password", href: a.resetUrl } : undefined,
    note: "If you didn't ask for this, your password stays the same.",
    reason: ACCOUNT_REASON,
  });
}

/** E-03 */
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
    chip: { variant: "gray", label: "Invitation" },
    title: `Join ${a.company}`,
    lead: `${from} invited you to ${a.inviter ? `${a.company} on ` : ""}Routely as ${/^[AEIOU]/.test(a.role) ? "an" : "a"} ${a.role}.`,
    meta: [
      { label: "Company", value: a.company },
      { label: "Role", value: a.role },
    ],
    cta: { label: "Accept invitation", href: a.url },
    ctaNote: a.expires,
    reason: `You’re receiving this because ${from} invited this email to Routely.`,
  });
}

/** E-04, when setup reaches O-19 (All set). */
export function welcome(a: {
  name?: string | null;
  company: string;
  plan: string;
  price: string;
  trialEnds: string;
  summary: [string, string][];
}) {
  return render({
    subject: "Your Routely workspace is ready",
    chip: { variant: "mint", label: "Setup complete" },
    title: "You’re all set",
    name: firstName(a.name),
    lead: `${a.company} is ready for its first delivery. Your 14-day trial of the ${a.plan} plan is active.`,
    meta: [
      { label: "Plan", value: a.price ? `${a.plan} · ${a.price}/mo` : a.plan },
      { label: "Trial ends", value: a.trialEnds },
    ],
    sectionLabel: "Your setup",
    rows: a.summary,
    cta: { label: "Create your first stop", href: `${APP_URL}/dashboard/orders/new` },
    ctaNote: "Nothing is charged until your trial ends. You can change any of this in Settings.",
    reason: ACCOUNT_REASON,
  });
}

/** E-05, from customer.subscription.trial_will_end. */
export function trialEnding(a: {
  shortDate: string;
  date: string;
  plan: string;
  amount: string;
  last4?: string | null;
}) {
  return render({
    subject: `Your Routely trial ends on ${a.shortDate}`,
    chip: { variant: "amber", label: "Trial ending" },
    title: "Your trial ends in 3 days",
    lead: `On ${a.date} we'll charge your card for the ${a.plan} plan. No action needed to keep going.`,
    meta: [
      { label: "Plan", value: a.plan },
      { label: "Amount", value: `${a.amount} / month` },
    ],
    rows: [["First charge", a.date], ...(a.last4 ? ([["Card", `•••• ${a.last4}`]] as [string, string][]) : [])],
    cta: { label: "Manage billing", href: `${APP_URL}/dashboard/billing` },
    ctaNote: `Want to change plans or cancel? Do it in Billing before ${a.shortDate}.`,
    reason: ACCOUNT_REASON,
  });
}

/** E-06 */
export function paymentFailed(a: { amount: string; pausedOn: string; last4?: string | null }) {
  const card = a.last4 ? `the card ending in ${a.last4}` : "your card";
  return render({
    subject: "Action needed: your Routely payment failed",
    chip: { variant: "rose", label: "Payment failed" },
    title: "Your payment didn't go through",
    lead: `We couldn't charge ${a.amount} to ${card}. Update your card to keep creating stops.`,
    meta: [
      { label: "Amount", value: a.amount },
      { label: "New stops paused on", value: a.pausedOn },
    ],
    cta: { label: "Update card", href: `${APP_URL}/dashboard/billing` },
    ctaNote: "Your data, routes in progress and drivers are not affected.",
    reason: ACCOUNT_REASON,
  });
}

/** Invitation to the RoutelyPro staff of the admin console. */
export function staffInvite(a: { role: string; inviter?: string | null; url: string; expires: string }) {
  const from = a.inviter || "Routely";
  return render({
    subject: `${from} invited you to the Routely admin console`,
    chip: { variant: "gray", label: "Invitation" },
    title: "Join the RoutelyPro team",
    lead: `${from} invited you to the Routely admin console with the ${a.role} role.`,
    meta: [{ label: "Role", value: a.role }],
    cta: { label: "Accept invitation", href: a.url },
    ctaNote: a.expires,
    reason: `You’re receiving this because ${from} invited this email to the Routely admin console.`,
  });
}
