import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET() {
  try {
    const db = await getDb();
    const scans = await db.collection("package_scans").find({}).sort({ created_at: -1 }).limit(500).toArray();
    return NextResponse.json(scans);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
