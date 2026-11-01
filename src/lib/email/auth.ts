import { getSupabaseAdmin } from "@/lib/supabase";

import { sendEmail } from "./send";
import { resetPassword, teamInvite } from "./templates";

/* The web never asks Supabase to send mail: generateLink does not call auth-send-email-hook (that hook and the SMTP
 * belong to the driver app) and is outside the platform email rate limit. So the cooldown below is the only limit. */
const APP_URL = "https://app.routelypro.com";
const RESET_WAIT_MS = 60_000;
const TEAM_INVITE_EXPIRES =
  "This link expires in 15 minutes. If it does, sign up with this email and we'll send you a new one.";

/** E-02 with the code only: admin resets on its sign in page. A driver's email is not in user_profiles. */
export async function sendPasswordReset(email: string) {
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase.from("user_profiles").select("user_id").eq("email", email).maybeSingle();
  if (!profile) return;
  const { data: current } = await supabase.auth.admin.getUserById(profile.user_id);
  const lastSent = current.user?.recovery_sent_at;
  if (lastSent && Date.now() - new Date(lastSent).getTime() < RESET_WAIT_MS) return;
  const { data, error } = await supabase.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data.properties) {
    console.error("[email] recovery link failed:", error?.message);
    return;
  }
  await sendEmail(email, resetPassword({ code: data.properties.email_otp, email }));
}

export async function inviterName(userId: string | null | undefined) {
  if (!userId) return null;
  const { data } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("full_name")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.full_name ?? null;
}

/** E-03. Creates the auth user when needed and returns its id. */
export async function sendTeamInvite(a: { email: string; company: string; role: string; inviter?: string | null }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.generateLink({ type: "invite", email: a.email });
  if (error || !data.user) {
    console.error("[email] invite link failed:", error?.message);
    return null;
  }
  await supabase.auth.admin.updateUserById(data.user.id, { app_metadata: { source: "web" } });
  const url = `${APP_URL}/auth/accept?token_hash=${data.properties.hashed_token}`;
  const sent = await sendEmail(a.email, teamInvite({ ...a, url, expires: TEAM_INVITE_EXPIRES }));
  return sent ? data.user.id : null;
}
