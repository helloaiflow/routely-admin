import { type NextRequest, NextResponse } from "next/server";

import { ObjectId } from "mongodb";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city") || "";
    const db = await getDb();

    const filter: Record<string, unknown> = { tenant_id: 1 };
    if (city) {
      filter.city = { $regex: city, $options: "i" };
    }

    const list = await db.collection("routes").find(filter).sort({ created_at: -1 }).toArray();

    return NextResponse.json({ list, count: list.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json();
    const { _id, ...update } = body;

    if (!_id) {
      return NextResponse.json({ error: "Missing _id" }, { status: 400 });
    }

    const result = await db
      .collection("routes")
      .updateOne({ _id: new ObjectId(_id), tenant_id: 1 }, { $set: { ...update, updated_at: new Date() } });

    return NextResponse.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
