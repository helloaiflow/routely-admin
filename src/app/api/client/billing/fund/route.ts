import { NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* GET /api/client/billing/fund — balance & credit engine (billing v4): the
 * SAME available-fund computation the reservation check itself uses, so
 * what staff sees on Overview is exactly what gates new stop creation. */
export async function GET() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let upstream: Response;
  try {
    upstream = await fetch(`${FASTAPI_BASE}/v1/billing/fund?tenant_id=${encodeURIComponent(String(ctx.tenantId))}`, {
      headers: { "X-API-Key": FASTAPI_SECRET },
    });
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
