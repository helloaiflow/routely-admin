import { NextResponse } from "next/server";

import {
  DELIVERED_STATUSES,
  FAILED_STATUSES,
  IN_TRANSIT_STATUSES,
  PENDING_STATUSES,
  resolveDriverNames,
  shapeDraftForSearch,
  shapeStopForSearch,
} from "@/lib/spoke-fields";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getDb, requirePagePermission } from "@/lib/tenant";

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCounts(r: SearchResult[]): SearchCounts {
  return {
    total: r.length,
    pending: r.filter((x) => PENDING_STATUSES.includes(x.status)).length,
    assigned: r.filter((x) => x.status === "assigned").length,
    in_transit: r.filter((x) => IN_TRANSIT_STATUSES.includes(x.status)).length,
    delivered: r.filter((x) => DELIVERED_STATUSES.includes(x.status)).length,
    failed: r.filter((x) => FAILED_STATUSES.includes(x.status)).length,
    drafts: r.filter((x) => x.source === "draft").length,
    same_day: r.filter((x) => x.is_same_day).length,
    cod: r.filter((x) => x.collect_cod).length,
  };
}

export async function GET(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const tenantId = Number(ctx.tenantId);
  // Admin cross-tenant: "all" scope searches across every tenant.
  const scopeAll = ctx.isAdmin && ctx.tenantScope === "all";
  const { searchParams } = new URL(request.url);
  const rawQ = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? "100"), 200);
  if (!rawQ || rawQ.length < 2)
    return NextResponse.json({ results: [], counts: buildCounts([]), query: rawQ, from_stops: 0, from_drafts: 0 });

  const regex = new RegExp(esc(rawQ), "i");
  const phoneNorm = rawQ.replace(/\D/g, "");
  const phoneRx = phoneNorm.length >= 4 ? new RegExp(esc(phoneNorm), "i") : null;

  // Search across canonical (`assignment.route_title`) and legacy
  // (`delivery_leg.metrics.route_title`) paths so IVY-era stops still match.
  const stopOr: Record<string, unknown>[] = [
    { stop_id: { $regex: regex } },
    { "recipient.name": { $regex: regex } },
    { "address.name": { $regex: regex } },
    { "address.street": { $regex: regex } },
    { "address.city": { $regex: regex } },
    { "address.zip": { $regex: regex } },
    { status: { $regex: regex } },
    { "assignment.route_title": { $regex: regex } },
    { "delivery_leg.metrics.route_title": { $regex: regex } },
    // Hybrid-OCR (Phase 1): any single order id finds the stop regardless of
    // its position in the array (regex matches array elements in Mongo).
    { order_ids: { $regex: regex } },
    { "package.rx_number": { $regex: regex } },
  ];
  if (phoneRx) {
    stopOr.push({ "recipient.phone": { $regex: phoneRx } });
    stopOr.push({ "address.phone": { $regex: phoneRx } });
  }

  // Pre-compute normalized query variants for scoring
  const qLower = rawQ.toLowerCase();
  const qNoRtl = rawQ.replace(/^RTL-/i, "").toLowerCase();
  const phoneLast4 = phoneNorm.length >= 4 ? phoneNorm.slice(-4) : null;
  const recentCutoff = Date.now() - 7 * 86_400_000;

  const stopDocs = await db
    .collection("stops")
    .find({
      ...(scopeAll ? {} : { tenant_id: tenantId }),
      stop_type: { $ne: "pickup" }, // hide internal courier-leg pickups from client UI
      status: { $ne: "deleted" }, // never surface soft-deleted stops in search
      $or: stopOr,
    })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
  const driverMap = await resolveDriverNames(db, stopDocs);
  const stopsResults = stopDocs.map((d) => shapeStopForSearch(d, driverMap)) as SearchResult[];

  // Drafts moved to Supabase public.draft_stops on 2026-06-22 (commit
  // 975852a) — this endpoint was left querying Mongo draft_stops after that
  // migration and has been silently missing every draft made since (found
  // live 2026-08-19/20, Mongo Inventory report). doc is a verbatim mirror of
  // the original Mongo document shape (same pattern as draft-stops/route.ts's
  // own GET), so the same field-matching logic applies unchanged — filtered
  // in JS rather than translated into nested-jsonb-path SQL, to keep the
  // matching semantics identical to what stops search already does, not a
  // reimplementation with its own subtly different behavior. Draft volume is
  // low enough (tens, not thousands) that fetching the tenant's non-deleted
  // drafts and testing them in memory is cheap.
  const supabase = getSupabaseAdmin();
  let draftQuery = supabase.from("draft_stops").select("doc").neq("status", "deleted");
  if (!scopeAll) draftQuery = draftQuery.eq("tenant_id", tenantId);
  const { data: draftRows } = await draftQuery.order("created_at", { ascending: false }).limit(500);

  function draftMatches(d: Record<string, unknown>): boolean {
    const deliveryInfo = (d.delivery_info ?? {}) as Record<string, unknown>;
    const serviceInfo = (d.service_info ?? {}) as Record<string, unknown>;
    const fields = [
      d.tracking_id,
      d.draft_id,
      d.recipient_name,
      deliveryInfo.delivery_address,
      deliveryInfo.delivery_city,
      deliveryInfo.delivery_zip,
      d.status,
      serviceInfo.rx_number,
    ];
    if (fields.some((v) => typeof v === "string" && regex.test(v))) return true;
    if (Array.isArray(d.order_ids) && d.order_ids.some((v) => typeof v === "string" && regex.test(v))) return true;
    if (phoneRx && typeof d.recipient_phone === "string" && phoneRx.test(d.recipient_phone)) return true;
    return false;
  }

  const draftDocs = (draftRows ?? [])
    .map((r) => (r as { doc: Record<string, unknown> }).doc ?? {})
    .filter(draftMatches)
    .slice(0, limit);
  const draftResults = draftDocs.map(shapeDraftForSearch) as SearchResult[];

  const seenIds = new Set(stopsResults.map((r) => r.stop_id).filter(Boolean));
  const filteredDrafts = draftResults.filter((r) => !r.stop_id || !seenIds.has(r.stop_id));

  // ── Relevance scoring ────────────────────────────────────────────
  function scoreResult(r: SearchResult): number {
    let s = 0;
    const stopIdLower = (r.stop_id ?? r.id).toLowerCase();
    const nameLower = r.recipient_name.toLowerCase();
    const addrLower = r.delivery_address.toLowerCase();
    const cityLower = r.delivery_city.toLowerCase();

    // exact stop_id match (handles user typing "RTL-..." or just digits)
    if (stopIdLower === qLower || stopIdLower === qNoRtl || stopIdLower === `rtl-${qNoRtl}`) s += 100;

    // starts with query
    if (stopIdLower.startsWith(qLower) || stopIdLower.startsWith(qNoRtl)) s += 50;
    if (nameLower.startsWith(qLower)) s += 50;
    if (cityLower.startsWith(qLower)) s += 50;

    // contains query
    if (nameLower.includes(qLower)) s += 20;
    if (addrLower.includes(qLower)) s += 20;
    if (stopIdLower.includes(qLower) || stopIdLower.includes(qNoRtl)) s += 20;

    // phone last 4 digits match
    if (phoneLast4 && r.recipient_phone) {
      const clean = r.recipient_phone.replace(/\D/g, "");
      if (clean.endsWith(phoneLast4)) s += 30;
    }

    // city exact
    if (cityLower && cityLower === qLower) s += 40;

    // recent (last 7 days)
    if (new Date(r.created_at).getTime() >= recentCutoff) s += 10;

    return s;
  }

  const scored = [...stopsResults, ...filteredDrafts].map((r) => ({ r, s: scoreResult(r) }));
  scored.sort((a, b) => {
    if (a.s !== b.s) return b.s - a.s;
    return new Date(b.r.created_at).getTime() - new Date(a.r.created_at).getTime();
  });
  const merged = scored.map((x) => x.r);

  return NextResponse.json({
    results: merged,
    counts: buildCounts(merged),
    query: rawQ,
    from_stops: stopsResults.length,
    from_drafts: filteredDrafts.length,
  });
}

export interface SearchResult {
  id: string;
  stop_id: string | null;
  source: "stop" | "draft" | "portal";
  status: string;
  recipient_name: string;
  recipient_phone: string | null;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  delivery_lat: number | null;
  delivery_lng: number | null;
  package_type: string;
  service_type: string | null;
  collect_cod: boolean;
  collect_amount: number | null;
  is_same_day: boolean;
  delivery_date: string | null;
  eta_at: string | null;
  driver_name: string | null;
  route_title: string | null;
  requires_signature: boolean;
  return_to_sender: boolean;
  notes: string | null;
  photos: string[];
  total_price: number;
  created_at: string;
}
export interface SearchCounts {
  total: number;
  pending: number;
  assigned: number;
  in_transit: number;
  delivered: number;
  failed: number;
  drafts: number;
  same_day: number;
  cod: number;
}
