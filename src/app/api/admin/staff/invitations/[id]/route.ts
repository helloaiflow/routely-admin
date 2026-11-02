import { NextResponse } from "next/server";

import { canAssign, canManage, getStaff, noAccess, resendStaffInvitation } from "@/lib/staff";
import { getSupabaseAdmin } from "@/lib/supabase";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const staff = await getStaff();
  if (!canManage(staff)) return noAccess(staff);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const supabase = getSupabaseAdmin();
  const { data: invitation } = await supabase
    .from("platform_invitations")
    .select("id, email, platform_role, expires_at")
    .eq("id", id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (!canAssign(staff, invitation.platform_role)) {
    return NextResponse.json({ error: "Only a super admin can change a super admin" }, { status: 403 });
  }

  if (body?.action === "revoke") {
    await supabase.from("platform_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true });
  }
  if (body?.action !== "resend") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const result = await resendStaffInvitation(invitation, staff);
  if (result === "wait") return NextResponse.json({ error: "Wait a minute before sending it again" }, { status: 429 });
  if (result === "failed") return NextResponse.json({ error: "We could not send the invitation" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
