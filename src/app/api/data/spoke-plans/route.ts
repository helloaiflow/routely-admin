import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const db = await getDb();
    const list = await db.collection("spoke_plans").find({}).sort({ starts_at: -1 }).limit(limit).toArray();
    return NextResponse.json({ list, total: list.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
