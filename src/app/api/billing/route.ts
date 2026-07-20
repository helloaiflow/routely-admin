import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("tenants")
      .select("*")
      .eq("clerk_user_id", userId)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const tenant = (row.doc ?? {}) as Record<string, unknown>;
    const stripeCustomerId = row.stripe_customer_id ?? tenant.stripe_customer_id;
    const defaultPaymentMethodId = tenant.default_payment_method_id as string | undefined;

    let paymentMethod = null;
    if (stripeCustomerId && defaultPaymentMethodId) {
      try {
        const pm = await getStripe().paymentMethods.retrieve(defaultPaymentMethodId);
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
      plan: row.plan_type || tenant.plan_type || "free",
      paymentTerm: tenant.payment_term || "on_demand",
      paymentType: tenant.payment_type || "card",
      stripeCustomerId: stripeCustomerId || null,
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

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("tenants")
      .select("doc")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    const doc = { ...((row?.doc ?? {}) as Record<string, unknown>) };
    if (paymentTerm) doc.payment_term = paymentTerm;
    if (paymentType) doc.payment_type = paymentType;

    await supabase
      .from("tenants")
      .update({ doc, updated_at: new Date().toISOString() })
      .eq("clerk_user_id", userId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[billing] PUT error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
