import { NextResponse } from "next/server";

import clientPromise from "@/lib/mongodb";
import { getStripe } from "@/lib/stripe";

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

  const client = await clientPromise;
  const db = client.db();

  switch (event.type) {
    case "setup_intent.succeeded": {
      const si = event.data.object;
      if (si.customer && si.payment_method) {
        await getStripe().customers.update(si.customer as string, {
          invoice_settings: { default_payment_method: si.payment_method as string },
        });
        await db
          .collection("tenants")
          .updateOne(
            { stripe_customer_id: si.customer },
            { $set: { default_payment_method_id: si.payment_method, updated_at: new Date() } },
          );
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as unknown as Record<string, unknown>;
      await db.collection("tenants").updateOne(
        { stripe_customer_id: sub.customer },
        {
          $set: {
            subscription_id: sub.id,
            subscription_status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end,
            updated_at: new Date(),
          },
        },
      );
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as unknown as Record<string, unknown>;
      await db
        .collection("tenants")
        .updateOne(
          { stripe_customer_id: sub.customer },
          { $set: { subscription_status: "canceled", updated_at: new Date() } },
        );
      break;
    }
    case "payment_method.attached": {
      const pm = event.data.object;
      if (pm.customer) {
        await db
          .collection("tenants")
          .updateOne(
            { stripe_customer_id: pm.customer },
            { $set: { default_payment_method_id: pm.id, updated_at: new Date() } },
          );
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
