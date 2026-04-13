import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function POST() {
  try {
    const apiKey = process.env.SPOKE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "SPOKE_API_KEY not set" }, { status: 500 });
    const credentials = Buffer.from(`${apiKey}:`).toString("base64");
    const res = await fetch("https://api.getcircuit.com/public/v0.2b/drivers", {
      headers: { Authorization: `Basic ${credentials}` },
    });
    if (!res.ok) return NextResponse.json({ error: `Spoke error: ${res.status}` }, { status: 500 });
    const data = await res.json();
    const drivers: Record<string, unknown>[] = data.drivers || [];
    const db = await getDb();
    let added = 0;
    let updated = 0;
    for (const d of drivers) {
      const spokeId = d.id as string;
      if (!spokeId) continue;
      const existing = await db.collection("spoke_drivers").findOne({ spoke_driver_id: spokeId });
      const depots = (d.depots as string[]) || [];
      const doc = {
        spoke_driver_id: spokeId,
        full_name: (d.name as string) || "Unknown",
        email: (d.email as string) || "",
        phone: (d.phone as string) || "",
        active: d.active !== false,
        depot_id: depots[0] || (d.depotId as string) || "",
        depots,
        display_name: (d.displayName as string) || "",
        synced_at: new Date(),
      };
      if (existing) {
        await db.collection("spoke_drivers").updateOne({ spoke_driver_id: spokeId }, { $set: doc });
        updated++;
      } else {
        await db.collection("spoke_drivers").insertOne({ ...doc, created_at: new Date() });
        added++;
      }
    }
    return NextResponse.json({ success: true, total: drivers.length, added, updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
