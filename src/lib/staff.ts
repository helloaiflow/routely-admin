import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { getSessionProfile, type UserProfile } from "@/lib/auth/supabase-server";
import { sendEmail } from "@/lib/email/send";
import { staffInvite } from "@/lib/email/templates";
import { getSupabaseAdmin } from "@/lib/supabase";

export const PLATFORM_ROLES = ["super_admin", "admin", "support"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  support: "Support",
};

const ADMIN_URL = "https://admin.routelypro.com";
const INVITE_DAYS = 7;
const INVITE_MS = INVITE_DAYS * 86_400_000;
const RESEND_WAIT_MS = 60_000;

export const isPlatformRole = (value: unknown): value is PlatformRole =>
  PLATFORM_ROLES.includes(value as PlatformRole);

export type Staff = UserProfile & { platform_role: PlatformRole };

/** Staff are the active profiles with a platform_role; user_profiles is the only source (D62). */
export async function getStaff() {
  const profile = (await getSessionProfile()) as (UserProfile & { platform_role?: PlatformRole | null }) | null;
  return profile?.platform_role ? (profile as Staff) : null;
}

export const noAccess = (staff: Staff | null) =>
  staff
    ? NextResponse.json({ error: "Your role can't manage the team", code: "FORBIDDEN" }, { status: 403 })
    : NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

export const canManage = (staff: Staff | null): staff is Staff =>
  staff?.platform_role === "super_admin" || staff?.platform_role === "admin";

/** Only a super_admin may hand out super_admin, or touch one. */
export const canAssign = (staff: Staff, role: string | null | undefined) =>
  role !== "super_admin" || staff.platform_role === "super_admin";

export async function superAdminCount() {
  const { count } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("platform_role", "super_admin")
    .eq("active", true);
  return count ?? 0;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function sendStaffInvite(email: string, role: PlatformRole, inviter: string | null, token: string) {
  return sendEmail(
    email,
    staffInvite({
      role: PLATFORM_ROLE_LABELS[role],
      inviter,
      url: `${ADMIN_URL}/staff-invite/${token}`,
      expires: `This invitation expires in ${INVITE_DAYS} days.`,
    }),
  );
}

const newToken = () => {
  const token = randomBytes(32).toString("base64url");
  return { token, token_hash: hashToken(token), expires_at: new Date(Date.now() + INVITE_MS).toISOString() };
};

/** Nothing is kept if the email can't be sent. */
export async function createStaffInvitation(email: string, role: PlatformRole, inviter: Staff) {
  const { token, ...secret } = newToken();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("platform_invitations")
    .insert({ email, platform_role: role, invited_by: inviter.user_id, ...secret })
    .select("id")
    .single();
  if (error || !data) return error?.code === "23505" ? "duplicate" : "failed";
  if (await sendStaffInvite(email, role, inviter.full_name, token)) return "sent";
  await supabase.from("platform_invitations").delete().eq("id", data.id);
  return "failed";
}

/** A resend issues a new link: only the hash is stored, so the old one stops working. */
export async function resendStaffInvitation(
  invitation: { id: string; email: string; platform_role: PlatformRole; expires_at: string },
  inviter: Staff,
) {
  if (Date.now() - (new Date(invitation.expires_at).getTime() - INVITE_MS) < RESEND_WAIT_MS) return "wait";
  const { token, ...secret } = newToken();
  const { error } = await getSupabaseAdmin().from("platform_invitations").update(secret).eq("id", invitation.id);
  if (error) return "failed";
  return (await sendStaffInvite(invitation.email, invitation.platform_role, inviter.full_name, token)) ? "sent" : "failed";
}

/** The open, unexpired invitation behind a link, or why there is none. */
export async function findStaffInvitation(token: string) {
  const { data } = await getSupabaseAdmin()
    .from("platform_invitations")
    .select("id, email, platform_role, invited_by, expires_at, accepted_at, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data) return { invalid: "invalid" } as const;
  if (data.accepted_at) return { invalid: "accepted" } as const;
  if (data.revoked_at) return { invalid: "revoked" } as const;
  if (new Date(data.expires_at).getTime() < Date.now()) return { invalid: "expired" } as const;
  return { invitation: data };
}
