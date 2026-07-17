import { NextResponse } from "next/server";

import { getDb, requirePagePermission } from "@/lib/tenant";

/* ── GET /api/client/api-logs ────────────────────────────────────────────────
 * Read recent external-API audit lines for the signed-in tenant. The data IS
 * the point — this is a thin query surface, not a metrics UI.
 *
 * Query params (all optional):
 *   provider   "openai" | "spoke" | "google_places" | "telnyx"
 *   operation  exact operation or prefix ending in * (e.g. "ocr.ai-extract.*")
 *   ok         "false" → only failures (the usual debugging case); "true" → only ok
 *   status     numeric HTTP/status code
 *   stage      request_summary.stage
 *   model      request_summary.model
 *   since      minutes to look back (default 1440 = 24h, max 20160 = 14d)
 *   from/to    ISO datetimes; override since when present
 *   batch_id   correlate one batch ("what happened to these 15 scans?")
 *   q          text search over provider/operation/error/batch/model/stage
 *   limit      max docs (default 100, max 500)
 *
 * Example: /api/client/api-logs?provider=openai&ok=false&since=120
 * ─────────────────────────────────────────────────────────────────────────── */

export async function GET(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");
  const operation = searchParams.get("operation");
  const okParam = searchParams.get("ok");
  const statusParam = searchParams.get("status");
  const stage = searchParams.get("stage");
  const model = searchParams.get("model");
  const batchId = searchParams.get("batch_id");
  const q = searchParams.get("q")?.trim();
  const sinceMin = Math.min(Math.max(Number(searchParams.get("since") ?? 1440) || 1440, 1), 20160);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 100) || 100, 1), 500);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const db = await getDb();
  const tenantId = Number(ctx.tenantId);
  const parsedFrom = fromParam ? new Date(fromParam) : null;
  const parsedTo = toParam ? new Date(toParam) : null;
  const since =
    parsedFrom && !Number.isNaN(parsedFrom.getTime()) ? parsedFrom : new Date(Date.now() - sinceMin * 60_000);
  const until = parsedTo && !Number.isNaN(parsedTo.getTime()) ? parsedTo : null;

  const createdAt: Record<string, Date> = { $gte: since };
  if (until) createdAt.$lte = until;

  const query: Record<string, unknown> = { tenant_id: tenantId, created_at: createdAt };
  if (provider) query.provider = provider;
  if (operation) {
    query.operation = operation.endsWith("*")
      ? { $regex: `^${operation.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` }
      : operation;
  }
  if (okParam === "false") query.ok = false;
  else if (okParam === "true") query.ok = true;
  if (statusParam && /^\d{3}$/.test(statusParam)) query.status_code = Number(statusParam);
  if (stage) query["request_summary.stage"] = stage;
  if (model) query["request_summary.model"] = model;
  if (batchId) query["correlation.batch_id"] = batchId;
  if (q) {
    const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { provider: { $regex: safeQ, $options: "i" } },
      { operation: { $regex: safeQ, $options: "i" } },
      { error_code: { $regex: safeQ, $options: "i" } },
      { error_message: { $regex: safeQ, $options: "i" } },
      { "request_summary.model": { $regex: safeQ, $options: "i" } },
      { "request_summary.stage": { $regex: safeQ, $options: "i" } },
      { "correlation.batch_id": { $regex: safeQ, $options: "i" } },
    ];
  }

  const logs = await db.collection("api_logs").find(query).sort({ created_at: -1 }).limit(limit).toArray();

  // Lightweight rollup so the caller can eyeball "N failures, by provider+status".
  const byProviderStatus: Record<string, number> = {};
  for (const l of logs) {
    if (l.ok) continue;
    const key = `${l.provider}:${l.status_code ?? "err"}`;
    byProviderStatus[key] = (byProviderStatus[key] ?? 0) + 1;
  }

  return NextResponse.json({
    count: logs.length,
    window_minutes: sinceMin,
    failures_by_provider_status: byProviderStatus,
    logs,
  });
}
