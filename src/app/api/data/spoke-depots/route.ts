import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = Number(searchParams.get("tenant_id") || "1");
    const db = await getDb();
    const depots = await db.collection("spoke_depots").find({ tenant_id: tenantId }).toArray();
    return NextResponse.json({ list: depots, count: depots.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
