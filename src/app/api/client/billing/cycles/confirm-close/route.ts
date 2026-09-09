import { NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* POST /api/client/billing/cycles/confirm-close — thin proxy to routely-api's
 * POST /v1/billing/cycles/{tenant_id}/confirm-close (2026-09-09 go-live
 * alerting). tenant_id is ALWAYS the session-resolved one from
 * requirePagePermission, never client-supplied — same tenant-isolation
 * boundary as every other /api/client/billing/* route in this file. */
export async function POST() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const approvedBy = ctx.user?.primaryEmailAddress?.emailAddress ?? ctx.userId;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/billing/cycles/${encodeURIComponent(String(ctx.tenantId))}/confirm-close`,
      {
        method: "POST",
        headers: { "X-API-Key": FASTAPI_SECRET, "Content-Type": "application/json" },
        body: JSON.stringify({ approved_by: approvedBy }),
      },
    );
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
