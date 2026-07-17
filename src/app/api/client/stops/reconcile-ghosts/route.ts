import { NextResponse } from "next/server";

import { repostStopToSpoke } from "@/lib/create-order";
import { getDb, requirePagePermission } from "@/lib/tenant";

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

function ghostQuery(tenantId: number): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    status: { $in: IN_SPOKE_STATUSES },
    // No verified Spoke id under the canonical path (null OR missing).
    "assignment.spoke_stop_id": { $in: [null, ""] },
  };
}

export async function GET() {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const tenantId = Number(ctx.tenantId);
  const docs = await db
    .collection("stops")
    .find(ghostQuery(tenantId), { projection: { stop_id: 1, status: 1, created_at: 1, "recipient.name": 1 } })
    .sort({ created_at: -1 })
    .limit(200)
    .toArray();

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

  const db = await getDb();
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

  const query = ghostQuery(tenantId);
  if (onlyStopId) query.stop_id = onlyStopId;

  const docs = await db.collection("stops").find(query).limit(200).toArray();

  let healed = 0;
  let failed = 0;
  const results: Array<{ stop_id: string; outcome: string; spoke_stop_id?: string }> = [];

  // Sequential — these are recovery posts to Spoke; keep it gentle on the API.
  for (const doc of docs) {
    const r = await repostStopToSpoke(db, doc as Record<string, unknown>);
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
