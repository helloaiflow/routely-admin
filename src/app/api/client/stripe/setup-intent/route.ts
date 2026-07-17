import { NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe";
import { getDb, requirePagePermission } from "@/lib/tenant";

export async function POST() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const tenant = await db.collection("tenants").findOne({ tenant_id: ctx.tenantId });
  const stripe = getStripe();

  let stripeCustomerId = tenant?.stripe_customer_id;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: tenant?.email || ctx.user?.emailAddresses?.[0]?.emailAddress || undefined,
      name: tenant?.company_name || undefined,
      metadata: { tenant_id: String(ctx.tenantId) },
    });
    stripeCustomerId = customer.id;
    await db
      .collection("tenants")
      .updateOne(
        { tenant_id: ctx.tenantId },
        { $set: { stripe_customer_id: stripeCustomerId, updated_at: new Date() } },
      );
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
  });

  return NextResponse.json({
    client_secret: setupIntent.client_secret,
    customer_id: stripeCustomerId,
  });
}
