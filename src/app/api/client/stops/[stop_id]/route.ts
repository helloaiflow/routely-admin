import { NextResponse } from "next/server";

import { resolveDriverNames, reviveStopDoc, shapeStopForDetail } from "@/lib/spoke-fields";
import { getDb, requirePagePermission, type TenantContext } from "@/lib/tenant";

// FastAPI (VPS) owns all dispatch (Spoke) writes — basic-field edits and
// deletes of UNASSIGNED stops route through it so Mongo and dispatch never
// diverge. The secret stays server-side only.
const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

const UNASSIGNED_STATUSES = ["pending", "approved", "paid", "unassigned", "created"];

function isUnassignedDoc(doc: Record<string, unknown>): boolean {
  const a = (doc.assignment ?? {}) as Record<string, unknown>;
  return (
    UNASSIGNED_STATUSES.includes(String(doc.status ?? "").toLowerCase()) && !a.driver_id && !a.route_id
  );
}

// Rich human actor forwarded to FastAPI so edit/delete land in the stop's
// timeline[] with WHO did it (stop-timeline Phase 1; same shape as created_by).
function actorFor(ctx: TenantContext) {
  return {
    type: ctx.role === "member" ? "tenant_member" : "tenant_owner",
    clerk_user_id: ctx.userId,
    name:
      [ctx.user?.firstName, ctx.user?.lastName].filter(Boolean).join(" ") ||
      ctx.user?.emailAddresses?.[0]?.emailAddress ||
      "",
    tenant_role: ctx.role,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ stop_id: string }> }) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { stop_id } = await params;
  const tenantId = Number(ctx.tenantId);
  // Admin cross-tenant "all": stop_id is globally unique, so read it without a
  // tenant filter (and skip the FastAPI-by-tenant call, which needs a tenant_id).
  const scopeAll = ctx.isAdmin && ctx.tenantScope === "all";

  // Read from FastAPI/PG (authority under STOPS_AUTHORITY=supabase) instead of the
  // lagging PG→Mongo mirror. reviveStopDoc converts jsonb ISO strings back to Dates
  // so the shapers' .toISOString() calls keep working.
  let doc: Record<string, unknown> | null = null;
  if (FASTAPI_SECRET && !scopeAll) {
    try {
      const upstream = await fetch(
        `${FASTAPI_BASE}/v1/stops/${encodeURIComponent(stop_id)}?tenant_id=${tenantId}`,
        { headers: { "X-API-Key": FASTAPI_SECRET }, signal: AbortSignal.timeout(10000) },
      );
      if (upstream.ok) doc = reviveStopDoc((await upstream.json()) as Record<string, unknown>);
      // 404/5xx → fall through to Mongo fallback (un-backfilled stops + transient errors)
    } catch {
      /* FastAPI unreachable/timeout → Mongo fallback */
    }
  }

  // Mongo is FALLBACK only. 2026-07-02: an unconditional getDb() here 500'd every
  // detail read while Atlas was down (ReplicaSetNoPrimary) even though PG had
  // already answered — the exact failure the PG repoint exists to survive.
  let db: Awaited<ReturnType<typeof getDb>> | null = null;
  if (!doc) {
    try {
      db = await getDb();
      doc = (await db
        .collection("stops")
        .findOne(scopeAll ? { stop_id } : { stop_id, tenant_id: tenantId })) as Record<string, unknown> | null;
    } catch {
      return NextResponse.json({ error: "Stop temporarily unavailable" }, { status: 503 });
    }
    if (!doc) return NextResponse.json({ error: "Stop not found" }, { status: 404 });
  }

  // Tenant isolation guard (belt-and-suspenders). Admin "all" scope views any tenant.
  if (!scopeAll && Number(doc.tenant_id) !== tenantId) {
    return NextResponse.json({ error: "Stop not found" }, { status: 404 });
  }

  // Driver names live in Mongo (spoke_drivers) and only matter for ASSIGNED stops.
  // Optional + capped at 2.5s: shapeStopForDetail falls back to the driver_name
  // already stored on assignment when the map is missing.
  const a = (doc.assignment ?? {}) as Record<string, unknown>;
  const legacyLeg = (doc.delivery_leg ?? {}) as Record<string, unknown>;
  let driverMap: Map<string, string> | undefined;
  if (a.driver_id || legacyLeg.driver_id) {
    try {
      driverMap = await Promise.race([
        (async () => resolveDriverNames(db ?? (await getDb()), [doc]))(),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 2500)),
      ]);
    } catch {
      /* degrade: name falls back to assignment.driver_name */
    }
  }

  return NextResponse.json({
    stop: {
      ...shapeStopForDetail(doc, driverMap),
      internal_notes: doc.internal_notes ?? [],
      dispatch_sync: doc.dispatch_sync ?? null,
      submit_error: doc.submit_error ?? null,
    },
  });
}

// Portal-editable set. Recipient identity + delivery address are editable from the
// portal per product decision (writes back to the Spoke-synced `stops` collection).
// When the delivery address changes the server re-geocodes to refresh address.lat/lng.
const ALLOWED: [string, string][] = [
  ["recipient", "name"],
  ["recipient", "phone"],
  ["recipient", "email"],
  ["recipient", "dob"],
  ["package", "type"],
  ["package", "notes"],
  ["package", "rx_number"],
  ["package", "dp_note"],
  ["package", "cold_chain"],
  ["package", "requires_signature"],
  ["package", "weight_oz"],
  ["package", "length_in"],
  ["package", "width_in"],
  ["package", "height_in"],
  ["address", "street"],
  ["address", "city"],
  ["address", "state"],
  ["address", "zip"],
  ["address", "gate_code"],
  ["address", "drop_preference"],
  ["service", "type"],
  ["service", "date"],
  ["service", "collect_payment"],
  ["service", "cod_amount"],
  ["service", "return_to_sender"],
  ["rates", "selected"],
  // Pickup — written by submitDraft's follow-up PATCH so the bulk-edited /
  // user-selected pickup is the canonical pickup on the stops doc.
  ["pickup", "location_id"],
  ["pickup", "name"],
  ["pickup", "address"],
  ["pickup", "city"],
  ["pickup", "state"],
  ["pickup", "zip"],
  ["pickup", "code"],
];

// Top-level fields editable from the portal
const ALLOWED_TOP = ["stop_type"];

export async function PATCH(request: Request, { params }: { params: Promise<{ stop_id: string }> }) {
  try {
    const ctx = await requirePagePermission("orders");
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { stop_id } = await params;
    // Admin cross-tenant: operate as the STOP's real tenant so any tenant's stop
    // can be edited and dispatch/charging stay correct.
    let tenantId = Number(ctx.tenantId);
    if (ctx.isAdmin) {
      try {
        const dbc = await getDb();
        const owner = await dbc.collection("stops").findOne({ stop_id }, { projection: { tenant_id: 1 } });
        if (owner?.tenant_id != null) tenantId = Number(owner.tenant_id);
      } catch {
        /* keep current scope tenant */
      }
    }
    const body = (await request.json()) as Record<string, unknown>;
    const rec = (body.recipient ?? {}) as Record<string, unknown>;

    // ── Classify the stop (ALWAYS) — unassigned edits delegate to FastAPI. ──
    // Mongo probe first; on an Atlas flap (or a mirror miss) fall back to the
    // FastAPI/PG read so a Mongo outage can't break the guard.
    let dbConn: Awaited<ReturnType<typeof getDb>> | null = null;
    let probe: Record<string, unknown> | null = null;
    let mongoDown = false;
    try {
      dbConn = await getDb();
      probe = (await dbConn
        .collection("stops")
        .findOne({ stop_id, tenant_id: tenantId }, { projection: { status: 1, assignment: 1 } })) as Record<
        string,
        unknown
      > | null;
    } catch {
      mongoDown = true;
    }
    if (!probe && FASTAPI_SECRET) {
      try {
        const upstream = await fetch(
          `${FASTAPI_BASE}/v1/stops/${encodeURIComponent(stop_id)}?tenant_id=${tenantId}`,
          { headers: { "X-API-Key": FASTAPI_SECRET }, signal: AbortSignal.timeout(10000) },
        );
        if (upstream.ok) probe = (await upstream.json()) as Record<string, unknown>;
      } catch {
        /* handled below */
      }
    }
    if (!probe) {
      return mongoDown
        ? NextResponse.json({ error: "Stop temporarily unavailable" }, { status: 503 })
        : NextResponse.json({ error: "Stop not found" }, { status: 404 });
    }

    // ── UNASSIGNED: delegate the FULL editable set to FastAPI, which writes
    // PG (what the panel reads), mirrors Mongo, and appends the timeline —
    // commits cdd96bd/9eab211. No local Mongo writes on this path.
    if (isUnassignedDoc(probe)) {
      const addrBody = body.address as Record<string, unknown> | undefined;
      // D20: address identity is immutable once submitted — Circuit can't
      // update an unassigned stop's location (delete + recreate is the path).
      if (addrBody && ["street", "city", "state", "zip"].some((k) => Object.hasOwn(addrBody, k))) {
        return NextResponse.json(
          {
            error:
              "The delivery address can't be edited on a submitted stop. Delete this stop and create a new draft with the correct address.",
          },
          { status: 409 },
        );
      }
      if (!FASTAPI_SECRET) {
        return NextResponse.json({ error: "Dispatch service not configured" }, { status: 502 });
      }

      // Map ONLY fields present in the client body onto FastAPI's
      // UnassignedEditInput (absent/None = don't touch).
      const pick = (src: unknown, keys: string[]) => {
        if (!src || typeof src !== "object") return undefined;
        const s = src as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const k of keys) {
          if (Object.hasOwn(s, k) && s[k] !== null && s[k] !== undefined) out[k] = s[k];
        }
        return Object.keys(out).length ? out : undefined;
      };
      const payload: Record<string, unknown> = { tenant_id: tenantId, actor: actorFor(ctx) };
      if (typeof rec.name === "string") payload.name = rec.name;
      if (typeof rec.phone === "string") payload.phone = rec.phone;
      if (Object.hasOwn(rec, "email")) payload.email = rec.email ?? "";
      if (typeof rec.dob === "string" && rec.dob) payload.dob = rec.dob;
      if (typeof body.stop_type === "string" && ["delivery", "pickup"].includes(body.stop_type)) {
        payload.activity = body.stop_type;
      }
      const pkg = pick(body.package, [
        "type",
        "notes",
        "rx_number",
        "dp_note",
        "cold_chain",
        "requires_signature",
        "weight_oz",
        "length_in",
        "width_in",
        "height_in",
      ]);
      if (pkg) payload.package = pkg;
      const svc = pick(body.service, ["type", "date", "collect_payment", "cod_amount", "return_to_sender"]);
      // Same rule as the legacy path: never clobber the canonical delivery
      // day with an empty string.
      if (svc?.date === "") delete svc.date;
      if (svc && Object.keys(svc).length) payload.service = svc;
      const addrSafe = pick(addrBody, ["gate_code", "drop_preference"]);
      if (addrSafe) payload.address = addrSafe;
      const pu = pick(body.pickup, ["location_id", "name", "address", "city", "state", "zip", "code"]);
      if (pu) payload.pickup = pu;
      const rates = body.rates as Record<string, unknown> | undefined;
      if (rates && Object.hasOwn(rates, "selected") && rates.selected != null) {
        payload.rates_selected = rates.selected;
      }
      if (Array.isArray(body.order_ids)) payload.order_ids = body.order_ids.map((v) => String(v));

      // Nothing mappable (e.g. only a non-delegable stop_type) → no-op success.
      if (Object.keys(payload).length === 2) {
        return NextResponse.json({ ok: true, stop_id });
      }

      let upstream: Response;
      try {
        upstream = await fetch(`${FASTAPI_BASE}/v1/stops/${encodeURIComponent(stop_id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-API-Key": FASTAPI_SECRET },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        return NextResponse.json({ error: "Dispatch service unreachable — change not saved" }, { status: 502 });
      }
      if (upstream.status === 409) {
        const d = (await upstream.json().catch(() => ({}))) as { detail?: string };
        return NextResponse.json({ error: d.detail ?? "Stop is no longer unassigned" }, { status: 409 });
      }
      if (!upstream.ok) {
        return NextResponse.json({ error: "Couldn't save the change" }, { status: 502 });
      }
      // Passthrough — FastAPI's {ok, warning?, detail?} reaches the client as-is.
      const out = (await upstream.json()) as Record<string, unknown>;
      return NextResponse.json({ stop_id, ...out });
    }

    // ── NON-unassigned: legacy Mongo-direct path (ALLOWED whitelist, geocode,
    // local timeline) — intact. This path genuinely needs Mongo.
    const db = dbConn ?? (await getDb());

    const updates: Record<string, unknown> = { updated_at: new Date() };
    for (const [section, field] of ALLOWED) {
      const sectionData = body[section] as Record<string, unknown> | undefined;
      if (sectionData && Object.hasOwn(sectionData, field)) {
        const value = sectionData[field];
        // Guard: service.date is the canonical delivery day — never overwrite a
        // real date with null/empty. A submit follow-up PATCH used to send
        // `date: serviceDate || null`, which nulled the delivery leg's date that
        // FastAPI had set (the OCR/failed-scan "no service.date" bug). Drop the
        // field instead of clobbering; clients now always send a real ET date.
        if (section === "service" && field === "date" && (value === null || value === "")) {
          continue;
        }
        updates[`${section}.${field}`] = value;
      }
    }
    for (const key of ALLOWED_TOP) {
      if (Object.hasOwn(body, key)) {
        updates[key] = body[key];
      }
    }
    // Hybrid-OCR (Phase 1): canonical order-id array — strictly validated.
    if (Object.hasOwn(body, "order_ids") && Array.isArray(body.order_ids)) {
      updates.order_ids = (body.order_ids as unknown[])
        .map((v) => String(v).trim())
        .filter((v) => /^\d{7}-\d{2}$/.test(v));
    }
    // Re-geocode when delivery address identity changes, so map/routing coords stay fresh.
    const addr = body.address as Record<string, unknown> | undefined;
    if (addr && (addr.street || addr.city || addr.zip)) {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (apiKey) {
        const q = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(", ");
        try {
          const r = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=country:US&key=${apiKey}`,
          );
          const d = await r.json();
          const loc = d.results?.[0]?.geometry?.location;
          if (typeof loc?.lat === "number" && typeof loc?.lng === "number") {
            updates["address.lng"] = loc.lng;
            updates["address.lat"] = loc.lat;
          }
        } catch {
          /* non-fatal — address still saved without fresh coords */
        }
      }
    }

    // Timeline (create-flow hardening Fix 4): Mongo-direct edits must be as
    // auditable as the FastAPI-delegated ones. Diff against the current doc
    // and append a stop.field_changed entry in the same shape FastAPI's
    // make_event writes. Derived coords (address.lat/lng) are noise — excluded.
    const AUDIT_EXCLUDED = new Set(["updated_at", "address.lat", "address.lng"]);
    const auditKeys = Object.keys(updates).filter((k) => !AUDIT_EXCLUDED.has(k));
    let fieldChanges: Array<{ field: string; old_value: unknown; new_value: unknown }> = [];
    if (auditKeys.length > 0) {
      const current = await db
        .collection("stops")
        .findOne(
          { stop_id, tenant_id: tenantId },
          { projection: Object.fromEntries(auditKeys.map((k) => [k, 1])) },
        );
      if (current) {
        const oldVal = (k: string) =>
          k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown> | null | undefined)?.[p], current);
        fieldChanges = auditKeys
          .map((k) => ({ field: k, old_value: oldVal(k) ?? null, new_value: updates[k] ?? null }))
          .filter((c) => JSON.stringify(c.old_value) !== JSON.stringify(c.new_value));
      }
    }

    const result = await db
      .collection("stops")
      .updateOne({ stop_id, tenant_id: tenantId }, { $set: updates });

    if (result.matchedCount === 0) return NextResponse.json({ error: "Stop not found" }, { status: 404 });

    if (fieldChanges.length > 0) {
      const a = actorFor(ctx);
      try {
        await db.collection("stops").updateOne(
          { stop_id, tenant_id: tenantId },
          {
            $push: {
              timeline: {
                event: "stop.field_changed",
                timestamp: new Date(),
                actor: a.type,
                actor_name: a.name || "Client portal",
                note: "Edited from client portal",
                actor_id: a.clerk_user_id,
                metadata: {
                  field_changes: fieldChanges,
                  tenant_id: tenantId,
                  tenant_role: a.tenant_role,
                },
                visibility: "customer",
              },
            },
          } as never,
        );
      } catch (tlErr) {
        console.error("[stops PATCH] timeline append failed (non-fatal):", tlErr);
      }
    }

    return NextResponse.json({ ok: true, stop_id });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Delete — UNASSIGNED stops route through FastAPI (Spoke delete first, Mongo
// soft-delete second, paired pickup included). Anything else keeps the legacy
// Mongo-only soft delete (reversible) used before this feature.
export async function DELETE(_request: Request, { params }: { params: Promise<{ stop_id: string }> }) {
  try {
    const ctx = await requirePagePermission("orders");
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { stop_id } = await params;
    const db = await getDb();
    // Admin cross-tenant: operate as the STOP's real tenant.
    let tenantId = Number(ctx.tenantId);
    if (ctx.isAdmin) {
      const owner = await db.collection("stops").findOne({ stop_id }, { projection: { tenant_id: 1 } });
      if (owner?.tenant_id != null) tenantId = Number(owner.tenant_id);
    }

    const doc = await db
      .collection("stops")
      .findOne({ stop_id, tenant_id: tenantId }, { projection: { status: 1, assignment: 1 } });
    if (!doc) return NextResponse.json({ error: "Stop not found" }, { status: 404 });

    if (isUnassignedDoc(doc) && FASTAPI_SECRET) {
      let upstream: Response;
      try {
        upstream = await fetch(
          `${FASTAPI_BASE}/v1/stops/${encodeURIComponent(stop_id)}?tenant_id=${tenantId}`,
          {
            method: "DELETE",
            headers: { "X-API-Key": FASTAPI_SECRET, "Content-Type": "application/json" },
            body: JSON.stringify({ actor: actorFor(ctx) }),
          },
        );
      } catch {
        return NextResponse.json({ error: "Dispatch service unreachable — stop NOT deleted" }, { status: 502 });
      }
      if (upstream.status === 409) {
        return NextResponse.json({ error: "Stop is no longer unassigned" }, { status: 409 });
      }
      if (!upstream.ok) {
        return NextResponse.json({ error: "Dispatch delete failed — stop NOT deleted" }, { status: 502 });
      }
      const payload = (await upstream.json()) as Record<string, unknown>;
      return NextResponse.json({ ok: true, stop_id, ...payload });
    }

    // Legacy path (non-unassigned): Mongo-only soft delete, unchanged.
    const result = await db
      .collection("stops")
      .updateOne({ stop_id, tenant_id: tenantId }, { $set: { status: "deleted", updated_at: new Date() } });

    if (result.matchedCount === 0) return NextResponse.json({ error: "Stop not found" }, { status: 404 });
    return NextResponse.json({ ok: true, stop_id });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
