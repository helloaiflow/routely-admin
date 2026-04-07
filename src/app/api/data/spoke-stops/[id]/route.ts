import { type NextRequest, NextResponse } from "next/server";

import { ObjectId } from "mongodb";

import { getDb } from "@/lib/mongodb";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = await getDb();
    await db.collection("spoke_stops").updateOne({ _id: new ObjectId(id) }, { $set: body });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
