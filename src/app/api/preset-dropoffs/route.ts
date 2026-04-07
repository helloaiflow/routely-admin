import { type NextRequest, NextResponse } from "next/server";

import { ObjectId } from "mongodb";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address") || "";
    const db = await getDb();

    const filter: Record<string, unknown> = { tenant_id: 1 };
    if (address) {
      filter.address = { $regex: address, $options: "i" };
    }

    const [list, count] = await Promise.all([
      db.collection("preset_dropoffs").find(filter).sort({ created_at: -1 }).limit(100).toArray(),
      db.collection("preset_dropoffs").countDocuments(filter),
    ]);

    return NextResponse.json({ list, count });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json();

    const doc = {
      ...body,
      tenant_id: 1,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const result = await db.collection("preset_dropoffs").insertOne(doc);
    return NextResponse.json({ _id: result.insertedId }, { status: 201 });
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
      .collection("preset_dropoffs")
      .updateOne({ _id: new ObjectId(_id), tenant_id: 1 }, { $set: { ...update, updated_at: new Date() } });

    return NextResponse.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const db = await getDb();
    const result = await db.collection("preset_dropoffs").deleteOne({
      _id: new ObjectId(id),
      tenant_id: 1,
    });

    return NextResponse.json({ deletedCount: result.deletedCount });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
