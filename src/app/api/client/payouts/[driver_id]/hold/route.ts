import { type NextRequest, NextResponse } from "next/server";

import { payoutsActor, payoutsFetch } from "@/lib/payouts-api";
import { getTenantContext } from "@/lib/tenant";

/* POST /api/client/payouts/[driver_id]/hold — pauses (or releases) the
 * driver's Monday automatic sweep without touching their balance (B4/B7).
 * Proxies to FastAPI POST /v1/drivers/{id}/payouts/hold. Reason required
 * only when turning the hold ON (both here and backend-enforced). Admin-only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ driver_id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { driver_id } = await params;
  let body: { held?: unknown; reason?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { detail: { code: "invalid_body", message: "Request body must be JSON" } },
      { status: 400 },
    );
  }
  const held = body.held === true;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (held && !reason) {
    return NextResponse.json(
      { detail: { code: "reason_required", message: "A reason is required to place a hold" } },
      { status: 422 },
    );
  }

  const { status, data } = await payoutsFetch(`/v1/drivers/${encodeURIComponent(driver_id)}/payouts/hold`, {
    method: "POST",
    actor: payoutsActor(ctx),
    body: { held, reason: reason || null },
  });
  return NextResponse.json(data, { status });
}
