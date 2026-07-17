import { NextResponse } from "next/server";

import { repostStopToSpoke } from "@/lib/create-order";
import { getDb, requirePagePermission, type TenantContext } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* ── POST /api/client/stops/[stop_id]/retry ──────────────────────────────────
 * Resubmit a submit_failed stop to dispatch (Q-RETRY). Thin proxy: tenant_id
 * from the session, human actor forwarded so the timeline records who clicked
 * retry. FastAPI re-posts via the same logic as create and keeps the
 * Spoke-accept honesty (repeat failure stays submit_failed).
 * ─────────────────────────────────────────────────────────────────────────── */

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

export async function POST(_request: Request, { params }: { params: Promise<{ stop_id: string }> }) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { stop_id } = await params;
  if (!FASTAPI_SECRET) {
    return NextResponse.json({ error: "Retry unavailable" }, { status: 503 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${FASTAPI_BASE}/v1/stops/${encodeURIComponent(stop_id)}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": FASTAPI_SECRET },
      body: JSON.stringify({ tenant_id: Number(ctx.tenantId), actor: actorFor(ctx) }),
    });
  } catch {
    return NextResponse.json({ error: "Dispatch service unreachable" }, { status: 502 });
  }

  const payload = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
  if (upstream.status === 404) return NextResponse.json({ error: "Stop not found" }, { status: 404 });
  if (upstream.status === 409) {
    return NextResponse.json({ error: "Only failed submissions can be retried" }, { status: 409 });
  }
  if (!upstream.ok) return NextResponse.json({ error: "Retry failed" }, { status: 502 });

  // ── RECONCILE, don't rubber-stamp ──────────────────────────────────────────
  // FastAPI reports the retry as done, but the standing rule is "verify Spoke
  // accepted before trusting Mongo." Read the canonical spoke id; if it's still
  // missing (FastAPI's idempotency short-circuited, or its re-post failed), do a
  // real Spoke re-post ourselves via repostStopToSpoke. Only a verified
  // spoke_stop_id counts as submitted — otherwise the stop stays submit_failed.
  try {
    const db = await getDb();
    const tenantId = Number(ctx.tenantId);
    const doc = await db.collection("stops").findOne({ stop_id, tenant_id: tenantId });
    if (!doc) return NextResponse.json({ error: "Stop not found" }, { status: 404 });

    let spokeId = (doc.assignment as Record<string, unknown> | undefined)?.spoke_stop_id;
    if (!spokeId) {
      const reposted = await repostStopToSpoke(db, doc);
      if (reposted.status === "dispatched" || reposted.status === "already") {
        spokeId = reposted.spoke_stop_id;
      }
    }
    if (!spokeId) {
      return NextResponse.json(
        { ok: false, error: "Spoke did not accept the stop — still failed.", dispatch_status: "spoke_unconfirmed" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ...payload, ok: true, spoke_stop_id: String(spokeId) });
  } catch (err) {
    console.error("[stops/retry] reconcile failed:", err);
    // FastAPI already responded ok; fall back to its payload rather than block.
    return NextResponse.json(payload);
  }
}
