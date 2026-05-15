/**
 * GET /api/scans/by-stop?stop_id=<spoke_stop_id>
 *
 * Isolated, non-breaking endpoint.
 * Looks up the package_scan document linked to a given stop_id.
 * Used by the stops detail panel to show image + repost context.
 */
import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stop_id = searchParams.get("stop_id") || "";

    if (!stop_id) {
      return NextResponse.json({ scan: null, error: "stop_id is required" }, { status: 400 });
    }

    const db = await getDb();
    // package_scans.stop_id matches the spoke_stop_id of the stop
    const scan = await db.collection("package_scans").findOne({ stop_id }, { sort: { created_at: -1 } });

    return NextResponse.json({ scan: scan ?? null });
  } catch (err) {
    return NextResponse.json({ scan: null, error: String(err) }, { status: 500 });
  }
}
