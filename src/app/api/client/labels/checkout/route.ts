import { NextResponse } from "next/server";

import { getShippo } from "@/lib/shippo";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

const MARKUP = 1.5; // 50% commission — client pays Shippo raw × 1.5 (same rule as /shippo/rates)

/** Creates a label order in `label_orders` with the SERVER-validated price.
 *  The client never dictates the amount: we re-retrieve the rate from Shippo
 *  by rate_id and recompute client_price = raw × 1.5 here. Payment itself is
 *  handled by the existing /api/client/stripe/payment-intent + Stripe Element
 *  (card) or by postpay approval (tenant.postpay_enabled) — the follow-up
 *  /api/client/labels/purchase call verifies payment BEFORE buying the label. */
export async function POST(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { from_address, to_address, parcel, rate_id, payment_type, package_type } = body ?? {};

  if (!rate_id || !from_address?.street1 || !to_address?.street1) {
    return NextResponse.json({ error: "rate_id, from_address and to_address required" }, { status: 400 });
  }
  if (payment_type !== "card" && payment_type !== "postpay") {
    return NextResponse.json({ error: "payment_type must be card|postpay" }, { status: 400 });
  }

  const tenantId = String(ctx.tenantId ?? "1");

  // Postpay is a privilege — verify against the tenant row, never the client.
  if (payment_type === "postpay") {
    const { data: tenant } = await getSupabaseAdmin()
      .from("tenants")
      .select("postpay_enabled, credit_limit, outstanding_amount")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!tenant?.postpay_enabled) {
      return NextResponse.json({ error: "Postpay is not enabled for this account" }, { status: 403 });
    }
  }

  try {
    // Server-side price: re-fetch the rate so a tampered client can't change it.
    const shippo = getShippo();
    // biome-ignore lint/suspicious/noExplicitAny: Shippo SDK v4
    const rate = await (shippo.rates.get as any)(rate_id);
    if (!rate?.amount) {
      return NextResponse.json({ error: "Rate not found or expired — please re-quote" }, { status: 400 });
    }
    const raw_price = Number(rate.amount);
    const client_price = Math.round(raw_price * MARKUP * 100) / 100;
    const amount_cents = Math.round(client_price * 100);
    if (amount_cents < 50) {
      return NextResponse.json({ error: "Rate amount invalid" }, { status: 400 });
    }

    const order_id = `LBL-${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
    const nowIso = new Date().toISOString();
    const fromAddress = {
      ...from_address,
      // Same server-side email guarantee as /shippo/rates (Shippo requires it).
      email: from_address.email || ctx.user?.emailAddresses?.[0]?.emailAddress || "support@routelypro.com",
    };
    const rateObj = {
      rate_id,
      provider: rate.provider ?? "",
      service: rate.servicelevel?.name ?? rate.servicelevel?.token ?? "",
      days: rate.estimatedDays ?? null,
      raw_price,
      client_price,
      currency: rate.currency ?? "USD",
    };
    const paymentObj = { type: payment_type, amount_cents };
    const shippoObj = { shipment_id: rate.shipment ?? null };

    // Full original Mongo document, preserved in `doc`.
    const doc = {
      order_id,
      tenant_id: tenantId,
      created_by: ctx.userId,
      created_at: nowIso,
      status: "pending_payment", // → purchased | refunded | failed
      from_address: fromAddress,
      to_address, // includes recipient email when provided (used for the shipped notification)
      parcel: parcel ?? null,
      package_type: typeof package_type === "string" ? package_type : null,
      rate: rateObj,
      payment: paymentObj,
      shippo: shippoObj,
    };

    const { error: insertError } = await getSupabaseAdmin()
      .from("label_orders")
      .insert({
        order_id,
        tenant_id: Number(ctx.tenantId ?? 1),
        created_by: ctx.userId,
        status: "pending_payment",
        from_address: fromAddress,
        to_address,
        parcel: parcel ?? null,
        rate: rateObj,
        payment: paymentObj,
        shippo: shippoObj,
        created_at: nowIso,
        updated_at: nowIso,
        doc,
      });
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ order_id, amount_cents, client_price });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Checkout error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
