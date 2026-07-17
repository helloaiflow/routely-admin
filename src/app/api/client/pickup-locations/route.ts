import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getDb, requirePagePermission } from "@/lib/tenant";

/* ───────────────────────────────────────────────────────────────────────────
 * Pickup Locations — tenant-scoped CRUD over the tenant.pickup_locations array.
 *
 * Touches ONLY pickup_locations (never pricing / plan / billing). Gated by the
 * "settings" page permission.
 *
 * CANONICAL SHAPE (matches existing production entries + the order flow's
 * normalizer in draft_order/page.tsx): the address is a NESTED object, and
 * entries may carry code / legacy_id / active from earlier seeding — those are
 * preserved untouched on edit.
 *
 *   { id, location_id, name,
 *     address: { street, city, state, zip },
 *     contact_name?, contact_phone?, hours?, notes?,
 *     is_default, active, code?, legacy_id?, created_at? }
 * ───────────────────────────────────────────────────────────────────────────*/

type Address = { street: string; city: string; state: string; zip: string };

type PickupLocation = {
  id: string;
  location_id: string;
  name: string;
  address: Address;
  contact_name?: string;
  contact_phone?: string;
  hours?: string;
  notes?: string;
  is_default: boolean;
  active: boolean;
  code?: string;
  legacy_id?: string;
  created_at?: string;
  [k: string]: unknown;
};

/** Coerce+trim untrusted body → normalized name + nested address + contacts. */
function sanitize(body: Record<string, unknown>) {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    name: s(body.name),
    address: {
      street: s(body.street).toUpperCase(),
      city: s(body.city),
      state: (s(body.state) || "FL").toUpperCase().slice(0, 2),
      zip: s(body.zip),
    } as Address,
    contact_name: s(body.contact_name),
    contact_phone: s(body.contact_phone),
    hours: s(body.hours),
    notes: s(body.notes),
  };
}

const isValid = (f: ReturnType<typeof sanitize>) =>
  Boolean(f.name && f.address.street && f.address.city && f.address.zip);

async function loadLocations(tenantId: number): Promise<PickupLocation[]> {
  const db = await getDb();
  const t = await db
    .collection("tenants")
    .findOne({ tenant_id: tenantId }, { projection: { pickup_locations: 1 } });
  return Array.isArray(t?.pickup_locations) ? (t!.pickup_locations as PickupLocation[]) : [];
}

async function saveLocations(tenantId: number, locations: PickupLocation[]) {
  const db = await getDb();
  await db
    .collection("tenants")
    .updateOne({ tenant_id: tenantId }, { $set: { pickup_locations: locations, updated_at: new Date() } });
}

/* GET — list all pickup locations for the tenant. */
export async function GET() {
  const ctx = await requirePagePermission("settings");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ locations: await loadLocations(ctx.tenantId) });
}

/* POST — add a new pickup location. First location auto-becomes default. */
export async function POST(req: Request) {
  const ctx = await requirePagePermission("settings");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields = sanitize(body);
  if (!isValid(fields)) {
    return NextResponse.json({ error: "name, street, city and zip are required" }, { status: 400 });
  }

  const locations = await loadLocations(ctx.tenantId);
  const wantsDefault = body.is_default === true || locations.length === 0;
  const id = `pl_${randomUUID().slice(0, 12)}`;
  const entry: PickupLocation = {
    id,
    location_id: id,
    ...fields,
    is_default: wantsDefault,
    active: true,
    created_at: new Date().toISOString(),
  };

  const next = wantsDefault ? locations.map((l) => ({ ...l, is_default: false })) : locations.slice();
  next.push(entry);
  await saveLocations(ctx.tenantId, next);
  return NextResponse.json({ location: entry, locations: next }, { status: 201 });
}

/* PATCH — update an existing location by id (also handles make-default).
 * Spreads the existing entry first so code / legacy_id / active / created_at
 * survive the edit. */
export async function PATCH(req: Request) {
  const ctx = await requirePagePermission("settings");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const locations = await loadLocations(ctx.tenantId);
  const idx = locations.findIndex((l) => l.id === id || l.location_id === id);
  if (idx === -1) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const fields = sanitize(body);
  if (!isValid(fields)) {
    return NextResponse.json({ error: "name, street, city and zip are required" }, { status: 400 });
  }
  const makeDefault = body.is_default === true;
  const updated: PickupLocation = {
    ...locations[idx],
    ...fields,
    is_default: makeDefault || Boolean(locations[idx].is_default),
    active: locations[idx].active ?? true,
  };

  const next = locations.map((l, i) => {
    if (i === idx) return updated;
    return makeDefault ? { ...l, is_default: false } : l;
  });
  await saveLocations(ctx.tenantId, next);
  return NextResponse.json({ location: updated, locations: next });
}

/* DELETE — remove a location by ?id=. Promotes the first remaining entry to
 * default when the deleted one was the default. */
export async function DELETE(req: Request) {
  const ctx = await requirePagePermission("settings");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const locations = await loadLocations(ctx.tenantId);
  const target = locations.find((l) => l.id === id || l.location_id === id);
  if (!target) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  let next = locations.filter((l) => l.id !== id && l.location_id !== id);
  if (target.is_default && next.length > 0 && !next.some((l) => l.is_default)) {
    next = next.map((l, i) => (i === 0 ? { ...l, is_default: true } : l));
  }
  await saveLocations(ctx.tenantId, next);
  return NextResponse.json({ locations: next });
}
