import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant";

/* ── /api/admin/providers ─────────────────────────────────────────────────────
 * M1 — Integraciones. Global catalog of integration providers (e.g. "generic",
 * "liberty") that tenants pick from when generating an API token in their own
 * dashboard. Read-only proxy to FastAPI's admin-only integrations router — no
 * tenant_id (this is the global catalog, not per-tenant data). Admin-only.
 * ─────────────────────────────────────────────────────────────────────────── */

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

// ── GET — full provider catalog (all statuses) ────────────────────────────────
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Integrations service unavailable" }, { status: 503 });

  let upstream: Response;
  try {
    upstream = await fetch(`${FASTAPI_BASE}/v1/integrations-admin/providers`, {
      headers: { "X-API-Key": FASTAPI_SECRET },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Integrations service unreachable" }, { status: 502 });
  }
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
