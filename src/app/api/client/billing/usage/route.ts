import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/* GET /api/client/billing/usage — Billing v2: reads OUR ledger (the audit
 * spine), not Stripe meters. Uninvoiced period totals grouped by type +
 * Routely/driver split for on-demand + flagged needs_miles count. The values
 * ARE the upcoming-invoice preview (run-invoices bills exactly these lines). */

export async function GET() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = Number(ctx.tenantId);
  const supabase = getSupabaseAdmin();

  const { data: lines } = await supabase
    .from("billing_ledger")
    .select("resolved_type, units, amount_cents, routely_cents, driver_cents, flag")
    .eq("tenant_id", tenantId)
    .is("invoiced_at", null);

  const byType: Record<string, { lines: number; units: number; amount_cents: number; routely_cents: number; driver_cents: number }> = {};
  let flagged = 0;
  for (const l of lines ?? []) {
    if (l.flag) { flagged++; continue; }
    const g = (byType[l.resolved_type] ??= { lines: 0, units: 0, amount_cents: 0, routely_cents: 0, driver_cents: 0 });
    g.lines++;
    g.units += Number(l.units ?? 0);
    g.amount_cents += l.amount_cents ?? 0;
    g.routely_cents += l.routely_cents ?? 0;
    g.driver_cents += l.driver_cents ?? 0;
  }
  const total = Object.values(byType).reduce((s, g) => s + g.amount_cents, 0);
  return NextResponse.json({ by_type: byType, total_cents: total, flagged_needs_miles: flagged });
}
