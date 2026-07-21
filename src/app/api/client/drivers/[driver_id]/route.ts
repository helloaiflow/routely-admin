import { NextResponse, type NextRequest } from "next/server";

import { getTenantContext } from "@/lib/tenant";

/* PATCH /api/client/drivers/[driver_id] — edit a driver, or deactivate it.
 * Body { action: "deactivate" } → FastAPI POST /v1/drivers/{id}/deactivate.
 * Any other body → FastAPI PATCH /v1/drivers/{id} (edits, incl. status:"active"
 * to reactivate). Proxy so driver.updated / driver.deactivated events fire.
 * Admin-only (ops fleet, tenant 1). */

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";
const ROUTELY_OPS_TENANT_ID = 1;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ driver_id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Fleet service unavailable" }, { status: 503 });

  const { driver_id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const qs = `?tenant_id=${ROUTELY_OPS_TENANT_ID}`;
  const isDeactivate = body.action === "deactivate";
  const url = isDeactivate
    ? `${FASTAPI_BASE}/v1/drivers/${encodeURIComponent(driver_id)}/deactivate${qs}`
    : `${FASTAPI_BASE}/v1/drivers/${encodeURIComponent(driver_id)}${qs}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: isDeactivate ? "POST" : "PATCH",
      headers: { "X-API-Key": FASTAPI_SECRET, "Content-Type": "application/json" },
      body: isDeactivate ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Fleet service unreachable" }, { status: 502 });
  }
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
