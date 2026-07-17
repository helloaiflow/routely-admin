import { NextResponse } from "next/server";

import { getDb, requirePagePermission } from "@/lib/tenant";

export async function GET(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");
  const okParam = searchParams.get("ok");
  const batchId = searchParams.get("batch_id");
  const q = searchParams.get("q")?.trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 100) || 100, 1), 500);
  const sinceMin = Math.min(Math.max(Number(searchParams.get("since") ?? 2880) || 2880, 1), 2880);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const parsedFrom = fromParam ? new Date(fromParam) : null;
  const parsedTo = toParam ? new Date(toParam) : null;
  const since =
    parsedFrom && !Number.isNaN(parsedFrom.getTime()) ? parsedFrom : new Date(Date.now() - sinceMin * 60_000);
  const createdAt: Record<string, Date> = { $gte: since };
  if (parsedTo && !Number.isNaN(parsedTo.getTime())) createdAt.$lte = parsedTo;

  const query: Record<string, unknown> = {
    tenant_id: Number(ctx.tenantId),
    created_at: createdAt,
  };
  if (provider) query.provider = provider;
  if (okParam === "false") query.ok = false;
  else if (okParam === "true") query.ok = true;
  if (batchId) query["correlation.batch_id"] = batchId;
  if (q) {
    const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { provider: { $regex: safeQ, $options: "i" } },
      { model: { $regex: safeQ, $options: "i" } },
      { error_code: { $regex: safeQ, $options: "i" } },
      { error_message: { $regex: safeQ, $options: "i" } },
      { "correlation.batch_id": { $regex: safeQ, $options: "i" } },
    ];
  }

  const db = await getDb();
  const logs = await db.collection("ocr_scan_logs").find(query).sort({ created_at: -1 }).limit(limit).toArray();

  const rollup = {
    total: logs.length,
    ok: logs.filter((log) => log.ok === true).length,
    failed: logs.filter((log) => log.ok === false).length,
    qwen: logs.filter((log) => log.provider === "qwen").length,
    openai: logs.filter((log) => log.provider === "openai").length,
  };

  return NextResponse.json({ count: logs.length, rollup, logs });
}
