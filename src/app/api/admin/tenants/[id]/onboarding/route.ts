import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

/** M25: the tenant's onboarding timeline (onboarding_events) and its signup attribution. */
export async function GET(_req: Request, { params }: Params) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = Number((await params).id);
  if (!Number.isInteger(tenantId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  const [{ data: events }, { data: attribution }] = await Promise.all([
    supabase
      .from("onboarding_events")
      .select("event, step, at, source")
      .eq("tenant_id", tenantId)
      .order("at", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("signup_attribution").select("*").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  return NextResponse.json({ events: events ?? [], attribution: attribution ?? null });
}
