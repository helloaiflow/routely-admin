import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext } from "@/lib/tenant";

// Admin-only: the list of tenants that powers the header tenant selector.
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ tenants: [] }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ tenants: [] }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("tenants").select("tenant_id, doc");
  const tenants = (data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((t: any) => {
      const d = t.doc ?? {};
      return {
        tenant_id: t.tenant_id,
        name: d.company_name || d.business_name || d.name || `Tenant ${t.tenant_id}`,
      };
    })
    .filter((t) => t.tenant_id != null)
    .sort((a, b) => Number(a.tenant_id) - Number(b.tenant_id));

  return NextResponse.json({ tenants });
}
