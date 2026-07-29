import { type NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/* GET /api/client/stops/[stop_id]/billing-lines — Billing v2.1: read-only
 * list of every ATTEMPT billed for this stop (2 trips = 2 lines), newest
 * attempt first. Each line is immutable once invoiced. */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ stop_id: string }> }) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { stop_id } = await params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("billing_ledger")
    .select(
      "id, attempt_seq, outcome, resolved_type, resolved_via, units, amount_cents, routely_cents, driver_cents, flag, flag_reason, invoiced_at, invoice_id, attempted_at",
    )
    .eq("stop_id", stop_id)
    .eq("tenant_id", Number(ctx.tenantId))
    .order("attempt_seq", { ascending: false });
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ lines: data ?? [] });
}
