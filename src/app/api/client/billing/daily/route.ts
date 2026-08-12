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
// 2026-08-13: added prepaid_label ("Labels") for the Recent Activity daily
// chart's 4-category breakdown (Packages · Mileage · Labels · Additional
// services — "Additional services" maps to on_demand, the closest existing
// resolved_type to a non-standard delivery service; there is no literal
// "additional services" type in billing_ledger, see 2026-08-13 report).
const TYPES = ["package", "miles", "on_demand", "prepaid_label"] as const;

export async function GET(req: NextRequest) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = Number(ctx.tenantId);

  const rangeParam = req.nextUrl.searchParams.get("range") ?? "30d";
  const dateFromParam = req.nextUrl.searchParams.get("date_from");
  const dateToParam = req.nextUrl.searchParams.get("date_to");

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);

  // Explicit date_from/date_to (2026-08-13) — the current-billing-cycle
  // chart passes the tenant's REAL cycle boundaries (billing-cycle.ts'
  // computeCyclePeriod) instead of a fixed day-count, so "current cycle"
  // reconciles exactly with the cycle figures shown elsewhere on this page
  // even for a mid-month or short/long custom cadence.
  let since: Date;
  let until: Date;
  let days: number;
  if (dateFromParam && dateToParam) {
    since = new Date(`${dateFromParam}T00:00:00.000Z`);
    until = new Date(`${dateToParam}T00:00:00.000Z`);
    days = Math.max(1, Math.round((until.getTime() - since.getTime()) / 86400_000));
  } else {
    days = RANGE_DAYS[rangeParam] ?? 30;
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
    until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  }

  const { data: rows, error: rowsError } = await supabase
    .from("billing_ledger")
    .select("resolved_type, amount_cents, units, attempted_at, flag")
    .eq("tenant_id", tenantId)
    .gte("attempted_at", since.toISOString())
    .lt("attempted_at", until.toISOString())
    .limit(5000);
  if (rowsError) {
    console.error("[billing/daily] ledger query failed", rowsError);
    return NextResponse.json({ error: "Failed to load daily billing chart" }, { status: 500 });
  }

  type DayBucket = { date: string; values: Record<string, number> };
  const buckets = new Map<string, DayBucket>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getFullYear(), since.getMonth(), since.getDate() + i);
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
