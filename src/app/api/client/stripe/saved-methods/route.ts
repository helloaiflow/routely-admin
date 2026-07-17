import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requirePagePermission } from "@/lib/tenant";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

export async function GET() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = ctx.user?.emailAddresses?.[0]?.emailAddress;
  if (!email) return NextResponse.json({ methods: [] });

  try {
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length === 0) return NextResponse.json({ methods: [] });

    const customerId = existing.data[0].id;
    const pms = await stripe.customers.listPaymentMethods(customerId, { type: "card", limit: 10 });

    const methods = pms.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? "card",
      last4: pm.card?.last4 ?? "****",
      exp_month: pm.card?.exp_month,
      exp_year: pm.card?.exp_year,
      funding: pm.card?.funding,
      name: pm.billing_details?.name ?? null,
    }));

    return NextResponse.json({ methods, customer_id: customerId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error loading saved methods";
    return NextResponse.json({ error: msg, methods: [] }, { status: 500 });
  }
}
