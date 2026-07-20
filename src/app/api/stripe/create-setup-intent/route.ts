import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("tenants")
      .select("*")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    const t = (row?.doc ?? {}) as Record<string, any>;
    const stripeCustomerId = row?.stripe_customer_id ?? t.stripe_customer_id;

    if (!stripeCustomerId) {
      return NextResponse.json({ error: "No Stripe customer. Create one first." }, { status: 400 });
    }

    const setupIntent = await getStripe().setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
    });

    return NextResponse.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error("[stripe/create-setup-intent]", err);
    return NextResponse.json({ error: "Failed to create setup intent" }, { status: 500 });
  }
}
