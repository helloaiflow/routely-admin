import { type NextRequest, NextResponse } from "next/server";

import {
  DEFAULT_BILLING_RULES,
  DEFAULT_BILLING_TYPE,
  PUBLISHED_TIER_RATES,
  type PublishedTier,
} from "@/lib/billing-tiers";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/* POST /api/client/billing/plan — D39 (CEO-locked 2026-08-19): the plan
 * selector. Picking a published tier writes ITS rates and resets rules back
 * to the standard default (a locked tier can't carry a bespoke, Custom-only
 * rule set left over from before). Picking "custom" only flips the label —
 * PATCH /api/client/billing/rates is where an admin then sets the actual
 * negotiated numbers, and that route re-asserts plan_type='custom' itself
 * the moment it's touched, so the two paths can't drift apart. */

const TIERS = new Set<PublishedTier>(["starter", "professional", "enterprise"]);

export async function POST(req: NextRequest) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const plan = body?.plan;
  if (plan !== "custom" && !TIERS.has(plan))
    return NextResponse.json({ error: "plan must be starter | professional | enterprise | custom" }, { status: 400 });

  const patch: Record<string, unknown> =
    plan === "custom"
      ? { plan_type: "custom" }
      : {
          plan_type: plan,
          billing_rates: PUBLISHED_TIER_RATES[plan as PublishedTier],
          default_billing_type: DEFAULT_BILLING_TYPE,
          billing_rules: DEFAULT_BILLING_RULES,
        };

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tenants")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("tenant_id", Number(ctx.tenantId));
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true, ...patch });
}
