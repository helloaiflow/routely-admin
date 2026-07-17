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
  const { stop_id, amount_cents, carrier, recipient_name, delivery_address } = body;

  if (!amount_cents || amount_cents < 50) {
    return NextResponse.json({ error: "Invalid amount (min $0.50)" }, { status: 400 });
  }

  try {
    // Find or create Stripe customer for this tenant/user
    let customerId: string | undefined;
    const email = ctx.user?.emailAddresses?.[0]?.emailAddress;
    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email,
          name: `${ctx.user?.firstName ?? ""} ${ctx.user?.lastName ?? ""}`.trim() || email,
          metadata: { tenant_id: String(ctx.tenantId ?? "1"), clerk_user_id: ctx.userId },
        });
        customerId = customer.id;
      }
    }

    // PaymentIntent — setup_future_usage saves the card to the customer
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: "usd",
      ...(customerId ? { customer: customerId } : {}),
      setup_future_usage: "on_session",
      automatic_payment_methods: { enabled: true },
      metadata: {
        stop_id,
        tenant_id: String(ctx.tenantId ?? "1"),
        carrier: carrier ?? "",
        recipient: recipient_name ?? "",
        delivery: delivery_address ?? "",
      },
      description: `Routely · ${stop_id} → ${recipient_name}`,
    });

    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
