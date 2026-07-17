import { NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* ── GET /api/client/stops/[stop_id]/timeline ────────────────────────────────
 * History tab data (stop-timeline Phase 4). Thin proxy to FastAPI's
 * visibility-filtered timeline: the client portal is ALWAYS a tenant viewer
 * (tenant_id from the session, never from the request), so FastAPI returns
 * customer-visibility entries only — the internal/admin rows never reach
 * this app. Server-side filtering lives in FastAPI; this proxy just carries
 * the session's tenant scope across.
 * ─────────────────────────────────────────────────────────────────────────── */
export async function GET(_request: Request, { params }: { params: Promise<{ stop_id: string }> }) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { stop_id } = await params;
  if (!FASTAPI_SECRET) {
    return NextResponse.json({ error: "History unavailable" }, { status: 503 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/stops/${encodeURIComponent(stop_id)}/timeline?tenant_id=${Number(ctx.tenantId)}`,
      { headers: { "X-API-Key": FASTAPI_SECRET }, cache: "no-store" },
    );
  } catch {
    return NextResponse.json({ error: "History service unreachable" }, { status: 502 });
  }
  if (upstream.status === 404) {
    return NextResponse.json({ error: "Stop not found" }, { status: 404 });
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: "Couldn't load history" }, { status: 502 });
  }
  const data = await upstream.json();
  return NextResponse.json(data);
}
