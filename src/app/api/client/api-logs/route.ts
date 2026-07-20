import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

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

  const tenantId = Number(ctx.tenantId);
  const parsedFrom = fromParam ? new Date(fromParam) : null;
  const parsedTo = toParam ? new Date(toParam) : null;
  const since =
    parsedFrom && !Number.isNaN(parsedFrom.getTime()) ? parsedFrom : new Date(Date.now() - sinceMin * 60_000);
  const until = parsedTo && !Number.isNaN(parsedTo.getTime()) ? parsedTo : null;

  // DB level: tenant + time window (promoted columns) newest-first. The remaining
  // filters target fields nested in `doc`, so they run in memory below.
  const supabase = getSupabaseAdmin();
  let sel = supabase
    .from("api_logs")
    .select("doc")
    .eq("tenant_id", tenantId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });
  if (until) sel = sel.lte("created_at", until.toISOString());
  const { data, error } = await sel;
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const opPrefix = operation?.endsWith("*") ? operation.slice(0, -1) : null;
  const qLower = q ? q.toLowerCase() : null;
  const matches = (l: Record<string, unknown>): boolean => {
    if (provider && l.provider !== provider) return false;
    if (operation) {
      if (opPrefix != null) {
        if (typeof l.operation !== "string" || !l.operation.startsWith(opPrefix)) return false;
      } else if (l.operation !== operation) return false;
    }
    if (okParam === "false" && l.ok !== false) return false;
    if (okParam === "true" && l.ok !== true) return false;
    if (statusParam && /^\d{3}$/.test(statusParam) && Number(l.status_code) !== Number(statusParam)) return false;
    const reqSummary = (l.request_summary ?? {}) as Record<string, unknown>;
    if (stage && reqSummary.stage !== stage) return false;
    if (model && reqSummary.model !== model) return false;
    const correlation = (l.correlation ?? {}) as Record<string, unknown>;
    if (batchId && correlation.batch_id !== batchId) return false;
    if (qLower) {
      const fields = [
        l.provider,
        l.operation,
        l.error_code,
        l.error_message,
        reqSummary.model,
        reqSummary.stage,
        correlation.batch_id,
      ];
      if (!fields.some((f) => typeof f === "string" && f.toLowerCase().includes(qLower))) return false;
    }
    return true;
  };

  const logs = (data ?? [])
    .map((r) => r.doc as Record<string, unknown>)
    .filter((l) => matches(l))
    .slice(0, limit);

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
