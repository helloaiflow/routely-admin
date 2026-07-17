/**
 * /api/data/package-scans
 *
 * Internal API used by the IVY n8n workflow (no auth — internal only).
 * MIGRATED: now writes/reads Supabase `public.ivy_scans` (was Mongo
 * `package_scans`). Same URL + response contract so the n8n workflow is
 * UNCHANGED. The old Mongo collection is left intact as a backup and is copied
 * over by POST /api/data/package-scans/migrate.
 *
 * Lifecycle per scan (unchanged):
 *   PROCESSING → SPOKE_OK → SUCCESS   (or ERROR at any node)
 *
 * POST   → initial insert (insert-only by rtscan_id; won't clobber on retries)
 * PATCH  → update lifecycle fields by rtscan_id (merges into doc jsonb)
 * GET    → basic query for internal use
 */

import { type NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";

const TABLE = "ivy_scans";

const iso = (v: unknown) => {
  if (!v) return undefined;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

/** Promote the queryable columns from a raw IVY body (rest stays in `doc`). */
function promoted(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    tenant_id: Number(body.tenant_id ?? body.client_id ?? 1),
    status: body.status,
    stage: body.stage,
    error_stage: body.error_stage,
    error_message: body.error_message ?? body.error,
    full_name: body.full_name,
    phone: body.phone,
    full_address: body.full_address,
    address: body.address,
    city: body.city,
    state: body.state,
    zipcode: body.zipcode,
    image_url: body.image_url,
    stop_id: body.stop_id,
    spoke_delivery_id: body.spoke_delivery_id,
    spoke_pickup_id: body.spoke_pickup_id,
    route: body.route,
    rx_pharma_id: body.rx_pharma_id,
    source: body.source ?? "ivy",
    started_at: iso(body.started_at),
    completed_at: iso(body.completed_at),
    processing_time_ms: body.processing_time_ms != null ? Number(body.processing_time_ms) : undefined,
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

// ── POST — initial insert from IVY (insert-only, mirrors Mongo $setOnInsert) ──
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (!body.rtscan_id) {
      return NextResponse.json({ ok: false, error: "rtscan_id is required" }, { status: 400 });
    }
    const rtscan_id = Number(body.rtscan_id);
    const row = {
      rtscan_id,
      ...promoted(body),
      status: (body.status as string) ?? "PROCESSING",
      stage: (body.stage as string) ?? "SANITIZED",
      started_at: iso(body.started_at) ?? new Date().toISOString(),
      doc: body,
    };
    // insert-only: on conflict do nothing (don't overwrite an in-flight/complete row)
    const { error } = await getSupabaseAdmin().from(TABLE).upsert(row, {
      onConflict: "rtscan_id",
      ignoreDuplicates: true,
    });
    if (error) {
      console.error("[package-scans POST]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, rtscan_id });
  } catch (err) {
    console.error("[package-scans POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// ── PATCH — update lifecycle fields by rtscan_id (merges into doc) ────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { rtscan_id, ...updates } = body;
    if (!rtscan_id) {
      return NextResponse.json({ ok: false, error: "rtscan_id is required" }, { status: 400 });
    }
    const id = Number(rtscan_id);
    const supabase = getSupabaseAdmin();

    // Merge the patch into the existing doc jsonb (best-effort read-modify-write).
    const { data: cur } = await supabase.from(TABLE).select("doc").eq("rtscan_id", id).maybeSingle();
    const mergedDoc = { ...((cur?.doc as Record<string, unknown>) ?? {}), ...updates };

    const set: Record<string, unknown> = {
      ...promoted(updates as Record<string, unknown>),
      doc: mergedDoc,
      updated_at: new Date().toISOString(),
    };

    const { error, count } = await supabase.from(TABLE).update(set, { count: "exact" }).eq("rtscan_id", id);
    if (error) {
      console.error("[package-scans PATCH]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Upsert semantics: if no row matched (e.g. a node crashed BEFORE the scan was
    // ever logged — the IVY error handler marks it ERROR), insert a fresh row so
    // the failure is still visible in the monitor. Never overwrites started_at on
    // updates above.
    if ((count ?? 0) === 0) {
      const insertRow = {
        rtscan_id: id,
        ...promoted(updates as Record<string, unknown>),
        doc: mergedDoc,
        started_at: iso((updates as Record<string, unknown>).started_at) ?? new Date().toISOString(),
      };
      const { error: insErr } = await supabase.from(TABLE).insert(insertRow);
      // 23505 = unique_violation → a concurrent insert won; treat as success.
      if (insErr && insErr.code !== "23505") {
        console.error("[package-scans PATCH insert]", insErr);
        return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, rtscan_id: id, created: true });
    }

    return NextResponse.json({ ok: true, rtscan_id: id, matched: count ?? 0, modified: count ?? 0 });
  } catch (err) {
    console.error("[package-scans PATCH]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// ── GET — basic query for internal use ───────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = Number(searchParams.get("tenant_id") ?? "1");
    const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
    const status = searchParams.get("status") ?? "";
    const rtscan_id = searchParams.get("rtscan_id");

    let q = getSupabaseAdmin()
      .from(TABLE)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status.toUpperCase());
    if (rtscan_id) q = q.eq("rtscan_id", Number(rtscan_id));

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, count: (data ?? []).length, list: data ?? [] });
  } catch (err) {
    console.error("[package-scans GET]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
