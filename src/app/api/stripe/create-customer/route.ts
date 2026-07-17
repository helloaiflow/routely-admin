import { NextResponse } from "next/server";

import { auth, currentUser } from "@clerk/nextjs/server";

import clientPromise from "@/lib/mongodb";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const user = await currentUser();
    const email = user?.emailAddresses[0]?.emailAddress || "";
    const name = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();

    const client = await clientPromise;
    const db = client.db();
    const tenant = await db.collection("tenants").findOne({ clerk_user_id: userId });

    if (tenant?.stripe_customer_id) {
      return NextResponse.json({ customerId: tenant.stripe_customer_id });
    }

    const customer = await getStripe().customers.create({
      email,
      name,
      metadata: { clerk_user_id: userId, tenant_id: String(tenant?.tenant_id || "") },
    });

    await db
      .collection("tenants")
      .updateOne(
        { clerk_user_id: userId },
        { $set: { stripe_customer_id: customer.id, billing_email: email, updated_at: new Date() } },
      );

    return NextResponse.json({ customerId: customer.id });
  } catch (err) {
    console.error("[stripe/create-customer]", err);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}
