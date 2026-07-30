import { NextResponse } from "next/server";

import { requirePagePermission, type TenantContext } from "@/lib/tenant";

// FastAPI (VPS) owns the ledger + Spoke-adjacent status writes. The secret
// stays server-side only — mirrors src/app/api/client/stops/[stop_id]/route.ts.
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

/* POST /api/client/stops/[stop_id]/return — manual "Return to hub".
 * Billable (outcome=returned) — see mission report for why this differs
 * from the automatic 3-failed-attempts return, which does not re-bill. */
export async function POST(request: Request, { params }: { params: Promise<{ stop_id: string }> }) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { stop_id } = await params;
  const tenantId = Number(ctx.tenantId);
  const body = await request.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note : undefined;

  const upstream = await fetch(
    `${FASTAPI_BASE}/v1/stops/${encodeURIComponent(stop_id)}/return?tenant_id=${tenantId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": FASTAPI_SECRET },
      body: JSON.stringify({ actor: actorFor(ctx), note }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });
  return NextResponse.json(data);
}
