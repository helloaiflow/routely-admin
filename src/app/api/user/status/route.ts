import { NextResponse } from "next/server";

import { auth, ownTenantFilter } from "@/lib/auth/server";

import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ hasCompletedOnboarding: false });

  try {
    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("tenants")
      .select("*")
      .eq(...(await ownTenantFilter(userId)))
      .maybeSingle();

    const t = (row?.doc ?? {}) as Record<string, any>;

    return NextResponse.json({
      hasCompletedOnboarding: !!row,
      tenant: row
        ? {
            company_name: row.company_name,
            plan_type: row.plan_type ?? t.plan_type,
            trial_ends_at: t.trial_ends_at,
          }
        : null,
    });
  } catch {
    return NextResponse.json({ hasCompletedOnboarding: false });
  }
}
