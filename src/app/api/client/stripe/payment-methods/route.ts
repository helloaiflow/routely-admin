import { NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe";
import { requirePagePermission } from "@/lib/tenant";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data: row } = await supabase
    .from("tenants")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  const t = (row?.doc ?? {}) as Record<string, any>;
  const stripeCustomerId = row?.stripe_customer_id ?? t.stripe_customer_id;
  const defaultPm = t.stripe_default_payment_method;

  if (!stripeCustomerId) {
    return NextResponse.json({ payment_methods: [], default_pm: null });
  }

  const stripe = getStripe();
  const pms = await stripe.paymentMethods.list({
    customer: stripeCustomerId,
    type: "card",
  });

  return NextResponse.json({
    payment_methods: pms.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      exp_month: pm.card?.exp_month,
      exp_year: pm.card?.exp_year,
      is_default: pm.id === defaultPm,
    })),
    default_pm: defaultPm ?? null,
  });
}

export async function POST(request: Request) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { payment_method_id } = await request.json();
  const supabase = getSupabaseAdmin();

  const { data: row } = await supabase
    .from("tenants")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  const t = (row?.doc ?? {}) as Record<string, any>;
  const doc = { ...t, stripe_default_payment_method: payment_method_id };

  await supabase
    .from("tenants")
    .update({ doc, updated_at: new Date().toISOString() })
    .eq("tenant_id", ctx.tenantId);

  return NextResponse.json({ ok: true });
}
