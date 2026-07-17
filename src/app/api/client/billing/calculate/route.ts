import { NextResponse } from "next/server";

import { getDb, requirePagePermission } from "@/lib/tenant";

const PLAN_PRICES: Record<string, { stop: number; mile: number }> = {
  trial: { stop: 0, mile: 0 },
  free: { stop: 0, mile: 0 },
  starter: { stop: 16.0, mile: 1.65 },
  professional: { stop: 14.0, mile: 1.5 },
  enterprise: { stop: 12.0, mile: 1.35 },
};

const SAME_DAY_FEE = 49.99;

export async function POST(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { stops, miles, delivery_type } = body as { stops: number; miles: number; delivery_type?: string };

  if (typeof stops !== "number" || typeof miles !== "number") {
    return NextResponse.json({ error: "stops and miles are required numbers" }, { status: 400 });
  }

  const db = await getDb();
  const tenant = await db
    .collection("tenants")
    .findOne(
      { tenant_id: ctx.tenantId },
      { projection: { plan_type: 1, price_per_stop: 1, price_per_mile: 1, billing_method: 1 } },
    );

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const planKey = tenant.plan_type || "trial";
  const prices = PLAN_PRICES[planKey] || PLAN_PRICES.trial;
  const pricePerStop = tenant.price_per_stop > 0 ? tenant.price_per_stop : prices.stop;
  const pricePerMile = tenant.price_per_mile > 0 ? tenant.price_per_mile : prices.mile;

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
