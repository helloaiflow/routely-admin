import * as dotenv from "dotenv";

import * as path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { MongoClient } from "mongodb";

async function main() {
  // biome-ignore lint/style/noNonNullAssertion: env validated at runtime
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db();

  // Fix package_scans
  const scans = await db
    .collection("package_scans")
    .find({ rx_creation_date: { $type: "date" } })
    .toArray();

  console.log(`Found ${scans.length} scans with Date type rx_creation_date`);

  for (const scan of scans) {
    if (scan.rx_creation_date instanceof Date) {
      const asString = scan.rx_creation_date.toISOString();
      await db.collection("package_scans").updateOne({ _id: scan._id }, { $set: { rx_creation_date: asString } });
    }
  }

  // Fix spoke_stops
  const stops = await db
    .collection("spoke_stops")
    .find({ rx_creation_date: { $type: "date" } })
    .toArray();

  console.log(`Found ${stops.length} stops with Date type rx_creation_date`);

  for (const stop of stops) {
    if (stop.rx_creation_date instanceof Date) {
      const asString = stop.rx_creation_date.toISOString();
      await db.collection("spoke_stops").updateOne({ _id: stop._id }, { $set: { rx_creation_date: asString } });
    }
  }

  console.log("✅ All rx_creation_date fields converted to String");
  await client.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
