import { NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

type Supa = ReturnType<typeof getSupabaseAdmin>;

/** Merge `changes` into the tenant's `doc` jsonb, matched by stripe_customer_id. */
async function patchTenantByCustomer(supabase: Supa, customer: unknown, changes: Record<string, unknown>) {
  if (!customer) return;
  const { data: row } = await supabase
    .from("tenants")
    .select("doc")
    .eq("stripe_customer_id", customer as string)
    .maybeSingle();
  if (!row) return;
  const doc = { ...((row.doc ?? {}) as Record<string, unknown>), ...changes };
  await supabase
    .from("tenants")
    .update({ doc, updated_at: new Date().toISOString() })
    .eq("stripe_customer_id", customer as string);
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  switch (event.type) {
    case "setup_intent.succeeded": {
      const si = event.data.object;
      if (si.customer && si.payment_method) {
        await getStripe().customers.update(si.customer as string, {
          invoice_settings: { default_payment_method: si.payment_method as string },
        });
        await patchTenantByCustomer(supabase, si.customer, { default_payment_method_id: si.payment_method });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as unknown as Record<string, unknown>;
      await patchTenantByCustomer(supabase, sub.customer, {
        subscription_id: sub.id,
        subscription_status: sub.status,
        cancel_at_period_end: sub.cancel_at_period_end,
      });
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as unknown as Record<string, unknown>;
      await patchTenantByCustomer(supabase, sub.customer, { subscription_status: "canceled" });
      break;
    }
    case "payment_method.attached": {
      const pm = event.data.object;
      if (pm.customer) {
        await patchTenantByCustomer(supabase, pm.customer, { default_payment_method_id: pm.id });
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
