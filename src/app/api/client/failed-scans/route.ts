import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/* ── /api/client/failed-scans ─────────────────────────────────────────────────
 * Bulletproof SAME-DAY tray for labels that failed the 3-field OCR gate during a
 * (batch) scan. Persisted in Supabase `failed_scans` so they survive window
 * close, back, refresh, and device switch for the rest of the day. PHI: the
 * label image lives IN the row (temporary, same-day); this route is
 * auth-protected and tenant-scoped — never a public/guessable route.
 * ─────────────────────────────────────────────────────────────────────────── */

const MAX_IMAGE_CHARS = 12 * 1024 * 1024; // ~12MB data URL ceiling
const LIST_LIMIT = 100;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

// ── GET: pending failed scans for the tenant (the source-of-truth tray) ───────
// `?count=1` returns only the pending count (cheap — no images) for the badge.
export async function GET(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();

  // Admin cross-tenant: "all" scope drops the per-tenant filter.
  const scopeAll = ctx.isAdmin && ctx.tenantScope === "all";
  const tenantId = Number(ctx.tenantId);

  if (new URL(request.url).searchParams.get("count") === "1") {
    let cq = supabase.from("failed_scans").select("*", { count: "exact", head: true }).eq("status", "pending");
    if (!scopeAll) cq = cq.eq("tenant_id", tenantId);
    const { count, error } = await cq;
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ count: count ?? 0 });
  }

  let lq = supabase.from("failed_scans").select("id, doc, created_at").eq("status", "pending");
  if (!scopeAll) lq = lq.eq("tenant_id", tenantId);
  const { data, error } = await lq.order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });

  const items = (data ?? []).map((row) => {
    // biome-ignore lint/suspicious/noExplicitAny: original flat Mongo document shape
    const d = (row.doc ?? {}) as any;
    return {
      id: String(row.id),
      image: typeof d.image === "string" ? d.image : null,
      name: d.extracted?.name ?? null,
      phone: d.extracted?.phone ?? null,
      address: d.extracted?.address ?? null,
      dob: d.extracted?.dob ?? null,
      orderIds: Array.isArray(d.extracted?.orderIds) ? d.extracted.orderIds : [],
      reasons: Array.isArray(d.reasons) ? d.reasons : [],
      createdAt: d.createdAt ?? row.created_at ?? null,
    };
  });

  return NextResponse.json({ items, total: items.length });
}

// ── POST: persist a failed scan (image stored in the row) ─────────────────────
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

  const nowIso = new Date().toISOString();
  const tenantId = Number(ctx.tenantId);

  const doc = {
    tenant_id: tenantId,
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
    createdAt: nowIso,
  };

  const { data, error } = await getSupabaseAdmin()
    .from("failed_scans")
    .insert({
      tenant_id: tenantId,
      status: "pending",
      rtscan_id: null,
      created_at: nowIso,
      updated_at: nowIso,
      doc,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[failed-scans POST]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: String(data?.id) });
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

  const rawIds = (Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : []).map((v) => String(v)).filter(Boolean);
  if (rawIds.length === 0) return NextResponse.json({ error: "id or ids required" }, { status: 400 });

  const { data, error } = await getSupabaseAdmin()
    .from("failed_scans")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("tenant_id", Number(ctx.tenantId)) // tenant scope enforced in the match
    .in("id", rawIds)
    .select("id");
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true, modified: (data ?? []).length });
}
