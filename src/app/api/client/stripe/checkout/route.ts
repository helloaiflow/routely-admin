import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requirePagePermission } from "@/lib/tenant";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

export async function POST(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { stop_id, amount_cents, carrier, recipient_name, delivery_address, success_url, cancel_url } = body;

  if (!amount_cents || amount_cents < 50) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: amount_cents,
          product_data: {
            name: `Routely Delivery — ${stop_id}`,
            description: `${carrier} · ${recipient_name} · ${delivery_address}`,
          },
        },
        quantity: 1,
      }],
      success_url: success_url || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/orders/confirmed?session_id={CHECKOUT_SESSION_ID}&stop_id=${stop_id}`,
      cancel_url: cancel_url || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/orders/new`,
      metadata: {
        stop_id,
        tenant_id: String(ctx.tenantId ?? "1"),
        carrier,
        recipient: recipient_name,
      },
      payment_intent_data: {
        metadata: {
          stop_id,
          tenant_id: String(ctx.tenantId ?? "1"),
        },
      },
    });

    return NextResponse.json({ checkout_url: session.url, session_id: session.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
