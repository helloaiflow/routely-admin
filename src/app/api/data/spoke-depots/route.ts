import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const list = await db.collection("spoke_depots").find({}).sort({ name: 1 }).toArray();
    return NextResponse.json({ list, count: list.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const body = await req.json();
    const db = await getDb();
    const { _id, spoke_depot_id, rt_depot_id, created_at, synced_at, ...fields } = body;
    await db
      .collection("spoke_depots")
      .updateOne({ spoke_depot_id: id }, { $set: { ...fields, updated_at: new Date() } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
