import { NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/* GET /api/client/billing/usage — read-only metered-usage view (revenue engine).
 * packages: delivered stops this calendar month (our own count — source of the
 * meter events); upcoming: Stripe's upcoming-invoice preview for the tenant's
 * metered subscription when one exists. Lazy Stripe init; Stripe failures
 * degrade to packages-only (never a 500). */

export async function GET() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = Number(ctx.tenantId);
  const supabase = getSupabaseAdmin();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("stops")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["delivered", "succeeded", "success"])
    .gte("updated_at", monthStart.toISOString());

  let upcoming: { amount_due: number; currency: string; period_end: number } | null = null;
  try {
    const { data: t } = await supabase.from("tenants").select("stripe_customer_id").eq("tenant_id", tenantId).maybeSingle();
    if (t?.stripe_customer_id) {
      const inv = await getStripe().invoices.createPreview({ customer: t.stripe_customer_id });
      upcoming = { amount_due: inv.amount_due, currency: inv.currency, period_end: inv.period_end };
    }
  } catch {
    // no subscription / preview unavailable — packages-only is still useful
  }

  return NextResponse.json({
    period_start: monthStart.toISOString(),
    packages_delivered: count ?? 0,
    miles_driven: null, // forward-compat: no routes engine yet
    upcoming_invoice: upcoming,
  });
}
