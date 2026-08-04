import { NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* POST /api/client/billing/wallet/topup — admin-initiated, free amount.
 * requested_by is ALWAYS the session identity, never client-supplied. The
 * response here is just "charge attempt started" — the wallet is only
 * credited by the webhook's payment_intent.succeeded handler. */
export async function POST(req: Request) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const amountCents = Number(body?.amount_cents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "amount_cents must be a positive number" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${FASTAPI_BASE}/v1/billing/wallet/topup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": FASTAPI_SECRET },
      body: JSON.stringify({
        tenant_id: Number(ctx.tenantId),
        amount_cents: Math.round(amountCents),
        requested_by: ctx.user?.id ?? "unknown",
      }),
    });
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
