import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";
import {
  DELIVERED_STATUSES,
  FAILED_STATUSES,
  IN_TRANSIT_STATUSES,
  PENDING_STATUSES,
  resolveDriverNames,
  shapeDraftForSearch,
  shapeStopForSearch,
} from "@/lib/spoke-fields";

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN cross-tenant order search. Same shaping/scoring as the client portal's
// /api/client/search, but WITHOUT the `tenant_id` filter — the admin console
// sees stops & drafts across ALL tenants. Each result is enriched with
// `tenant_id` + `tenant_name` so the UI can show which tenant it belongs to.
// (The legacy /api/search route stays untouched — it powers the ⌘ palette.)
// ─────────────────────────────────────────────────────────────────────────────

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
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const { searchParams } = new URL(request.url);
  const rawQ = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? "100"), 300);
  if (!rawQ || rawQ.length < 2)
    return NextResponse.json({ results: [], counts: buildCounts([]), query: rawQ, from_stops: 0, from_drafts: 0 });

  const regex = new RegExp(esc(rawQ), "i");
  const phoneNorm = rawQ.replace(/\D/g, "");
  const phoneRx = phoneNorm.length >= 4 ? new RegExp(esc(phoneNorm), "i") : null;

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
    { order_ids: { $regex: regex } },
    { "package.rx_number": { $regex: regex } },
  ];
  if (phoneRx) {
    stopOr.push({ "recipient.phone": { $regex: phoneRx } });
    stopOr.push({ "address.phone": { $regex: phoneRx } });
  }

  const qLower = rawQ.toLowerCase();
  const qNoRtl = rawQ.replace(/^RTL-/i, "").toLowerCase();
  const phoneLast4 = phoneNorm.length >= 4 ? phoneNorm.slice(-4) : null;
  const recentCutoff = Date.now() - 7 * 86_400_000;

  // NOTE: no tenant_id filter — cross-tenant.
  const stopDocs = await db
    .collection("stops")
    .find({
      stop_type: { $ne: "pickup" },
      status: { $ne: "deleted" },
      $or: stopOr,
    })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
  const driverMap = await resolveDriverNames(db, stopDocs);
  const stopsResults = stopDocs.map((d) => ({
    ...shapeStopForSearch(d, driverMap),
    tenant_id: d.tenant_id ?? null,
  })) as SearchResult[];

  const draftOr: Record<string, unknown>[] = [
    { tracking_id: { $regex: regex } },
    { draft_id: { $regex: regex } },
    { recipient_name: { $regex: regex } },
    { "delivery_info.delivery_address": { $regex: regex } },
    { "delivery_info.delivery_city": { $regex: regex } },
    { "delivery_info.delivery_zip": { $regex: regex } },
    { status: { $regex: regex } },
    { order_ids: { $regex: regex } },
    { "service_info.rx_number": { $regex: regex } },
  ];
  if (phoneRx) draftOr.push({ recipient_phone: { $regex: phoneRx } });

  const draftDocs = await db
    .collection("draft_stops")
    .find({ status: { $ne: "deleted" }, $or: draftOr })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
  const draftResults = draftDocs.map((d) => ({
    ...shapeDraftForSearch(d),
    tenant_id: d.tenant_id ?? null,
  })) as SearchResult[];

  const seenIds = new Set(stopsResults.map((r) => r.stop_id).filter(Boolean));
  const filteredDrafts = draftResults.filter((r) => !r.stop_id || !seenIds.has(r.stop_id));

  // ── Enrich with tenant names (single query) ──────────────────────────
  const merged0 = [...stopsResults, ...filteredDrafts];
  const tenantIds = [...new Set(merged0.map((r) => r.tenant_id).filter((x) => x != null))];
  const tenantMap = new Map<number, string>();
  if (tenantIds.length) {
    const tenants = await db
      .collection("tenants")
      .find({ tenant_id: { $in: tenantIds } })
      .project({ tenant_id: 1, company_name: 1, name: 1, business_name: 1 })
      .toArray();
    for (const t of tenants) {
      tenantMap.set(t.tenant_id, t.company_name || t.business_name || t.name || `Tenant ${t.tenant_id}`);
    }
  }
  for (const r of merged0) {
    r.tenant_name = r.tenant_id != null ? (tenantMap.get(r.tenant_id) ?? `Tenant ${r.tenant_id}`) : null;
  }

  // ── Relevance scoring ────────────────────────────────────────────
  function scoreResult(r: SearchResult): number {
    let s = 0;
    const stopIdLower = (r.stop_id ?? r.id).toLowerCase();
    const nameLower = r.recipient_name.toLowerCase();
    const addrLower = r.delivery_address.toLowerCase();
    const cityLower = r.delivery_city.toLowerCase();

    if (stopIdLower === qLower || stopIdLower === qNoRtl || stopIdLower === `rtl-${qNoRtl}`) s += 100;
    if (stopIdLower.startsWith(qLower) || stopIdLower.startsWith(qNoRtl)) s += 50;
    if (nameLower.startsWith(qLower)) s += 50;
    if (cityLower.startsWith(qLower)) s += 50;
    if (nameLower.includes(qLower)) s += 20;
    if (addrLower.includes(qLower)) s += 20;
    if (stopIdLower.includes(qLower) || stopIdLower.includes(qNoRtl)) s += 20;
    if (phoneLast4 && r.recipient_phone) {
      const clean = r.recipient_phone.replace(/\D/g, "");
      if (clean.endsWith(phoneLast4)) s += 30;
    }
    if (cityLower && cityLower === qLower) s += 40;
    if (new Date(r.created_at).getTime() >= recentCutoff) s += 10;
    return s;
  }

  const scored = merged0.map((r) => ({ r, s: scoreResult(r) }));
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
  tenant_id: number | null;
  tenant_name?: string | null;
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
