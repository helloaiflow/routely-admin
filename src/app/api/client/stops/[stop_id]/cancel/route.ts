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

/* POST /api/client/stops/[stop_id]/cancel — dispatcher approves a pending
 * cancel_requested (or cancels directly, no prior request needed). Bills
 * canceled_in_route only if the stop had already been dispatched. */
export async function POST(request: Request, { params }: { params: Promise<{ stop_id: string }> }) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { stop_id } = await params;
  const tenantId = Number(ctx.tenantId);
  const body = await request.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note : undefined;
  const paired_pickup_action = typeof body?.paired_pickup_action === "string" ? body.paired_pickup_action : undefined;

  const upstream = await fetch(`${FASTAPI_BASE}/v1/stops/${encodeURIComponent(stop_id)}/cancel?tenant_id=${tenantId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": FASTAPI_SECRET },
    body: JSON.stringify({ actor: actorFor(ctx), note, paired_pickup_action }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });
  return NextResponse.json(data);
}
