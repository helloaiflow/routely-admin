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
      return NextResponse.json({ error: "No Stripe customer found" }, { status: 400 });
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://routely-client.vercel.app"}/dashboard/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/billing-portal]", err);
    return NextResponse.json({ error: "Failed to create portal session" }, { status: 500 });
  }
}
