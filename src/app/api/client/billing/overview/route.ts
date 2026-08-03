import { NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* GET /api/client/billing/overview — thin proxy to routely-api's canonical
 * GET /v1/billing/overview (2026-08 billing v3). tenant_id is ALWAYS the
 * session-resolved one from requirePagePermission, never a client-supplied
 * value — this is the server-side tenant-isolation boundary. Same contract
 * routely-client will consume in Phase 2. */
export async function GET() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/billing/overview?tenant_id=${encodeURIComponent(String(ctx.tenantId))}`,
      { headers: { "X-API-Key": FASTAPI_SECRET } },
    );
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
