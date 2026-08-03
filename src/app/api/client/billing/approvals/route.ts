import { type NextRequest, NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* GET /api/client/billing/approvals — the pending-approval queue (staff
 * actions above the dual-approval threshold, or always-dual actions: refund/
 * void/manual_cycle_close). Scoped to the current tenant only. */
export async function GET(req: NextRequest) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/billing/approvals?tenant_id=${encodeURIComponent(String(ctx.tenantId))}&status=${encodeURIComponent(status)}`,
      { headers: { "X-API-Key": FASTAPI_SECRET } },
    );
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
