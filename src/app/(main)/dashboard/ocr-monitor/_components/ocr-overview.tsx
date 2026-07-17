"use client";

import { useMemo, useState } from "react";

import { Activity, AlertCircle, CheckCircle2, Cpu, Timer } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { dailySeries, fmtMs, type OcrDailyStats, percentile, type Scan, type ScanRecord } from "./types";

const dayTick = (value: string) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dayLabel = (value: unknown) =>
  new Date(value as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const latToneCls = (ms: number) =>
  ms < 2000 ? "text-success" : ms < 5000 ? "text-warning" : "text-destructive";
const latStrokeCls = (ms: number) =>
  ms < 2000 ? "stroke-success" : ms < 5000 ? "stroke-warning" : "stroke-destructive";

const dayBarConfig = {
  scans: { label: "Scans", color: "var(--primary)" },
  failed: { label: "Failed", color: "var(--destructive)" },
} satisfies ChartConfig;
type DayMetric = keyof typeof dayBarConfig;

const latencyConfig = { latency: { label: "Avg latency (ms)", color: "var(--primary)" } } satisfies ChartConfig;

function providerStats(records: ScanRecord[], provider: string) {
  const lat = records.filter((r) => r.provider === provider).map((r) => r.latency_ms ?? 0).filter((n) => n > 0);
  const count = records.filter((r) => r.provider === provider).length;
  return {
    count,
    avg: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0,
    p95: percentile(lat, 95),
  };
}

export function OcrOverview({
  records,
  scans,
  loading,
  sinceMinutes,
  history,
}: {
  records: ScanRecord[];
  scans: Scan[];
  loading: boolean;
  sinceMinutes: number;
  history?: OcrDailyStats | null;
}) {
  const [metric, setMetric] = useState<DayMetric>("scans");

  const rawStats = useMemo(() => {
    const latencies = records.map((r) => r.latency_ms ?? 0).filter((n) => n > 0);
    const failedScans = scans.filter((s) => s.status !== "processed").length;
    return {
      totalScans: scans.length,
      events: records.length,
      successRate: scans.length ? Math.round((scans.filter((s) => s.status === "processed").length / scans.length) * 100) : 0,
      errorRate: scans.length ? Math.round((failedScans / scans.length) * 100) : 0,
      avgLatency: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      failedScans,
      qwen: providerStats(records, "qwen"),
      openai: providerStats(records, "openai"),
    };
  }, [records, scans]);

  const rawTrend = useMemo(() => dailySeries(records, sinceMinutes), [records, sinceMinutes]);

  // Long ranges (> 48h) read from the permanent Supabase rollup; short ranges
  // use the live raw records.
  const trend = history ? history.series : rawTrend;
  const stats = history
    ? {
        totalScans: history.totals.total,
        events: history.totals.total,
        successRate: history.totals.successRate,
        errorRate: history.totals.errorRate,
        avgLatency: history.totals.avgLatency,
        p50: history.totals.p50,
        p95: history.totals.p95,
        failedScans: history.totals.failed,
        qwen: { count: history.totals.qwen.count, avg: history.totals.qwen.avg, p95: 0 },
        openai: { count: history.totals.openai.count, avg: history.totals.openai.avg, p95: 0 },
      }
    : rawStats;
  const dayTotals = { scans: trend.reduce((a, b) => a + b.scans, 0), failed: trend.reduce((a, b) => a + b.failed, 0) };

  const kpis = [
    { key: "scans", label: "Total scans", value: String(stats.totalScans), hint: `${stats.qwen.count} Qwen · ${stats.openai.count} OpenAI`, icon: Activity, tone: "primary" as const },
    { key: "success", label: "Success rate", value: `${stats.successRate}%`, hint: `${stats.failedScans} not clean`, icon: CheckCircle2, tone: stats.successRate >= 90 ? ("success" as const) : ("warning" as const) },
    { key: "error", label: "Error rate", value: `${stats.errorRate}%`, hint: `${stats.failedScans}/${stats.totalScans} scans`, icon: AlertCircle, tone: stats.errorRate > 0 ? ("destructive" as const) : ("success" as const) },
    { key: "p95", label: "p95 latency", value: fmtMs(stats.p95), hint: `p50 ${fmtMs(stats.p50)}`, icon: Timer, tone: "info" as const },
  ];

  const toneCls: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning dark:text-warning",
    info: "bg-info/10 text-info",
    destructive: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-4">
      {/* Golden-signal KPIs */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.key} className="relative overflow-hidden">
            <div aria-hidden="true" className={cn("pointer-events-none absolute -top-8 -right-6 size-20 rounded-full blur-2xl", toneCls[k.tone].split(" ")[0])} />
            <CardContent className="relative space-y-1.5 py-4">
              <div className="flex items-center justify-between gap-2">
                <span className="type-label truncate text-muted-foreground">{k.label}</span>
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", toneCls[k.tone])}>
                  <k.icon className="size-3.5" aria-hidden="true" />
                </span>
              </div>
              {loading ? <Skeleton className="h-7 w-16" /> : <p className="font-semibold text-xl tracking-tight tabular-nums sm:text-2xl">{k.value}</p>}
              <p className="truncate text-muted-foreground text-xs">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Scan over time (labels-style interactive bar, by day) + latency gauge */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <Card className="gap-0 border-border/60 py-0 lg:col-span-2">
          <CardHeader className="flex flex-col items-stretch border-b !p-0 sm:flex-row">
            <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:pb-4">
              <CardTitle className="type-card-title">Scan activity</CardTitle>
              <CardDescription>Daily totals for the selected range</CardDescription>
            </div>
            <div className="flex">
              {(Object.keys(dayBarConfig) as DayMetric[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMetric(k)}
                  data-active={metric === k}
                  className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-5"
                >
                  <span className="text-muted-foreground text-xs">{dayBarConfig[k].label}</span>
                  <span className="font-bold text-lg leading-none tabular-nums sm:text-2xl">{loading ? "—" : dayTotals[k]}</span>
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:p-6">
            {loading ? (
              <Skeleton className="h-[230px] w-full" />
            ) : trend.length === 0 ? (
              <EmptyChart />
            ) : (
              <ChartContainer config={dayBarConfig} className="aspect-auto h-[230px] w-full">
                <BarChart accessibilityLayer data={trend} margin={{ left: 12, right: 12 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={dayTick} className="text-xs" />
                  <ChartTooltip
                    cursor={{ fill: "var(--primary)", fillOpacity: 0.06, radius: 4 }}
                    content={<ChartTooltipContent className="w-40" labelFormatter={dayLabel} />}
                  />
                  <Bar dataKey={metric} fill={`var(--color-${metric})`} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Latency gauge gadget */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Avg latency</CardTitle>
            <p className="text-muted-foreground text-sm">Across all providers.</p>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            {loading ? (
              <Skeleton className="h-[150px] w-full" />
            ) : (
              <LatencyGauge value={stats.avgLatency} p95={stats.p95} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* OCR latency trend + provider latency */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">OCR latency</CardTitle>
            <p className="text-muted-foreground text-sm">Average processing time by day.</p>
          </CardHeader>
          <CardContent className="px-2 sm:px-4">
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : trend.length === 0 ? (
              <EmptyChart />
            ) : (
              <ChartContainer config={latencyConfig} className="aspect-auto h-[200px] w-full">
                <AreaChart data={trend} margin={{ left: 4, right: 4, top: 8 }}>
                  <defs>
                    <linearGradient id="fillLatency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={dayTick} className="text-xs" />
                  <ChartTooltip
                    cursor={{ stroke: "var(--primary)", strokeOpacity: 0.2 }}
                    content={<ChartTooltipContent labelFormatter={dayLabel} />}
                  />
                  <Area dataKey="latency" type="monotone" stroke="var(--primary)" strokeWidth={2} fill="url(#fillLatency)" />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Per-provider latency */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latency by provider</CardTitle>
            <p className="text-muted-foreground text-sm">Qwen (local) vs OpenAI (fallback).</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProviderLatency label="Qwen 2.5-VL" sub="local" stat={stats.qwen} tone="primary" loading={loading} />
            <ProviderLatency label="OpenAI" sub="fallback" stat={stats.openai} tone="info" loading={loading} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── Radial latency gauge (single-threshold gadget) ── */
function LatencyGauge({ value, p95 }: { value: number; p95: number }) {
  const max = Math.max(6000, Math.ceil(p95 / 1000) * 1000);
  const pct = Math.min(value / max, 1);
  // Semicircle arc from (18,100) to (182,100), radius 82.
  const len = Math.PI * 82;
  const offset = len * (1 - pct);
  return (
    <div className="flex w-full flex-col items-center py-1">
      <div className="relative w-full max-w-[220px]">
        <svg viewBox="0 0 200 108" className="w-full" role="img" aria-label={`Average latency ${fmtMs(value)}`}>
          <path d="M18 100 A82 82 0 0 1 182 100" fill="none" className="stroke-muted" strokeWidth={13} strokeLinecap="round" />
          <path
            d="M18 100 A82 82 0 0 1 182 100"
            fill="none"
            className={cn(latStrokeCls(value), "transition-[stroke-dashoffset] duration-700 ease-out")}
            strokeWidth={13}
            strokeLinecap="round"
            strokeDasharray={len}
            style={{ strokeDashoffset: offset }}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className={cn("font-bold text-3xl tracking-tight tabular-nums", latToneCls(value))}>{fmtMs(value)}</span>
          <span className="text-muted-foreground text-xs">average</span>
        </div>
      </div>
      <div className="mt-3 flex w-full max-w-[220px] items-center justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span className="rounded bg-muted px-1.5 py-0.5">p95 {fmtMs(p95)}</span>
        <span>{fmtMs(max)}</span>
      </div>
    </div>
  );
}

function ProviderLatency({
  label,
  sub,
  stat,
  tone,
  loading,
}: {
  label: string;
  sub: string;
  stat: { count: number; avg: number; p95: number };
  tone: "primary" | "info";
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border bg-gradient-to-br from-muted/30 to-transparent p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-medium text-sm">
          <Cpu className={cn("size-3.5", tone === "primary" ? "text-primary" : "text-info")} aria-hidden="true" />
          {label}
          <span className="text-muted-foreground text-xs">· {sub}</span>
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">{stat.count} events</span>
      </div>
      {loading ? (
        <Skeleton className="h-6 w-full" />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-background px-2 py-1.5 text-center">
            <p className="type-label text-muted-foreground">Avg</p>
            <p className="font-semibold text-sm tabular-nums">{fmtMs(stat.avg)}</p>
          </div>
          <div className="rounded-md bg-background px-2 py-1.5 text-center">
            <p className="type-label text-muted-foreground">p95</p>
            <p className="font-semibold text-sm tabular-nums">{stat.p95 ? fmtMs(stat.p95) : "—"}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="grid h-[180px] place-items-center rounded-lg border border-dashed text-center text-muted-foreground text-sm">
      No scans in this window yet.
    </div>
  );
}
