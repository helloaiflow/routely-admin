import { NextResponse } from "next/server";

import { auth, currentUser } from "@clerk/nextjs/server";

import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const user = await currentUser();
    const email = user?.emailAddresses[0]?.emailAddress || "";
    const name = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();

    const supabase = getSupabaseAdmin();
    const { data: tenant } = await supabase
      .from("tenants")
      .select("tenant_id, stripe_customer_id, doc")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    const existingCustomerId =
      tenant?.stripe_customer_id ?? (tenant?.doc as Record<string, unknown> | undefined)?.stripe_customer_id;
    if (existingCustomerId) {
      return NextResponse.json({ customerId: existingCustomerId });
    }

    const customer = await getStripe().customers.create({
      email,
      name,
      metadata: { clerk_user_id: userId, tenant_id: String(tenant?.tenant_id || "") },
    });

    const doc = { ...((tenant?.doc ?? {}) as Record<string, unknown>), stripe_customer_id: customer.id, billing_email: email };
    await supabase
      .from("tenants")
      .update({ stripe_customer_id: customer.id, doc, updated_at: new Date().toISOString() })
      .eq("clerk_user_id", userId);

    return NextResponse.json({ customerId: customer.id });
  } catch (err) {
    console.error("[stripe/create-customer]", err);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}
