import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

/** The invitee finished setting a password: mark the invite accepted. Idempotent. */
export async function POST() {
  const p = await getSessionProfile();
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  await supabase
    .from("user_profiles")
    .update({ accepted_at: now, updated_at: now })
    .eq("user_id", p.user_id)
    .is("accepted_at", null);
  await supabase
    .from("tenant_members")
    .update({ active: true, invitation_status: "accepted", accepted_at: now, updated_at: now })
    .eq("clerk_user_id", p.user_id)
    .eq("invitation_status", "pending");
  return NextResponse.json({ ok: true });
}
