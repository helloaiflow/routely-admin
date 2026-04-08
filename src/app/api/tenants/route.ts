import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const db = await getDb();

    if (id) {
      const tenant = await db.collection("tenants").findOne({
        $or: [{ tenant_id: Number.parseInt(id, 10) }, { clerk_user_id: id }],
      });
      return NextResponse.json({ tenant });
    }

    const tenants = await db.collection("tenants").find({}).sort({ tenant_id: 1 }).toArray();
    return NextResponse.json({ list: tenants, count: tenants.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getDb();

    // Auto-increment tenant_id
    const last = await db.collection("tenants").findOne({}, { sort: { tenant_id: -1 } });
    const tenant_id = (last?.tenant_id ?? 0) + 1;

    // Get plan features
    const planId = body.plan_type ?? "free_trial";
    const plan = await db.collection("saas_plans").findOne({ plan_id: planId });

    const trialEndsAt = planId === "free_trial" ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null;

    const doc = {
      tenant_id,
      company_name: body.company_name ?? body.businessName ?? "",
      contact_name: body.contact_name ?? body.contactName ?? "",
      email: (body.email ?? "").toLowerCase().trim(),
      phone: body.phone ?? "",
      // From quote form
      business_type: body.businessType ?? "",
      service_types: body.serviceTypes ?? [],
      pickups_per_month: body.pickupsPerMonth ?? "",
      service_area: body.serviceArea ?? "",
      zip: body.zip ?? "",
      hear_about: body.hearAbout ?? "",
      // Clerk
      clerk_user_id: body.clerk_user_id ?? "",
      clerk_org_id: body.clerk_org_id ?? "",
      // Spoke
      spoke_depot_id: "",
      spoke_depot_name: "",
      spoke_api_key: "",
      // Plan & billing
      plan: planId,
      plan_type: planId,
      price_per_package: plan?.price_per_package ?? 16.0,
      price_per_mile: plan?.price_per_mile ?? 1.65,
      billing_cycle: "monthly",
      trial_ends_at: trialEndsAt,
      stripe_customer_id: "",
      stripe_subscription_id: "",
      // Usage
      packages_this_month: 0,
      miles_this_month: 0,
      // Features
      features: plan?.features ?? {
        ai_agent_calls: false,
        proof_of_delivery: true,
        pickup_delivery: true,
        advanced_reports: false,
        web_order_creation: false,
        api_access: false,
        max_users: 1,
      },
      // Status
      status: body.status ?? "pending_setup",
      client_portal_enabled: false,
      // VAPI / Telnyx (provisioned later)
      vapi_assistant_id: null,
      telnyx_number: "",
      service_areas: body.serviceArea ? [body.serviceArea] : [],
      // Meta
      createdAt: new Date(),
      updated_at: new Date(),
    };

    await db.collection("tenants").insertOne(doc);
    return NextResponse.json({ success: true, tenant_id, doc }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/tenants]", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant_id, ...update } = body;
    const db = await getDb();

    await db
      .collection("tenants")
      .updateOne({ tenant_id: Number.parseInt(tenant_id) }, { $set: { ...update, updated_at: new Date() } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
