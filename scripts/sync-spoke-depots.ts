import { MongoClient } from "mongodb";

const SPOKE_API_KEY = process.env.SPOKE_API_KEY || "fFlEWqrPqHu1sNUWF4xo";
const SPOKE_BASE = "https://api.getcircuit.com/public/v0.2b";
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://helloai-admin:AiJbwz7eTSvBXZse@helloai-prod.3xc5pi7.mongodb.net/routely_prod?appName=helloai-prod";

async function spokeGet(path: string) {
  const credentials = Buffer.from(`${SPOKE_API_KEY}:`).toString("base64");
  const res = await fetch(`${SPOKE_BASE}${path}`, {
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spoke API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log("🔌 Connecting to MongoDB...");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db("routely_prod");

  console.log("🚚 Fetching depots from Spoke API...");
  const data = await spokeGet("/depots");
  console.log("Raw response:", JSON.stringify(data, null, 2));

  const depots = data.depots || data.results || (Array.isArray(data) ? data : [data]);
  console.log(`✅ Found ${depots.length} depot(s)`);

  if (depots.length === 0) {
    console.log("⚠️  No depots returned. Exiting.");
    await client.close();
    return;
  }

  // Upsert each depot into spoke_depots collection
  for (const depot of depots) {
    const doc = {
      spoke_depot_id: depot.id || depot.depotId,
      name: depot.name || depot.title || "Depot",
      address: depot.address || depot.location?.address || "",
      city: depot.city || depot.location?.city || "",
      state: depot.state || depot.location?.state || "",
      zipcode: depot.zipCode || depot.zip || depot.location?.zipCode || "",
      lat: depot.lat || depot.latitude || depot.location?.lat || null,
      lng: depot.lng || depot.longitude || depot.location?.lng || null,
      phone: depot.phone || "",
      email: depot.email || "",
      timezone: depot.timezone || "",
      tenant_id: 1,
      raw: depot,
      synced_at: new Date(),
    };

    await db
      .collection("spoke_depots")
      .updateOne({ spoke_depot_id: doc.spoke_depot_id }, { $set: doc }, { upsert: true });
    console.log(`  💾 Saved depot: ${doc.name} (${doc.spoke_depot_id})`);
  }

  // Update tenant_id:1 with the first depot's spoke_depot_id
  const firstDepot = depots[0];
  const firstDepotId = firstDepot.id || firstDepot.depotId;
  await db.collection("tenants").updateOne(
    { tenant_id: 1 },
    {
      $set: {
        spoke_depot_id: firstDepotId,
        spoke_depot_address:
          firstDepot.address || firstDepot.location?.address || "12156 West Sample Road, Coral Springs, FL 33065",
        updated_at: new Date(),
      },
    },
  );
  console.log(`  🏢 Updated tenant_id:1 with spoke_depot_id: ${firstDepotId}`);

  console.log("\n✅ Done! spoke_depots collection synced.");
  await client.close();
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
