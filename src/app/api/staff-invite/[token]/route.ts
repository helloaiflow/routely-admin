import { NextResponse } from "next/server";

import { findStaffInvitation, PLATFORM_ROLE_LABELS } from "@/lib/staff";
import { getSupabaseAdmin } from "@/lib/supabase";

type Params = { params: Promise<{ token: string }> };

const gone = (reason: string) => NextResponse.json({ error: reason, code: "INVITE_INVALID" }, { status: 410 });

export async function GET(_req: Request, { params }: Params) {
  const found = await findStaffInvitation((await params).token);
  if (!found.invitation) return gone(found.invalid);
  const { email, platform_role } = found.invitation;
  const { data: profile } = await getSupabaseAdmin().from("user_profiles").select("user_id").eq("email", email).maybeSingle();
  return NextResponse.json({ email, role: PLATFORM_ROLE_LABELS[platform_role as keyof typeof PLATFORM_ROLE_LABELS], existing: Boolean(profile) });
}

/* Creates the account or links an earlier staff one. Never a tenant. The profile must exist before the first token:
 * custom_access_token_hook turns any auth user without a user_profiles row into a driver. */
export async function POST(req: Request, { params }: Params) {
  const found = await findStaffInvitation((await params).token);
  if (!found.invitation) return gone(found.invalid);
  const { id, email, platform_role, invited_by } = found.invitation;

  const body = await req.json().catch(() => null);
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("user_id, tenant_id")
    .eq("email", email)
    .maybeSingle();

  if (profile?.tenant_id) {
    return NextResponse.json({ error: "This email belongs to a tenant account", code: "TENANT_ACCOUNT" }, { status: 409 });
  }
  if (profile) {
    const { error } = await supabase
      .from("user_profiles")
      .update({ platform_role, active: true, deactivated_at: null, accepted_at: now, updated_at: now })
      .eq("user_id", profile.user_id);
    if (error) return NextResponse.json({ error: "We could not accept the invitation" }, { status: 500 });
    await supabase.auth.admin.updateUserById(profile.user_id, { ban_duration: "none" });
  } else {
    const fullName = String(body?.full_name ?? "").trim();
    const password = String(body?.password ?? "");
    if (!fullName) return NextResponse.json({ error: "Enter your name" }, { status: 400 });
    if (password.length < 8 || !/\d/.test(password)) {
      return NextResponse.json({ error: "Password needs 8+ characters and a number" }, { status: 400 });
    }
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (!created?.user) {
      if (createError?.code === "email_exists") {
        return NextResponse.json({ error: "This email already has an account", code: "EMAIL_EXISTS" }, { status: 409 });
      }
      return NextResponse.json({ error: "We could not create your account" }, { status: 500 });
    }
    const { error } = await supabase.from("user_profiles").insert({
      user_id: created.user.id,
      email,
      full_name: fullName,
      is_platform_admin: true,
      platform_role,
      active: true,
      invited_by,
      invited_at: now,
      accepted_at: now,
    });
    if (error) {
      await supabase.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: "We could not create your account" }, { status: 500 });
    }
  }

  await supabase.from("platform_invitations").update({ accepted_at: now }).eq("id", id);
  return NextResponse.json({ ok: true, email, existing: Boolean(profile) });
}
