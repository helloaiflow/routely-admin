import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number.parseInt(searchParams.get("limit") || "100", 10);
    const page = Number.parseInt(searchParams.get("page") || "1", 10);
    const tenantId = Number.parseInt(searchParams.get("tenant_id") || "1", 10);
    const status = searchParams.get("status") || "all"; // all | success | error | processing | spoke_ok
    const search = searchParams.get("search") || "";
    const dateFrom = searchParams.get("from") || "";
    const dateTo = searchParams.get("to") || "";
    const source = searchParams.get("source") || "";

    const db = await getDb();
    const col = db.collection("package_scans");

    // biome-ignore lint/suspicious/noExplicitAny: dynamic query
    const query: Record<string, any> = { tenant_id: tenantId };

    // Status filtering using the new status field
    if (status === "success") {
      query.status = "SUCCESS";
    } else if (status === "error") {
      query.$or = [{ status: "PROCESSING" }, { status: "ERROR" }, { status: { $exists: false } }];
    } else if (status === "processing") {
      query.status = "PROCESSING";
    } else if (status === "spoke_ok") {
      query.status = "SPOKE_OK";
    }

    if (source) query.source = source;

    if (search) {
      query.$or = [
        { full_name: { $regex: search, $options: "i" } },
        { rx_pharma_id: { $regex: search, $options: "i" } },
        { rx_number: { $regex: search, $options: "i" } },
        { stop_id: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { scanned_by: { $regex: search, $options: "i" } },
        { barcode_value: { $regex: search, $options: "i" } },
      ];
    }

    if (dateFrom || dateTo) {
      query.started_at = {};
      if (dateFrom) query.started_at.$gte = new Date(dateFrom);
      if (dateTo) query.started_at.$lte = new Date(`${dateTo}T23:59:59Z`);
    }

    const skip = (page - 1) * limit;
    const total = await col.countDocuments(query);
    const list = await col.find(query).sort({ started_at: -1 }).skip(skip).limit(limit).toArray();

    // Today stats (America/New_York)
    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const todayStart = new Date(`${todayET}T00:00:00-04:00`);
    const todayTotal = await col.countDocuments({ tenant_id: tenantId, started_at: { $gte: todayStart } });
    const todaySuccess = await col.countDocuments({
      tenant_id: tenantId,
      started_at: { $gte: todayStart },
      status: "SUCCESS",
    });
    const todaySpoke = await col.countDocuments({
      tenant_id: tenantId,
      started_at: { $gte: todayStart },
      status: "SPOKE_OK",
    });
    const todayProcess = await col.countDocuments({
      tenant_id: tenantId,
      started_at: { $gte: todayStart },
      status: "PROCESSING",
    });
    const todayError = todayTotal - todaySuccess;

    // Avg processing time today (SUCCESS only)
    const avgPipeline = await col
      .aggregate([
        {
          $match: {
            tenant_id: tenantId,
            started_at: { $gte: todayStart },
            status: "SUCCESS",
            processing_time_ms: { $exists: true },
          },
        },
        { $group: { _id: null, avg_ms: { $avg: "$processing_time_ms" } } },
      ])
      .toArray();
    const avgMs = avgPipeline[0]?.avg_ms ?? null;

    return NextResponse.json({
      list,
      count: list.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      stats: {
        today_total: todayTotal,
        today_success: todaySuccess,
        today_spoke_ok: todaySpoke,
        today_processing: todayProcess,
        today_error: todayError,
        avg_processing_ms: avgMs ? Math.round(avgMs) : null,
      },
    });
  } catch (err) {
    return NextResponse.json({ list: [], count: 0, total: 0, error: String(err) }, { status: 500 });
  }
}

// POST — initial insert from n8n IVY (status: PROCESSING by default)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getDb();
    const doc = {
      ...body,
      tenant_id: body.tenant_id ?? body.client_id ?? 1,
      status: body.status ?? "PROCESSING",
      started_at: body.started_at ? new Date(body.started_at) : new Date(),
      created_at: new Date(),
    };
    const result = await db.collection("package_scans").insertOne(doc);
    return NextResponse.json({ ok: true, id: result.insertedId });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// PATCH — update existing scan log by rtscan_id (used by IVY to update status/stage)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { rtscan_id, ...updates } = body;

    if (!rtscan_id) {
      return NextResponse.json({ ok: false, error: "rtscan_id is required" }, { status: 400 });
    }

    const db = await getDb();
    const setFields = { ...updates, updated_at: new Date() };

    // Convert date strings to Date objects
    if (setFields.completed_at && typeof setFields.completed_at === "string") {
      setFields.completed_at = new Date(setFields.completed_at);
    }

    const result = await db
      .collection("package_scans")
      .updateOne({ rtscan_id: Number(rtscan_id) }, { $set: setFields });

    return NextResponse.json({ ok: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
