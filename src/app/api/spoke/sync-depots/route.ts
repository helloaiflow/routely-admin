import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

const SPOKE_API_KEY = process.env.SPOKE_API_KEY || "";
const SPOKE_BASE = "https://api.getcircuit.com/public/v0.2b";

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

export async function POST() {
  try {
    const db = await getDb();

    const data = await spokeGet("/depots");
    const depots = data.depots || data.results || (Array.isArray(data) ? data : [data]);

    let added = 0;
    let updated = 0;

    for (const depot of depots) {
      const doc = {
        spoke_depot_id: depot.id || depot.depotId,
        name: depot.name || depot.title || "Depot",
        tenant_id: 1,
        synced_at: new Date(),
      };

      const existing = await db.collection("spoke_depots").findOne({ spoke_depot_id: doc.spoke_depot_id });

      if (existing) {
        await db
          .collection("spoke_depots")
          .updateOne({ spoke_depot_id: depot.id }, { $set: { name: doc.name, synced_at: doc.synced_at } });
        updated++;
      } else {
        const counter = await db
          .collection("counters")
          .findOneAndUpdate(
            { _id: "rtdepot" as unknown as import("mongodb").ObjectId },
            { $inc: { seq: 1 } },
            { returnDocument: "after" },
          );
        const rt_depot_id = `RTD-${String(counter!.seq).padStart(4, "0")}`;
        await db.collection("spoke_depots").insertOne({
          ...doc,
          rt_depot_id,
          address: "",
          city: "",
          state: "",
          zipcode: "",
          created_at: new Date(),
        });
        added++;
      }
    }

    return NextResponse.json({ ok: true, added, updated, total: depots.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
