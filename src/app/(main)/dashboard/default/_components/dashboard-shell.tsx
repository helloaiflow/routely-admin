"use client";

import { useCallback, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  Package,
  Share2,
  Truck,
  XCircle,
} from "lucide-react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DateRange } from "@/components/ui/date-range-picker";
import { DateRangePicker, todayRange } from "@/components/ui/date-range-picker";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRoutelyRealtime } from "@/hooks/use-routely-realtime";
import { phaseOf } from "@/lib/status";
import { cn } from "@/lib/utils";

import { formatEta, statusLabel, statusTone, toneClasses } from "./_helpers";
import type { DashboardData, DashboardStop } from "./_types";
import { DeliveryStatusCard } from "./delivery-status-card";
import { NeedsAttentionCard } from "./needs-attention-card";
import { OpsMetricStrip } from "./ops-metric-strip";
import { StopMixCard } from "./stop-mix-card";
import { ZonesCapacityCard } from "./zones-capacity-card";
import { StopsOverviewChart } from "./stops-overview-chart";
import { StopEditSheet } from "./stop-edit-sheet";
import { StopsCard } from "./stops-card";
import { StopsTable } from "./stops-table";

const fetcher = async (url: string): Promise<DashboardData> => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

function toYmd(d: Date) {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

type Tab = "overview" | "stops" | "activities";
const DASHBOARD_REALTIME_TABLES = ["stops", "draft_stops"] as const;

// ── Share / screenshot ──────────────────────────────────────────────────
async function shareDashboard(el: HTMLElement | null) {
  if (!el) return;
  try {
    // Dynamic import so html2canvas only loads when needed
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(el, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false,
    });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `routely-dashboard-${new Date().toISOString().split("T")[0]}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  } catch {
    // Fallback: window.print()
    window.print();
  }
}

// ── Activities feed ──────────────────────────────────────────────────────
function ActivitiesFeed({ stops, loading }: { stops: DashboardStop[]; loading: boolean }) {
  // Classification via the canonical, Spoke-boolean classifier (lib/status.ts) —
  // same source of truth as KPIs / Sankey / the monitor.
  function iconFor(s: DashboardStop) {
    const p = phaseOf(s);
    if (p === "delivered")
      return {
        el: <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />,
        bg: "bg-emerald-50 dark:bg-emerald-900/30",
      };
    if (p === "failed")
      return {
        el: <XCircle className="size-4 text-rose-500 dark:text-rose-400" />,
        bg: "bg-rose-50 dark:bg-rose-900/30",
      };
    if (p === "in_motion")
      return {
        el: <Truck className="size-4 text-blue-500 dark:text-blue-400" />,
        bg: "bg-blue-50 dark:bg-blue-900/30",
      };
    return { el: <Package className="size-4 text-muted-foreground" />, bg: "bg-muted" };
  }

  function msgFor(s: DashboardStop) {
    const p = phaseOf(s);
    if (p === "delivered") return `Delivered to ${s.recipient_name || "recipient"}`;
    if (p === "failed") return `Failed — ${s.recipient_name || "stop"}`;
    if (p === "in_motion") return `In transit to ${s.recipient_name || "recipient"}`;
    return `Stop created for ${s.recipient_name || "recipient"}`;
  }

  const recent = [...stops]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 30);

  if (loading) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        {["a", "b", "c", "d", "e", "f"].map((k) => (
          <div key={k} className="flex items-center gap-3">
            <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted/70" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-border border-b px-4 py-3">
        <h3 className="font-semibold text-foreground text-sm">Recent Activity</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
          {recent.length} events
        </span>
      </div>
      <div className="divide-y divide-border/50">
        {recent.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground/50 text-sm">No activity today</div>
        ) : (
          recent.map((s) => {
            const { el, bg } = iconFor(s);
            const tone = toneClasses[statusTone(s.status)];
            return (
              <div key={s.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/20">
                <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", bg)}>
                  {el}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground text-sm">{msgFor(s)}</p>
                  <p className="mt-0.5 truncate text-muted-foreground text-xs">
                    {[s.delivery_address, s.delivery_city].filter(Boolean).join(", ")}
                  </p>
                  {/* Tracking number */}
                  <p className="mt-0.5 font-medium font-mono text-[10px] text-primary/70">
                    {s.stop_id ?? s.id?.slice(-12).toUpperCase() ?? "—"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={cn("rounded-full px-2 py-0.5 font-semibold text-[10px]", tone.bg, tone.text)}>
                    {statusLabel(s.status)}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                    <Clock className="size-2.5" />
                    {formatEta(s.delivery_date, s.is_same_day)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Main shell ───────────────────────────────────────────────────────────
export function DashboardShell() {
  const [tab, setTab] = useState<Tab>("overview");
  const [editStopId, setEditStopId] = useState<string | null>(null);
  // Default range = rolling last 7 days (CEO, 2026-09-01) — always opens
  // with data, and every card (KPIs, chart, disposition, zone) reads the
  // SAME filter.
  // Default range: Today (CEO, 2026-09-01 — supersedes the Last-7-Days call
  // from earlier the same day; single-day KPIs + the trend still charts 30d).
  const [dateRange, setDateRange] = useState<DateRange>(todayRange);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Build URL — SWR refetches automatically when dateRange changes
  const apiUrl = `/api/client/dashboard?from=${toYmd(dateRange.from)}&to=${toYmd(dateRange.to)}`;

  const { data, error, isLoading, mutate } = useSWR<DashboardData>(apiUrl, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  useRoutelyRealtime({
    channelName: "dashboard-default",
    tables: DASHBOARD_REALTIME_TABLES,
    onChange: () => {
      void mutate();
    },
    refreshOnVisible: true,
  });

  const loading = isLoading && !data;
  const showStaleBanner = Boolean(error && data);
  const allStops = data?.stops ?? [];

  // "Today's Stops" = the server's real total (CEO 2026-07-13). The previous
  // local override excluded the UNCONFIRMED set (phaseOf === "pre"), which made
  // the card read "0" while the Sankey/pct — fed by the same endpoint — showed
  // 28 and "+100%". One number, one source of truth; the pipeline chart already
  // breaks down confirmed vs pre-dispatch for whoever needs that split.
  const kpis = data?.kpis;

  // Routes is not built yet → rendered present but disabled "Soon" (same pattern
  // as the sidebar Analytics/Routes) so the tab never 404s.
  // `count` (optional) renders a live badge on the trigger — Stops shows the
  // number of stops the tab lists (allStops).
  const TABS: { key: Tab | "routes"; label: string; Icon: typeof Package; soon?: boolean; count?: number }[] = [
    { key: "overview", label: "Overview", Icon: LayoutDashboard },
    { key: "stops", label: "Stops", Icon: Package, count: allStops.length },
    { key: "routes", label: "Routes", Icon: Truck, soon: true }, // Routes = the little truck
    { key: "activities", label: "Activities", Icon: Activity },
  ];

  const handleShare = useCallback(() => {
    shareDashboard(dashboardRef.current);
  }, []);

  return (
    <div ref={dashboardRef} className="@container/main flex flex-1 flex-col gap-3 p-3 md:gap-4 md:p-4">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="type-page-title text-foreground">Operations Dashboard</h1>
          <p className="hidden text-muted-foreground text-xs sm:block">
            Monitor volume, delivery performance, and exceptions across your network.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Live — reflects the REAL SWR refresh loop (30s interval +
            revalidate-on-focus + realtime mutate), not decoration. The
            tooltip carries the server's own generated_at timestamp. */}
          <span
            className="hidden items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 font-medium text-xs sm:flex"
            title={
              data?.generated_at
                ? `Auto-refreshing every 30s · last refresh ${new Date(data.generated_at).toLocaleTimeString()}`
                : "Auto-refreshing every 30s"
            }
          >
            <span
              className={cn("size-1.5 rounded-full", error ? "bg-amber-500" : "bg-emerald-500")}
              aria-hidden="true"
            />
            Live
          </span>
          {/* Date Range Picker */}
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          {/* Share — hidden on mobile */}
          <Button
            variant="outline"
            size="sm"
            className="hidden h-8 gap-1.5 font-medium text-xs sm:flex"
            onClick={handleShare}
          >
            <Share2 className="size-3.5" />
            Share
          </Button>
        </div>
      </div>

      {/* ── Tab nav — shadcn Tabs (dark-mode aware via its baked-in dark:
          variants). Controlled by `tab`; content still renders via the
          conditionals below (Tabs drives only the trigger highlight). Scrolls
          horizontally on narrow phones with a hidden scrollbar; Routes stays
          disabled without "Soon" text. */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="-mx-0.5 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <TabsList className="w-max">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              disabled={t.soon}
              title={t.soon ? "Routes — coming soon" : undefined}
              className="group shrink-0 gap-1.5 px-2.5 text-[13px] sm:px-3 sm:text-sm"
            >
              <t.Icon
                className={cn(
                  "size-3.5 transition-transform duration-200 ease-out",
                  // Tasteful aliveness: icon lifts/scales on hover; the active tab
                  // keeps a gentle settled scale. Routes (soon) stays still.
                  !t.soon && "group-hover:-translate-y-px group-hover:scale-110",
                  tab === t.key && "scale-110",
                )}
                aria-hidden="true"
              />
              {t.label}
              {t.count != null && t.count > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] tabular-nums leading-none"
                >
                  {t.count}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Stale banner */}
      {showStaleBanner && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-xs dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="size-3.5 shrink-0" />
          Showing last known data — refresh failed.
        </div>
      )}

      {/* ── KPI Cards — only on overview tab (per user feedback) ───────── */}
      {tab === "overview" && <OpsMetricStrip data={data} loading={loading} />}

      {/* ── Tab content ────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {tab === "overview" && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-3 md:gap-4"
          >
            {/*
              Command-center layout (CEO, 2026-09-01, reference image):
                1. KPI strip (above, outside this container)
                2. Main row 8/4 — Delivery flow + Needs attention
                3. Analytics row — Stop mix · Delivery status · Zones
                   (ranked/stacked BARS, no donuts, per the redesign spec)
                4. Special Handling table
            */}
            <div className="grid grid-cols-1 items-stretch gap-3 md:gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
              <StopsOverviewChart data={data} loading={loading} />
              <NeedsAttentionCard data={data} loading={loading} onGoToStops={() => setTab("stops")} />
            </div>

            <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3">
              <StopMixCard data={data} loading={loading} />
              <DeliveryStatusCard data={data} loading={loading} />
              <ZonesCapacityCard data={data} loading={loading} />
            </div>

            <StopsCard stops={data?.stops ?? []} loading={loading} />
          </motion.div>
        )}

        {tab === "stops" && (
          <motion.div
            key="stops"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {/* Side-by-side layout — the edit panel renders as a flex sibling on lg+
                so the grid stays visible and interactive. On mobile the panel becomes
                a fullscreen overlay (handled inside StopEditSheet). */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1">
                <StopsTable stops={allStops} loading={loading} onSelect={setEditStopId} selectedStopId={editStopId} />
              </div>
              <AnimatePresence>
                {editStopId && (
                  <StopEditSheet
                    key={editStopId}
                    stopId={editStopId}
                    onClose={() => setEditStopId(null)}
                    onUpdate={() => mutate()}
                  />
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {tab === "activities" && (
          <motion.div
            key="activities"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <ActivitiesFeed stops={allStops} loading={loading} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
