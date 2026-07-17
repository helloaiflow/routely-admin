import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/**
 * GET /api/client/tracking-pool/available?count=N
 *
 * READ-ONLY. Returns the next N `available` tracking IDs from the pool (oldest
 * first) plus the tenant's company name, so the client can render a printable
 * label sheet. This route NEVER writes — printing and pool-consumption are
 * intentionally decoupled (Phase 1). The pool's status field is owned by the
 * intake writer; here we only ever READ status:"available".
 */
export async function GET(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = Number(ctx.tenantId);
  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get("count") ?? "50");
  // Clamp to a sane range; the UI offers 25/50/75/100/125.
  const count = Math.max(1, Math.min(Number.isFinite(requested) ? requested : 50, 200));

  const supabase = getSupabaseAdmin();

  // Tenant company name — printed_by label text on each sticker.
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("company_name")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const tenantName = String(tenantRow?.company_name ?? "").trim() || "ROUTELY";

  // Next N available IDs, oldest first (FIFO consumption of the pool).
  const { data: poolRows, error } = await supabase
    .from("tracking_pool")
    .select("tracking_id")
    .eq("status", "available")
    .order("created_at", { ascending: true })
    .limit(count);

  if (error) {
    console.error("[tracking-pool/available] supabase error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const trackingIds = (poolRows ?? []).map((d) => String(d.tracking_id)).filter(Boolean);

  // Total still available (for the "only X left" UX hint).
  const { count: availableTotal } = await supabase
    .from("tracking_pool")
    .select("*", { count: "exact", head: true })
    .eq("status", "available");

  return NextResponse.json({
    ok: true,
    tenant_name: tenantName,
    tracking_ids: trackingIds,
    requested: count,
    returned: trackingIds.length,
    available_total: availableTotal ?? 0,
  });
}
