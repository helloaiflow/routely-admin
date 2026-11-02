import { NextResponse } from "next/server";

import { canAssign, canManage, getStaff, isPlatformRole, noAccess, superAdminCount } from "@/lib/staff";
import { getSupabaseAdmin } from "@/lib/supabase";

type Params = { params: Promise<{ userId: string }> };

const BAN_DURATION = "876000h";

/* platform_role null removes the person from the team. user_profiles_scope forbids a profile with neither tenant nor
 * is_platform_admin, and deleting it would make the hook treat them as a driver, so the row stays inactive and banned. */
export async function PATCH(req: Request, { params }: Params) {
  const staff = await getStaff();
  if (!canManage(staff)) return noAccess(staff);

  const { userId } = await params;
  const body = await req.json().catch(() => null);
  const role = body?.platform_role ?? null;
  if (role !== null && !isPlatformRole(role)) return NextResponse.json({ error: "Unknown role" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: target } = await supabase
    .from("user_profiles")
    .select("user_id, platform_role")
    .eq("user_id", userId)
    .not("platform_role", "is", null)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Not on the team" }, { status: 404 });

  if (!canAssign(staff, role) || !canAssign(staff, target.platform_role)) {
    return NextResponse.json({ error: "Only a super admin can change a super admin" }, { status: 403 });
  }
  if (target.platform_role === "super_admin" && role !== "super_admin") {
    if (userId === staff.user_id) {
      return NextResponse.json({ error: "You can't remove your own super admin role", code: "SELF" }, { status: 409 });
    }
    if ((await superAdminCount()) <= 1) {
      return NextResponse.json({ error: "The platform needs a super admin", code: "LAST_SUPER_ADMIN" }, { status: 409 });
    }
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("user_profiles")
    .update(
      role
        ? { platform_role: role, updated_at: now }
        : { platform_role: null, active: false, deactivated_at: now, updated_at: now },
    )
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!role) await supabase.auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION });
  return NextResponse.json({ ok: true });
}
