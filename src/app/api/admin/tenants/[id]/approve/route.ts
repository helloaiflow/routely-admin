import { NextResponse } from "next/server";

import { canManage, getStaff } from "@/lib/staff";
import { getSupabaseAdmin } from "@/lib/supabase";

type Params = { params: Promise<{ id: string }> };

/* M17j: a sign up with risk signals waits in status 'review' (app.routelypro.com/src/lib/onboarding/review.ts).
 * Approving lets the tenant create stops; the signals stay in doc.review with who approved it. */
export async function POST(_req: Request, { params }: Params) {
  const staff = await getStaff();
  if (!canManage(staff)) return NextResponse.json({ error: "Only admins can approve tenants." }, { status: 403 });

  const tenantId = Number((await params).id);
  if (!Number.isInteger(tenantId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("status, onboarding_step, doc")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (tenant.status !== "review") return NextResponse.json({ ok: true, status: tenant.status });

  const now = new Date().toISOString();
  const status = tenant.onboarding_step === "done" ? "active" : "pending_setup";
  const doc = { ...tenant.doc, review: { ...tenant.doc?.review, approved_at: now, approved_by: staff.user_id } };
  const { error } = await supabase
    .from("tenants")
    .update({ status, doc, updated_at: now })
    .eq("tenant_id", tenantId)
    .eq("status", "review");
  if (error) return NextResponse.json({ error: "Could not approve this tenant." }, { status: 500 });
  return NextResponse.json({ ok: true, status });
}
