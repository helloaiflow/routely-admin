import { NextResponse } from "next/server";

import { getDb, requirePagePermission } from "@/lib/tenant";

export async function GET() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const tenant = await db.collection("tenants").findOne(
    { tenant_id: ctx.tenantId },
    {
      projection: {
        plan_type: 1,
        billing_method: 1,
        billing_status: 1,
        price_per_stop: 1,
        price_per_mile: 1,
        stripe_customer_id: 1,
        stripe_default_payment_method: 1,
        billing_cycle_start: 1,
        billing_cycle_end: 1,
        trial_ends_at: 1,
        packages_this_month: 1,
        outstanding_routes_count: 1,
        outstanding_amount: 1,
        past_due_since: 1,
      },
    },
  );

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  return NextResponse.json({ tenant });
}
