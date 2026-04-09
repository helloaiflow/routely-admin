import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number.parseInt(searchParams.get("limit") || "200", 10);
    const tenantId = Number.parseInt(searchParams.get("tenant_id") || "1", 10);
    const db = await getDb();
    const list = await db
      .collection("package_scans")
      .find({ tenant_id: tenantId })
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
    return NextResponse.json({ list, count: list.length });
  } catch (err) {
    return NextResponse.json({ list: [], count: 0, error: String(err) }, { status: 500 });
  }
}
