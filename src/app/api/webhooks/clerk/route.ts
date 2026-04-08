import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { type, data } = payload;

    if (type === "user.created") {
      const db = await getDb();

      // Check if tenant already exists for this user
      const existing = await db.collection("tenants").findOne({
        email: data.email_addresses?.[0]?.email_address?.toLowerCase(),
      });
      if (existing) {
        // Update clerk_user_id if missing
        if (!existing.clerk_user_id) {
          await db
            .collection("tenants")
            .updateOne({ _id: existing._id }, { $set: { clerk_user_id: data.id, updated_at: new Date() } });
        }
        return NextResponse.json({ success: true, existing: true });
      }

      // Auto-increment tenant_id
      const last = await db.collection("tenants").findOne({}, { sort: { tenant_id: -1 } });
      const tenant_id = (last?.tenant_id ?? 0) + 1;

      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const firstName = data.first_name ?? "";
      const lastName = data.last_name ?? "";
      const email = data.email_addresses?.[0]?.email_address ?? "";

      const doc = {
        tenant_id,
        company_name: "",
        contact_name: `${firstName} ${lastName}`.trim(),
        email: email.toLowerCase(),
        phone: data.phone_numbers?.[0]?.phone_number ?? "",
        clerk_user_id: data.id,
        clerk_org_id: "",
        spoke_depot_id: "",
        spoke_depot_name: "",
        spoke_api_key: "",
        plan: "free_trial",
        plan_type: "free_trial",
        price_per_package: 0,
        price_per_mile: 0,
        billing_cycle: "monthly",
        trial_ends_at: trialEndsAt,
        stripe_customer_id: "",
        stripe_subscription_id: "",
        packages_this_month: 0,
        miles_this_month: 0,
        features: {
          ai_agent_calls: false,
          proof_of_delivery: true,
          pickup_delivery: true,
          advanced_reports: false,
          web_order_creation: false,
          api_access: false,
          max_users: 1,
        },
        status: "pending_setup",
        client_portal_enabled: false,
        vapi_assistant_id: null,
        telnyx_number: "",
        service_areas: [],
        createdAt: new Date(),
        updated_at: new Date(),
      };

      await db.collection("tenants").insertOne(doc);

      sendTelegramMessage(
        `🎉 <b>NEW TENANT REGISTERED</b>\n\n` +
          `👤 <b>Name:</b> ${doc.contact_name || "N/A"}\n` +
          `📧 <b>Email:</b> ${doc.email}\n` +
          `🆔 <b>Tenant ID:</b> ${tenant_id}\n` +
          `📋 <b>Plan:</b> Free Trial (14 days)\n` +
          `⏰ <b>Trial ends:</b> ${trialEndsAt.toLocaleDateString()}\n` +
          `🔧 <b>Status:</b> Pending Setup`,
      ).catch((err) => console.error("[Telegram webhook error]", err));

      return NextResponse.json({ success: true, tenant_id }, { status: 201 });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[POST /api/webhooks/clerk]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
