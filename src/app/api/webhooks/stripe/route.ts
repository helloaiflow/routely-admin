import { NextResponse } from "next/server";

import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

type Supa = ReturnType<typeof getSupabaseAdmin>;

/** Read the tenant's `doc`, apply `mutate`, write it back — matched by tenant_id. */
async function patchTenantDoc(
  supabase: Supa,
  tenantId: number,
  mutate: (doc: Record<string, unknown>) => void,
) {
  const { data: row } = await supabase
    .from("tenants")
    .select("doc")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!row) return;
  const doc = { ...((row.doc ?? {}) as Record<string, unknown>) };
  mutate(doc);
  await supabase
    .from("tenants")
    .update({ doc, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
}

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Webhook error";
    console.error("Webhook signature error:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const appUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || "https://app.routelypro.com";

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const tenantId = Number.parseInt(pi.metadata?.tenant_id || "0", 10);
      if (tenantId) {
        const stops = Number.parseInt(pi.metadata?.stops || "0", 10);
        await patchTenantDoc(supabase, tenantId, (doc) => {
          doc.packages_this_month = (Number(doc.packages_this_month) || 0) + stops;
        });
      }
      break;
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = Number.parseInt(session.metadata?.tenant_id || "0", 10);
      if (session.payment_status === "paid" && tenantId) {
        // Save card
        if (session.customer && session.payment_intent) {
          try {
            const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string);
            if (pi.payment_method) {
              await stripe.paymentMethods.attach(pi.payment_method as string, { customer: session.customer as string });
              await patchTenantDoc(supabase, tenantId, (doc) => {
                doc.stripe_default_payment_method = pi.payment_method;
              });
            }
          } catch (err) {
            console.error("[webhook] card save error:", err);
          }
        }

        // Dispatch order
        const m = session.metadata || {};
        await fetch(`${appUrl}/api/client/orders/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal": "1" },
          body: JSON.stringify({
            tenant_id: tenantId,
            pickup_address: m.pickup_address || "",
            delivery_address: m.delivery_address || "",
            delivery_city: m.delivery_city || "",
            delivery_state: m.delivery_state || "FL",
            delivery_zip: m.delivery_zip || "",
            estimated_miles: Number.parseFloat(m.estimated_miles || "0"),
            recipient_name: m.recipient_name || "",
            recipient_phone: m.recipient_phone || "",
            package_type: m.package_type || "rx",
            rx_number: m.rx_number || "",
            gate_code: m.gate_code || "",
            notes: m.notes || "",
            delivery_date: m.delivery_date || "",
            delivery_type: m.delivery_type || "next_day",
            same_day_fee: Number.parseFloat(m.same_day_fee || "0"),
            stops: Number.parseInt(m.stops || "2", 10),
            miles: Number.parseFloat(m.estimated_miles || "0"),
            total_amount: (session.amount_total || 0) / 100,
            payment_status: "paid",
            stripe_checkout_session_id: session.id,
          }),
        }).catch((err) => console.error("[webhook] order create failed:", err));
      }
      break;
    }

    case "setup_intent.succeeded": {
      const si = event.data.object as Stripe.SetupIntent;
      if (si.customer && si.payment_method) {
        const customer = (await stripe.customers.retrieve(si.customer as string)) as Stripe.Customer;
        const tenantId = Number.parseInt(customer.metadata?.tenant_id || "0", 10);
        if (tenantId) {
          await patchTenantDoc(supabase, tenantId, (doc) => {
            doc.stripe_default_payment_method = si.payment_method;
          });
        }
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const tenantId = Number.parseInt((invoice.metadata as Record<string, string>)?.tenant_id || "0", 10);
      if (tenantId) {
        await patchTenantDoc(supabase, tenantId, (doc) => {
          doc.billing_status = "active";
          doc.past_due_since = null;
        });
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const tenantId = Number.parseInt((invoice.metadata as Record<string, string>)?.tenant_id || "0", 10);
      if (tenantId) {
        await patchTenantDoc(supabase, tenantId, (doc) => {
          doc.billing_status = "past_due";
          doc.past_due_since = new Date().toISOString();
        });
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
