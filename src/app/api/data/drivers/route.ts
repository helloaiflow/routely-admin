import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const db = await getDb();
    let list = await db.collection("spoke_drivers").find({}).sort({ full_name: 1 }).limit(limit).toArray();
    if (list.length === 0) {
      list = await db.collection("drivers").find({}).sort({ full_name: 1 }).limit(limit).toArray();
    }
    return NextResponse.json({ list, total: list.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const db = await getDb();
    const result = await db.collection("drivers").insertOne({ ...body, created_at: new Date() });
    return NextResponse.json({ success: true, id: result.insertedId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
