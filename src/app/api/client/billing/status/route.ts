import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

export async function GET() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data: row } = await supabase.from("tenants").select("*").eq("tenant_id", ctx.tenantId).maybeSingle();

  if (!row) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const t = (row.doc ?? {}) as Record<string, any>;

  // Outstanding is derived from billing_ledger, never stored on the tenant row.
  const { data: outstandingRow } = await supabase
    .from("v_tenant_outstanding")
    .select("outstanding_cents")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  const tenant = {
    plan_type: row.plan_type ?? t.plan_type,
    billing_method: t.billing_method,
    billing_status: t.billing_status,
    price_per_stop: t.price_per_stop,
    price_per_mile: t.price_per_mile,
    stripe_customer_id: row.stripe_customer_id ?? t.stripe_customer_id,
    stripe_default_payment_method: t.stripe_default_payment_method,
    billing_cycle_start: t.billing_cycle_start,
    billing_cycle_end: t.billing_cycle_end,
    trial_ends_at: t.trial_ends_at,
    packages_this_month: t.packages_this_month,
    outstanding_routes_count: t.outstanding_routes_count,
    outstanding_amount: Number(outstandingRow?.outstanding_cents ?? 0) / 100,
    past_due_since: t.past_due_since,
  };

  return NextResponse.json({ tenant });
}
