import { NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* GET /api/client/stops/[stop_id]/paired — the sibling pickup's state
 * (executed/dispatched), so the cancel/return dialog can decide what to
 * offer BEFORE the operator picks an action. See mission 2026-07-30. */
export async function GET(_request: Request, { params }: { params: Promise<{ stop_id: string }> }) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { stop_id } = await params;
  const tenantId = Number(ctx.tenantId);

  const upstream = await fetch(`${FASTAPI_BASE}/v1/stops/${encodeURIComponent(stop_id)}/paired?tenant_id=${tenantId}`, {
    headers: { "X-API-Key": FASTAPI_SECRET },
    signal: AbortSignal.timeout(10000),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });
  return NextResponse.json(data);
}
