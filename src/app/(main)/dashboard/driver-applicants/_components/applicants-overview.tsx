"use client";

import { useEffect, useMemo, useState } from "react";

import { AlertTriangle, ChevronRight, Clock, FileWarning } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, XAxis } from "recharts";
import useSWR from "swr";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { type DateRange, DateRangePicker } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_BUCKET_COLORS, STATUS_BUCKET_LABEL, type StatusBucket, statusBucketOf } from "@/lib/driver-applicants";

import type { ApplicantRow, ApplicantsListResponse } from "./_types";

/* R28 point 6: a REAL step funnel (account -> profile -> license+selfie -> insurance ->
 * registration -> authorization -> Under Review -> Approved), driven by each row's own
 * `funnel_step` (the FURTHEST step that applicant has actually reached — computed server-side in
 * the list route). Replaces the old funnel, which was just the current-status distribution
 * (draft/in_progress/submitted/in_review/approved) and never showed document/authorization
 * progress at all. */
const FUNNEL_STEP_LABEL: Record<string, string> = {
  account: "Account created",
  profile: "Profile",
  license_and_selfie: "License + selfie",
  insurance: "Insurance",
  registration: "Registration",
  authorization: "Authorization",
  under_review: "Under Review",
  approved: "Approved",
};

const OVERVIEW_PAGE_SIZE = 100; // the list endpoint's pagination cap — see the caveat banner below

function allTimeRange(): DateRange {
  return { from: new Date(2026, 0, 1), to: new Date(), label: "All time" };
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const chartConfig = {
  app: { label: "App", color: "var(--chart-1)" },
  web: { label: "Web", color: "var(--chart-2)" },
} satisfies ChartConfig;

const fetcher = async (url: string): Promise<ApplicantsListResponse> => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

/** A01 — pipeline overview. Every number here is computed CLIENT-SIDE from the
 *  same /api/client/driver-applicants rows the Applications grid uses — there is
 *  no backend aggregate endpoint yet (flagged below), so this is capped at the
 *  most recent OVERVIEW_PAGE_SIZE matching applications, newest first. Good
 *  enough for M1 volume; once applicant counts regularly exceed that, these
 *  numbers need a real aggregate endpoint instead of client-side math over a
 *  capped page. */
export function ApplicantsOverview({
  onOpenApplications,
  refreshToken,
}: {
  onOpenApplications: () => void;
  refreshToken: number;
}) {
  const [dateRange, setDateRange] = useState<DateRange>(allTimeRange);
  const [zone, setZone] = useState("");

  const sp = new URLSearchParams();
  sp.set("from", dateRange.from.toISOString());
  sp.set("to", dateRange.to.toISOString());
  sp.set("pageSize", String(OVERVIEW_PAGE_SIZE));
  if (zone.trim()) sp.set("zone", zone.trim());

  const { data, error, isLoading, mutate } = useSWR<ApplicantsListResponse>(
    `/api/client/driver-applicants?${sp.toString()}`,
    fetcher,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch only when refreshToken bumps; mutate is stable from useSWR
  useEffect(() => {
    void mutate();
  }, [refreshToken]);

  const m = useMemo(() => {
    const rows: ApplicantRow[] = data?.applicants ?? [];
    const now = Date.now();

    const underReview = rows.filter((r) => r.status === "in_review");
    const underReviewWaitMs = underReview.map((r) => now - new Date(r.updated_at).getTime());
    const avgWaitHours = underReviewWaitMs.length
      ? underReviewWaitMs.reduce((a, b) => a + b, 0) / underReviewWaitMs.length / 3_600_000
      : 0;

    const approved = rows.filter((r) => r.status === "approved_applicant").length;
    const waitlisted = rows.filter((r) => r.status === "waitlisted").length;
    const rejected = rows.filter((r) => r.status === "rejected").length;

    const complete = rows.filter((r) => r.complete);

    // Applications-per-day, app vs web (full span across the loaded set).
    const byDay = new Map<string, { app: number; web: number }>();
    for (const r of rows) {
      const k = dayKey(new Date(r.created_at));
      const b = byDay.get(k) ?? { app: 0, web: 0 };
      b[r.source_category] += 1;
      byDay.set(k, b);
    }
    const days = [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, v]) => ({
        day,
        label: new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        ...v,
      }));

    // R28 point 6: a real step funnel, driven by funnel_step (the furthest step EACH applicant has
    // actually reached — see _types.ts/route.ts). Still a current-snapshot, not a cohort/time-based
    // conversion funnel (no per-step transition timestamps exist to compute that) — see the caveat
    // banner below.
    const stepOrder = Object.keys(FUNNEL_STEP_LABEL);
    const byFunnelStep: Record<string, number> = {};
    for (const r of rows) byFunnelStep[r.funnel_step] = (byFunnelStep[r.funnel_step] ?? 0) + 1;
    let prevCount = rows.length;
    const funnel = stepOrder.map((key, i) => {
      const count = byFunnelStep[key] ?? 0;
      const cumulative = stepOrder.slice(i).reduce((sum, k) => sum + (byFunnelStep[k] ?? 0), 0);
      const dropoffPct = i === 0 ? 0 : Math.round((1 - cumulative / prevCount) * 100);
      prevCount = cumulative;
      return { key, label: FUNNEL_STEP_LABEL[key], count, cumulative, dropoffPct };
    });

    // By-zone, complete vs incomplete.
    const byZone = new Map<string, { complete: number; incomplete: number }>();
    for (const r of rows) {
      const z = r.zone ?? "Unspecified";
      const b = byZone.get(z) ?? { complete: 0, incomplete: 0 };
      if (r.complete) b.complete += 1;
      else b.incomplete += 1;
      byZone.set(z, b);
    }

    // Median time-in-current-status (approx: now - updated_at, since the list
    // endpoint doesn't carry per-stage transition timestamps).
    const activeAges = rows
      .filter((r) => !["approved_applicant", "rejected", "withdrawn"].includes(r.status))
      .map((r) => now - new Date(r.updated_at).getTime())
      .sort((a, b) => a - b);
    const medianAgeMs = activeAges.length ? activeAges[Math.floor(activeAges.length / 2)] : 0;

    const needsAttention = {
      overdueReview: underReview.filter((r) => now - new Date(r.updated_at).getTime() > 48 * 3_600_000),
      stuck: rows.filter((r) => r.stuck),
      docsNeedsReview: rows.filter((r) => r.docs_needs_review),
    };

    // R28 point 7: bucketed (Onboarding/Under Review/Approved/Waitlisted/Rejected), not the raw
    // 8-value status, so this card matches the same 5-bucket contract everywhere else in the module.
    const byBucket = new Map<StatusBucket, number>();
    for (const r of rows) {
      const b = statusBucketOf(r.status);
      byBucket.set(b, (byBucket.get(b) ?? 0) + 1);
    }

    return {
      total: rows.length,
      newApplications: rows.length, // within the selected date range, by definition
      complete: complete.length,
      underReviewCount: underReview.length,
      avgWaitHours,
      approved,
      waitlisted,
      rejected,
      days,
      funnel,
      byZone: [...byZone.entries()].map(([zoneName, v]) => ({ zone: zoneName, ...v })),
      medianAgeDays: medianAgeMs / 86_400_000,
      needsAttention,
      byBucket,
    };
  }, [data]);

  const loading = isLoading && !data;
  const capped = (data?.total ?? 0) > OVERVIEW_PAGE_SIZE;

  const kpis = [
    { label: "New applications", value: m.newApplications, icon: null },
    { label: "Complete applications", value: m.complete, icon: null },
    {
      label: "Under Review",
      value: m.underReviewCount,
      sub: m.underReviewCount ? `avg wait ${m.avgWaitHours.toFixed(1)}h` : undefined,
      icon: null,
    },
    {
      label: "Approved",
      value: m.approved,
      sub: `waitlisted ${m.waitlisted} · rejected ${m.rejected}`,
      icon: null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <Input
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          placeholder="Filter by zone"
          className="h-9 w-40 text-xs"
          aria-label="Filter overview by zone"
        />
      </div>

      {error && <p className="text-sm text-destructive">Could not load overview data ({error.message}).</p>}

      {capped && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-xs dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
          Showing the {OVERVIEW_PAGE_SIZE} most recent matching applications out of {data?.total} — these KPIs are
          capped by the list endpoint's pagination, not a true aggregate. A backend aggregate endpoint would remove this
          cap (flagged in the build report).
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} size="sm" className="gap-1 border-border/60 px-4 py-3.5 shadow-sm">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</span>
            {loading ? (
              <div className="h-8 w-14 animate-pulse rounded bg-muted" />
            ) : (
              <span className="font-bold text-3xl tabular-nums tracking-tight">{k.value}</span>
            )}
            {k.sub && <span className="text-[11px] text-muted-foreground">{k.sub}</span>}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Applications per day */}
        <Card size="sm" className="border-border/60 shadow-sm">
          <CardHeader className="pb-0">
            <CardTitle className="font-semibold text-sm tracking-tight">Applications per day</CardTitle>
            <p className="text-muted-foreground text-xs">App vs web source, selected range</p>
          </CardHeader>
          <CardContent className="pt-2 pb-2">
            {loading ? (
              <Skeleton className="h-[160px] w-full rounded-lg" />
            ) : m.days.length === 0 ? (
              <Empty>No applications in range.</Empty>
            ) : (
              <ChartContainer config={chartConfig} className="h-[160px] w-full">
                <BarChart data={m.days} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} tick={{ fontSize: 10 }} />
                  <ChartTooltip cursor={{ fillOpacity: 0.06 }} content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="app"
                    fill="var(--color-app)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={18}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="web"
                    fill="var(--color-web)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={18}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Funnel */}
        <Card size="sm" className="border-border/60 shadow-sm">
          <CardHeader className="pb-0">
            <CardTitle className="font-semibold text-sm tracking-tight">Funnel (current snapshot)</CardTitle>
            <p className="text-muted-foreground text-xs">
              Where applications sit today — not a cohort drop-off over time
            </p>
          </CardHeader>
          <CardContent className="space-y-2 pt-2 pb-3">
            {loading ? (
              <Skeleton className="h-[160px] w-full rounded-lg" />
            ) : (
              m.funnel.map((f) => (
                <div key={f.key} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 text-muted-foreground">{f.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${m.total ? Math.round((f.cumulative / m.total) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="w-10 text-right tabular-nums">{f.cumulative}</span>
                  {f.dropoffPct > 0 && (
                    <span className="w-14 text-right text-amber-600 text-[11px] tabular-nums">-{f.dropoffPct}%</span>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* By zone */}
        <Card size="sm" className="border-border/60 shadow-sm">
          <CardHeader className="pb-0">
            <CardTitle className="font-semibold text-sm tracking-tight">By zone</CardTitle>
            <p className="text-muted-foreground text-xs">Complete vs incomplete</p>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-2 pb-3">
            {loading ? (
              <Skeleton className="h-[120px] w-full rounded-lg" />
            ) : m.byZone.length === 0 ? (
              <Empty>No data.</Empty>
            ) : (
              m.byZone.map((z) => (
                <div key={z.zone} className="flex items-center justify-between text-xs">
                  <span className="truncate">{z.zone}</span>
                  <span className="tabular-nums">
                    <span className="text-foreground">{z.complete}</span>
                    <span className="text-muted-foreground"> / {z.complete + z.incomplete}</span>
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* By status + median time-in-stage */}
        <Card size="sm" className="border-border/60 shadow-sm">
          <CardHeader className="pb-0">
            <CardTitle className="font-semibold text-sm tracking-tight">By status</CardTitle>
            <p className="text-muted-foreground text-xs">
              Median time in current (active) stage: {loading ? "…" : `${m.medianAgeDays.toFixed(1)}d`}
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5 pt-2 pb-3">
            {loading ? (
              <Skeleton className="h-[80px] w-full rounded-lg" />
            ) : (
              [...m.byBucket.entries()].map(([bucket, count]) => {
                const c = STATUS_BUCKET_COLORS[bucket];
                return (
                  <span
                    key={bucket}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium text-xs"
                    style={{ backgroundColor: c.bg, color: c.fg }}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
                    {STATUS_BUCKET_LABEL[bucket]}: {count}
                  </span>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Needs attention */}
      <Card size="sm" className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-1.5 font-semibold text-sm tracking-tight">
              <AlertTriangle className="size-3.5 text-amber-500" aria-hidden="true" />
              Needs attention
            </CardTitle>
            <button
              type="button"
              onClick={onOpenApplications}
              className="flex items-center gap-0.5 font-medium text-primary text-xs hover:underline"
            >
              View all applications
              <ChevronRight className="size-3" aria-hidden="true" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pb-3 sm:grid-cols-3">
          <AttentionCell
            icon={<Clock className="size-3.5" aria-hidden="true" />}
            label="Under Review > 48h"
            count={loading ? null : m.needsAttention.overdueReview.length}
          />
          <AttentionCell
            icon={<AlertTriangle className="size-3.5" aria-hidden="true" />}
            label="Stuck > 7 days"
            count={loading ? null : m.needsAttention.stuck.length}
          />
          <AttentionCell
            icon={<FileWarning className="size-3.5" aria-hidden="true" />}
            label="Docs flagged needs_review"
            count={loading ? null : m.needsAttention.docsNeedsReview.length}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function AttentionCell({ icon, label, count }: { icon: React.ReactNode; label: string; count: number | null }) {
  const warn = (count ?? 0) > 0;
  return (
    <div
      className={
        warn
          ? "flex items-center justify-between rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 dark:border-amber-700/50 dark:bg-amber-900/10"
          : "flex items-center justify-between rounded-md border px-3 py-2"
      }
    >
      <span
        className={
          warn
            ? "flex items-center gap-1.5 text-amber-700 text-xs dark:text-amber-400"
            : "flex items-center gap-1.5 text-muted-foreground text-xs"
        }
      >
        {icon}
        {label}
      </span>
      <span className="font-semibold text-sm tabular-nums">{count ?? "…"}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-muted-foreground text-xs">{children}</p>;
}
