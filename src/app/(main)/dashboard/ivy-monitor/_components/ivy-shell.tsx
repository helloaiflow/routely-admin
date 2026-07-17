"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  Search,
  Timer,
  User,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { type DateRange, DateRangePicker } from "@/components/ui/date-range-picker";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { etAddDays, etDayEndUtc, etDayKey, etDayStartUtc, etToday, localYmd } from "@/lib/et-time";
import { cn } from "@/lib/utils";

import { fmtMs, type IvyResponse, type IvyScan, type IvyStatus, relTime } from "../../ocr-monitor/_components/types";

const sod = (d: Date) => {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
};
/** Default filter window — last 30 days, so the monitor always opens with data. */
const defaultRange = (): DateRange => {
  const to = sod(new Date());
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from, to, label: "Last 30 Days" };
};

const META: Record<IvyStatus, { label: string; cls: string; dot: string; Icon: React.ElementType }> = {
  success: { label: "Success", cls: "bg-success/10 text-success border-success/25", dot: "bg-success", Icon: CheckCircle2 },
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive border-destructive/25", dot: "bg-destructive", Icon: AlertTriangle },
  processing: { label: "Processing", cls: "bg-info/10 text-info border-info/25", dot: "bg-info", Icon: Loader2 },
};

const chartConfig = {
  success: { label: "Success", color: "var(--primary)" },
  failed: { label: "Failed", color: "var(--destructive)" },
} satisfies ChartConfig;
type DayMetric = "success" | "failed";

// Day bucketing is pinned to Eastern Time (Routely is a FL operation) so the
// report matches ET calendar days regardless of the UTC server/DB.
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : etDayKey(d);
};
const dayTick = (v: string) =>
  new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

export function IvyShell() {
  const [data, setData] = useState<IvyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange);
  const [live, setLive] = useState(true);
  const [lastSync, setLastSync] = useState(Date.now());
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | IvyStatus>("");
  const [dayMetric, setDayMetric] = useState<DayMetric>("success");
  const [labelScan, setLabelScan] = useState<IvyScan | null>(null);
  const [chartScans, setChartScans] = useState<IvyScan[]>([]);

  // Convert the picked calendar days into ET day boundaries (as UTC instants) so
  // the SELECT window matches Eastern-Time days, not UTC.
  const fromIso = etDayStartUtc(localYmd(dateRange.from)).toISOString();
  const toIso = etDayEndUtc(localYmd(dateRange.to)).toISOString();

  const fetchData = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const r = await fetch(`/api/client/ivy-scans?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (!d.error) {
          setData(d as IvyResponse);
          setLastSync(Date.now());
        }
      } catch {
        /* keep last good */
      } finally {
        setLoading(false);
      }
    },
    [fromIso, toIso],
  );

  // The Scan-activity chart always shows a continuous last-30-days window, so it
  // fetches its own 30-day slice independent of the top date filter.
  const fetchChart = useCallback(async () => {
    const to = new Date();
    const from = etDayStartUtc(etAddDays(etToday(), -29)); // ET: 30 days back
    try {
      const r = await fetch(`/api/client/ivy-scans?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!d.error) setChartScans((d.scans ?? []) as IvyScan[]);
    } catch {
      /* keep last good */
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);
  useEffect(() => {
    void fetchChart();
  }, [fetchChart]);

  const liveRef = useRef(live);
  liveRef.current = live;
  const fnRef = useRef(fetchData);
  fnRef.current = fetchData;
  const chartRef = useRef(fetchChart);
  chartRef.current = fetchChart;
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (liveRef.current) {
        void fnRef.current(true);
        void chartRef.current();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [live]);

  const t = data?.totals;
  const scans = useMemo(() => data?.scans ?? [], [data?.scans]);

  // Continuous last-30-days series (fills empty days with 0) so the chart always
  // spans a full 30 columns regardless of the selected filter.
  const trend = useMemo(() => {
    const map = new Map<string, { success: number; failed: number }>();
    for (const s of chartScans) {
      const k = dayKey(s.started_at);
      if (!k) continue;
      const slot = map.get(k) ?? { success: 0, failed: 0 };
      if (s.status === "success") slot.success += 1;
      else if (s.status === "failed") slot.failed += 1;
      map.set(k, slot);
    }
    const out: { date: string; success: number; failed: number }[] = [];
    let key = etAddDays(etToday(), -29); // ET day, 30 days back
    for (let i = 0; i < 30; i++) {
      const v = map.get(key) ?? { success: 0, failed: 0 };
      // Noon-UTC anchor of the ET day → renders on the right ET calendar day.
      out.push({ date: `${key}T12:00:00.000Z`, ...v });
      key = etAddDays(key, 1);
    }
    return out;
  }, [chartScans]);

  const dayTotals = useMemo(
    () => ({ success: trend.reduce((a, b) => a + b.success, 0), failed: trend.reduce((a, b) => a + b.failed, 0) }),
    [trend],
  );

  // ── Logistics rollups (routes, destinations, throughput) ──
  const logistics = useMemo(() => {
    const routes = new Map<string, { total: number; success: number; failed: number }>();
    const cities = new Map<string, number>();
    const times: number[] = [];
    let delivered = 0;
    for (const s of scans) {
      const rk = (s.route || "Unrouted").toUpperCase();
      const r = routes.get(rk) ?? { total: 0, success: 0, failed: 0 };
      r.total += 1;
      if (s.status === "success") r.success += 1;
      else if (s.status === "failed") r.failed += 1;
      routes.set(rk, r);

      const city = (s.city || "").trim();
      if (city) cities.set(city, (cities.get(city) ?? 0) + 1);
      if (s.processing_time_ms > 0) times.push(s.processing_time_ms);
      if (s.stop_id) delivered += 1;
    }
    const routeList = [...routes.entries()]
      .map(([name, v]) => ({ name, ...v, rate: v.total ? Math.round((v.success / v.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);
    const cityList = [...cities.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
    const byDay = new Map<string, number>();
    for (const s of scans) {
      const k = dayKey(s.started_at);
      if (k) byDay.set(k, (byDay.get(k) ?? 0) + 1);
    }
    const peak = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    const activeDays = byDay.size || 1;
    return {
      routeList,
      cityList,
      delivered,
      fastest: times.length ? Math.min(...times) : 0,
      perDay: Math.round(scans.length / activeDays),
      peakDay: peak ? { date: peak[0], n: peak[1] } : null,
      routeMax: routeList.length ? routeList[0].total : 1,
    };
  }, [scans]);

  const filtered = useMemo(() => {
    let list = statusFilter ? scans.filter((s) => s.status === statusFilter) : scans;
    const term = q.trim().toLowerCase();
    if (term)
      list = list.filter((s) =>
        [s.recipient, s.address, s.phone, s.stop_id, s.rx_pharma_id, s.error_stage, s.error_message]
          .join(" ")
          .toLowerCase()
          .includes(term),
      );
    return list;
  }, [scans, statusFilter, q]);

  const recent = useMemo(() => scans.slice(0, 5), [scans]);

  const failStages = t ? Object.entries(t.failuresByStage).sort((a, b) => b[1] - a[1]) : [];
  const topStage = failStages[0]?.[0];

  const ceoCard = "@container/card border-0 bg-gradient-to-t from-primary/5 to-card shadow-xs ring-1 ring-foreground/10";

  const kpis = [
    {
      key: "total",
      label: "IVY scans",
      value: t ? t.total.toLocaleString() : "—",
      icon: Cpu,
      footer: `${logistics.perDay}/day average`,
      sub: "Telegram → OCR → Spoke",
    },
    {
      key: "ok",
      label: "Success rate",
      value: t ? `${t.successRate}%` : "—",
      icon: CheckCircle2,
      action:
        t && t.total > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-1.5 py-0.5 font-medium text-success text-xs">
            {t.success} ok
          </span>
        ) : null,
      footer: t ? `${t.success} of ${t.total} completed` : "—",
      sub: "End to end, no failures",
    },
    {
      key: "failed",
      label: "Failed",
      value: t ? String(t.failed) : "—",
      icon: AlertTriangle,
      action:
        t && t.failed > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive text-xs">
            {topStage ?? "error"}
          </span>
        ) : null,
      footer: t && t.failed > 0 ? "Broke before Spoke" : "No failures in range",
      sub: "Never reached delivery",
    },
    {
      key: "proc",
      label: "In process",
      value: t ? String(t.processing) : "—",
      icon: Clock,
      footer: t && t.processing > 0 ? "Awaiting Spoke" : "Nothing in flight",
      sub: "Currently running",
    },
    {
      key: "avg",
      label: "Avg time",
      value: t ? fmtMs(t.avgMs) : "—",
      icon: Timer,
      footer: `Fastest ${t ? fmtMs(logistics.fastest) : "—"}`,
      sub: "Scan to Spoke handoff",
    },
  ];

  return (
    <div className="@container/main w-full space-y-4 px-4 py-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Cpu className="size-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="type-page-title">IVY DataEntry</h1>
            <p className="type-desc mt-0.5">Telegram → OCR → Spoke pipeline · success, failures &amp; where they broke</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setLive((v) => !v)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-medium text-xs transition-colors",
            live ? "border-success/30 bg-success/10 text-success" : "border-border bg-background text-muted-foreground hover:bg-muted",
          )}
          aria-pressed={live}
        >
          <span className="relative flex size-2">
            {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />}
            <span className={cn("relative inline-flex size-2 rounded-full", live ? "bg-success" : "bg-muted-foreground")} />
          </span>
          {live ? "Live" : "Paused"}
        </button>

        <DateRangePicker value={dateRange} onChange={setDateRange} />

        <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => void fetchData()} disabled={loading}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden="true" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <div className="flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="scans" className="gap-1.5">
              Scans
              {scans.length > 0 && (
                <Badge className="h-4 min-w-4 justify-center rounded-full border-transparent bg-primary px-1 text-[10px] text-white tabular-nums">
                  {scans.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <span className="hidden text-muted-foreground text-xs sm:inline">
            Synced {new Date(lastSync).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </div>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-3 space-y-4">
          {/* KPI cards — Labels style */}
          <div className="grid grid-cols-2 gap-4 @xl/main:grid-cols-3 @5xl/main:grid-cols-5">
            {kpis.map((c) => (
              <Card key={c.key} className={ceoCard}>
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5">
                    <c.icon className="size-3.5 text-primary/70" aria-hidden="true" />
                    {c.label}
                  </CardDescription>
                  {loading && !data ? (
                    <Skeleton className="mt-1 h-7 w-16" />
                  ) : (
                    <CardTitle className="font-semibold text-2xl tabular-nums">{c.value}</CardTitle>
                  )}
                  {c.action && <CardAction>{c.action}</CardAction>}
                </CardHeader>
                <CardFooter className="flex-col items-start gap-0.5 text-sm">
                  <div className="line-clamp-1 font-medium">{c.footer}</div>
                  <div className="text-muted-foreground text-xs">{c.sub}</div>
                </CardFooter>
              </Card>
            ))}
          </div>

          {/* Full-width Scan activity chart — Labels/OCR interactive-bar pattern */}
          <Card className="gap-0 border-border/60 py-0">
            <CardHeader className="flex flex-col items-stretch border-b !p-0 sm:flex-row">
              <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:pb-4">
                <CardTitle className="type-card-title">Scan activity</CardTitle>
                <CardDescription>Daily volume for the selected range</CardDescription>
              </div>
              <div className="flex">
                {(["success", "failed"] as DayMetric[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDayMetric(k)}
                    data-active={dayMetric === k}
                    className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-5"
                  >
                    <span className="text-muted-foreground text-xs">{chartConfig[k].label}</span>
                    <span className="font-bold text-lg leading-none tabular-nums sm:text-2xl">{loading && !data ? "—" : dayTotals[k]}</span>
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:p-6">
              {loading && !data ? (
                <Skeleton className="h-[230px] w-full" />
              ) : trend.length === 0 ? (
                <EmptyChart />
              ) : (
                <ChartContainer config={chartConfig} className="aspect-auto h-[230px] w-full">
                  <BarChart accessibilityLayer data={trend} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid vertical={false} strokeOpacity={0.25} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={dayTick} />
                    <ChartTooltip cursor={{ fill: "var(--primary)", fillOpacity: 0.06, radius: 4 }} content={<ChartTooltipContent className="w-40" />} />
                    <Bar dataKey={dayMetric} fill={`var(--color-${dayMetric})`} radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Quick-access grid — 4 equal cards, Labels style */}
          <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            {/* Recent scans */}
            <Card className={ceoCard}>
              <CardHeader>
                <CardTitle className="type-card-title">Recent scans</CardTitle>
                <CardDescription>Last {recent.length || 0} in range</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {recent.length === 0 && <p className="type-desc">Nothing yet.</p>}
                {recent.map((s) => {
                  const m = META[s.status];
                  return (
                    <button
                      key={s.rtscan_id}
                      type="button"
                      onClick={() => setLabelScan(s)}
                      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <span className={cn("grid size-7 shrink-0 place-items-center rounded-md border", m.cls)}>
                        <m.Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[13px]">{s.recipient || "Unknown"}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{s.stop_id || s.address || "—"}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{relTime(s.started_at)}</span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Deliveries by route */}
            <Card className={ceoCard}>
              <CardHeader>
                <CardTitle className="type-card-title flex items-center gap-1.5">
                  <Navigation className="size-3.5 text-primary" aria-hidden="true" />
                  Deliveries by route
                </CardTitle>
                <CardDescription>Volume &amp; success per route</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {logistics.routeList.length === 0 && <p className="type-desc">Nothing yet.</p>}
                {logistics.routeList.slice(0, 5).map((r) => (
                  <div key={r.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="truncate font-medium">{r.name}</span>
                      <span className="shrink-0 tabular-nums">
                        {r.total} <span className="font-normal text-muted-foreground">· {r.rate}%</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.round((r.total / logistics.routeMax) * 100))}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* By status */}
            <Card className={ceoCard}>
              <CardHeader>
                <CardTitle className="type-card-title">By status</CardTitle>
                <CardDescription>All scans in range</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {([
                  { k: "success" as const, label: "Success", n: t?.success ?? 0 },
                  { k: "failed" as const, label: "Failed", n: t?.failed ?? 0 },
                  { k: "processing" as const, label: "In process", n: t?.processing ?? 0 },
                ]).map((row) => (
                  <div key={row.k} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", META[row.k].dot)} aria-hidden="true" />
                      {row.label}
                    </span>
                    <span className="font-semibold tabular-nums">{row.n}</span>
                  </div>
                ))}
                <div className="!mt-3 border-t pt-2.5">
                  <div className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="text-muted-foreground">Success rate</span>
                    <span className="font-semibold text-primary tabular-nums">{t?.successRate ?? 0}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${t?.successRate ?? 0}%` }} />
                  </div>
                </div>
                {failStages.length > 0 && (
                  <div className="!mt-3 space-y-1.5 border-t pt-2.5">
                    <span className="type-label text-muted-foreground">Where it broke</span>
                    {failStages.map(([stage, n]) => (
                      <div key={stage} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          <span className="size-1.5 rounded-full bg-destructive" aria-hidden="true" />
                          {stage}
                        </span>
                        <span className="font-medium tabular-nums">{n}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top destinations */}
            <Card className={ceoCard}>
              <CardHeader>
                <CardTitle className="type-card-title flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-primary" aria-hidden="true" />
                  Top destinations
                </CardTitle>
                <CardDescription>Busiest cities in range</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {logistics.cityList.length === 0 && <p className="type-desc">No cities yet.</p>}
                {logistics.cityList.slice(0, 5).map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span className="grid size-5 shrink-0 place-items-center rounded bg-muted font-semibold text-[10px] text-muted-foreground tabular-nums">{i + 1}</span>
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{c.n}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

          </div>
        </TabsContent>

        {/* ── Scans ── */}
        <TabsContent value="scans" className="mt-3">
          {/* Toolbar + table live in ONE card so the filters read as part of the
              content, not floating in the page's gray background. */}
          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-3">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipient, address, stop, error…" className="h-9 border-border bg-muted/40 pl-8" />
              </div>
              <div className="flex gap-1">
                {([{ k: "", l: "All" }, { k: "success", l: "Success" }, { k: "failed", l: "Failed" }, { k: "processing", l: "In process" }] as const).map((f) => (
                  <button
                    key={f.k || "all"}
                    type="button"
                    onClick={() => setStatusFilter(f.k as "" | IvyStatus)}
                    className={cn(
                      "h-9 rounded-md border px-3 font-medium text-xs transition-colors",
                      statusFilter === f.k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {f.l}
                  </button>
                ))}
              </div>
            </div>
            <IvyGrid scans={filtered} loading={loading && !data} empty={scans.length === 0} onLabel={setLabelScan} embedded />
          </Card>
        </TabsContent>

        {/* ── Activity ── */}
        <TabsContent value="activity" className="mt-3">
          <IvyActivity scans={scans} loading={loading && !data} />
        </TabsContent>
      </Tabs>

      <LabelDialog scan={labelScan} onClose={() => setLabelScan(null)} />
    </div>
  );
}

/* ── Label preview popup (blue-accented, no page nav) ── */
function LabelDialog({ scan, onClose }: { scan: IvyScan | null; onClose: () => void }) {
  const meta = scan ? META[scan.status] : null;
  return (
    <Dialog open={!!scan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0" showCloseButton>
        {scan && meta && (
          <>
            <div className="flex items-start gap-3 border-b bg-primary/5 px-5 py-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <ImageIcon className="size-4.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-sm">{scan.recipient || "Label scan"}</p>
                <p className="truncate text-muted-foreground text-xs">{scan.address || "—"}</p>
              </div>
              <Badge variant="outline" className={cn("gap-1.5 capitalize", meta.cls)}>
                <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden="true" />
                {meta.label}
              </Badge>
            </div>

            <div className="grid place-items-center bg-muted/30 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scan.image_url}
                alt={`Label for ${scan.recipient || scan.rtscan_id}`}
                className="max-h-[52vh] w-auto rounded-lg border bg-background object-contain shadow-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t px-5 py-4 text-sm">
              <DetailRow label="Stop" value={scan.stop_id || "—"} mono />
              <DetailRow label="Route" value={scan.route || "—"} />
              <DetailRow label="Rx / Pharma" value={scan.rx_pharma_id || "—"} mono />
              <DetailRow label="Phone" value={scan.phone || "—"} mono />
            </div>

            <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-5 py-3">
              <span className="text-muted-foreground text-xs">
                {relTime(scan.started_at)}
                {scan.processing_time_ms > 0 ? ` · ${fmtMs(scan.processing_time_ms)}` : ""}
              </span>
              <div className="flex items-center gap-2">
                {scan.stop_id && (
                  <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                    <a href={`/dashboard/stops?q=${encodeURIComponent(scan.stop_id)}`}>
                      View stop
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  </Button>
                )}
                <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
                  <a href={scan.image_url} target="_blank" rel="noreferrer">
                    Open original
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="type-label text-muted-foreground">{label}</p>
      <p className={cn("truncate font-medium", mono && "font-mono text-xs tabular-nums")} title={value}>
        {value}
      </p>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="grid h-[200px] place-items-center rounded-lg border border-dashed text-center text-muted-foreground text-sm">
      No IVY scans in this window yet.
    </div>
  );
}

function IvyGrid({ scans, loading, empty, onLabel, embedded }: { scans: IvyScan[]; loading: boolean; empty: boolean; onLabel: (s: IvyScan) => void; embedded?: boolean }) {
  if (loading) {
    const sk = (
      <div className="space-y-2 p-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={`sk-${i}`} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
    return embedded ? sk : <Card>{sk}</Card>;
  }
  if (scans.length === 0) {
    const msg = (
      <div className="py-16 text-center text-muted-foreground text-sm">
        {empty ? "No IVY scans in this window." : "No matches for this filter."}
      </div>
    );
    return embedded ? msg : <Card><CardContent className="p-0">{msg}</CardContent></Card>;
  }
  const grid = (
    <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="type-label">Status</TableHead>
                <TableHead className="type-label">Recipient</TableHead>
                <TableHead className="type-label">Address</TableHead>
                <TableHead className="type-label">Phone</TableHead>
                <TableHead className="type-label">Result</TableHead>
                <TableHead className="type-label">Stop</TableHead>
                <TableHead className="type-label text-center">Label</TableHead>
                <TableHead className="type-label text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scans.map((s) => {
                const meta = META[s.status];
                return (
                  <TableRow key={s.rtscan_id}>
                    <TableCell>
                      <Badge variant="outline" className={cn("gap-1.5 capitalize", meta.cls)}>
                        <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden="true" />
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {s.recipient ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-sm">
                          <User className="size-3.5 text-muted-foreground" aria-hidden="true" />
                          {s.recipient}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <span className="block truncate text-muted-foreground text-sm" title={s.address}>
                        {s.address || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {s.phone ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums">
                          <Phone className="size-3 text-muted-foreground" aria-hidden="true" />
                          {s.phone}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {s.status === "failed" ? (
                        <span className="block truncate text-destructive text-xs" title={s.error_message}>
                          {s.error_stage ? <span className="font-medium">{s.error_stage}</span> : null}
                          {s.error_message ? ` · ${s.error_message}` : s.error_stage ? "" : "failed"}
                        </span>
                      ) : s.status === "success" ? (
                        <span className="text-success text-xs">completed</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">{s.stage || "in flight"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.stop_id ? (
                        <a href={`/dashboard/stops?q=${encodeURIComponent(s.stop_id)}`} className="inline-flex items-center gap-1 font-mono text-primary text-xs tabular-nums hover:underline">
                          {s.stop_id.replace(/^RTL-/, "").slice(-8)}
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {s.image_url ? (
                        <button
                          type="button"
                          onClick={() => onLabel(s)}
                          className="inline-grid size-7 place-items-center rounded-md text-primary transition-colors hover:bg-primary/10"
                          aria-label="View label image"
                        >
                          <ImageIcon className="size-4" aria-hidden="true" />
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm whitespace-nowrap">{relTime(s.started_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
    </div>
  );
  return embedded ? grid : (
    <Card className="overflow-hidden">
      <CardContent className="p-0">{grid}</CardContent>
    </Card>
  );
}

function IvyActivity({ scans, loading }: { scans: IvyScan[]; loading: boolean }) {
  if (loading)
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={`ak-${i}`} className="h-14 w-full" />
        ))}
      </div>
    );
  if (scans.length === 0)
    return (
      <Card>
        <CardContent className="py-14 text-center text-muted-foreground text-sm">No activity in this window.</CardContent>
      </Card>
    );
  return (
    <Card>
      <CardContent className="py-2">
        <div className="divide-y divide-border/50">
          {scans.slice(0, 100).map((s) => {
            const meta = META[s.status];
            return (
              <div key={s.rtscan_id} className="flex items-center gap-3 py-2.5">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", meta.cls)}>
                  <meta.Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-medium capitalize">{meta.label}</span>
                    {s.recipient ? <span className="text-muted-foreground"> · {s.recipient}</span> : null}
                  </p>
                  <p className="truncate text-muted-foreground text-xs">
                    {s.status === "failed"
                      ? `${s.error_stage || "failed"}${s.error_message ? ` — ${s.error_message}` : ""}`
                      : s.address || s.stage || "—"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {s.stop_id && <p className="font-mono text-primary text-xs tabular-nums">{s.stop_id.replace(/^RTL-/, "")}</p>}
                  <p className="text-muted-foreground text-xs tabular-nums">{relTime(s.started_at)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
