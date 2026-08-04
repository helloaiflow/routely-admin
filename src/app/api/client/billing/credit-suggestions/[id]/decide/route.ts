import { NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* POST — approve or reject a credit-limit suggestion. decided_by is ALWAYS
 * the session identity. Approval is the ONLY code path that ever writes
 * tenants.credit_limit for a suggestion — never automatic. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  let upstream: Response;
  try {
    upstream = await fetch(`${FASTAPI_BASE}/v1/billing/credit-suggestions/${encodeURIComponent(id)}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": FASTAPI_SECRET },
      body: JSON.stringify({ approve: Boolean(body?.approve), decided_by: ctx.user?.id ?? "unknown" }),
    });
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
