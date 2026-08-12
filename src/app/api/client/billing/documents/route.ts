import { type NextRequest, NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* GET /api/client/billing/documents — the Invoices tab's list: receipts,
 * statements, and invoices (the 4 document families the mission's Part C
 * describes: label receipts + balance top-up receipts are both doc_type
 * 'receipt', service statements are prepaid, service invoices are postpaid —
 * distinguished by doc_type + snapshot contents, not separate tables). */
export async function GET(req: NextRequest) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const params = new URLSearchParams({ tenant_id: String(ctx.tenantId) });
  for (const key of [
    "doc_type",
    "status",
    "limit",
    "offset",
    "search",
    "date_from",
    "date_to",
    "amount_min",
    "amount_max",
  ]) {
    const v = sp.get(key);
    if (v) params.set(key, v);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${FASTAPI_BASE}/v1/billing/documents?${params.toString()}`, {
      headers: { "X-API-Key": FASTAPI_SECRET },
    });
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
