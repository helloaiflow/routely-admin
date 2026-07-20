import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

export async function GET() {
  // Member-system Phase 4: reports page permission. Owners pass for free;
  // tenant resolves from the session's tenant_id so members (whose
  // clerk_user_id is not on the tenant doc) get their tenant's stats.
  const ctx = await requirePagePermission("reports");
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const supabase = getSupabaseAdmin();

    const { data: tenant } = await supabase
      .from("tenants")
      .select("*")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const tdoc = (tenant.doc ?? {}) as Record<string, unknown>;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const todayIso = today.toISOString();
    const monthStartIso = monthStart.toISOString();

    const countQuery = () =>
      supabase.from("stops").select("*", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId);

    const [todayTotal, inTransit, deliveredToday, monthTotal, recentStops] = await Promise.all([
      countQuery().gte("created_at", todayIso),
      countQuery().in("status", ["in_transit", "picked_up", "pending"]),
      countQuery().eq("status", "delivered").gte("created_at", todayIso),
      countQuery().gte("created_at", monthStartIso),
      supabase
        .from("stops")
        .select("doc, stop_id, status, created_at")
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    return NextResponse.json({
      todayTotal: todayTotal.count ?? 0,
      inTransit: inTransit.count ?? 0,
      deliveredToday: deliveredToday.count ?? 0,
      monthTotal: monthTotal.count ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recentStops: (recentStops.data ?? []).map((r: any) => {
        const s = (r.doc ?? {}) as Record<string, unknown>;
        return {
          id: String(r.stop_id ?? s.stop_id ?? s._id ?? ""),
          rtstop_id: s.rtstop_id,
          recipient: s.recipient_name || s.name || "Unknown",
          address: s.address || "",
          status: r.status || s.status || "pending",
          created_at: r.created_at ?? s.created_at,
        };
      }),
      tenant: {
        company_name: tenant.company_name ?? tdoc.company_name,
        plan: tenant.plan_type ?? tdoc.plan_type ?? tdoc.plan,
        trial_ends_at: tdoc.trial_ends_at,
      },
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
