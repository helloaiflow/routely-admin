import { NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* GET /api/client/billing/documents/[id] — document detail: full breakdown,
 * ledger lines it covers, adjustment history. tenant_id is always the
 * session-resolved one, so a document belonging to a DIFFERENT tenant 404s
 * here even if the id is guessed. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/billing/documents/${encodeURIComponent(id)}?tenant_id=${encodeURIComponent(String(ctx.tenantId))}`,
      { headers: { "X-API-Key": FASTAPI_SECRET } },
    );
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
