import { type NextRequest, NextResponse } from "next/server";

import { payoutsActor, payoutsFetch } from "@/lib/payouts-api";
import { getTenantContext } from "@/lib/tenant";

/* POST /api/client/payouts/[driver_id]/adjustment — admin hold/adjustment
 * (B7). Proxies to FastAPI POST /v1/drivers/{id}/payouts/adjustment. Reason
 * is required here AND re-enforced by the backend's own DB CHECK constraint
 * (kind='adjustment' requires a non-empty reason and a staff: actor) — there
 * is deliberately no way from this page to fake a job_completed earning.
 * Admin-only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ driver_id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { driver_id } = await params;
  let body: { amount_cents?: unknown; reason?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { detail: { code: "invalid_body", message: "Request body must be JSON" } },
      { status: 400 },
    );
  }
  const amountCents = typeof body.amount_cents === "number" ? Math.trunc(body.amount_cents) : Number.NaN;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!Number.isFinite(amountCents) || amountCents === 0) {
    return NextResponse.json(
      { detail: { code: "amount_required", message: "Amount must be a non-zero number of cents" } },
      { status: 422 },
    );
  }
  if (!reason)
    return NextResponse.json({ detail: { code: "reason_required", message: "A reason is required" } }, { status: 422 });

  const idempotencyKey = `admin-adjustment-${driver_id}-${Date.now()}`;
  const { status, data } = await payoutsFetch(`/v1/drivers/${encodeURIComponent(driver_id)}/payouts/adjustment`, {
    method: "POST",
    actor: payoutsActor(ctx),
    body: { amount_cents: amountCents, reason, idempotency_key: idempotencyKey },
  });
  return NextResponse.json(data, { status });
}
