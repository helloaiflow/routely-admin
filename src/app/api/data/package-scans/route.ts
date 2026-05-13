import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number.parseInt(searchParams.get("limit") || "100", 10);
    const page = Number.parseInt(searchParams.get("page") || "1", 10);
    const tenantId = Number.parseInt(searchParams.get("tenant_id") || "1", 10);
    const status = searchParams.get("status") || "all"; // all | success | error
    const search = searchParams.get("search") || "";
    const dateFrom = searchParams.get("from") || "";
    const dateTo = searchParams.get("to") || "";
    const source = searchParams.get("source") || "";

    const db = await getDb();
    const col = db.collection("package_scans");

    // biome-ignore lint/suspicious/noExplicitAny: dynamic query
    const query: Record<string, any> = { tenant_id: tenantId };

    // Status: success = has stop_id, error = missing/empty stop_id
    if (status === "success") {
      query.stop_id = { $exists: true, $ne: "" };
    } else if (status === "error") {
      query.$or = [{ stop_id: { $exists: false } }, { stop_id: "" }];
    }

    if (source) query.source = source;

    if (search) {
      query.$or = [
        { full_name: { $regex: search, $options: "i" } },
        { rx_pharma_id: { $regex: search, $options: "i" } },
        { stop_id: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { scanned_by: { $regex: search, $options: "i" } },
      ];
    }

    if (dateFrom || dateTo) {
      query.created_at = {};
      if (dateFrom) query.created_at.$gte = new Date(dateFrom);
      if (dateTo) query.created_at.$lte = new Date(`${dateTo}T23:59:59Z`);
    }

    const skip = (page - 1) * limit;
    const total = await col.countDocuments(query);
    const list = await col.find(query).sort({ created_at: -1 }).skip(skip).limit(limit).toArray();

    // Today stats (America/New_York)
    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const todayStart = new Date(`${todayET}T00:00:00-04:00`);
    const todayTotal = await col.countDocuments({ tenant_id: tenantId, created_at: { $gte: todayStart } });
    const todaySuccess = await col.countDocuments({
      tenant_id: tenantId,
      created_at: { $gte: todayStart },
      stop_id: { $exists: true, $ne: "" },
    });
    const todayError = todayTotal - todaySuccess;

    return NextResponse.json({
      list,
      count: list.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      stats: { today_total: todayTotal, today_success: todaySuccess, today_error: todayError },
    });
  } catch (err) {
    return NextResponse.json({ list: [], count: 0, total: 0, error: String(err) }, { status: 500 });
  }
}

// POST — upsert from n8n IVY
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getDb();
    const doc = { ...body, tenant_id: body.client_id ?? body.tenant_id ?? 1, created_at: new Date() };
    const result = await db.collection("package_scans").insertOne(doc);
    return NextResponse.json({ ok: true, id: result.insertedId });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
