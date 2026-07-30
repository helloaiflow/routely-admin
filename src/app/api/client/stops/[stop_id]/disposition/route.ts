import { NextResponse } from "next/server";

import { requirePagePermission, type TenantContext } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

function actorFor(ctx: TenantContext) {
  return {
    type: ctx.role === "member" ? "tenant_member" : "tenant_owner",
    clerk_user_id: ctx.userId,
    name:
      [ctx.user?.firstName, ctx.user?.lastName].filter(Boolean).join(" ") ||
      ctx.user?.emailAddresses?.[0]?.emailAddress ||
      "",
    tenant_role: ctx.role,
  };
}

/* POST /api/client/stops/[stop_id]/disposition — dispatcher sets/corrects the
 * structured WHY behind a terminal delivered|failed stop (2026-07-31 collapse).
 * 400 if the value doesn't apply to the stop's current status, 409 if the
 * stop isn't terminal yet — see GET .../paired for the analogous pattern. */
export async function POST(request: Request, { params }: { params: Promise<{ stop_id: string }> }) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { stop_id } = await params;
  const tenantId = Number(ctx.tenantId);
  const body = await request.json().catch(() => ({}));
  const disposition = typeof body?.disposition === "string" ? body.disposition : undefined;
  const note = typeof body?.note === "string" ? body.note : undefined;
  if (!disposition) return NextResponse.json({ error: "disposition is required" }, { status: 422 });

  const upstream = await fetch(
    `${FASTAPI_BASE}/v1/stops/${encodeURIComponent(stop_id)}/disposition?tenant_id=${tenantId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": FASTAPI_SECRET },
      body: JSON.stringify({ disposition, note, actor: actorFor(ctx) }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });
  return NextResponse.json(data);
}
