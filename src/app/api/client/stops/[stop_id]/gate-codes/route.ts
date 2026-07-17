import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getDb, requirePagePermission } from "@/lib/tenant";

/** Strip unit suffix from street so "123 Main St Apt 4" matches "123 Main St Suite 100" */
function baseStreet(street: string): string {
  return street
    .toUpperCase()
    .replace(
      /[\s,]+(APT|APARTMENT|SUITE|STE|UNIT|#|BLDG|BUILDING|FL|FLOOR|RM|ROOM|LOT|SPC|SPACE)\s*[\w-]*\.?\s*$/i,
      "",
    )
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ stop_id: string }> },
) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { stop_id } = await params;
  const db = await getDb();

  const stop = await db
    .collection("stops")
    .findOne(
      { stop_id, tenant_id: Number(ctx.tenantId) },
      { projection: { "address.street": 1, "address.zip": 1 } },
    );

  const draft = !stop
    ? await db.collection("draft_stops").findOne(
        { $or: [{ draft_id: stop_id }, { stop_id }], tenant_id: Number(ctx.tenantId) },
        { projection: { delivery_address: 1, delivery_zip: 1 } },
      )
    : null;

  const street = stop?.address?.street ?? draft?.delivery_address ?? "";
  const zip = stop?.address?.zip ?? draft?.delivery_zip ?? "";

  if (!street || !zip) {
    return NextResponse.json({ codes: [], street: "", zip });
  }

  const base = baseStreet(street);
  const pattern = `^${escapeRegex(base)}`;

  const codes = await db
    .collection("gate_codes")
    .find({
      tenant_id: Number(ctx.tenantId),
      $or: [
        { address: { $regex: pattern, $options: "i" } },
        { address_normalized: { $regex: pattern, $options: "i" } },
        { street: { $regex: pattern, $options: "i" } },
      ],
      $and: [{ $or: [{ zip }, { zip: { $exists: false } }] }],
    })
    .sort({ created_at: -1 })
    .limit(20)
    .toArray();

  return NextResponse.json({ codes, street: base, zip });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ stop_id: string }> },
) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { stop_id } = await params;
  const db = await getDb();

  const body = (await request.json()) as { code?: string; notes?: string };
  const code = String(body.code ?? "").trim();
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });
  if (code.length > 50) return NextResponse.json({ error: "Code too long (max 50)" }, { status: 400 });

  const stop = await db
    .collection("stops")
    .findOne(
      { stop_id, tenant_id: Number(ctx.tenantId) },
      { projection: { "address.street": 1, "address.zip": 1, "address.city": 1, "address.state": 1 } },
    );
  const draft = !stop
    ? await db.collection("draft_stops").findOne(
        { $or: [{ draft_id: stop_id }, { stop_id }], tenant_id: Number(ctx.tenantId) },
        { projection: { delivery_address: 1, delivery_zip: 1, delivery_city: 1, delivery_state: 1 } },
      )
    : null;

  const street = stop?.address?.street ?? draft?.delivery_address ?? "";
  const zip = stop?.address?.zip ?? draft?.delivery_zip ?? "";
  const city = stop?.address?.city ?? draft?.delivery_city ?? "";
  const state = stop?.address?.state ?? draft?.delivery_state ?? "";
  const base = baseStreet(street);

  const user = await currentUser();
  const author = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
      user.emailAddresses[0]?.emailAddress ||
      "Client"
    : "Client";

  const doc = {
    tenant_id: Number(ctx.tenantId),
    address: base,
    address_normalized: base,
    street: base,
    city: city.toUpperCase(),
    state: state.toUpperCase(),
    zip,
    gate_code: code,
    notes: String(body.notes ?? "").trim(),
    added_by: author,
    created_by: author,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const result = await db.collection("gate_codes").insertOne(doc);
  return NextResponse.json({ ok: true, code: { ...doc, _id: result.insertedId } });
}
