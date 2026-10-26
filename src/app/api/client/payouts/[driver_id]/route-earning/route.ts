import { type NextRequest, NextResponse } from "next/server";

import { payoutsActor, payoutsFetch } from "@/lib/payouts-api";
import { getTenantContext } from "@/lib/tenant";

/* POST /api/client/payouts/[driver_id]/route-earning — "Add route earning"
 * (B5). Proxies to FastAPI POST /v1/drivers/{id}/payouts/route-earning, which
 * writes a job_completed ledger row, staff-actor gated. Real route-completion
 * events are R26b (Spoke webhook) — see TASKS.md; this button is the interim
 * path while that doesn't exist yet. Admin-only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ driver_id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { driver_id } = await params;
  let body: { route_ref?: unknown; amount_cents?: unknown; note?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { detail: { code: "invalid_body", message: "Request body must be JSON" } },
      { status: 400 },
    );
  }
  const routeRef = typeof body.route_ref === "string" ? body.route_ref.trim() : "";
  const amountCents = typeof body.amount_cents === "number" ? Math.trunc(body.amount_cents) : Number.NaN;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;
  if (!routeRef)
    return NextResponse.json(
      { detail: { code: "route_ref_required", message: "Route reference is required" } },
      { status: 422 },
    );
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json(
      { detail: { code: "amount_required", message: "Amount must be a positive number of cents" } },
      { status: 422 },
    );
  }

  const idempotencyKey = `admin-route-earning-${driver_id}-${routeRef}-${Date.now()}`;
  const { status, data } = await payoutsFetch(`/v1/drivers/${encodeURIComponent(driver_id)}/payouts/route-earning`, {
    method: "POST",
    actor: payoutsActor(ctx),
    body: { route_ref: routeRef, amount_cents: amountCents, note, idempotency_key: idempotencyKey },
  });
  return NextResponse.json(data, { status });
}
