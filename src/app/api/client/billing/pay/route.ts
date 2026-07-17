import { NextResponse } from "next/server";

import { type CreateOrderResult, createOrder, fireN8nBackup, type OrderBody } from "@/lib/create-order";
import { getStripe } from "@/lib/stripe";
import { getDb, requirePagePermission } from "@/lib/tenant";

const PLAN_PRICES: Record<string, { stop: number; mile: number }> = {
  trial: { stop: 0, mile: 0 },
  free: { stop: 0, mile: 0 },
  starter: { stop: 16.0, mile: 1.65 },
  professional: { stop: 14.0, mile: 1.5 },
  enterprise: { stop: 12.0, mile: 1.35 },
};

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

export async function POST(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    stops,
    miles,
    description,
    pickup_address,
    delivery_address,
    delivery_city,
    delivery_state,
    delivery_zip,
    recipient_name,
    recipient_phone,
    recipient_email,
    package_type,
    rx_number,
    gate_code,
    notes,
    delivery_date,
    delivery_type,
    same_day_fee,
    estimated_miles,
    order_id,
    requires_signature,
    collect_cod,
    collect_amount,
  } = body;

  const db = await getDb();
  const tenant = await db.collection("tenants").findOne({ tenant_id: ctx.tenantId });
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const planKey = tenant.plan_type || "trial";
  const prices = PLAN_PRICES[planKey] || PLAN_PRICES.trial;
  const pricePerStop = tenant.price_per_stop > 0 ? tenant.price_per_stop : prices.stop;
  const pricePerMile = tenant.price_per_mile > 0 ? tenant.price_per_mile : prices.mile;
  const totalDollars = stops * pricePerStop + miles * pricePerMile + (same_day_fee || 0);
  const total = Math.round(totalDollars * 100);

  // ─ TRIAL / FREE ───────────────────────────────────────
  if (planKey === "trial" || planKey === "free" || total === 0) {
    const result = await dispatchOrder(ctx.tenantId, {
      ...body,
      tenant_id: ctx.tenantId,
      payment_status: "paid",
      total_amount: 0,
    });
    return NextResponse.json({
      ok: true,
      method: "trial",
      amount: 0,
      requires_payment: false,
      rtscan_id: result.rtscan_id,
      tracking_number: result.tracking_number,
      dispatch_status: result.dispatch_status,
      label_url: result.label_url,
    });
  }

  const stripe = getStripe();

  // Ensure stripe customer exists
  let stripeCustomerId = tenant.stripe_customer_id;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: tenant.email || undefined,
      name: tenant.company_name || undefined,
      metadata: { tenant_id: String(ctx.tenantId) },
    });
    stripeCustomerId = customer.id;
    await db
      .collection("tenants")
      .updateOne({ tenant_id: ctx.tenantId }, { $set: { stripe_customer_id: stripeCustomerId } });
  }

  const metaDescription = description || `Delivery: ${pickup_address} → ${delivery_address}`;

  // ─ SAVED CARD ─────────────────────────────────────────
  if (tenant.stripe_default_payment_method) {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: total,
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: tenant.stripe_default_payment_method,
      confirm: true,
      off_session: true,
      description: metaDescription,
      metadata: {
        tenant_id: String(ctx.tenantId),
        order_id: order_id || "",
        stops: String(stops),
        miles: String(miles),
      },
    });

    const result = await dispatchOrder(ctx.tenantId, {
      ...body,
      tenant_id: ctx.tenantId,
      payment_status: "paid",
      stripe_payment_intent_id: paymentIntent.id,
      total_amount: totalDollars,
    });

    return NextResponse.json({
      ok: true,
      method: "saved_card",
      amount: totalDollars,
      payment_intent_id: paymentIntent.id,
      status: paymentIntent.status,
      requires_payment: false,
      rtscan_id: result.rtscan_id,
      tracking_number: result.tracking_number,
      dispatch_status: result.dispatch_status,
      label_url: result.label_url,
    });
  }

  // ─ STRIPE CHECKOUT ────────────────────────────────────
  const lineItems = [
    {
      price_data: {
        currency: "usd" as const,
        unit_amount: total - Math.round((same_day_fee || 0) * 100),
        product_data: { name: "Routely Delivery", description: metaDescription },
      },
      quantity: 1,
    },
  ];

  if (same_day_fee > 0) {
    lineItems.push({
      price_data: {
        currency: "usd" as const,
        unit_amount: Math.round((same_day_fee || 0) * 100),
        product_data: { name: "Same Day Delivery Fee", description: "Priority same-day dispatch" },
      },
      quantity: 1,
    });
  }

  const checkoutMeta: Record<string, string> = {
    tenant_id: String(ctx.tenantId),
    order_id: order_id || "",
    stops: String(stops),
    miles: String(miles || estimated_miles || 0),
    pickup_address: String(pickup_address || ""),
    delivery_address: String(delivery_address || ""),
    delivery_city: String(delivery_city || ""),
    delivery_state: String(delivery_state || "FL"),
    delivery_zip: String(delivery_zip || ""),
    recipient_name: String(recipient_name || ""),
    recipient_phone: String(recipient_phone || ""),
    recipient_email: String(recipient_email || ""),
    package_type: String(package_type || "rx"),
    rx_number: String(rx_number || ""),
    gate_code: String(gate_code || ""),
    notes: String(notes || ""),
    delivery_date: String(delivery_date || ""),
    delivery_type: String(delivery_type || "next_day"),
    same_day_fee: String(same_day_fee || 0),
    estimated_miles: String(estimated_miles || miles || 0),
    requires_signature: String(requires_signature ?? false),
    collect_cod: String(collect_cod ?? false),
    collect_amount: String(collect_amount || ""),
  };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    line_items: lineItems,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.routelypro.com"}/dashboard/orders?payment=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.routelypro.com"}/dashboard/orders?payment=cancelled`,
    metadata: checkoutMeta,
  });

  return NextResponse.json({
    ok: true,
    method: "checkout",
    amount: totalDollars,
    checkout_url: session.url,
    requires_payment: true,
  });
}
