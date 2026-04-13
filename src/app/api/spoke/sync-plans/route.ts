import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function POST() {
  try {
    const apiKey = process.env.SPOKE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "SPOKE_API_KEY not set" }, { status: 500 });
    const credentials = Buffer.from(`${apiKey}:`).toString("base64");
    const res = await fetch("https://api.getcircuit.com/public/v0.2b/plans", {
      headers: { Authorization: `Basic ${credentials}` },
    });
    if (!res.ok) return NextResponse.json({ error: `Spoke error: ${res.status}` }, { status: 500 });
    const data = await res.json();
    const plans: Record<string, unknown>[] = data.plans || [];
    const db = await getDb();
    let added = 0;
    let updated = 0;
    for (const p of plans) {
      const spokeId = p.id as string;
      if (!spokeId) continue;
      const existing = await db.collection("spoke_plans").findOne({ spoke_plan_id: spokeId });
      const doc = {
        spoke_plan_id: spokeId,
        title: (p.title as string) || (p.name as string) || spokeId,
        status: (p.status as string) || "",
        starts_at: (p.startsAt as number) || null,
        route_count: (p.routeCount as number) || 0,
        stop_count: (p.stopCount as number) || 0,
        distributed_at: (p.distributedAt as number) || null,
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
