import { NextResponse, type NextRequest } from "next/server";

import { getTenantContext } from "@/lib/tenant";

/* PATCH /api/client/hubs/[hub_id] — update a hub. Proxy to FastAPI so the
 * hub.updated event fires. Admin-only (ops fleet, tenant 1). */

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";
const ROUTELY_OPS_TENANT_ID = 1;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ hub_id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Fleet service unavailable" }, { status: 503 });

  const { hub_id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/hubs/${encodeURIComponent(hub_id)}?tenant_id=${ROUTELY_OPS_TENANT_ID}`,
      {
        method: "PATCH",
        headers: { "X-API-Key": FASTAPI_SECRET, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json({ error: "Fleet service unreachable" }, { status: 502 });
  }
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
