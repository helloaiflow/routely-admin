import { NextResponse } from "next/server";

import { canAssign, canManage, createStaffInvitation, getStaff, isPlatformRole, noAccess } from "@/lib/staff";
import { getSupabaseAdmin } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

export async function GET() {
  const staff = await getStaff();
  if (!staff) return noAccess(staff);
  const supabase = getSupabaseAdmin();
  const [{ data: members, error }, { data: invitations }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("user_id, email, full_name, platform_role, active")
      .not("platform_role", "is", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("platform_invitations")
      .select("id, email, platform_role, expires_at")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({
    me: { user_id: staff.user_id, platform_role: staff.platform_role },
    members,
    invitations: (invitations ?? []).map((i) => ({
      ...i,
      expired: new Date(i.expires_at).getTime() < Date.now(),
    })),
  });
}

export async function POST(req: Request) {
  const staff = await getStaff();
  if (!canManage(staff)) return noAccess(staff);

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase();
  const role = body?.platform_role;
  if (!EMAIL_RE.test(email) || !isPlatformRole(role)) {
    return NextResponse.json({ error: "Enter an email and a role" }, { status: 400 });
  }
  if (!canAssign(staff, role)) {
    return NextResponse.json({ error: "Only a super admin can invite a super admin" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("tenant_id, platform_role")
    .eq("email", email)
    .maybeSingle();
  if (profile?.platform_role) return NextResponse.json({ error: "Already on the team" }, { status: 409 });
  if (profile?.tenant_id) {
    return NextResponse.json({ error: "This email belongs to a tenant account" }, { status: 409 });
  }

  // An expired invitation holds the unique index but no longer means anything.
  await supabase
    .from("platform_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .ilike("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .lt("expires_at", new Date().toISOString());

  const result = await createStaffInvitation(email, role, staff);
  if (result === "duplicate") return NextResponse.json({ error: "This email already has an invitation" }, { status: 409 });
  if (result === "failed") return NextResponse.json({ error: "We could not send the invitation" }, { status: 502 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
