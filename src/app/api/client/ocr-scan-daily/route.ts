import { NextResponse } from "next/server";

import clientPromise from "@/lib/mongodb";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

const ET = "America/New_York";
const RECONCILE_FIELD_KEYS = ["name", "phone", "street", "city", "state", "zip", "dob"] as const;

/* ───────────────────────────────────────────────────────────────────────────
 * Long-term OCR scan stats — reads the permanent Supabase rollup
 * (public.ocr_scan_daily). One row per tenant per day; survives the raw
 * ocr_scan_logs 48h TTL. Latency percentiles are approximated from the daily
 * latency histogram buckets.
 * ───────────────────────────────────────────────────────────────────────────*/

type Row = {
  day: string;
  total: number;
  ok: number;
  failed: number;
  errors_cnt: number;
  qwen_count: number;
  qwen_lat_sum: number;
  openai_count: number;
  openai_lat_sum: number;
  retries: number;
  second_pass: number;
  fields_sum: number;
  score_sum: number;
  score_n: number;
  lat_b0: number;
  lat_b1: number;
  lat_b2: number;
  lat_b3: number;
  lat_b4: number;
  errors: Record<string, number>;
};

// Representative latency (ms) per histogram bucket, for percentile approximation.
const BUCKET_REP = [750, 1500, 3500, 7500, 15000];

function pctFromBuckets(b: number[], p: number): number {
  const total = b.reduce((a, c) => a + c, 0);
  if (total === 0) return 0;
  const target = (p / 100) * total;
  let cum = 0;
  for (let i = 0; i < b.length; i++) {
    cum += b[i];
    if (cum >= target) return BUCKET_REP[i];
  }
  return BUCKET_REP[BUCKET_REP.length - 1];
}

/** Shift a YYYY-MM-DD calendar string by whole days (UTC math → DST-safe).
 *  All day math is done on calendar strings to stay consistent with the
 *  ET-anchored `day` column in the rollup. */
function addDaysStr(dayStr: string, delta: number): string {
  const [y, m, d] = dayStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days") ?? 30) || 30, 1), 400);
  // Anchor the window on the ET calendar (matches how the rollup stores `day`).
  const endStr = new Date().toLocaleDateString("en-CA", { timeZone: ET });
  const startStr = addDaysStr(endStr, -(days - 1));

  const supabase = getSupabaseAdmin();
  // Admin cross-tenant: "all" drops the per-tenant filter. (Single-tenant today,
  // so no per-day collision; sum-by-day can be added when >1 tenant has rollups.)
  const scopeAll = ctx.isAdmin && ctx.tenantScope === "all";
  let dailyQ = supabase.from("ocr_scan_daily").select("*").gte("day", startStr);
  if (!scopeAll) dailyQ = dailyQ.eq("tenant_id", ctx.tenantId);
  const { data, error } = await dailyQ.order("day", { ascending: true });

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  const rows = (data ?? []) as Row[];
  const byDay = new Map(rows.map((r) => [r.day, r]));

  // Continuous daily series (fill gaps). `date` = mid-day UTC so the browser
  // renders the right calendar day regardless of its own timezone.
  const series: {
    date: string;
    scans: number;
    ok: number;
    failed: number;
    latency: number;
    qwen: number;
    openai: number;
  }[] = [];
  let dayStr = startStr;
  for (let i = 0; dayStr <= endStr && i < 420; i++) {
    const r = byDay.get(dayStr);
    const latN = r ? r.qwen_count + r.openai_count : 0;
    const latSum = r ? r.qwen_lat_sum + r.openai_lat_sum : 0;
    series.push({
      date: `${dayStr}T12:00:00.000Z`,
      scans: r?.total ?? 0,
      ok: r?.ok ?? 0,
      failed: r?.failed ?? 0,
      latency: latN ? Math.round(latSum / latN) : 0,
      qwen: r?.qwen_count ?? 0,
      openai: r?.openai_count ?? 0,
    });
    dayStr = addDaysStr(dayStr, 1);
  }

  // Aggregate totals.
  const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
  const total = sum((r) => r.total);
  const ok = sum((r) => r.ok);
  const failed = sum((r) => r.failed);
  const qwenCount = sum((r) => r.qwen_count);
  const qwenLat = sum((r) => r.qwen_lat_sum);
  const openaiCount = sum((r) => r.openai_count);
  const openaiLat = sum((r) => r.openai_lat_sum);
  const latN = qwenCount + openaiCount;
  const latSum = qwenLat + openaiLat;
  const buckets = [
    sum((r) => r.lat_b0),
    sum((r) => r.lat_b1),
    sum((r) => r.lat_b2),
    sum((r) => r.lat_b3),
    sum((r) => r.lat_b4),
  ];
  const scoreN = sum((r) => r.score_n);
  const errorsByCode: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.errors ?? {})) errorsByCode[k] = (errorsByCode[k] ?? 0) + Number(v);

  return NextResponse.json({
    days,
    series,
    totals: {
      total,
      ok,
      failed,
      errors: sum((r) => r.errors_cnt),
      successRate: total ? Math.round((ok / total) * 100) : 0,
      errorRate: total ? Math.round((failed / total) * 100) : 0,
      avgLatency: latN ? Math.round(latSum / latN) : 0,
      p50: pctFromBuckets(buckets, 50),
      p95: pctFromBuckets(buckets, 95),
      retries: sum((r) => r.retries),
      secondPass: sum((r) => r.second_pass),
      fieldsAvg: total ? Math.round((sum((r) => r.fields_sum) / total) * 10) / 10 : 0,
      scoreAvg: scoreN ? Math.round((sum((r) => r.score_sum) / scoreN) * 100) : null,
      qwen: { count: qwenCount, avg: qwenCount ? Math.round(qwenLat / qwenCount) : 0 },
      openai: { count: openaiCount, avg: openaiCount ? Math.round(openaiLat / openaiCount) : 0 },
      buckets,
    },
    errorsByCode,
  });
}

/* POST — reconcile the last 48h of the rollup from the raw ocr_scan_logs
 * (Mongo). Recomputes affected days and upserts ABSOLUTE values, so the
 * rollup's recent window always matches the raw detail (self-healing, no
 * double-count). Older days are untouched. */
export async function POST() {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = (await clientPromise).db("routely_prod");
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const logs = await db
      .collection("ocr_scan_logs")
      .find({ tenant_id: Number(ctx.tenantId), created_at: { $gte: since } })
      .limit(5000)
      .toArray();

    type Agg = {
      tenant_id: number;
      day: string;
      total: number;
      ok: number;
      failed: number;
      errors_cnt: number;
      qwen_count: number;
      qwen_lat_sum: number;
      openai_count: number;
      openai_lat_sum: number;
      retries: number;
      second_pass: number;
      fields_sum: number;
      score_sum: number;
      score_n: number;
      lat_b0: number;
      lat_b1: number;
      lat_b2: number;
      lat_b3: number;
      lat_b4: number;
      errors: Record<string, number>;
      updated_at: string;
    };

    const byDay = new Map<string, Agg>();
    for (const r of logs as Record<string, unknown>[]) {
      const created = new Date(r.created_at as string);
      if (Number.isNaN(created.getTime())) continue;
      const day = created.toLocaleDateString("en-CA", { timeZone: ET });
      let a = byDay.get(day);
      if (!a) {
        a = {
          tenant_id: Number(ctx.tenantId),
          day,
          total: 0,
          ok: 0,
          failed: 0,
          errors_cnt: 0,
          qwen_count: 0,
          qwen_lat_sum: 0,
          openai_count: 0,
          openai_lat_sum: 0,
          retries: 0,
          second_pass: 0,
          fields_sum: 0,
          score_sum: 0,
          score_n: 0,
          lat_b0: 0,
          lat_b1: 0,
          lat_b2: 0,
          lat_b3: 0,
          lat_b4: 0,
          errors: {},
          updated_at: new Date().toISOString(),
        };
        byDay.set(day, a);
      }
      const ok = r.ok === true;
      const statusCode = Number(r.status_code) || 0;
      const lat = Math.max(Number(r.latency_ms) || 0, 0);
      const provider = String(r.provider ?? "");
      a.total += 1;
      if (ok) a.ok += 1;
      else a.failed += 1;
      if (!ok && statusCode >= 500) a.errors_cnt += 1;
      if (provider === "qwen") {
        a.qwen_count += 1;
        a.qwen_lat_sum += lat;
      } else if (provider === "openai") {
        a.openai_count += 1;
        a.openai_lat_sum += lat;
      }
      if (r.used_retry === true) a.retries += 1;
      if (r.used_second_pass === true) a.second_pass += 1;
      const f = (r.fields ?? {}) as Record<string, unknown>;
      a.fields_sum += RECONCILE_FIELD_KEYS.filter((k) => Boolean(f[k])).length;
      if (typeof f.critical_score === "number") {
        a.score_sum += f.critical_score;
        a.score_n += 1;
      }
      if (lat < 1000) a.lat_b0 += 1;
      else if (lat < 2000) a.lat_b1 += 1;
      else if (lat < 5000) a.lat_b2 += 1;
      else if (lat < 10000) a.lat_b3 += 1;
      else a.lat_b4 += 1;
      const code = r.error_code ? String(r.error_code) : "";
      if (code) a.errors[code] = (a.errors[code] ?? 0) + 1;
    }

    // Only reconcile ET days FULLY inside the 48h raw window. The window's
    // boundary day is partial (early scans already expired), so recomputing it
    // could clobber the complete value the forward write-path accumulated.
    const boundaryDay = since.toLocaleDateString("en-CA", { timeZone: ET });
    const fullFromDay = addDaysStr(boundaryDay, 1);
    const rows = [...byDay.values()].filter((a) => a.day >= fullFromDay);
    if (rows.length > 0) {
      const { error } = await getSupabaseAdmin()
        .from("ocr_scan_daily")
        .upsert(rows, { onConflict: "tenant_id,day" });
      if (error) return NextResponse.json({ error: "Rollup upsert failed" }, { status: 500 });
    }
    return NextResponse.json({ reconciled: rows.length, days: rows.map((r) => r.day) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Reconcile error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
