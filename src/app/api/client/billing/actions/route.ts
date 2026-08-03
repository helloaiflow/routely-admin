import { NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

const ACTION_TYPES = new Set(["credit", "debit_adjustment", "refund", "void", "manual_cycle_close"]);

/* POST /api/client/billing/actions — staff action (credit/adjustment/refund/
 * void/manual close). Threshold-based dual approval is enforced SERVER-SIDE
 * in routely-api (never trust a client-side "approved" flag); this proxy's
 * only job is to inject the real actor identity from the Clerk session —
 * `requested_by` is NEVER taken from the request body, so a staff member
 * can't attribute an action to someone else. */
export async function POST(req: Request) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const actionType = body?.action_type;
  if (!ACTION_TYPES.has(actionType)) {
    return NextResponse.json({ error: "Unknown action_type" }, { status: 400 });
  }
  if (!body?.reason || !String(body.reason).trim()) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${FASTAPI_BASE}/v1/billing/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": FASTAPI_SECRET },
      body: JSON.stringify({
        tenant_id: Number(ctx.tenantId),
        action_type: actionType,
        amount_cents: body.amount_cents ?? null,
        payload: body.payload ?? {},
        requested_by: ctx.user?.id ?? "unknown",
        reason: String(body.reason),
      }),
    });
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
