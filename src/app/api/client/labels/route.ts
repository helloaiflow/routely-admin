import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/** Tenant-scoped label order history (newest first). */
export async function GET() {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();
    // Admin cross-tenant: "all" scope drops the per-tenant filter.
    const scopeAll = ctx.isAdmin && ctx.tenantScope === "all";
    let q = supabase.from("label_orders").select("doc");
    if (!scopeAll) q = q.eq("tenant_id", Number(ctx.tenantId ?? 1));
    const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const orders = (data ?? []).map((r) => r.doc);
    return NextResponse.json({ orders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Query error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
