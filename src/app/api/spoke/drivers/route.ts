import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

const SPOKE_BASE = "https://api.getcircuit.com/public/v0.2b";

function auth() {
  const key = process.env.SPOKE_API_KEY;
  if (!key) throw new Error("SPOKE_API_KEY not set");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export async function GET() {
  try {
    const res = await fetch(`${SPOKE_BASE}/drivers?pageSize=100`, {
      headers: { Authorization: auth() },
    });
    if (!res.ok) return NextResponse.json({ error: `Spoke ${res.status}` }, { status: res.status });
    const data = await res.json();
    return NextResponse.json({ drivers: data.drivers || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const res = await fetch(`${SPOKE_BASE}/drivers?pageSize=100`, {
      headers: { Authorization: auth() },
    });
    if (!res.ok) return NextResponse.json({ error: `Spoke ${res.status}` }, { status: res.status });
    const data = await res.json();
    const drivers = data.drivers || [];

    const db = await getDb();
    let added = 0;
    let updated = 0;

    for (const d of drivers) {
      const existing = await db.collection("spoke_drivers").findOne({ spoke_driver_id: d.id });
      const doc = {
        spoke_driver_id: d.id,
        full_name: d.name || d.full_name || "Unknown",
        email: d.email || "",
        phone: d.phone || "",
        active: d.active !== false,
        depot_id: d.depotId || d.depot_id || "",
        synced_at: new Date(),
      };
      if (existing) {
        await db.collection("spoke_drivers").updateOne({ spoke_driver_id: d.id }, { $set: doc });
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
