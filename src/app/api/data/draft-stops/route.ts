import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

// GET /api/data/draft-stops?tenant_id=1
// Returns draft_stops for a tenant, sorted by created_at desc
// Used by the admin billing page — does NOT modify any data
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = Number(searchParams.get("tenant_id") ?? "0");

    if (!tenantId) {
      return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
    }

    const db = await getDb();
    const stops = await db
      .collection("draft_stops")
      .find({ tenant_id: tenantId })
      .sort({ created_at: -1 })
      .limit(200)
      .project({
        draft_id: 1, tracking_id: 1, status: 1,
        payment_type: 1, payment_status: 1,
        total_price: 1, distance_miles: 1,
        recipient_name: 1, delivery_city: 1,
        created_at: 1, approved_at: 1,
        _id: 0,
      })
      .toArray();

    // ── Accurate outstanding balance from source of truth ────────────────
    // outstanding = sum of invoiced/approved postpay stops that are NOT paid
    const outstandingStops = stops.filter(
      (s) =>
        s.payment_type === "postpay" &&
        s.payment_status !== "paid" &&
        s.status !== "canceled" &&
        s.status !== "draft"
    );
    const computedOutstanding = outstandingStops.reduce(
      (sum: number, s: { total_price?: number }) => sum + (s.total_price ?? 0),
      0
    );

    // ── Accurate totals ──────────────────────────────────────────────────
    const activeStops = stops.filter(
      (s) => s.status !== "draft" && s.status !== "canceled"
    );
    const totalMiles = activeStops.reduce(
      (sum: number, s: { distance_miles?: number | null }) => sum + (s.distance_miles ?? 0),
      0
    );
    const totalBilled = activeStops.reduce(
      (sum: number, s: { total_price?: number }) => sum + (s.total_price ?? 0),
      0
    );

    return NextResponse.json({
      stops,
      summary: {
        total_stops:            activeStops.length,
        total_miles:            Math.round(totalMiles * 10) / 10,
        total_billed:           Math.round(totalBilled * 100) / 100,
        computed_outstanding:   Math.round(computedOutstanding * 100) / 100,
        outstanding_stop_count: outstandingStops.length,
      },
    });
  } catch (err) {
    console.error("[GET /api/data/draft-stops]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
