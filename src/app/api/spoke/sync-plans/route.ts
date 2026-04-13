import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

const SPOKE_BASE = "https://api.getcircuit.com/public/v0.2b";

function auth() {
  const key = process.env.SPOKE_API_KEY;
  if (!key) throw new Error("SPOKE_API_KEY not set");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export async function POST() {
  try {
    const res = await fetch(`${SPOKE_BASE}/plans?pageSize=50`, {
      headers: { Authorization: auth() },
    });
    if (!res.ok) return NextResponse.json({ error: `Spoke ${res.status}` }, { status: res.status });
    const data = await res.json();
    const plans: Record<string, unknown>[] = data.plans || [];

    const db = await getDb();
    let added = 0;
    let updated = 0;

    for (const p of plans) {
      const spokeId = p.id as string;
      const existing = await db.collection("spoke_plans").findOne({ spoke_plan_id: spokeId });
      const doc = {
        spoke_plan_id: spokeId,
        title: (p.title as string) || (p.name as string) || spokeId,
        status: (p.status as string) || "",
        starts_at: p.startsAt || null,
        route_count: p.routeCount || 0,
        stop_count: p.stopCount || 0,
        distributed_at: p.distributedAt || null,
        tenant_id: 1,
        synced_at: new Date(),
      };
      if (existing) {
        await db.collection("spoke_plans").updateOne({ spoke_plan_id: spokeId }, { $set: doc });
        updated++;
      } else {
        await db.collection("spoke_plans").insertOne({ ...doc, created_at: new Date() });
        added++;
      }
    }
    return NextResponse.json({ success: true, total: plans.length, added, updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
