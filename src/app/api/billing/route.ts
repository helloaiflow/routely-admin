import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import clientPromise from "@/lib/mongodb";
import { getStripe } from "@/lib/stripe";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const client = await clientPromise;
    const db = client.db();
    const tenant = await db.collection("tenants").findOne({ clerk_user_id: userId });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    let paymentMethod = null;
    if (tenant.stripe_customer_id && tenant.default_payment_method_id) {
      try {
        const pm = await getStripe().paymentMethods.retrieve(tenant.default_payment_method_id);
        paymentMethod = {
          id: pm.id,
          brand: pm.card?.brand,
          last4: pm.card?.last4,
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
        };
      } catch {
        // Payment method may have been detached
      }
    }

    return NextResponse.json({
      plan: tenant.plan_type || "free",
      paymentTerm: tenant.payment_term || "on_demand",
      paymentType: tenant.payment_type || "card",
      stripeCustomerId: tenant.stripe_customer_id || null,
      subscriptionStatus: tenant.subscription_status || null,
      trialEndsAt: tenant.trial_ends_at || null,
      paymentMethod,
    });
  } catch (err) {
    console.error("[billing] GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { paymentTerm, paymentType } = body;

    const client = await clientPromise;
    const db = client.db();

    const update: Record<string, unknown> = { updated_at: new Date() };
    if (paymentTerm) update.payment_term = paymentTerm;
    if (paymentType) update.payment_type = paymentType;

    await db.collection("tenants").updateOne({ clerk_user_id: userId }, { $set: update });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[billing] PUT error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
