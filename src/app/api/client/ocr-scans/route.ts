import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/* ───────────────────────────────────────────────────────────────────────────
 * Linked scans — reads the permanent `ocr_scans` table and JOINS each scan to
 * the draft it created (draft_stops.doc) to surface the recipient name +
 * delivery address that was sent. Lets the OCR monitor show/search "what was
 * scanned" even without the label image. Tenant-scoped.
 * ───────────────────────────────────────────────────────────────────────────*/

type ScanRow = {
  scan_id: string;
  created_at: string;
  source: string | null;
  provider: string | null;
  ok: boolean | null;
  status_code: number | null;
  latency_ms: number | null;
  model: string | null;
  fields_captured: number | null;
  critical_score: number | null;
  draft_id: string | null;
  stop_id: string | null;
  image_status: string | null;
};

export async function GET(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const minutes = Math.min(
    Math.max(Number(new URL(request.url).searchParams.get("minutes") ?? 2880) || 2880, 1),
    525600,
  );
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const supabase = getSupabaseAdmin();

  // Admin cross-tenant: "all" scope drops the per-tenant filter.
  const scopeAll = ctx.isAdmin && ctx.tenantScope === "all";
  let ocrQuery = supabase
    .from("ocr_scans")
    .select(
      "scan_id, created_at, source, provider, ok, status_code, latency_ms, model, fields_captured, critical_score, draft_id, stop_id, image_status",
    )
    .gte("created_at", since);
  if (!scopeAll) ocrQuery = ocrQuery.eq("tenant_id", ctx.tenantId);
  const { data, error } = await ocrQuery.order("created_at", { ascending: false }).limit(1000);

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  const rows = (data ?? []) as ScanRow[];

  // JOIN drafts (recipient + delivery address) by draft_id.
  const draftIds = [...new Set(rows.map((r) => r.draft_id).filter(Boolean))] as string[];
  const draftMap = new Map<
    string,
    { recipient_name: string; street: string; city: string; state: string; zip: string; tracking_id: string | null }
  >();
  if (draftIds.length > 0) {
    let draftQ = supabase.from("draft_stops").select("draft_id, doc").in("draft_id", draftIds);
    if (!scopeAll) draftQ = draftQ.eq("tenant_id", ctx.tenantId);
    const { data: drafts } = await draftQ;
    for (const dr of drafts ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (dr as { doc: any }).doc ?? {};
      draftMap.set(String((dr as { draft_id: string }).draft_id), {
        recipient_name: String(doc.recipient_name ?? ""),
        street: String(doc.delivery_info?.delivery_address ?? ""),
        city: String(doc.delivery_info?.delivery_city ?? ""),
        state: String(doc.delivery_info?.delivery_state ?? ""),
        zip: String(doc.delivery_info?.delivery_zip ?? ""),
        tracking_id: doc.tracking_id ? String(doc.tracking_id) : null,
      });
    }
  }

  const status = (r: ScanRow) =>
    r.ok === true ? "processed" : (r.status_code ?? 0) >= 500 ? "error" : "failed";

  const scans = rows.map((r) => {
    const d = r.draft_id ? draftMap.get(r.draft_id) : undefined;
    const cityLine = d ? [d.city, [d.state, d.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
    const delivery_line = d ? [d.street, cityLine].filter(Boolean).join(", ") : "";
    return {
      scan_id: r.scan_id,
      created_at: r.created_at,
      source: r.source ?? "ocr",
      provider: r.provider ?? "—",
      status: status(r),
      latency_ms: r.latency_ms ?? 0,
      model: r.model,
      fields_captured: r.fields_captured ?? 0,
      critical_score: r.critical_score,
      draft_id: r.draft_id,
      stop_id: r.stop_id ?? d?.tracking_id ?? null,
      image_status: r.image_status ?? "pending",
      recipient_name: d?.recipient_name ?? "",
      delivery_line,
    };
  });

  return NextResponse.json({ count: scans.length, scans });
}
