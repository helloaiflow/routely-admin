"use client";

import { BRAND_PRIMARY } from "@/lib/brand";

import { useMemo, useState } from "react";

import { TrendingUp } from "lucide-react";
import { Bar, BarChart, Cell, LabelList, RadialBar, RadialBarChart, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { DashboardStop } from "./_types";
// Canonical classification — Spoke's success boolean (lib/status.ts). "Processed"
// = reached a terminal phase (delivered OR failed) via isTerminal. Matches the
// KPIs / Sankey / monitor.
import { isDelivered, isFailed, isTerminal, phaseOf } from "@/lib/status";

// ── Brand blue derivatives ─────────────────────────────────────────────────
// All derived from the brand blue — tonal, harmonious, deep to light
const BLUE_SHADES = [
  "#0157D6", // deep
  BRAND_PRIMARY, // primary
  "#2E85FF", // mid
  "#5CA3FF", // soft
  "#8BBEFF", // light
];

// ── Deliveries By Location ─────────────────────────────────────────────────
interface LocationRow {
  city: string;
  address: string;
  count: number;
  pct: number;
}

const locationChartConfig: ChartConfig = {
  count: { label: "Deliveries", color: "var(--primary)" },
  label: { color: "var(--background)" },
};

export function DeliveriesByLocation({ stops, loading }: { stops: DashboardStop[]; loading: boolean }) {
  const rows = useMemo<LocationRow[]>(() => {
    const map = new Map<string, { city: string; address: string; count: number }>();
    for (const s of stops) {
      const key = s.delivery_city || s.delivery_zip || "Unknown";
      const existing = map.get(key);
      if (existing) {
        existing.count++;
      } else {
        map.set(key, {
          city: s.delivery_city || "Unknown",
          address: [s.delivery_city, s.delivery_state, s.delivery_zip].filter(Boolean).join(", "),
          count: 1,
        });
      }
    }
    const total = stops.length || 1;
    return [...map.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((r) => ({ ...r, pct: Math.round((r.count / total) * 100) }));
  }, [stops]);

  if (loading) {
    return (
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-semibold text-sm">Deliveries by Location</CardTitle>
          <CardDescription className="text-xs">Top delivery cities</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[180px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="font-semibold text-sm">Deliveries by Location</CardTitle>
        <CardDescription className="text-xs">
          {rows.length} cities · {stops.length} stops
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-2">
        {rows.length === 0 ? (
          <div className="flex h-[160px] items-center justify-center text-muted-foreground/40 text-sm">No data yet</div>
        ) : (
          <ChartContainer config={locationChartConfig} className="h-[180px] w-full">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ right: 16, left: 0, top: 2, bottom: 2 }}
              barCategoryGap="18%"
            >
              <YAxis dataKey="city" type="category" tickLine={false} axisLine={false} width={0} tick={false} />
              <XAxis dataKey="count" type="number" hide />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted) / 0.4)", radius: 6 }}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(value, _name, item) => (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-[11px] text-foreground">{item.payload.city}</span>
                        <span className="text-[10px] text-muted-foreground">{item.payload.address}</span>
                        <span className="font-bold text-[11px] text-foreground">
                          {value} stops · {item.payload.pct}%
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="count" radius={[0, 5, 5, 0]} maxBarSize={28}>
                {rows.map((row, i) => (
                  <Cell key={row.city} fill={BLUE_SHADES[i % BLUE_SHADES.length]} />
                ))}
                {/* City label — white inside bar, using shadcn fill-(--color-label) pattern */}
                <LabelList
                  dataKey="city"
                  position="insideLeft"
                  offset={10}
                  className="fill-(--color-label)"
                  fontSize={11}
                  fontWeight={500}
                  formatter={(v: unknown) => {
                    const s = String(v);
                    return s.length > 16 ? `${s.slice(0, 15)}…` : s;
                  }}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>

      {rows.length > 0 && (
        <CardFooter className="flex-col items-start gap-1 border-border/40 border-t bg-muted/10 px-4 pt-3 pb-4">
          <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
            Top {rows.length} cities cover {rows.reduce((a, r) => a + r.pct, 0)}% of deliveries
            <TrendingUp className="size-3.5 text-primary" />
          </div>
          <p className="text-[11px] text-muted-foreground">Based on {stops.length} stops this period</p>
        </CardFooter>
      )}
    </Card>
  );
}

// ── Stops By Disposition — Radial Bar Chart ────────────────────────────────
//
// Despite the original name (`StopsByType`), this chart visualizes the
// disposition / status mix (Delivered, In Transit, Pending, Failed, …).
// Renamed to `StopsByDisposition` so the real "by type" chart can take that
// name. The `StopsByType` export is preserved as an alias for any existing
// imports during the rollout.

// All-blue ramp — monochromatic gradient from saturated primary down to soft
// faded blues, per user feedback ("ponlo todo azul"). Brand consistency over
// hue variety; severity is conveyed via saturation, not by switching colors.
const DISPO_COLORS: Record<string, string> = {
  Delivered: BRAND_PRIMARY,
  "In Transit": "#2E85FF",
  Pending: "#5CA3FF",
  Failed: "#8BBEFF",
  Unassigned: "#B8D4FF",
  Cancelled: "#DCE9FF",
};
const DISPO_ORDER = ["Delivered", "In Transit", "Pending", "Failed", "Unassigned", "Cancelled"];

// Disposition label — TERMINAL decision (Delivered/Failed/Cancelled) is driven by
// the canonical Spoke-boolean classifier; the pre-terminal split (In Transit /
// Unassigned / Pending) and the failed sub-split (Cancelled/RTS vs Failed) are by
// internal status. So a delivered_to_safe_place lands in Delivered, a
// failed_not_home in Failed — consistently with the KPIs/Sankey/monitor.
function dispoLabel(s: DashboardStop): string {
  const p = phaseOf(s);
  const st = (s.status ?? "").toLowerCase();
  if (p === "delivered") return "Delivered";
  if (p === "failed") return st === "cancelled" || st === "return_to_sender" || st === "rts" ? "Cancelled" : "Failed";
  if (p === "in_motion") return "In Transit";
  return st === "unassigned" ? "Unassigned" : "Pending";
}

export function StopsByDisposition({ stops, loading }: { stops: DashboardStop[]; loading: boolean }) {
  const rows = useMemo(() => {
    const total = stops.length || 1;
    const counts = new Map<string, number>();
    for (const s of stops) {
      const label = dispoLabel(s);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return DISPO_ORDER.map((label) => ({
      label,
      count: counts.get(label) ?? 0,
      pct: Math.round(((counts.get(label) ?? 0) / total) * 100),
      fill: DISPO_COLORS[label],
    }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [stops]);

  const chartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    for (const r of rows) {
      cfg[r.label.toLowerCase().replace(/ /g, "_")] = {
        label: r.label,
        color: r.fill,
      };
    }
    return cfg;
  }, [rows]);

  const delivered = stops.filter((s) => isDelivered(s)).length;
  const failed = stops.filter((s) => isFailed(s)).length;
  const dPct = stops.length > 0 ? Math.round((delivered / stops.length) * 100) : 0;
  const fPct = stops.length > 0 ? Math.round((failed / stops.length) * 100) : 0;

  if (loading) {
    return (
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-semibold text-sm">Stops by Disposition</CardTitle>
          <CardDescription className="text-xs">Status breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="font-semibold text-sm">Stops by Disposition</CardTitle>
        <CardDescription className="text-xs">
          {stops.length > 0 ? `${dPct}% delivered · ${fPct}% failed · ${stops.length} total` : "Status breakdown"}
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-2">
        {rows.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-muted-foreground/40 text-sm">No data yet</div>
        ) : (
          <ChartContainer config={chartConfig} className="mx-auto h-[260px] w-full max-w-[340px]">
            <RadialBarChart
              data={rows}
              innerRadius="25%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              barSize={14}
            >
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, _name, item) => (
                      <div className="flex items-center gap-2 text-[11px]">
                        <span
                          className="inline-block size-2 shrink-0 rounded-full"
                          style={{ background: item.payload.fill }}
                        />
                        <span className="font-semibold text-foreground">{item.payload.label}</span>
                        <span className="text-muted-foreground">
                          — {value} stops ({item.payload.pct}%)
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <RadialBar
                dataKey="count"
                background={{ fill: "hsl(var(--muted) / 0.25)" }}
                cornerRadius={5}
                barSize={18}
              >
                <LabelList
                  position="insideStart"
                  dataKey="label"
                  className="fill-background"
                  fontSize={9}
                  fontWeight={600}
                  formatter={(v: unknown) => String(v)}
                />
              </RadialBar>
            </RadialBarChart>
          </ChartContainer>
        )}
      </CardContent>

      {rows.length > 0 && (
        <CardFooter className="flex-col items-start gap-2 border-border/40 border-t bg-muted/10 px-4 pt-3 pb-4">
          <div className="flex w-full flex-wrap gap-x-3 gap-y-1.5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center gap-1.5 text-[11px]">
                <span className="size-2 shrink-0 rounded-full" style={{ background: r.fill }} />
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-semibold text-foreground tabular-nums">{r.count}</span>
              </div>
            ))}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

// ── Stops By Type (real) — Delivery / Pickup / Dropoff ──────────────────────
//
// Operational breakdown of stops by `stop_type`. Pickups are internal
// courier legs (paired to deliveries) — invisible in lists/search per
// product decision, but counted here because they consume dispatch
// capacity. Compact horizontal-bar layout designed to sit next to the
// wider Special Handling card.

const TYPE_CONFIG: { key: "delivery" | "pickup" | "dropoff"; label: string; color: string; emoji: string }[] = [
  { key: "delivery", label: "Deliveries", color: BRAND_PRIMARY, emoji: "\uD83D\uDCE6" },
  { key: "pickup", label: "Pickups", color: "#5CA3FF", emoji: "\uD83D\uDCE5" },
  { key: "dropoff", label: "Dropoffs", color: "#2E85FF", emoji: "\uD83D\uDCEC" },
];

// ── Package config (full medical-courier set) ────────────────────────────
const PACKAGE_CONFIG: { key: string; label: string; color: string; emoji: string }[] = [
  { key: "rx", label: "Rx Prescription", color: "#0157D6", emoji: "\uD83D\uDC8A" },
  { key: "cold", label: "Cold Package", color: "#2E85FF", emoji: "\u2744\uFE0F" },
  { key: "lab", label: "Lab Specimens", color: "#5CA3FF", emoji: "\uD83E\uDDEA" },
  { key: "blood", label: "Blood Products", color: "#FF0A54", emoji: "\uD83E\uDE78" },
  { key: "organs", label: "Organs", color: "#FF6B9D", emoji: "\uD83E\uDEC0" },
  { key: "medical_equipment", label: "Medical Equipment", color: "#7BB5FF", emoji: "\u2695\uFE0F" },
  { key: "legal", label: "Legal Document", color: BRAND_PRIMARY, emoji: "\uD83D\uDCC4" },
  { key: "checks", label: "Checks", color: "#8BBEFF", emoji: "\uD83E\uDDFE" },
  { key: "internal", label: "Internal", color: "#A8CCFF", emoji: "\uD83C\uDFE2" },
  { key: "standard", label: "Standard", color: "#94A3B8", emoji: "\uD83D\uDCE6" },
  { key: "other", label: "Other", color: "#CBD5E1", emoji: "\uD83D\uDCCB" },
];

// Normalize MongoDB package_type values to the canonical bucket keys above.
function packageKey(t: string | null | undefined): string {
  const s = (t ?? "").toLowerCase().trim();
  if (!s) return "standard";
  if (s === "rx" || s.includes("prescription")) return "rx";
  if (s === "cold" || s === "cold_chain" || s.includes("cold")) return "cold";
  if (s === "lab" || s.includes("specimen") || s.includes("sample")) return "lab";
  if (s === "blood" || s.includes("blood")) return "blood";
  if (s === "organ" || s === "organs") return "organs";
  if (s === "equipment" || s === "device" || s.includes("medical_equipment") || s.includes("equipment"))
    return "medical_equipment";
  if (s === "legal" || s.includes("legal") || s.includes("document")) return "legal";
  if (s === "check" || s === "checks") return "checks";
  if (s === "internal") return "internal";
  if (s === "standard" || s === "package" || s === "box") return "standard";
  return "other";
}

export function StopsByType({ stops, loading }: { stops: DashboardStop[]; loading: boolean }) {
  const rows = useMemo(() => {
    const counts = {
      delivery: stops.filter((s) => s.stop_type === "delivery").length,
      pickup: stops.filter((s) => s.stop_type === "pickup").length,
      dropoff: stops.filter((s) => s.stop_type === "dropoff").length,
    };
    const total = counts.delivery + counts.pickup + counts.dropoff || 1;
    return TYPE_CONFIG.map((t) => ({
      ...t,
      count: counts[t.key],
      pct: Math.round((counts[t.key] / total) * 100),
    }));
  }, [stops]);

  const total = rows.reduce((acc, r) => acc + r.count, 0);

  if (loading) {
    return (
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-semibold text-sm">Stops by Type</CardTitle>
          <CardDescription className="text-xs">Operational breakdown today</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[180px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="font-semibold text-sm">Stops by Type</CardTitle>
        <CardDescription className="text-xs">
          {total > 0
            ? `${total} total · ${rows.find((r) => r.key === "delivery")?.count ?? 0} deliveries, ${rows.find((r) => r.key === "pickup")?.count ?? 0} pickups, ${rows.find((r) => r.key === "dropoff")?.count ?? 0} dropoffs`
            : "No stops today"}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        {total === 0 ? (
          <div className="flex h-[140px] items-center justify-center text-muted-foreground/40 text-sm">
            No stops scheduled today
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm leading-none">{r.emoji}</span>
                    <span className="font-medium text-foreground text-xs">{r.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 tabular-nums">
                    <span className="font-bold text-base text-foreground">{r.count}</span>
                    <span className="text-[10px] text-muted-foreground/60">{r.pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${r.pct}%`, background: r.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Deliveries Breakdown — unified card with internal toggle ──────────────
//
// Single card that matches `StopsByDisposition` in visual weight — toggle
// pill lives INSIDE the CardHeader so both cards in the dashboard row have
// identical outer dimensions. The two views (Type / Location) share the
// same Card chrome and only swap their inner content.

type BreakdownView = "type" | "location" | "package";

// Shared row component for processed-rate display — "X/Y  Z%" + progress bar.
// `processed` includes ANY final state (delivered, failed, cancelled, return),
// so the bar shows how many stops have left the in-flight buffer.
function BreakdownRow({
  emoji,
  label,
  processed,
  total,
  pct,
  color,
}: {
  emoji: string;
  label: string;
  processed: number;
  total: number;
  pct: number;
  color: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-sm leading-none">{emoji}</span>
          <span className="truncate font-medium text-foreground text-xs">{label}</span>
        </div>
        <div className="flex shrink-0 items-baseline gap-1 tabular-nums">
          <span className="font-bold text-[13px] text-foreground">{processed}</span>
          <span className="font-medium text-[11px] text-muted-foreground/55">/{total}</span>
          <span className="ml-1 font-semibold text-[10px] text-muted-foreground/70">{pct}%</span>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function DeliveriesBreakdown({ stops, loading }: { stops: DashboardStop[]; loading: boolean }) {
  const [view, setView] = useState<BreakdownView>("type");

  // ── By-Type data (processed-rate per type: processed/total) ──
  const typeRows = useMemo(() => {
    return TYPE_CONFIG.map((t) => {
      const inCat = stops.filter((s) => s.stop_type === t.key);
      const processed = inCat.filter((s) => isTerminal(s)).length;
      const total = inCat.length;
      return {
        ...t,
        processed,
        total,
        pct: total > 0 ? Math.round((processed / total) * 100) : 0,
      };
    });
  }, [stops]);
  const typeOverall = typeRows.reduce(
    (acc, r) => ({
      processed: acc.processed + r.processed,
      total: acc.total + r.total,
    }),
    { processed: 0, total: 0 },
  );

  // ── By-Location data (processed-rate per city: processed/total) ──
  const locationRows = useMemo(() => {
    const map = new Map<string, { city: string; address: string; total: number; processed: number }>();
    for (const s of stops) {
      const key = s.delivery_city || s.delivery_zip || "Unknown";
      let m = map.get(key);
      if (!m) {
        m = {
          city: s.delivery_city || "Unknown",
          address: [s.delivery_city, s.delivery_state, s.delivery_zip].filter(Boolean).join(", "),
          total: 0,
          processed: 0,
        };
        map.set(key, m);
      }
      m.total++;
      if (isTerminal(s)) m.processed++;
    }
    return [...map.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((r) => ({ ...r, pct: r.total > 0 ? Math.round((r.processed / r.total) * 100) : 0 }));
  }, [stops]);
  const locOverall = locationRows.reduce(
    (acc, r) => ({
      processed: acc.processed + r.processed,
      total: acc.total + r.total,
    }),
    { processed: 0, total: 0 },
  );

  // ── By-Package data (processed-rate per package type: processed/total) ──
  const packageRows = useMemo(() => {
    const groups: Record<string, { total: number; processed: number }> = {};
    for (const c of PACKAGE_CONFIG) groups[c.key] = { total: 0, processed: 0 };
    for (const s of stops) {
      const k = packageKey(s.package_type);
      if (!groups[k]) groups[k] = { total: 0, processed: 0 };
      groups[k].total++;
      if (isTerminal(s)) groups[k].processed++;
    }
    return PACKAGE_CONFIG.map((p) => ({
      ...p,
      total: groups[p.key].total,
      processed: groups[p.key].processed,
      pct: groups[p.key].total > 0 ? Math.round((groups[p.key].processed / groups[p.key].total) * 100) : 0,
    }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [stops]);
  const packageOverall = packageRows.reduce(
    (acc, r) => ({
      processed: acc.processed + r.processed,
      total: acc.total + r.total,
    }),
    { processed: 0, total: 0 },
  );

  // Description text — overall processed rate for the active view
  const description =
    view === "type"
      ? typeOverall.total > 0
        ? `${typeOverall.processed}/${typeOverall.total} processed · completion by stop type`
        : "No stops today"
      : view === "location"
        ? locOverall.total > 0
          ? `${locOverall.processed}/${locOverall.total} processed · ${locationRows.length} cities`
          : "Top delivery cities"
        : packageOverall.total > 0
          ? `${packageOverall.processed}/${packageOverall.total} processed · ${packageRows.length} categories`
          : "Package mix today";

  if (loading) {
    return (
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-semibold text-sm">Stops Breakdown</CardTitle>
          <CardDescription className="text-xs">Loading…</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[220px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <CardTitle className="font-semibold text-sm">Stops Breakdown</CardTitle>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>
          {/* Toggle pill — same style as Special Handling tab group, stacks on mobile */}
          <div className="inline-flex shrink-0 items-center gap-0.5 self-start rounded-lg bg-muted p-0.5 ring-1 ring-border/30">
            {[
              { key: "type" as const, label: "Type" },
              { key: "location" as const, label: "Location" },
              { key: "package" as const, label: "Package" },
            ].map((opt) => {
              const on = view === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setView(opt.key)}
                  className={cn(
                    "inline-flex h-6 items-center whitespace-nowrap rounded-md px-2 font-medium text-[11px] transition-all duration-150",
                    on
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                      : "text-muted-foreground/70 hover:bg-background/60 hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-4">
        {view === "type" ? (
          typeOverall.total === 0 ? (
            <div className="flex h-[180px] items-center justify-center text-muted-foreground/40 text-sm">
              No stops scheduled today
            </div>
          ) : (
            <div className="space-y-3">
              {typeRows.map((r) => (
                <BreakdownRow
                  key={r.key}
                  emoji={r.emoji}
                  label={r.label}
                  processed={r.processed}
                  total={r.total}
                  pct={r.pct}
                  color={r.color}
                />
              ))}
            </div>
          )
        ) : view === "package" ? (
          packageOverall.total === 0 ? (
            <div className="flex h-[180px] items-center justify-center text-muted-foreground/40 text-sm">
              No package data today
            </div>
          ) : (
            <div className="space-y-3">
              {packageRows.map((r) => (
                <BreakdownRow
                  key={r.key}
                  emoji={r.emoji}
                  label={r.label}
                  processed={r.processed}
                  total={r.total}
                  pct={r.pct}
                  color={r.color}
                />
              ))}
            </div>
          )
        ) : locationRows.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-muted-foreground/40 text-sm">No data yet</div>
        ) : (
          <ChartContainer config={locationChartConfig} className="h-[200px] w-full">
            <BarChart accessibilityLayer data={locationRows} layout="vertical" margin={{ right: 16 }}>
              <YAxis
                dataKey="city"
                type="category"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value: string) => value.slice(0, 3)}
                hide
              />
              <XAxis dataKey="total" type="number" hide />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(_value, _name, item) => (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-[11px] text-foreground">{item.payload.city}</span>
                        <span className="text-[10px] text-muted-foreground">{item.payload.address}</span>
                        <span className="font-bold text-[11px] text-foreground">
                          {item.payload.processed}/{item.payload.total} processed · {item.payload.pct}%
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="total" fill="var(--chart-2)" radius={4}>
                <LabelList
                  dataKey="city"
                  position="insideLeft"
                  offset={8}
                  className="fill-(--color-label)"
                  fontSize={12}
                />
                <LabelList dataKey="total" position="right" offset={8} className="fill-foreground" fontSize={12} />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
