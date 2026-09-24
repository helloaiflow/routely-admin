import { type NextRequest, NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant";

/* PATCH /api/admin/providers/[key] — toggle a provider's status (active /
 * inactive). Proxy to FastAPI so deactivation immediately invalidates every
 * tenant token issued for it. M1 — Integraciones. Admin-only. */

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Integrations service unavailable" }, { status: 503 });

  const { key } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${FASTAPI_BASE}/v1/integrations-admin/providers/${encodeURIComponent(key)}`, {
      method: "PATCH",
      headers: { "X-API-Key": FASTAPI_SECRET, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Integrations service unreachable" }, { status: 502 });
  }
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
