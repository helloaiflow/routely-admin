import { getSupabaseAdmin } from "@/lib/supabase";

import { sendEmail } from "./send";
import { resetPassword, teamInvite } from "./templates";
import { createHash, randomBytes } from "node:crypto";

/* The web never asks Supabase to send mail: generateLink does not call auth-send-email-hook (that hook and the SMTP
 * belong to the driver app) and is outside the platform email rate limit. So the cooldown below is the only limit. */
const APP_URL = "https://app.routelypro.com";
const RESET_WAIT_MS = 60_000;
const INVITE_DAYS = 7;

type InviteRole = "admin" | "dispatcher" | "viewer";

const ROLE_LABELS: Record<InviteRole, string> = { admin: "Admin", dispatcher: "Dispatcher", viewer: "Viewer" };

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

/** invitations.role only allows the setup roles, so page access maps onto the closest one for the email and the invite
 * page. What the invitee really gets stays on the pending tenant_members row. Same mapping as routely-client. */
function inviteRoleFor(permissions: Record<string, boolean>): InviteRole {
  if (permissions.settings || permissions.billing) return "admin";
  return permissions.orders ? "dispatcher" : "viewer";
}

/** E-03. Same invitation as routely-client's Settings -> Team: routely-client's /invite/{token} creates the account and
 * activates the pending tenant_members row. Nothing is kept if the email cannot be sent. */
export async function createTeamInvitation(a: {
  tenantId: number;
  invitedBy: string;
  company: string;
  email: string;
  permissions: Record<string, boolean>;
}) {
  const supabase = getSupabaseAdmin();
  const role = inviteRoleFor(a.permissions);
  const token = randomBytes(32).toString("base64url");
  const { data: invitation, error } = await supabase
    .from("invitations")
    .insert({
      tenant_id: a.tenantId,
      email: a.email,
      role,
      token_hash: createHash("sha256").update(token).digest("hex"),
      expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
      invited_by: a.invitedBy,
    })
    .select("id")
    .single();
  if (error || !invitation) {
    if (error?.code !== "23505") console.error("[invite] not created:", error?.message);
    return { ok: false, duplicate: error?.code === "23505" };
  }

  const now = new Date().toISOString();
  const { error: memberError } = await supabase.from("tenant_members").insert({
    tenant_id: a.tenantId,
    clerk_user_id: `invite:${invitation.id}`,
    email: a.email,
    role: "member",
    active: false,
    invited_by: a.invitedBy,
    invitation_id: invitation.id,
    invitation_status: "pending",
    page_permissions: a.permissions,
    doc: { invited_role: role },
    created_at: now,
    updated_at: now,
  });
  const sent =
    !memberError &&
    (await sendEmail(
      a.email,
      teamInvite({
        company: a.company,
        role: ROLE_LABELS[role],
        inviter: await inviterName(a.invitedBy),
        url: `${APP_URL}/invite/${token}`,
        expires: `This invitation expires in ${INVITE_DAYS} days.`,
      }),
    ));
  if (sent) return { ok: true, duplicate: false, id: invitation.id };

  console.error("[invite] not sent:", memberError?.message ?? "email failed");
  await supabase.from("tenant_members").delete().eq("invitation_id", invitation.id);
  await supabase.from("invitations").delete().eq("id", invitation.id);
  return { ok: false, duplicate: false };
}
