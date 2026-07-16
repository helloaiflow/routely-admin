import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  DELIVERED_STATUSES,
  FAILED_STATUSES,
  IN_TRANSIT_STATUSES,
  PENDING_STATUSES,
  reviveStopDoc,
  shapeDraftForSearch,
  shapeStopForSearch,
} from "@/lib/spoke-fields";
import { getSupabaseAdmin } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN cross-tenant order search — SUPABASE source (Postgres migration).
// The `stops` / `draft_stops` / `tenants` tables follow the hybrid pattern:
// promoted scalar columns + a `doc jsonb` column holding the full original Mongo
// document. We `.select("doc")`, revive it, and reuse the exact same shaping the
// client portal uses — so results are identical, just sourced from Supabase and
// WITHOUT any tenant filter (the admin sees every tenant).
// ─────────────────────────────────────────────────────────────────────────────

// PostgREST `.or()` uses `,` to separate conditions and `.` to separate
// column.operator.value — so strip those (and other reserved chars) from the
// user query before interpolating it into the filter string.
function sanitize(q: string) {
  return q.replace(/[,().*:"']/g, " ").replace(/\s+/g, " ").trim();
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

  const { searchParams } = new URL(request.url);
  const rawQ = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? "100"), 300);
  const q = sanitize(rawQ);
  if (!q || q.length < 2)
    return NextResponse.json({ results: [], counts: buildCounts([]), query: rawQ, from_stops: 0, from_drafts: 0 });

  const like = `*${q}*`;
  const phoneNorm = rawQ.replace(/\D/g, "");
  const phoneLike = phoneNorm.length >= 4 ? `*${phoneNorm}*` : null;

  const supabase = getSupabaseAdmin();

  // ── Stops ────────────────────────────────────────────────────────────
  const stopOr = [
    `doc->>stop_id.ilike.${like}`,
    `doc->recipient->>name.ilike.${like}`,
    `doc->address->>name.ilike.${like}`,
    `doc->address->>street.ilike.${like}`,
    `doc->address->>city.ilike.${like}`,
    `doc->address->>zip.ilike.${like}`,
    `doc->>status.ilike.${like}`,
    `doc->assignment->>route_title.ilike.${like}`,
    `doc->package->>rx_number.ilike.${like}`,
  ];
  if (phoneLike) {
    stopOr.push(`doc->recipient->>phone.ilike.${phoneLike}`);
    stopOr.push(`doc->address->>phone.ilike.${phoneLike}`);
  }

  const { data: stopRows, error: stopErr } = await supabase
    .from("stops")
    .select("doc, tenant_id")
    .or(stopOr.join(","))
    .limit(limit);
  if (stopErr) return NextResponse.json({ error: stopErr.message }, { status: 500 });

  const stopsResults = (stopRows ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((row: any) => ({ doc: reviveStopDoc(row.doc), tenant_id: row.tenant_id ?? row.doc?.tenant_id ?? null }))
    .filter((x) => x.doc && x.doc.status !== "deleted" && x.doc.stop_type !== "pickup")
    .map((x) => ({ ...shapeStopForSearch(x.doc), tenant_id: x.tenant_id })) as SearchResult[];

  // ── Drafts ───────────────────────────────────────────────────────────
  const draftOr = [
    `doc->>tracking_id.ilike.${like}`,
    `doc->>draft_id.ilike.${like}`,
    `doc->>recipient_name.ilike.${like}`,
    `doc->delivery_info->>delivery_address.ilike.${like}`,
    `doc->delivery_info->>delivery_city.ilike.${like}`,
    `doc->delivery_info->>delivery_zip.ilike.${like}`,
    `doc->>status.ilike.${like}`,
    `doc->service_info->>rx_number.ilike.${like}`,
  ];
  if (phoneLike) draftOr.push(`doc->>recipient_phone.ilike.${phoneLike}`);

  const { data: draftRows, error: draftErr } = await supabase
    .from("draft_stops")
    .select("doc, tenant_id")
    .or(draftOr.join(","))
    .limit(limit);
  if (draftErr) return NextResponse.json({ error: draftErr.message }, { status: 500 });

  const draftResults = (draftRows ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((row: any) => ({ doc: reviveStopDoc(row.doc), tenant_id: row.tenant_id ?? row.doc?.tenant_id ?? null }))
    .filter((x) => x.doc && x.doc.status !== "deleted")
    .map((x) => ({ ...shapeDraftForSearch(x.doc), tenant_id: x.tenant_id })) as SearchResult[];

  const seenIds = new Set(stopsResults.map((r) => r.stop_id).filter(Boolean));
  const filteredDrafts = draftResults.filter((r) => !r.stop_id || !seenIds.has(r.stop_id));

  // ── Enrich with tenant names ─────────────────────────────────────────
  const merged0 = [...stopsResults, ...filteredDrafts];
  const tenantIds = [...new Set(merged0.map((r) => r.tenant_id).filter((x) => x != null))];
  const tenantMap = new Map<number, string>();
  if (tenantIds.length) {
    const { data: tRows } = await supabase.from("tenants").select("tenant_id, doc").in("tenant_id", tenantIds);
    for (const t of tRows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (t as any).doc ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const id = (t as any).tenant_id;
      tenantMap.set(id, d.company_name || d.business_name || d.name || `Tenant ${id}`);
    }
  }
  for (const r of merged0) {
    r.tenant_name = r.tenant_id != null ? (tenantMap.get(r.tenant_id) ?? `Tenant ${r.tenant_id}`) : null;
  }

  // ── Relevance scoring (identical to client portal) ───────────────────
  const qLower = rawQ.toLowerCase();
  const qNoRtl = rawQ.replace(/^RTL-/i, "").toLowerCase();
  const phoneLast4 = phoneNorm.length >= 4 ? phoneNorm.slice(-4) : null;
  const recentCutoff = Date.now() - 7 * 86_400_000;

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
