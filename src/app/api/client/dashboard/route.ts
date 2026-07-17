import { NextResponse } from "next/server";

import { reviveStopDoc, shapeDraftForList, shapeStopForList, statusBucket } from "@/lib/spoke-fields";
// Canonical classification — Spoke's success boolean is the source of truth, so
// KPIs agree with the Sankey and the Live Stop Monitor (lib/status.ts).
import { isDelivered, isFailed, isInMotion } from "@/lib/status";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireActiveTenantContext } from "@/lib/tenant";

// Always use Eastern Time (America/New_York) for date math
// Vercel servers run UTC — without this, after 8pm ET the dashboard shows 0
function ymd(d: Date, tz = "America/New_York"): string {
  return d.toLocaleDateString("en-CA", { timeZone: tz }); // en-CA gives YYYY-MM-DD
}

function startOfDayET(d: Date): Date {
  const etMidnightStr = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" }) + "T00:00:00";
  const etOffset = getETOffsetMinutes(d);
  const sign = etOffset <= 0 ? "+" : "-";
  const abs = Math.abs(etOffset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return new Date(`${etMidnightStr}${sign}${hh}:${mm}`);
}

function getETOffsetMinutes(d: Date): number {
  const utc = d.getTime();
  const etStr = d.toLocaleString("en-US", { timeZone: "America/New_York" });
  const etDate = new Date(etStr + " UTC");
  return Math.round((utc - etDate.getTime()) / 60000);
}

function pctChange(now: number, prev: number): number | null {
  if (prev === 0) return now > 0 ? 100 : null;
  return Math.round(((now - prev) / prev) * 100);
}

// created_at may be a Date (revived) or an ISO string — normalize to epoch ms.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ms(v: any): number {
  if (v instanceof Date) return v.getTime();
  return new Date(v ?? 0).getTime();
}

export async function GET(request: Request) {
  const ctx = await requireActiveTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const tenantId = Number(ctx.tenantId);
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "today";
  const fromParam = searchParams.get("from"); // YYYY-MM-DD
  const toParam = searchParams.get("to"); // YYYY-MM-DD

  const now = new Date();
  const today = ymd(now);
  const yesterday = ymd(new Date(now.getTime() - 86_400_000));
  const monthStart = startOfDayET(new Date(now.getFullYear(), now.getMonth(), 1));

  const sevenDaysAgo = startOfDayET(new Date(now.getTime() - 6 * 86_400_000));
  const todayMidnight = startOfDayET(now);

  // Range: explicit from/to params, else period-based default
  let rangeStart: Date;
  let rangeStartYmd: string;
  if (fromParam) {
    rangeStart = startOfDayET(new Date(fromParam + "T12:00:00"));
    rangeStartYmd = fromParam;
  } else {
    rangeStart = period === "month" ? monthStart : period === "week" ? sevenDaysAgo : todayMidnight;
    rangeStartYmd = ymd(rangeStart);
  }

  const rangeEndYmd = toParam ?? today;
  // Exclusive upper Date bound (next ET midnight after rangeEnd) for the
  // created_at fallback below.
  const rangeEndDateExclusive = new Date(startOfDayET(new Date(rangeEndYmd + "T12:00:00")).getTime() + 86_400_000);

  // ── Fetch this tenant's stops ONCE — server-side narrowed ─────────────────
  // HOTFIX 2026-07-13 (same 504-storm family as the stops route): the old
  // `select doc … limit(5000)` shipped EVERY tenant doc on every dashboard
  // load. Now SQL pre-narrows to a strict SUPERSET of both windows the JS
  // derives (selected range + 7-day trend): scheduled date inside the widened
  // window, OR date-less docs with created_at inside it (±24h padding so no
  // timezone edge can exclude a doc the JS fallback would keep). All the fine
  // in-range/trend/missing-field semantics below run UNCHANGED in JS.
  const lowYmd = rangeStartYmd < ymd(sevenDaysAgo) ? rangeStartYmd : ymd(sevenDaysAgo);
  const highYmd = rangeEndYmd > today ? rangeEndYmd : today;
  const lowCreatedIso = new Date(
    Math.min(rangeStart.getTime(), sevenDaysAgo.getTime()) - 86_400_000,
  ).toISOString();
  const { data: stopRows, error: stopErr } = await supabase
    .from("stops")
    .select("doc")
    .eq("tenant_id", tenantId)
    .or(
      `and(doc->service->>date.gte.${lowYmd},doc->service->>date.lte.${highYmd}),` +
        `and(doc->delivery->>date.gte.${lowYmd},doc->delivery->>date.lte.${highYmd}),` +
        `and(doc->service->>date.is.null,doc->delivery->>date.is.null,doc->>created_at.gte.${lowCreatedIso})`,
    )
    .order("doc->>created_at", { ascending: false })
    .limit(1000);

  if (stopErr) {
    console.error("[dashboard] stops supabase error:", stopErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const allStops = (stopRows ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r) => reviveStopDoc((r as { doc: any }).doc))
    .filter(Boolean)
    .filter((d) => d.stop_type !== "pickup" && d.status !== "deleted");

  // ── Real stops (range-filtered) ────────────────────────────────────────────
  // Stops are filtered by `service.date` (canonical) or legacy `delivery.date`.
  // FALLBACK: a stop with NO scheduled date (common for OCR-scanned stops) is
  // bucketed by `created_at` within the ET range so it isn't dropped. Stops WITH
  // a scheduled date keep using it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inRange = (d: any): boolean => {
    const sd = d.service?.date ?? null;
    const dd = d.delivery?.date ?? null;
    if (sd != null && sd >= rangeStartYmd && sd <= rangeEndYmd) return true;
    if (dd != null && dd >= rangeStartYmd && dd <= rangeEndYmd) return true;
    if (sd == null && dd == null) {
      const t = ms(d.created_at);
      return t >= rangeStart.getTime() && t < rangeEndDateExclusive.getTime();
    }
    return false;
  };
  const realDocs = allStops
    .filter(inRange)
    .sort((a, b) => ms(b.created_at) - ms(a.created_at))
    .slice(0, 500);

  // No driverMap: shapeStopForList falls back to the embedded
  // assignment.driver_name (a Supabase resolver is added only if needed).
  const realStops = realDocs.map((d) => shapeStopForList(d));

  // ── Draft stops (portal orders, not yet submitted) ─────────────────────
  // Not period-filtered — drafts exist outside the scheduled-date world.
  const { data: draftRows } = await supabase
    .from("draft_stops")
    .select("doc")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  const draftStops = (draftRows ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r) => shapeDraftForList(reviveStopDoc((r as { doc: any }).doc)))
    .filter(Boolean);

  // ── Period stops for KPIs ───────────────────────────────────────────────
  const effectiveDate = (s: ReturnType<typeof shapeStopForList>) => s.delivery_date ?? ymd(new Date(s.created_at));
  const periodStops = realStops;
  const yesterdayReal = realStops.filter((s) => effectiveDate(s) === yesterday);

  // ── Tenant ────────────────────────────────────────────────────────────────
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("outstanding_amount")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  // ── Month total (billing-period count) ──────────────────────────────────
  const billingPeriod = today.slice(0, 7);
  let monthTotal = 0;
  try {
    const { count } = await supabase
      .from("usage_events")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .or(`billing_period.eq.${billingPeriod},created_at.gte.${monthStart.toISOString()}`);
    monthTotal = count ?? 0;
  } catch {
    monthTotal = 0;
  }
  if (monthTotal === 0) {
    monthTotal = realDocs.filter((d) => d.created_at && ms(d.created_at) >= monthStart.getTime()).length;
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const deliveredNow = periodStops.filter((s) => isDelivered(s)).length;
  const deliveredPrev = yesterdayReal.filter((s) => isDelivered(s)).length;
  const inTransitNow = periodStops.filter((s) => isInMotion(s)).length;
  const failedNow = periodStops.filter((s) => isFailed(s)).length;
  const sigRequired = periodStops.filter((s) => s.requires_signature === true).length;
  const codTotal = periodStops
    .filter((s) => s.collect_cod && !isDelivered(s))
    .reduce((acc, s) => acc + (s.collect_amount ?? 0), 0);

  // Stops by type — operational breakdown of what's happening today.
  const stopsByType = {
    delivery: periodStops.filter((s) => s.stop_type === "delivery").length,
    pickup: periodStops.filter((s) => s.stop_type === "pickup").length,
    dropoff: periodStops.filter((s) => s.stop_type === "dropoff").length,
  };

  const draftSummary = {
    total: draftStops.length,
    pending: draftStops.filter((s) => ["draft", "pending"].includes(s.status)).length,
    approved: draftStops.filter((s) => ["approved", "paid"].includes(s.status)).length,
  };

  const kpis = {
    total: periodStops.length,
    total_pct: pctChange(periodStops.length, yesterdayReal.length),
    delivered: deliveredNow,
    delivered_pct: pctChange(deliveredNow, deliveredPrev),
    in_transit: inTransitNow,
    failed: failedNow,
    signature_required: sigRequired,
    cod_total: Number(codTotal.toFixed(2)),
    outstanding: Number(tenantRow?.outstanding_amount ?? 0),
    month_total: monthTotal,
    drafts_total: draftSummary.total,
    stops_by_type: stopsByType,
    draft_summary: draftSummary,
  };

  // ── Pipeline ──────────────────────────────────────────────────────────────
  const PRE_DISPATCH = ["pending", "draft", "approved", "paid", "unassigned", "created"];
  const pipeline = { pending: 0, in_transit: 0, delivered: 0, failed: 0, pickups: 0, deliveries: 0 };
  for (const s of periodStops) {
    const b = statusBucket(s);
    pipeline[b as keyof typeof pipeline] += 1;
    if (PRE_DISPATCH.includes(s.status)) pipeline.pickups += 1;
    else pipeline.deliveries += 1;
  }

  // ── 7-day trend ───────────────────────────────────────────────────────────
  const trend: Array<{ date: string; label: string; completed: number; failed: number; total: number }> = [];
  const trendIndex = new Map<string, (typeof trend)[number]>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = ymd(d);
    const pt = {
      date: key,
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      completed: 0,
      failed: 0,
      total: 0,
    };
    trend.push(pt);
    trendIndex.set(key, pt);
  }
  // The trend needs the FULL last-7-days window (not the selected range). Derive
  // it from the same single fetch, with the identical date logic (incl. the
  // date-less created_at fallback).
  const trendStartYmd = ymd(sevenDaysAgo);
  const trendEndDateExclusive = new Date(todayMidnight.getTime() + 86_400_000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inTrendWindow = (d: any): boolean => {
    const sd = d.service?.date ?? null;
    const dd = d.delivery?.date ?? null;
    if (sd != null && sd >= trendStartYmd && sd <= today) return true;
    if (dd != null && dd >= trendStartYmd && dd <= today) return true;
    if (sd == null && dd == null) {
      const t = ms(d.created_at);
      return t >= sevenDaysAgo.getTime() && t < trendEndDateExclusive.getTime();
    }
    return false;
  };
  const trendDocs = allStops.filter(inTrendWindow);
  for (const d of trendDocs) {
    const ed = d.service?.date ?? d.delivery?.date ?? (d.created_at ? ymd(new Date(d.created_at)) : null);
    if (!ed) continue;
    const bucket = trendIndex.get(ed);
    if (!bucket) continue;
    // Canonical classification via the Spoke boolean (result.delivery_succeeded),
    // status as fallback — matches the KPIs/Sankey/monitor exactly.
    const cs = { status: d.status, delivery_succeeded: d.result?.delivery_succeeded ?? null };
    bucket.total++;
    if (isDelivered(cs)) bucket.completed++;
    else if (isFailed(cs)) bucket.failed++;
  }

  // ── COD & Cold ────────────────────────────────────────────────────────────
  const codQueue = periodStops.filter((s) => s.collect_cod && !isDelivered(s)).slice(0, 20);
  const coldPackages = periodStops
    .filter((s) => s.package_type === "cold" && !isDelivered(s))
    .slice(0, 20);

  // ── Upcoming / Live Stops (sorted by ETA) ──────────────────────────────────
  // The Live Stop Monitor shows only the in-flight/dispatched set (isInMotion):
  // assigned / in_transit / out_for_delivery / dispatched. Excludes
  // pre-dispatch/unassigned and delivered/failed.
  const upcoming = realStops
    .filter((s) => isInMotion(s))
    .sort((a, b) => {
      if (a.is_same_day !== b.is_same_day) return a.is_same_day ? -1 : 1;
      const ea = a.eta ?? a.delivery_date ?? effectiveDate(a);
      const eb = b.eta ?? b.delivery_date ?? effectiveDate(b);
      return ea < eb ? -1 : 1;
    })
    .slice(0, 50);

  const nextStop = upcoming[0] ?? null;

  return NextResponse.json({
    kpis,
    pipeline,
    stops: realStops,
    drafts: draftStops,
    trend,
    next_stop: nextStop,
    cod_queue: codQueue,
    cold_packages: coldPackages,
    upcoming,
    period,
    range: { start: rangeStartYmd, end: rangeEndYmd },
    generated_at: new Date().toISOString(),
  });
}
