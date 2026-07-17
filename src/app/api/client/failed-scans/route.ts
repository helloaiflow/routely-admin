import { NextResponse } from "next/server";

import { ObjectId } from "mongodb";

import { getDb, requirePagePermission } from "@/lib/tenant";

/* ── /api/client/failed-scans ─────────────────────────────────────────────────
 * Bulletproof SAME-DAY tray for labels that failed the 3-field OCR gate during a
 * (batch) scan. Persisted in MongoDB `failed_scans` so they survive window close,
 * back, refresh, and device switch for the rest of the day. Auto-deleted 24h
 * after createdAt via a MongoDB TTL index (no cron). PHI: the label image lives
 * IN the document (temporary, same-day); this route is auth-protected and
 * tenant-scoped — never a public/guessable route.
 * ─────────────────────────────────────────────────────────────────────────── */

const MAX_IMAGE_CHARS = 12 * 1024 * 1024; // ~12MB data URL ceiling (Mongo doc limit 16MB)
const LIST_LIMIT = 100;

let indexesEnsured = false;
async function ensureIndexes(db: Awaited<ReturnType<typeof getDb>>) {
  if (indexesEnsured) return;
  try {
    await db.collection("failed_scans").createIndexes([
      // TTL — Mongo auto-deletes a doc 24h after createdAt. The field MUST be a
      // real BSON Date for the TTL monitor to act on it.
      { key: { createdAt: 1 }, name: "ttl_createdAt_24h", expireAfterSeconds: 86400 },
      { key: { tenant_id: 1, status: 1, createdAt: -1 }, name: "idx_tenant_status_created" },
    ]);
    indexesEnsured = true;
  } catch (err) {
    // Non-fatal: a parallel cold start may race; the index is idempotent.
    console.error("[failed-scans ensureIndexes]", err);
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

// ── GET: pending failed scans for the tenant (the source-of-truth tray) ───────
// `?count=1` returns only the pending count (cheap — no images) for the badge.
export async function GET(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  await ensureIndexes(db);

  // Admin cross-tenant: "all" scope drops the per-tenant filter.
  const scopeAll = ctx.isAdmin && ctx.tenantScope === "all";
  const tenantFilter = scopeAll
    ? { status: "pending" }
    : { tenant_id: Number(ctx.tenantId), status: "pending" };

  if (new URL(request.url).searchParams.get("count") === "1") {
    const count = await db.collection("failed_scans").countDocuments(tenantFilter);
    return NextResponse.json({ count });
  }

  const docs = await db
    .collection("failed_scans")
    .find(tenantFilter)
    .sort({ createdAt: -1 })
    .limit(LIST_LIMIT)
    .toArray();

  const items = docs.map((d) => ({
    id: d._id.toString(),
    image: typeof d.image === "string" ? d.image : null,
    name: d.extracted?.name ?? null,
    phone: d.extracted?.phone ?? null,
    address: d.extracted?.address ?? null,
    dob: d.extracted?.dob ?? null,
    orderIds: Array.isArray(d.extracted?.orderIds) ? d.extracted.orderIds : [],
    reasons: Array.isArray(d.reasons) ? d.reasons : [],
    createdAt: d.createdAt?.toISOString?.() ?? null,
  }));

  return NextResponse.json({ items, total: items.length });
}

// ── POST: persist a failed scan (image stored in the doc) ─────────────────────
export async function POST(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image : "";
  if (!image.startsWith("data:image/")) {
    return NextResponse.json({ error: "image must be an image data URL" }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const db = await getDb();
  await ensureIndexes(db);
  const now = new Date();

  const doc = {
    tenant_id: Number(ctx.tenantId),
    status: "pending" as const,
    image,
    extracted: {
      name: str(body.name),
      phone: str(body.phone),
      address: str(body.address),
      dob: str(body.dob),
      orderIds: Array.isArray(body.orderIds) ? body.orderIds.map((v) => String(v)) : [],
    },
    reasons: Array.isArray(body.reasons) ? body.reasons.map((v) => String(v)).slice(0, 5) : [],
    source: body.source === "single" ? "single" : "batch",
    created_by: {
      type: ctx.role === "member" ? "tenant_member" : "tenant_owner",
      clerk_user_id: ctx.userId,
      name:
        [ctx.user?.firstName, ctx.user?.lastName].filter(Boolean).join(" ") ||
        ctx.user?.emailAddresses?.[0]?.emailAddress ||
        "",
      tenant_role: ctx.role,
    },
    createdAt: now, // BSON Date — the TTL anchor (24h auto-delete)
  };

  try {
    const result = await db.collection("failed_scans").insertOne(doc);
    return NextResponse.json({ ok: true, id: result.insertedId.toString() });
  } catch (err) {
    console.error("[failed-scans POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// ── PATCH: mark failed scan(s) resolved / discarded (tenant-scoped) ───────────
// Single (`id`) or bulk (`ids: string[]`) — bulk powers "delete selected / all".
export async function PATCH(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string; ids?: string[]; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const status = body.status === "resolved" || body.status === "discarded" ? body.status : null;
  if (!status) return NextResponse.json({ error: "valid status required" }, { status: 400 });

  const rawIds = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  const objectIds: ObjectId[] = [];
  for (const v of rawIds) {
    try {
      objectIds.push(new ObjectId(String(v)));
    } catch {
      /* skip malformed ids */
    }
  }
  if (objectIds.length === 0) return NextResponse.json({ error: "id or ids required" }, { status: 400 });

  const db = await getDb();
  const res = await db.collection("failed_scans").updateMany(
    { _id: { $in: objectIds }, tenant_id: Number(ctx.tenantId) }, // tenant scope enforced in the match
    { $set: { status, resolvedAt: new Date() } },
  );
  return NextResponse.json({ ok: true, modified: res.modifiedCount });
}
