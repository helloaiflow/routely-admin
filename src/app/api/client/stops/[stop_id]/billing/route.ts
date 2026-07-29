import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/* PATCH /api/client/stops/[stop_id]/billing — per-stop billing override.
 * Body: { billing_type?: "package"|"miles"|"on_demand"|"prepaid_label"|null,
 *         billed_miles?: number|null }
 * null clears back to auto (the delivery-time cascade resolves it). Only
 * affects stops not yet in the ledger — delivered lines are immutable. */

const TYPES = new Set(["package", "miles", "on_demand", "prepaid_label"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ stop_id: string }> }) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { stop_id } = await params;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("stops")
    .select("billing_type, billed_miles")
    .eq("stop_id", stop_id)
    .eq("tenant_id", Number(ctx.tenantId))
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Stop not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ stop_id: string }> }) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { stop_id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("billing_type" in body) {
    if (body.billing_type !== null && !TYPES.has(body.billing_type))
      return NextResponse.json({ error: "billing_type invalid" }, { status: 400 });
    patch.billing_type = body.billing_type;
  }
  if ("billed_miles" in body) {
    const m = body.billed_miles;
    if (m !== null && (typeof m !== "number" || m < 0 || m > 9999))
      return NextResponse.json({ error: "billed_miles must be 0-9999 or null" }, { status: 400 });
    patch.billed_miles = m === null ? null : Math.round(m * 10) / 10;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error, count } = await supabase
    .from("stops")
    .update({ ...patch, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("stop_id", stop_id)
    .eq("tenant_id", Number(ctx.tenantId));
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Stop not found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...patch });
}
