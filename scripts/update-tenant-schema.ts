import * as dotenv from "dotenv";

import * as path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { MongoClient } from "mongodb";

async function main() {
  // biome-ignore lint/style/noNonNullAssertion: env validated at runtime
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db();

  await db.collection("tenants").updateOne(
    { tenant_id: 1 },
    {
      $set: {
        // Spoke
        spoke_depot_id: "",
        spoke_depot_name: "MedFlorida Pharmacy",
        spoke_api_key: "",
        // Billing
        plan_type: "enterprise",
        price_per_package: 0,
        price_per_mile: 0,
        billing_cycle: "monthly",
        trial_ends_at: null,
        stripe_customer_id: "",
        stripe_subscription_id: "",
        // Usage
        packages_this_month: 0,
        miles_this_month: 0,
        // Features
        features: {
          ai_agent_calls: true,
          proof_of_delivery: true,
          pickup_delivery: true,
          advanced_reports: true,
          web_order_creation: true,
          api_access: true,
          max_users: 999,
          max_packages_per_month: 999999,
        },
        // Client portal
        client_portal_enabled: true,
        // Meta
        updated_at: new Date(),
      },
    },
  );
  console.log("✅ tenant_id:1 updated with SaaS fields");

  // Create plans collection with 4 SaaS plans
  await db.collection("saas_plans").deleteMany({});
  await db.collection("saas_plans").insertMany([
    {
      plan_id: "free_trial",
      name: "Free Trial",
      description: "Try Routely free for 14 days",
      price_per_package: 0,
      price_per_mile: 0,
      duration_days: 14,
      max_packages: 50,
      features: {
        ai_agent_calls: false,
        proof_of_delivery: true,
        pickup_delivery: true,
        advanced_reports: false,
        web_order_creation: false,
        api_access: false,
        max_users: 1,
      },
      active: true,
      sort_order: 1,
    },
    {
      plan_id: "starter",
      name: "Starter",
      description: "Perfect for small clinics and pharmacies",
      price_per_package: 16.0,
      price_per_mile: 1.65,
      duration_days: null,
      max_packages: null,
      features: {
        ai_agent_calls: false,
        proof_of_delivery: true,
        pickup_delivery: true,
        advanced_reports: false,
        web_order_creation: false,
        api_access: false,
        max_users: 3,
      },
      active: true,
      sort_order: 2,
    },
    {
      plan_id: "professional",
      name: "Professional",
      description: "For growing medical practices",
      price_per_package: 14.0,
      price_per_mile: 1.5,
      duration_days: null,
      max_packages: null,
      features: {
        ai_agent_calls: true,
        proof_of_delivery: true,
        pickup_delivery: true,
        advanced_reports: true,
        web_order_creation: true,
        api_access: false,
        max_users: 10,
      },
      active: true,
      sort_order: 3,
    },
    {
      plan_id: "enterprise",
      name: "Enterprise",
      description: "Full power for hospitals and large networks",
      price_per_package: 12.0,
      price_per_mile: 1.35,
      duration_days: null,
      max_packages: null,
      features: {
        ai_agent_calls: true,
        proof_of_delivery: true,
        pickup_delivery: true,
        advanced_reports: true,
        web_order_creation: true,
        api_access: true,
        max_users: 999,
      },
      active: true,
      sort_order: 4,
    },
  ]);
  console.log("✅ saas_plans collection created with 4 plans");

  const tenant = await db.collection("tenants").findOne({ tenant_id: 1 });
  console.log("\n📋 Updated tenant:", JSON.stringify(tenant, null, 2));

  await client.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
