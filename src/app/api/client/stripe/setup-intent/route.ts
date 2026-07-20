import { NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe";
import { requirePagePermission } from "@/lib/tenant";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data: row } = await supabase
    .from("tenants")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  const t = (row?.doc ?? {}) as Record<string, any>;
  const stripe = getStripe();

  let stripeCustomerId = row?.stripe_customer_id ?? t.stripe_customer_id;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: row?.email || t.email || ctx.user?.emailAddresses?.[0]?.emailAddress || undefined,
      name: row?.company_name || t.company_name || undefined,
      metadata: { tenant_id: String(ctx.tenantId) },
    });
    stripeCustomerId = customer.id;

    const doc = { ...t, stripe_customer_id: stripeCustomerId };
    await supabase
      .from("tenants")
      .update({
        stripe_customer_id: stripeCustomerId,
        doc,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", ctx.tenantId);
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
