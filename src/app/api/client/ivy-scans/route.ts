import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/* ───────────────────────────────────────────────────────────────────────────
 * IVY scans — tenant-facing read of the IVY DataEntry lifecycle (Mongo
 * `package_scans`, written by the n8n workflow "Routely IVY DataEntry — v10").
 *
 * Lifecycle (n8n): PROCESSING (soft insert) → SPOKE_OK → SUCCESS, or ERROR at
 * any node (error_stage + error_message record WHERE it broke).
 *
 * We normalize to: success (fully completed OCR→Spoke→Telegram) | failed (ERROR,
 * or a stale non-terminal run) | processing (in-flight).
 * ───────────────────────────────────────────────────────────────────────────*/

type IvyStatus = "success" | "failed" | "processing";

// Stale non-terminal runs (never reached SUCCESS) count as failed after this.
const STALE_MS = 30 * 60 * 1000;

export async function GET(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const statusFilter = (sp.get("status") ?? "").toLowerCase(); // success | failed | processing | ""

  // Absolute window (from/to ISO) takes precedence; otherwise fall back to a
  // rolling `minutes` window from now.
  const fromParam = sp.get("from");
  const toParam = sp.get("to");
  const minutes = Math.min(Math.max(Number(sp.get("minutes") ?? 2880) || 2880, 1), 525600);
  const fromIso = fromParam ?? new Date(Date.now() - minutes * 60_000).toISOString();

  try {
    let q = getSupabaseAdmin().from("ivy_scans").select("*").gte("started_at", fromIso);
    // Admin cross-tenant: "all" scope drops the per-tenant filter.
    if (!(ctx.isAdmin && ctx.tenantScope === "all")) q = q.eq("tenant_id", Number(ctx.tenantId));
    if (toParam) q = q.lte("started_at", toParam);
    const { data, error } = await q.order("started_at", { ascending: false }).limit(2000);
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    const rows = (data ?? []) as Record<string, unknown>[];

    const norm = (r: Record<string, unknown>): IvyStatus => {
      const s = String(r.status ?? "").toUpperCase();
      if (s === "SUCCESS") return "success";
      if (s === "ERROR") return "failed";
      // Non-terminal (PROCESSING / SPOKE_OK / SANITIZED): stale → failed, else in-flight.
      const started = r.started_at ? new Date(r.started_at as string).getTime() : 0;
      if (started && Date.now() - started > STALE_MS) return "failed";
      return "processing";
    };

    const cityLine = (r: Record<string, unknown>) =>
      [r.city, [r.state, r.zipcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");

    let scans = rows.map((r) => {
      const status = norm(r);
      const addr =
        String(r.full_address ?? "") ||
        [r.address, cityLine(r)].filter(Boolean).join(", ");
      return {
        rtscan_id: Number(r.rtscan_id) || 0,
        status,
        stage: String(r.stage ?? ""),
        error_stage: r.error_stage ? String(r.error_stage) : status === "failed" ? String(r.stage ?? "") : "",
        error_message: r.error_message ? String(r.error_message) : r.error ? String(r.error) : "",
        recipient: String(r.full_name ?? ""),
        phone: String(r.phone ?? ""),
        address: addr,
        city: r.city ? String(r.city) : "",
        state: r.state ? String(r.state) : "",
        rx_pharma_id: r.rx_pharma_id ? String(r.rx_pharma_id) : "",
        stop_id: r.stop_id ? String(r.stop_id) : "",
        spoke_delivery_id: r.spoke_delivery_id ? String(r.spoke_delivery_id) : "",
        route: r.route ? String(r.route) : "",
        image_url: r.image_url ? String(r.image_url) : "",
        started_at: r.started_at ? new Date(r.started_at as string).toISOString() : "",
        completed_at: r.completed_at ? new Date(r.completed_at as string).toISOString() : "",
        processing_time_ms: Number(r.processing_time_ms) || 0,
      };
    });

    if (statusFilter === "success" || statusFilter === "failed" || statusFilter === "processing") {
      scans = scans.filter((s) => s.status === statusFilter);
    }

    // Rollup for KPIs.
    const total = scans.length;
    const ok = scans.filter((s) => s.status === "success").length;
    const failed = scans.filter((s) => s.status === "failed").length;
    const processing = scans.filter((s) => s.status === "processing").length;
    const times = scans.filter((s) => s.processing_time_ms > 0).map((s) => s.processing_time_ms);
    const avgMs = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    const byStage: Record<string, number> = {};
    for (const s of scans) if (s.status === "failed" && s.error_stage) byStage[s.error_stage] = (byStage[s.error_stage] ?? 0) + 1;

    return NextResponse.json({
      count: total,
      totals: {
        total,
        success: ok,
        failed,
        processing,
        successRate: total ? Math.round((ok / total) * 100) : 0,
        avgMs,
        failuresByStage: byStage,
      },
      scans,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Query error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
