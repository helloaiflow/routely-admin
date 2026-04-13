import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const db = await getDb();
    const list = await db.collection("spoke_drivers").find({}).sort({ full_name: 1 }).limit(limit).toArray();
    return NextResponse.json({ list, total: list.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const spokeId = searchParams.get("id");
    if (!spokeId) return NextResponse.json({ error: "id required" }, { status: 400 });
    const body = await req.json();
    const db = await getDb();
    await db
      .collection("spoke_drivers")
      .updateOne({ spoke_driver_id: spokeId }, { $set: { ...body, updated_at: new Date() } }, { upsert: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
