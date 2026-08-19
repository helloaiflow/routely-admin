import { NextResponse } from "next/server";

import { type CreateOrderResult, createOrder, fireN8nBackup, genTracking, type OrderBody } from "@/lib/create-order";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

async function dispatchOrder(tenantId: number, body: Record<string, unknown>): Promise<Partial<CreateOrderResult>> {
  try {
    const result = await createOrder(tenantId, body as OrderBody);
    return result;
  } catch (err) {
    console.error("[pay/dispatchOrder] createOrder failed:", err);
    try {
      await fireN8nBackup(tenantId, body as OrderBody);
    } catch (backupErr) {
      console.error("[pay/dispatchOrder] backup also failed:", backupErr);
    }
    return { dispatch_status: "backup_queued" };
  }
}

/* GUARDRAIL (2026-08-19 — ported from routely-client a06ea5a): this route
 * used to charge Stripe immediately at stop-creation time (off-session
 * PaymentIntent on a saved card, or a Checkout Session), computed from the
 * LEGACY tenants.doc.price_per_stop/price_per_mile fields — entirely
 * disconnected from tenants.billing_rates and billing_ledger. Every
 * delivery is ALSO billed for real, unconditionally, by record_attempt()
 * on its delivered/failed transition (app/services/billing.py,
 * routely-api) — so any tenant charged here would be charged a SECOND
 * time, at a DIFFERENT rate, with no reconciliation between the two. The
 * only thing standing between production traffic and that double charge
 * was tenants.plan_type staying "trial" — a single tenant-editable field,
 * not a real guard. Same fix as routely-client: this route no longer
 * calls Stripe at all, for any plan_type — dispatching directly
 * (payment_status: "paid") and letting record_attempt() do the one real
 * charge, as designed. */
export async function POST(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    stops,
    miles,
    same_day_fee,
    package_type,
    delivery_type,
    pickup_address,
    delivery_address,
    delivery_city,
    delivery_state,
    delivery_zip,
  } = body as {
    stops: number;
    miles: number;
    same_day_fee?: number;
    package_type?: string;
    delivery_type?: string;
    pickup_address?: string;
    delivery_address?: string;
    delivery_city?: string;
    delivery_state?: string;
    delivery_zip?: string;
  };

  const supabase = getSupabaseAdmin();
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("billing_rates")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!tenantRow) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  // Informational only below — nothing here is charged. Same source
  // record_attempt() bills from (see calculate/route.ts's identical fix).
  const rates = (tenantRow.billing_rates ?? {}) as Record<string, number>;
  const pricePerStop = (Number(rates.package) || 0) / 100;
  const pricePerMile = (Number(rates.per_mile) || 0) / 100;
  const totalDollars = stops * pricePerStop + miles * pricePerMile + (same_day_fee || 0);

  // Reserve/Charge/Release + mileage-precompute (2026-08-19): this route
  // creates a stop directly (no draft step), so it never went through
  // POST /v1/billing/reservations at all — the gap that made
  // mileage-precompute-with-refusal unsafe to ship in isolation (see the
  // design report). Mint the stop_id here, reserve against it BEFORE
  // dispatch, then hand the SAME id to createOrder so the real stop is
  // created under the id the reservation is keyed to.
  const stopId = genTracking();
  const reserveDoc = {
    stop_type: "delivery",
    service: {
      type: delivery_type === "on_demand" ? "on_demand" : delivery_type === "same_day" ? "same_day" : "local",
    },
    package: { type: package_type },
    pickup_address,
    address: { street: delivery_address, city: delivery_city, state: delivery_state, zip: delivery_zip },
  };
  let reserveResp: Response;
  try {
    reserveResp = await fetch(`${FASTAPI_BASE}/v1/billing/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": FASTAPI_SECRET },
      body: JSON.stringify({ tenant_id: ctx.tenantId, stop_id: stopId, doc: reserveDoc }),
    });
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  if (reserveResp.status === 402) {
    const err = await reserveResp.json().catch(() => ({}));
    return NextResponse.json({ error: err.error || "insufficient_funds", detail: err.detail ?? err }, { status: 402 });
  }
  if (!reserveResp.ok) {
    return NextResponse.json({ error: "Reservation failed" }, { status: 502 });
  }

  const result = await dispatchOrder(ctx.tenantId, {
    ...body,
    tenant_id: ctx.tenantId,
    tracking_id: stopId,
    payment_status: "paid",
    total_amount: totalDollars,
  });

  return NextResponse.json({
    ok: true,
    method: "billed_on_delivery",
    amount: totalDollars,
    requires_payment: false,
    rtscan_id: result.rtscan_id,
    tracking_number: result.tracking_number,
    dispatch_status: result.dispatch_status,
    label_url: result.label_url,
  });
}
