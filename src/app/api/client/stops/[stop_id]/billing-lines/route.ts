import { type NextRequest, NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* GET /api/client/stops/[stop_id]/billing-lines — Billing v4: every ATTEMPT
 * billed for this stop (2 trips = 2 lines), newest first, each carrying a
 * ready-made charge_label ("RTL-... — Attempt 2 — Failed: no one home") so
 * this surface reads identically to the invoice/PDF/Charges tab.
 *
 * Previously queried billing_ledger directly via the Supabase admin client,
 * selecting invoiced_at/invoice_id — columns renamed to documented_at/
 * document_id in the 2026-08 billing v3 migration. That rename shipped
 * without updating this route, so it had been a silent 500 ever since (a
 * select on nonexistent columns errors, not the "0 lines" it might read as
 * on the frontend). Fixed by routing through the SAME canonical
 * GET /v1/billing/charges routely-api endpoint every other billing surface
 * uses instead of a second, drift-prone direct query. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ stop_id: string }> }) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { stop_id } = await params;

  const qs = new URLSearchParams({ tenant_id: String(ctx.tenantId), stop_id, limit: "50" });
  let upstream: Response;
  try {
    upstream = await fetch(`${FASTAPI_BASE}/v1/billing/charges?${qs.toString()}`, {
      headers: { "X-API-Key": FASTAPI_SECRET },
    });
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(payload, { status: upstream.status });
  return NextResponse.json({ lines: payload.rows ?? [] });
}
