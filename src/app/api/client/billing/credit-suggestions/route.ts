import { type NextRequest, NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* GET — list pending (or any status) credit-limit suggestions for this
 * tenant. POST — compute a fresh one. The system SUGGESTS only; nothing here
 * ever writes tenants.credit_limit — see [id]/decide/route.ts for approval. */
export async function GET(req: NextRequest) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/billing/credit-suggestions?tenant_id=${encodeURIComponent(String(ctx.tenantId))}&status=${encodeURIComponent(status)}`,
      { headers: { "X-API-Key": FASTAPI_SECRET } },
    );
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}

export async function POST() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/billing/credit-suggestions/compute?tenant_id=${encodeURIComponent(String(ctx.tenantId))}`,
      { method: "POST", headers: { "X-API-Key": FASTAPI_SECRET } },
    );
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
