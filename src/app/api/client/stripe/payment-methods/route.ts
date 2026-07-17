import { NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe";
import { getDb, requirePagePermission } from "@/lib/tenant";

export async function GET() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const tenant = await db.collection("tenants").findOne({ tenant_id: ctx.tenantId });

  if (!tenant?.stripe_customer_id) {
    return NextResponse.json({ payment_methods: [], default_pm: null });
  }

  const stripe = getStripe();
  const pms = await stripe.paymentMethods.list({
    customer: tenant.stripe_customer_id,
    type: "card",
  });

  return NextResponse.json({
    payment_methods: pms.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      exp_month: pm.card?.exp_month,
      exp_year: pm.card?.exp_year,
      is_default: pm.id === tenant.stripe_default_payment_method,
    })),
    default_pm: tenant.stripe_default_payment_method,
  });
}

export async function POST(request: Request) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { payment_method_id } = await request.json();
  const db = await getDb();

  await db
    .collection("tenants")
    .updateOne(
      { tenant_id: ctx.tenantId },
      { $set: { stripe_default_payment_method: payment_method_id, updated_at: new Date() } },
    );

  return NextResponse.json({ ok: true });
}
