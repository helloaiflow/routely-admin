import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import clientPromise from "@/lib/mongodb";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const client = await clientPromise;
    const db = client.db();
    const tenant = await db.collection("tenants").findOne({ clerk_user_id: userId });

    if (!tenant?.stripe_customer_id) {
      return NextResponse.json({ error: "No Stripe customer. Create one first." }, { status: 400 });
    }

    const setupIntent = await getStripe().setupIntents.create({
      customer: tenant.stripe_customer_id,
      payment_method_types: ["card"],
    });

    return NextResponse.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error("[stripe/create-setup-intent]", err);
    return NextResponse.json({ error: "Failed to create setup intent" }, { status: 500 });
  }
}
