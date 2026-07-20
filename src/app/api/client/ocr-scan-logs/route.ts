import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

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
  const until = parsedTo && !Number.isNaN(parsedTo.getTime()) ? parsedTo : null;

  // DB level: time window (+ tenant unless admin "all" scope). The remaining
  // filters target fields nested in `doc`, so they run in memory below.
  const supabase = getSupabaseAdmin();
  const scopeAll = ctx.isAdmin && ctx.tenantScope === "all";
  let sel = supabase.from("ocr_scan_logs").select("doc").gte("created_at", since.toISOString());
  if (until) sel = sel.lte("created_at", until.toISOString());
  if (!scopeAll) sel = sel.eq("tenant_id", Number(ctx.tenantId));
  const { data, error } = await sel.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const qLower = q ? q.toLowerCase() : null;
  const matches = (l: Record<string, unknown>): boolean => {
    if (provider && l.provider !== provider) return false;
    if (okParam === "false" && l.ok !== false) return false;
    if (okParam === "true" && l.ok !== true) return false;
    const correlation = (l.correlation ?? {}) as Record<string, unknown>;
    if (batchId && correlation.batch_id !== batchId) return false;
    if (qLower) {
      const fields = [l.provider, l.model, l.error_code, l.error_message, correlation.batch_id];
      if (!fields.some((f) => typeof f === "string" && f.toLowerCase().includes(qLower))) return false;
    }
    return true;
  };

  const logs = (data ?? [])
    .map((r) => r.doc as Record<string, unknown>)
    .filter((l) => matches(l))
    .slice(0, limit);

  const rollup = {
    total: logs.length,
    ok: logs.filter((log) => log.ok === true).length,
    failed: logs.filter((log) => log.ok === false).length,
    qwen: logs.filter((log) => log.provider === "qwen").length,
    openai: logs.filter((log) => log.provider === "openai").length,
  };

  return NextResponse.json({ count: logs.length, rollup, logs });
}
