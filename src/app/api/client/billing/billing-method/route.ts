import { NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* POST /api/client/billing/billing-method — the editable Prepaid/Postpaid
 * control's write path. Deliberately NOT the same as PATCH /rates: that
 * route writes postpay_enabled/credit_limit straight to Supabase with no
 * audit trail and no approval gate. This proxies to routely-api's
 * POST /v1/billing/billing-method-change instead, which enforces the debt
 * rules (Postpaid->Prepaid blocked on existing debt unless overridden,
 * always-dual-approval on override; Prepaid->Postpaid hard-blocked on a
 * negative wallet, no override) and writes billing_adjustments regardless
 * of outcome. Same actor-injection pattern as /actions — requested_by is
 * NEVER taken from the request body, so a staff member can't attribute the
 * change to someone else. */
export async function POST(req: Request) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (typeof body?.postpay_enabled !== "boolean") {
    return NextResponse.json({ error: "postpay_enabled must be a boolean" }, { status: 400 });
  }
  if (body.credit_limit !== undefined && body.credit_limit !== null) {
    if (typeof body.credit_limit !== "number" || body.credit_limit < 0) {
      return NextResponse.json({ error: "credit_limit must be a number ≥ 0" }, { status: 400 });
    }
  }
  if (!body?.reason || !String(body.reason).trim()) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${FASTAPI_BASE}/v1/billing/billing-method-change`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": FASTAPI_SECRET },
      body: JSON.stringify({
        tenant_id: Number(ctx.tenantId),
        postpay_enabled: body.postpay_enabled,
        credit_limit: body.credit_limit ?? null,
        override_existing_debt: Boolean(body.override_existing_debt),
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
