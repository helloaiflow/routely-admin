import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

const SAME_DAY_FEE = 49.99;

export async function POST(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { stops, miles, delivery_type } = body as { stops: number; miles: number; delivery_type?: string };

  if (typeof stops !== "number" || typeof miles !== "number") {
    return NextResponse.json({ error: "stops and miles are required numbers" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: row } = await supabase
    .from("tenants")
    .select("plan_type, doc, billing_rates")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const tenant = (row.doc ?? {}) as Record<string, number | string | undefined>;
  const planKey = (row.plan_type ?? tenant.plan_type ?? "trial") as string;
  // Same source record_attempt() bills from — tenants.billing_rates, integer
  // cents (package/per_mile). Previously read the legacy doc.price_per_stop/
  // price_per_mile fields, which quoted a different number than what the
  // ledger actually charged.
  const rates = (row.billing_rates ?? {}) as Record<string, number>;
  const pricePerStop = (Number(rates.package) || 0) / 100;
  const pricePerMile = (Number(rates.per_mile) || 0) / 100;

  const stopsCost = stops * pricePerStop;
  const milesCost = miles * pricePerMile;
  const sameDayFee = delivery_type === "same_day" ? SAME_DAY_FEE : 0;
  const total = Math.round((stopsCost + milesCost + sameDayFee) * 100) / 100;

  return NextResponse.json({
    stops,
    miles,
    price_per_stop: pricePerStop,
    price_per_mile: pricePerMile,
    stops_cost: stopsCost,
    miles_cost: milesCost,
    same_day_fee: sameDayFee,
    delivery_type: delivery_type || "next_day",
    total,
    currency: "usd",
    plan_type: planKey,
    billing_method: tenant.billing_method,
    is_trial: planKey === "trial" || planKey === "free",
  });
}
