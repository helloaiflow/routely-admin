import { NextResponse } from "next/server";

import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

/* Consolidated Stripe webhook (2026-08 billing v3) — this repo previously had
 * TWO separate webhook route files (`/api/stripe/webhook` and
 * `/api/webhooks/stripe`) with overlapping event sets (both independently
 * handled `setup_intent.succeeded`, with different tenant-resolution logic)
 * and NO event-ID dedup in either — a Stripe retry or both URLs registered
 * in parallel could double-write state. Merged into one handler, with every
 * event checked against `stripe_webhook_events` (event_id UNIQUE) before any
 * side effect runs. The Stripe Dashboard's webhook endpoint must point ONLY
 * at this URL going forward — see the Phase 1 final report.
 *
 * `invoice.paid` / `invoice.payment_failed` are also the ONLY place a
 * billing_documents row is ever marked paid/past_due — never the frontend's
 * success response (per the money-safety rule: webhook-only confirmation). */

type Supa = ReturnType<typeof getSupabaseAdmin>;

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

async function patchTenantDoc(supabase: Supa, tenantId: number, mutate: (doc: Record<string, unknown>) => void) {
  const { data: row } = await supabase.from("tenants").select("doc").eq("tenant_id", tenantId).maybeSingle();
  if (!row) return;
  const doc = { ...((row.doc ?? {}) as Record<string, unknown>) };
  mutate(doc);
  await supabase.from("tenants").update({ doc, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Exactly-once processing: insert the event ID before doing any work: if
  // it's already there (a Stripe retry, or the same event delivered twice),
  // skip silently — this is the guard neither prior handler had.
  const { error: dedupError } = await supabase
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, type: event.type });
  if (dedupError) {
    // Unique-violation === already processed. Any other error: log and still
    // 200 (Stripe will retry on non-2xx; we'd rather investigate than cause
    // a retry storm for a transient Supabase blip).
    if (dedupError.code === "23505") {
      return NextResponse.json({ received: true, deduped: true });
    }
    console.error("[stripe/webhook] dedup insert failed (processing anyway):", dedupError);
  }

  const appUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || "https://app.routelypro.com";

  switch (event.type) {
    case "setup_intent.succeeded": {
      const si = event.data.object as Stripe.SetupIntent;
      if (si.customer && si.payment_method) {
        await stripe.customers.update(si.customer as string, {
          invoice_settings: { default_payment_method: si.payment_method as string },
        });
        await patchTenantByCustomer(supabase, si.customer, { default_payment_method_id: si.payment_method });
        // Also resolve by Customer metadata (the other prior handler's
        // strategy) — cheap and covers tenants matched by metadata instead
        // of the promoted stripe_customer_id column.
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
      const pm = event.data.object as Stripe.PaymentMethod;
      if (pm.customer) {
        await patchTenantByCustomer(supabase, pm.customer, { default_payment_method_id: pm.id });
      }
      break;
    }

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
      // Per-order prepayment flow (routely-admin/client "new pickup" checkout)
      // — untouched by billing v3, out of scope for the ledger/document system.
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = Number.parseInt(session.metadata?.tenant_id || "0", 10);
      if (session.payment_status === "paid" && tenantId) {
        if (session.customer && session.payment_intent) {
          try {
            const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string);
            if (pi.payment_method) {
              await stripe.paymentMethods.attach(pi.payment_method as string, {
                customer: session.customer as string,
              });
              await patchTenantDoc(supabase, tenantId, (doc) => {
                doc.stripe_default_payment_method = pi.payment_method;
              });
            }
          } catch (err) {
            console.error("[webhook] card save error:", err);
          }
        }

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

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const meta = (invoice.metadata as Record<string, string>) || {};
      const tenantId = Number.parseInt(meta.tenant_id || "0", 10);
      // Billing v3: if this invoice was created by close_cycle_for_tenant,
      // its metadata carries our document_id — flip billing_documents to
      // 'paid' here (webhook-only confirmation; never on a frontend response).
      const documentId = meta.document_id ? Number.parseInt(meta.document_id, 10) : null;
      if (documentId) {
        await supabase
          .from("billing_documents")
          .update({
            status: "paid",
            amount_paid_cents: invoice.amount_paid ?? invoice.amount_due ?? 0,
            paid_at: new Date().toISOString(),
            stripe_invoice_id: invoice.id,
          })
          .eq("id", documentId);
      }
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
      const meta = (invoice.metadata as Record<string, string>) || {};
      const tenantId = Number.parseInt(meta.tenant_id || "0", 10);
      const documentId = meta.document_id ? Number.parseInt(meta.document_id, 10) : null;
      if (documentId) {
        await supabase.from("billing_documents").update({ status: "past_due" }).eq("id", documentId);
      }
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
