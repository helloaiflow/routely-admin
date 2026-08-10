import { NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* GET /api/client/billing/wallet-debit-failures — detail list backing the
 * Overview tab's debit-failure banner (billing v4 Part A fix): a prepaid
 * charge whose wallet debit raised, surfaced here instead of buried in logs. */
export async function GET() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/billing/wallet-debit-failures?tenant_id=${encodeURIComponent(String(ctx.tenantId))}`,
      { headers: { "X-API-Key": FASTAPI_SECRET } },
    );
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
