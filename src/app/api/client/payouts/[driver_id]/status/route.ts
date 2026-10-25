import { NextResponse } from "next/server";

import { payoutsFetch } from "@/lib/payouts-api";
import { getTenantContext } from "@/lib/tenant";

/* GET /api/client/payouts/[driver_id]/status — proxies to FastAPI
 * GET /v1/drivers/{id}/payouts/status (R26a Part B, A09). Admin-only. */
export async function GET(_req: Request, { params }: { params: Promise<{ driver_id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { driver_id } = await params;
  const { status, data } = await payoutsFetch(`/v1/drivers/${encodeURIComponent(driver_id)}/payouts/status`, {
    method: "GET",
    actor: "",
  });
  return NextResponse.json(data, { status });
}
