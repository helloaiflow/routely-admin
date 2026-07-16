// src/lib/spoke-fields.ts
//
// Single source of truth for reading the `stops` collection and shaping
// documents for API responses. Three layers:
//
//   1. read* helpers: extract canonical fields with legacy fallbacks
//      (`assignment.*` with `delivery_leg.*` fallback; `service.*` with
//      `delivery.*` fallback). Canonical = what FastAPI writes today.
//      Fallback = what legacy IVY/n8n flows still write to.
//   2. resolveDriverNames(): shared driver-name lookup against `spoke_drivers`
//   3. shape* functions: build API response objects for each consumer
//
// Field naming policy
// -------------------
// API responses use vendor-agnostic field names (eta_window, dispatch_link,
// route_state, estimated_distance_m) — NOT vendor-branded names like
// spoke_web_app_link. The UI never sees "spoke" in field names. This keeps
// the portal portable when we migrate off Spoke.
//
// Timeline policy
// ---------------
// `stops.timeline[]` is the canonical event stream consumed by the UI.
// `spoke.history[]` is internal raw audit log and is NEVER exposed in API
// responses or rendered in the UI. When we eventually migrate away from
// Spoke, this rule keeps the UI untouched — only the writer changes.

import type { Db } from "mongodb";

import { type ClassifiableStop, phaseOf } from "@/lib/status";

// ── Status buckets ──────────────────────────────────────────────────────────
export const DELIVERED_STATUSES = ["delivered", "completed", "picked_up"];
export const FAILED_STATUSES = ["failed", "attempted", "cancelled", "failed_not_home"];
export const IN_TRANSIT_STATUSES = ["in_transit", "out_for_delivery", "dispatched", "assigned"];
export const PENDING_STATUSES = ["pending", "draft", "approved", "paid", "unassigned", "created"];

// Canonical bucket — keyed on Spoke's success boolean via phaseOf (lib/status.ts),
// so it agrees with the KPIs / Sankey / monitor. The string arrays above are the
// pre-terminal fallback inside the classifier; they're no longer the decision here.
export function statusBucket(stop: ClassifiableStop): "delivered" | "failed" | "in_transit" | "pending" {
  const p = phaseOf(stop);
  return p === "in_motion" ? "in_transit" : p === "pre" ? "pending" : p;
}

// ── Field readers (canonical + legacy fallback) ────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Stop = any;

/**
 * Revives Mongo date fields after a Supabase fetch. Postgres jsonb stores dates
 * as ISO strings, but the shapers below call `.toISOString?.()`, which only
 * works on Date objects. Converting the known date fields back to Date keeps
 * every shaper working unchanged whether the doc came from Mongo or Postgres.
 * Mutates and returns the same object.
 */
export function reviveStopDoc(d: Stop): Stop {
  if (!d || typeof d !== "object") return d;
  if (typeof d.created_at === "string") d.created_at = new Date(d.created_at);
  if (typeof d.updated_at === "string") d.updated_at = new Date(d.updated_at);
  if (d.spoke && typeof d.spoke.last_event_at === "string") {
    d.spoke.last_event_at = new Date(d.spoke.last_event_at);
  }
  if (Array.isArray(d.timeline)) {
    for (const e of d.timeline) {
      if (e && typeof e.timestamp === "string") e.timestamp = new Date(e.timestamp);
    }
  }
  return d;
}

/**
 * Reads assignment fields. Canonical path is `assignment.*` (what FastAPI
 * writes after 2026-06-02 Spoke Raw Data Architecture). Legacy IVY/n8n
 * flows may still write to `delivery_leg.*` — those are read as fallback
 * so legacy stops keep displaying correctly during migration.
 *
 * New fields surfaced under vendor-agnostic names:
 *   - eta_window:           { earliest, latest } (epoch seconds)
 *   - route_state:          { distributed, started, completed, ... }
 *   - estimated_distance_m: meters
 *   - estimated_duration_s: seconds
 *   - dispatch_link:        external dispatcher link (Spoke today, ours later)
 */
export function readAssignment(d: Stop) {
  const a = d.assignment ?? {};
  const l = d.delivery_leg ?? {};
  return {
    driver_id: a.driver_id ?? l.driver_id ?? null,
    driver_name: a.driver_name ?? l.driver_name ?? null,
    driver_phone: a.driver_phone ?? l.driver_phone ?? null,
    route_id: a.route_id ?? d.route_id ?? l.route_id ?? null,
    route_title: a.route_title ?? l.metrics?.route_title ?? null,
    route_stop_count: a.route_stop_count ?? l.metrics?.route_stop_count ?? null,
    stop_position: a.stop_position ?? null,
    eta_at: a.eta_at ?? l.eta_at ?? null,
    dispatched_at: a.dispatched_at ?? l.dispatched_at ?? null,
    // New fields (vendor-agnostic, surfaced from Spoke raw data)
    eta_window: a.eta_window ?? null,
    route_state: a.route_state ?? null,
    estimated_distance_m: a.spoke_estimated_distance_m ?? null,
    estimated_duration_s: a.spoke_estimated_duration_s ?? null,
    dispatch_link: a.spoke_web_app_link ?? null,
  };
}

/**
 * Reads service fields. Canonical path is `service.*` (FastAPI). Legacy
 * IVY/n8n flows wrote to `delivery.*` — read as fallback.
 */
export function readService(d: Stop) {
  const s = d.service ?? {};
  const dl = d.delivery ?? {};
  return {
    type: s.type ?? dl.type ?? "local",
    date: s.date ?? dl.date ?? null,
    collect_payment: Boolean(s.collect_payment ?? dl.collect_payment),
    cod_amount: Number(s.cod_amount ?? dl.cod_amount ?? 0),
    return_to_sender: Boolean(s.return_to_sender ?? dl.return_to_sender),
  };
}

export function readAddress(d: Stop) {
  const a = d.address ?? {};
  return {
    street: a.street ?? "",
    city: a.city ?? "",
    state: a.state ?? "FL",
    zip: a.zip ?? "",
    lat: a.lat ?? null,
    lng: a.lng ?? null,
    gate_code: a.gate_code ?? null,
    drop_preference: a.drop_preference ?? null,
  };
}

export function readRecipient(d: Stop) {
  const r = d.recipient ?? {};
  return {
    name: r.name ?? d.address?.name ?? "",
    phone: r.phone ?? d.address?.phone ?? null,
    email: r.email ?? null,
    dob: r.dob ?? null,
  };
}

export function readPackage(d: Stop) {
  const p = d.package ?? {};
  return {
    type: p.type ?? "rx",
    rx_number: p.rx_number ?? "",
    dp_note: p.dp_note ?? null,
    notes: p.notes ?? "",
    cold_chain: Boolean(p.cold_chain),
    requires_signature: Boolean(p.requires_signature ?? d.requires_signature),
    weight_oz: Number(p.weight_oz ?? 8),
    length_in: Number(p.length_in ?? 10),
    width_in: Number(p.width_in ?? 7),
    height_in: Number(p.height_in ?? 2),
  };
}

export function readPickup(d: Stop) {
  const p = d.pickup ?? {};
  return {
    location_id: p.location_id ?? "",
    name: p.name ?? null,
    address: p.address ?? p.street ?? "",
    city: p.city ?? "",
    state: p.state ?? "FL",
    zip: p.zip ?? "",
    code: p.code ?? "",
    source: p.source ?? null,
  };
}

export function readLabel(d: Stop) {
  const l = d.label ?? {};
  return {
    carrier: l.carrier ?? null,
    tracking_number: l.tracking_number ?? null,
    tracking_link: l.tracking_link ?? d.delivery_leg?.tracking_link ?? null,
    label_url: l.label_url ?? null,
  };
}

/**
 * Reads `stops.timeline[]` (canonical, vendor-agnostic event stream).
 * Collapses consecutive duplicate events for the same actor — fixes the
 * webhook-replay duplication bug where the same `stop.allocated` push
 * lands multiple "assigned" entries in a row.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readTimeline(d: Stop): Array<Record<string, any>> {
  const raw = Array.isArray(d.timeline) ? d.timeline : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = [];
  for (const e of raw) {
    const prev = out[out.length - 1];
    const sameEvent = prev && prev.event === e.event;
    const sameDriver = prev && (prev.metadata?.driver_id ?? null) === (e.metadata?.driver_id ?? null);
    if (sameEvent && sameDriver) continue; // skip consecutive duplicate
    out.push({
      event: e.event ?? "unknown",
      timestamp: e.timestamp?.toISOString?.() ?? e.timestamp ?? null,
      actor: e.actor ?? "system",
      actor_name: e.actor_name ?? null,
      actor_id: e.actor_id ?? null,
      note: e.note ?? null,
      metadata: e.metadata ?? null,
    });
  }
  return out;
}

// ── Driver name resolution ──────────────────────────────────────────────────

/**
 * Resolves driver names from the `spoke_drivers` collection for a batch
 * of stop docs. Returns a Map keyed by both `spoke_driver_id` and
 * `driver_id` so callers can look up by whichever ID they have.
 *
 * Reads driver_id from canonical `assignment.driver_id` first, then
 * falls back to legacy `delivery_leg.driver_id`.
 */
export async function resolveDriverNames(db: Db, docs: Stop[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const driverIds = [
    ...new Set(docs.map((d) => d.assignment?.driver_id ?? d.delivery_leg?.driver_id).filter(Boolean) as string[]),
  ];
  if (driverIds.length === 0) return map;
  try {
    const drs = await db
      .collection("spoke_drivers")
      .find({
        $or: [{ spoke_driver_id: { $in: driverIds } }, { driver_id: { $in: driverIds } }],
      })
      .project({ spoke_driver_id: 1, driver_id: 1, full_name: 1, name: 1 })
      .toArray();
    for (const dr of drs) {
      const name = dr.full_name ?? dr.name ?? null;
      if (!name) continue;
      if (dr.spoke_driver_id) map.set(String(dr.spoke_driver_id), name);
      if (dr.driver_id) map.set(String(dr.driver_id), name);
    }
  } catch {
    // Non-fatal — list still rendered without driver names
  }
  return map;
}

// ── Shapers ─────────────────────────────────────────────────────────────────

/**
 * Nested shape used by the stop-detail panel (`/api/client/stops/[stop_id]`).
 * Preserves the existing contract and adds:
 *   - `timeline[]` (deduped canonical events for the UI to render)
 *   - `assignment.eta_window`, `route_state`, `dispatch_link`, etc.
 *   - `last_event_type` / `last_event_at` for live-status badges
 *
 * Does NOT expose `spoke.history[]` — that stays internal.
 */
export function shapeStopForDetail(d: Stop, driverMap?: Map<string, string>) {
  const assignment = readAssignment(d);
  const driverName = assignment.driver_id
    ? (driverMap?.get(assignment.driver_id) ?? assignment.driver_name)
    : assignment.driver_name;
  return {
    stop_id: d.stop_id ?? "",
    stop_type: d.stop_type ?? "delivery",
    status: d.status ?? "pending",
    order_ref: d.order_ref ?? null,
    route_zone: d.route_zone ?? null,
    total_price: Number(d.total_price ?? 0),
    created_at: d.created_at?.toISOString?.() ?? new Date().toISOString(),
    updated_at: d.updated_at?.toISOString?.() ?? null,
    recipient: readRecipient(d),
    address: readAddress(d),
    package: readPackage(d),
    service: readService(d),
    pickup: readPickup(d),
    label: readLabel(d),
    assignment: { ...assignment, driver_name: driverName },
    rates: {
      ups: d.rates?.ups ?? null,
      usps: d.rates?.usps ?? null,
      fedex: d.rates?.fedex ?? null,
      selected: d.rates?.selected ?? null,
    },
    timeline: readTimeline(d),
    photos: Array.isArray(d.result?.photo_urls) ? d.result.photo_urls : [],
    // Proof of delivery — driver's captured signature (Spoke result.signature_url).
    signature_url: d.result?.signature_url ?? null,
    // Live-status hints sourced from the most recent webhook event
    last_event_type: d.spoke?.last_event_type ?? null,
    last_event_at: d.spoke?.last_event_at?.toISOString?.() ?? d.spoke?.last_event_at ?? null,
    // Spoke's AUTHORITATIVE success/fail signal (true=delivered, false=failed,
    // null=not yet attempted). The single source of truth for terminal
    // classification — see lib/status.ts. spoke_state is the raw reason string
    // (e.g. "delivered_to_safe_place", "failed_not_home") — DISPLAY ONLY.
    delivery_succeeded: d.result?.delivery_succeeded ?? null,
    delivery_attempted: d.result?.delivery_attempted ?? null,
    spoke_state: d.result?.spoke_state ?? null,
  };
}

/**
 * Flat shape used by list endpoints (dashboard, `/api/client/stops`).
 * Preserves the existing flat field contract intact and adds new
 * vendor-agnostic fields (eta_window, route_state, dispatch_link, …).
 */
export function shapeStopForList(d: Stop, driverMap?: Map<string, string>) {
  const assignment = readAssignment(d);
  const driverName = assignment.driver_id
    ? (driverMap?.get(assignment.driver_id) ?? assignment.driver_name)
    : assignment.driver_name;
  const service = readService(d);
  const address = readAddress(d);
  const recipient = readRecipient(d);
  const label = readLabel(d);
  const pickup = readPickup(d);
  return {
    id: String(d.stop_id ?? d._id ?? ""),
    stop_id: d.stop_id ?? null,
    stop_type: d.stop_type ?? "delivery",
    source: d.source ?? "unknown",
    status: (d.status ?? "pending").toLowerCase(),
    order_ref: d.order_ref ?? null,
    // Recipient
    recipient_name: recipient.name,
    recipient_phone: recipient.phone,
    // Address (both naming conventions — UI code reads either form)
    delivery_address: address.street,
    delivery_city: address.city,
    delivery_state: address.state,
    delivery_zip: address.zip,
    delivery_lat: address.lat,
    delivery_lng: address.lng,
    address: address.street,
    city: address.city,
    state: address.state,
    zip: address.zip,
    // Service
    service_type: service.type,
    delivery_date: service.date,
    is_same_day: service.type === "same_day",
    collect_cod: service.collect_payment,
    collect_amount: service.cod_amount,
    return_to_sender: service.return_to_sender,
    // Package
    package_type: d.package?.type ?? "rx",
    requires_signature: Boolean(d.package?.requires_signature ?? d.requires_signature),
    notes: d.package?.notes ?? d.notes ?? null,
    // Assignment (canonical + new fields)
    driver_id: assignment.driver_id,
    driver_name: driverName,
    route_id: assignment.route_id,
    route_title: assignment.route_title,
    eta_at: assignment.eta_at,
    eta: assignment.eta_at, // backward-compat alias
    eta_window: assignment.eta_window,
    route_state: assignment.route_state,
    estimated_distance_m: assignment.estimated_distance_m,
    estimated_duration_s: assignment.estimated_duration_s,
    dispatch_link: assignment.dispatch_link,
    stop_position: assignment.stop_position,
    // Pickup
    pickup_name: pickup.name,
    pickup_location_id: pickup.location_id,
    pickup_address: pickup.address,
    pickup_lat: d.pickup?.lat ?? d.pickup?.latitude ?? null,
    pickup_lng: d.pickup?.lng ?? d.pickup?.longitude ?? null,
    // Label
    tracking_link: label.tracking_link,
    // Live-status hints
    last_event_type: d.spoke?.last_event_type ?? null,
    last_event_at: d.spoke?.last_event_at?.toISOString?.() ?? d.spoke?.last_event_at ?? null,
    // Stats
    photo_count: Array.isArray(d.result?.photo_urls) ? d.result.photo_urls.length : 0,
    total_price: Number(d.total_price ?? 0),
    created_at: d.created_at?.toISOString?.() ?? new Date().toISOString(),
    zone: d.route_zone ?? null,
    // Submit failure note (status fell back to "draft") — recovered-draft badge.
    submit_error: d.submit_error ?? null,
    // Spoke's AUTHORITATIVE terminal signal (true=delivered/false=failed/null=pre-
    // terminal) — canonical classification key (lib/status.ts). spoke_state is the
    // raw reason string for DISPLAY ONLY, never the success/fail decision.
    delivery_succeeded: d.result?.delivery_succeeded ?? null,
    delivery_attempted: d.result?.delivery_attempted ?? null,
    spoke_state: d.result?.spoke_state ?? null,
  };
}

/**
 * Flat shape used by `/api/client/search`. Superset of the list shape with
 * `source: "stop"` discriminator and full `photos` array (search panel
 * gallery), not just the count.
 */
export function shapeStopForSearch(d: Stop, driverMap?: Map<string, string>) {
  const base = shapeStopForList(d, driverMap);
  const photos =
    Array.isArray(d.result?.photo_urls) && d.result.photo_urls.length
      ? d.result.photo_urls
      : Array.isArray(d.photos)
        ? d.photos
        : [];
  return { ...base, source: "stop" as const, photos };
}

// ── Draft shapers ───────────────────────────────────────────────────────────

/**
 * Flat shape for draft stops (portal orders, not yet dispatched).
 * Same key set as `shapeStopForList` so the UI can render mixed lists
 * without branching, with all assignment-related fields null.
 */
export function shapeDraftForList(d: Stop) {
  return {
    id: String(d.draft_id ?? ""),
    stop_id: d.tracking_id ?? null,
    stop_type: d.stop_type ?? "delivery",
    source: "portal" as const,
    status: (d.status ?? "draft").toLowerCase(),
    order_ref: d.order_ref ?? null,
    recipient_name: d.recipient_name ?? "",
    recipient_phone: d.recipient_phone ?? null,
    delivery_address: d.delivery_info?.delivery_address ?? "",
    delivery_city: d.delivery_info?.delivery_city ?? "",
    delivery_state: d.delivery_info?.delivery_state ?? "FL",
    delivery_zip: d.delivery_info?.delivery_zip ?? "",
    delivery_lat: null,
    delivery_lng: null,
    address: d.delivery_info?.delivery_address ?? "",
    city: d.delivery_info?.delivery_city ?? "",
    state: d.delivery_info?.delivery_state ?? "FL",
    zip: d.delivery_info?.delivery_zip ?? "",
    service_type: d.service_info?.service_type ?? "local",
    delivery_date: d.delivery_info?.delivery_date ?? null,
    is_same_day: Boolean(d.delivery_info?.is_same_day),
    collect_cod: Boolean(d.delivery_requirements?.collect_cod),
    collect_amount:
      d.delivery_requirements?.collect_amount != null ? Number(d.delivery_requirements.collect_amount) : null,
    return_to_sender: false,
    package_type: d.service_info?.package_type ?? "rx",
    requires_signature: Boolean(d.delivery_requirements?.requires_signature),
    notes: d.service_info?.notes ?? null,
    driver_id: null,
    driver_name: null,
    route_id: null,
    route_title: null,
    eta_at: null,
    eta: null,
    eta_window: null,
    route_state: null,
    estimated_distance_m: null,
    estimated_duration_s: null,
    dispatch_link: null,
    stop_position: null,
    pickup_name: null,
    pickup_location_id: null,
    pickup_address: null,
    pickup_lat: null,
    pickup_lng: null,
    tracking_link: null,
    last_event_type: null,
    last_event_at: null,
    photo_count: Array.isArray(d.photos) ? d.photos.length : 0,
    total_price: Number(d.pricing_info?.total_price ?? 0),
    created_at: d.created_at?.toISOString?.() ?? new Date().toISOString(),
    zone: null,
  };
}

export function shapeDraftForSearch(d: Stop) {
  const base = shapeDraftForList(d);
  return {
    ...base,
    source: "draft" as const,
    photos: Array.isArray(d.photos) ? d.photos : [],
  };
}
