import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const q = searchParams.get("q") || "";
    const route = searchParams.get("route") || "";
    const status = searchParams.get("status") || "";
    const deliveryState = searchParams.get("delivery_state") || "";

    const db = await getDb();
    const filter: Record<string, unknown> = { tenant_id: 1 };

    if (q) {
      const regex = { $regex: q, $options: "i" };
      filter.$or = [{ recipient_name: regex }, { rx_pharma_id: regex }, { address: regex }];
    }
    if (route) filter.route_title = route;
    if (status) filter.label_status = status;
    if (deliveryState) filter.delivery_state = deliveryState;

    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      db.collection("spoke_stops").find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).toArray(),
      db.collection("spoke_stops").countDocuments(filter),
    ]);

    return NextResponse.json({
      list,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
