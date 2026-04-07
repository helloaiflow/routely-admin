import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const q = searchParams.get("q") || "";
    const route = searchParams.get("route") || "";
    const newClient = searchParams.get("new_client") || "";

    const db = await getDb();
    const filter: Record<string, unknown> = { tenant_id: 1 };

    if (q) {
      const regex = { $regex: q, $options: "i" };
      filter.$or = [{ full_name: regex }, { rx_pharma_id: regex }, { address: regex }];
    }
    if (route) filter.route = route;
    if (newClient) filter.new_client = newClient === "true";

    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      db.collection("package_scans").find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).toArray(),
      db.collection("package_scans").countDocuments(filter),
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
