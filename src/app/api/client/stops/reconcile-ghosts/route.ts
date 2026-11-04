import { NextResponse } from "next/server";

import { repostStopToSpoke } from "@/lib/create-order";
import { SPOKE_DISABLED_MESSAGE, spokeDispatchEnabled } from "@/lib/spoke-dispatch";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/* ── /api/client/stops/reconcile-ghosts ──────────────────────────────────────
 * A "ghost" stop is shown as Submitted/in-Spoke in the UI but was never actually
 * accepted by Spoke: status ∈ the in-Spoke set AND no assignment.spoke_stop_id.
 * It exists because the stops doc is written (status:"unassigned") BEFORE the
 * Spoke POST, and a failed/timed-out POST left it half-done. A ghost = a package
 * no driver will ever pick up.
 *
 *   GET  → detect: list the tenant's ghost stop_ids + count (read-only).
 *   POST → recover: re-post each ghost to Spoke. Verified success → it becomes a
 *          real unassigned stop with a spoke_stop_id; failure → submit_failed so
 *          it surfaces in the Q-RETRY path. Never leaves a ghost behind.
 * Tenant-scoped via the session; never touches another tenant's stops.
 * ─────────────────────────────────────────────────────────────────────────── */

// Statuses the UI treats as "exists in Spoke / Submitted" (mirror of the stops
// list `unassigned` filter). A doc in any of these WITHOUT a spoke id is a ghost.
const IN_SPOKE_STATUSES = ["unassigned", "pending", "approved", "paid", "created"];

/** Ghosts on public.stops: an in-Spoke status and no verified Spoke id under the canonical path (null or missing). */
async function ghostDocs(tenantId: number, stopId: string | null): Promise<Record<string, unknown>[]> {
  let q = getSupabaseAdmin()
    .from("stops")
    .select("doc")
    .eq("tenant_id", tenantId)
    .in("status", IN_SPOKE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(200);
  if (stopId) q = q.eq("stop_id", stopId);
  const { data } = await q;
  return (data ?? [])
    .map((row) => row.doc as Record<string, unknown>)
    .filter((d) => !(d.assignment as Record<string, unknown> | undefined)?.spoke_stop_id);
}

export async function GET() {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Spoke off: every Routely stop is "unassigned" without a Spoke id by design — not a ghost.
  if (!spokeDispatchEnabled()) {
    return NextResponse.json({ count: 0, ghosts: [], spoke_dispatch_enabled: false, message: SPOKE_DISABLED_MESSAGE });
  }

  const tenantId = Number(ctx.tenantId);
  const docs = await ghostDocs(tenantId, null);

  return NextResponse.json({
    count: docs.length,
    ghosts: docs.map((d) => ({
      stop_id: d.stop_id,
      status: d.status,
      recipient: (d.recipient as Record<string, unknown> | undefined)?.name ?? null,
      created_at: d.created_at ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!spokeDispatchEnabled()) {
    return NextResponse.json(
      { ok: false, error: SPOKE_DISABLED_MESSAGE, dispatch_status: "spoke_disabled" },
      { status: 409 },
    );
  }

  const tenantId = Number(ctx.tenantId);

  // Optional: target a single stop_id (e.g. the one stuck today); otherwise heal
  // every ghost for the tenant.
  let onlyStopId: string | null = null;
  try {
    const b = (await request.json().catch(() => ({}))) as { stop_id?: string };
    onlyStopId = b.stop_id ? String(b.stop_id) : null;
  } catch {
    /* no body — heal all */
  }

  const docs = await ghostDocs(tenantId, onlyStopId);

  let healed = 0;
  let failed = 0;
  const results: Array<{ stop_id: string; outcome: string; spoke_stop_id?: string }> = [];

  // Sequential — these are recovery posts to Spoke; keep it gentle on the API.
  for (const doc of docs) {
    const r = await repostStopToSpoke(doc);
    if (r.status === "dispatched" || r.status === "already") {
      healed++;
      results.push({ stop_id: String(doc.stop_id), outcome: r.status, spoke_stop_id: r.spoke_stop_id });
    } else {
      failed++;
      results.push({ stop_id: String(doc.stop_id), outcome: "submit_failed" });
    }
  }

  return NextResponse.json({ scanned: docs.length, healed, failed, results });
}
