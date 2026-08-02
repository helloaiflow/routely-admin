import { type NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/* GET /api/client/billing/daily?range=7d|30d|90d — per-day, per-billing-type
 * cost AND usage for the "Usage & charges" stacked area chart (2026-08-02).
 *
 * No existing endpoint exposes this: /api/client/billing/usage and /summary
 * are both point-in-time snapshots (uninvoiced-now / this-month-vs-last),
 * neither has a per-day breakdown; /summary's delivery_series_30d is a
 * single-series (total only) daily sum with no type split and no unit
 * counts. The chart needs BOTH money and quantity per type per day, so this
 * is a genuinely new aggregate, computed here (not client-side) because the
 * 90-day range would otherwise mean shipping up to ~90 days of raw ledger
 * rows to the browser just to bucket them. */

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
const TYPES = ["package", "miles", "on_demand"] as const;

export async function GET(req: NextRequest) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = Number(ctx.tenantId);

  const rangeParam = req.nextUrl.searchParams.get("range") ?? "30d";
  const days = RANGE_DAYS[rangeParam] ?? 30;

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));

  const { data: rows } = await supabase
    .from("billing_ledger")
    .select("resolved_type, amount_cents, units, attempted_at, flag")
    .eq("tenant_id", tenantId)
    .gte("attempted_at", since.toISOString())
    .limit(5000);

  type DayBucket = { date: string; values: Record<string, number> };
  const buckets = new Map<string, DayBucket>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = dayKey(d);
    const bucket: DayBucket = { date: k, values: {} };
    for (const t of TYPES) {
      bucket.values[`${t}_cents`] = 0;
      bucket.values[`${t}_qty`] = 0;
    }
    buckets.set(k, bucket);
  }

  const totals: Record<string, { cents: number; qty: number }> = {};
  for (const t of TYPES) totals[t] = { cents: 0, qty: 0 };

  for (const l of rows ?? []) {
    if (l.flag) continue;
    const type = TYPES.includes(l.resolved_type as (typeof TYPES)[number]) ? l.resolved_type : null;
    if (!type) continue;
    const k = dayKey(new Date(l.attempted_at));
    const bucket = buckets.get(k);
    if (!bucket) continue;
    const cents = l.amount_cents ?? 0;
    const qty = type === "miles" ? Number(l.units ?? 0) : 1;
    bucket.values[`${type}_cents`] += cents;
    bucket.values[`${type}_qty`] += qty;
    totals[type].cents += cents;
    totals[type].qty += qty;
  }

  // Flatten to {date, package_cents, package_qty, ...} — one plain object
  // per data point, the shape recharts/ChartContainer expects.
  const flatDays = [...buckets.values()].map((b) => ({ date: b.date, ...b.values }));

  return NextResponse.json({
    range: rangeParam,
    days: flatDays,
    totals,
  });
}
