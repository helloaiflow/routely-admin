import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import clientPromise from "@/lib/mongodb";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const client = await clientPromise;
    const db = client.db();
    const tenant = await db.collection("tenants").findOne({ clerk_user_id: userId });
    if (!tenant) return NextResponse.json({ stops: [] });

    const tenantId = tenant._id.toString();
    const stops = await db
      .collection("spoke_stops")
      .find({ tenant_id: tenantId })
      .sort({ created_at: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({
      stops: stops.map((s) => ({
        id: s._id.toString(),
        rtstop_id: s.rtstop_id,
        recipient: s.recipient_name || s.name || "Unknown",
        address: s.address || "",
        status: s.status || "pending",
        created_at: s.created_at,
      })),
    });
  } catch {
    return NextResponse.json({ stops: [] });
  }
}
