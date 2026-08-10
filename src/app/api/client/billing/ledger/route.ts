import { type NextRequest, NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* GET /api/client/billing/ledger — server-paginated Charges grid, thin proxy
 * to routely-api's GET /v1/billing/charges (2026-08 billing v3). Distinct
 * from the legacy /api/client/billing/charges (label-spend + tenant-counter
 * view backing the old Settings invoices tab) — this one is billing_ledger
 * itself, the canonical per-attempt charge record. */
export async function GET(req: NextRequest) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const params = new URLSearchParams({ tenant_id: String(ctx.tenantId) });
  for (const key of ["limit", "offset", "resolved_type", "status", "date_from", "date_to", "search", "stop_id"]) {
    const v = sp.get(key);
    if (v) params.set(key, v);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${FASTAPI_BASE}/v1/billing/charges?${params.toString()}`, {
      headers: { "X-API-Key": FASTAPI_SECRET },
    });
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
