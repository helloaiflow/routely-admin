import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function POST() {
  try {
    const apiKey = process.env.SPOKE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "SPOKE_API_KEY not set" }, { status: 500 });
    const credentials = Buffer.from(`${apiKey}:`).toString("base64");
    const res = await fetch("https://api.getcircuit.com/public/v0.2b/depots", {
      headers: { Authorization: `Basic ${credentials}` },
    });
    if (!res.ok) return NextResponse.json({ error: `Spoke error: ${res.status}` }, { status: 500 });
    const data = await res.json();
    const depots = data.depots || [];
    const db = await getDb();
    let added = 0;
    let updated = 0;
    for (const depot of depots) {
      const existing = await db.collection("spoke_depots").findOne({ spoke_depot_id: depot.id });
      if (existing) {
        await db
          .collection("spoke_depots")
          .updateOne({ spoke_depot_id: depot.id }, { $set: { name: depot.name, synced_at: new Date() } });
        updated++;
      } else {
        const counter = await db
          .collection("counters")
          .findOneAndUpdate(
            { _id: "rtdepot" as unknown as import("mongodb").ObjectId },
            { $inc: { seq: 1 } },
            { returnDocument: "after" },
          );
        const rt_depot_id = `RTD-${String(counter?.seq).padStart(4, "0")}`;
        await db.collection("spoke_depots").insertOne({
          spoke_depot_id: depot.id,
          rt_depot_id,
          name: depot.name || "Unknown",
          address: "",
          city: "",
          state: "",
          zipcode: "",
          tenant_id: 1,
          active: true,
          start_time: "07:00",
          end_time: null,
          end_location: "return",
          estimated_time_per_stop: 10,
          max_stops_per_driver: null,
          vehicle_type: "van",
          side_of_road: "either",
          avg_speed_mph: 35,
          working_days: ["mon", "tue", "wed", "thu", "fri"],
          timezone: "America/New_York",
          synced_at: new Date(),
          created_at: new Date(),
        });
        added++;
      }
    }
    return NextResponse.json({ success: true, total: depots.length, added, updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
