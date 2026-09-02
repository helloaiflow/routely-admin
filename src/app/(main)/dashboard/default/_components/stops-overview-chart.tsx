"use client";

import * as React from "react";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { DashboardData } from "./_types";

// Combined chart (CEO, 2026-09-01): no series tabs — the three outcomes stack
// in the SAME column per day (delivered at the base, failed in the middle,
// pending on top), so column height = that day's received. The summary on the
// right keeps Received · Delivered · Failed; clicking one now HIGHLIGHTS its
// series in the chart (dims the others) instead of swapping the chart —
// Received clears the highlight. Sizing follows the repo's compact scale
// (size="sm" cards, text-sm titles), not shadcn's roomier defaults.
const chartConfig = {
  delivered: {
    label: "Delivered",
    color: "var(--primary)",
  },
  failed: {
    label: "Failed",
    color: "var(--destructive)",
  },
  pending: {
    label: "Pending",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

type SeriesKey = "delivered" | "failed" | "pending";
type SummaryKey = "received" | "delivered" | "failed";
const SUMMARY: SummaryKey[] = ["received", "delivered", "failed"];
const SUMMARY_LABEL: Record<SummaryKey, string> = {
  received: "Received",
  delivered: "Delivered",
  failed: "Failed",
};

interface DayRow {
  date: string;
  received: number;
  delivered: number;
  failed: number;
  pending: number;
}

// trend dates are plain YYYY-MM-DD. `new Date("YYYY-MM-DD")` parses as UTC
// midnight, so in any western timezone toLocaleDateString would render the
// PREVIOUS day. Anchoring to local midnight avoids it.
// Hover cursor sized to the BAR, not the whole category band — the default
// Recharts cursor painted a wide washed-out column behind each hover (CEO,
// 2026-09-01: "hazla fina que recubra la barra").
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ThinCursor(props: any) {
  const { x, y, width, height } = props;
  if (width == null || x == null) return null;
  const w = Math.min(44, width);
  return (
    <rect
      x={x + (width - w) / 2}
      y={y}
      width={w}
      height={height}
      rx={4}
      fill="var(--muted)"
      fillOpacity={0.45}
    />
  );
}

function localDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00`);
}

export function StopsOverviewChart({ data, loading }: { data?: DashboardData; loading: boolean }) {
  // null = nothing highlighted (Received / default state)
  const [highlight, setHighlight] = React.useState<SeriesKey | null>(null);

  const chartData = React.useMemo<DayRow[]>(() => {
    const trend = data?.trend ?? [];
    return trend.map((t) => ({
      date: t.date,
      received: t.total,
      delivered: t.completed,
      failed: t.failed,
      // The trend endpoint tracks completed/failed per day — pending is the
      // remainder of the day's real total, never negative.
      pending: Math.max(0, t.total - t.completed - t.failed),
    }));
  }, [data?.trend]);

  const total = React.useMemo(
    () => ({
      received: chartData.reduce((acc, r) => acc + r.received, 0),
      delivered: chartData.reduce((acc, r) => acc + r.delivered, 0),
      failed: chartData.reduce((acc, r) => acc + r.failed, 0),
    }),
    [chartData],
  );

  const dimmed = (key: SeriesKey) => highlight !== null && highlight !== key;

  if (loading) {
    return (
      <Card size="sm" className="border-border/60 py-0 shadow-sm">
        <CardHeader className="flex flex-col items-stretch border-b p-0! sm:flex-row">
          <div className="flex flex-1 flex-col justify-center gap-1 px-4 pt-3 pb-2 sm:py-3!">
            <CardTitle className="font-semibold text-sm tracking-tight">Daily Volume</CardTitle>
            <CardDescription className="text-xs">Received, delivered and failed by day</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-2 pb-3 sm:px-4 sm:pt-3">
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm" className="border-border/60 py-0 shadow-sm">
      <CardHeader className="flex flex-col items-stretch border-b p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-4 pt-3 pb-2 sm:py-0!">
          <CardTitle className="font-semibold text-sm tracking-tight">Daily Volume</CardTitle>
          <CardDescription className="text-xs">
            Received, delivered and failed —{" "}
            {chartData.length > 1 ? `${chartData.length} days` : "selected period"}
          </CardDescription>
        </div>
        <div className="flex">
          {SUMMARY.map((key) => {
            const active = key === "received" ? highlight === null : highlight === key;
            return (
              <button
                key={key}
                type="button"
                data-active={active}
                title={key === "received" ? "Show all series" : `Highlight ${SUMMARY_LABEL[key]} in the chart`}
                className="relative z-30 flex flex-1 flex-col justify-center gap-0.5 border-t px-4 py-2.5 text-left transition-colors [&:nth-child(n+2)]:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-5 sm:py-3"
                onClick={() => setHighlight(key === "received" ? null : (key as SeriesKey))}
              >
                <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  {key !== "received" && (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: chartConfig[key as SeriesKey].color }}
                    />
                  )}
                  {SUMMARY_LABEL[key]}
                </span>
                <span className="font-bold text-base leading-none tabular-nums sm:text-2xl">
                  {total[key].toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-3 sm:px-4 sm:pt-3">
        {chartData.every((r) => r.received === 0) ? (
          <div className="flex h-[200px] items-center justify-center text-muted-foreground/40 text-sm">
            No data yet
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
            <BarChart
              accessibilityLayer
              data={chartData}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              {/* One tick per day, no skipping — with many days the label
                shrinks to the day number; "Aug 5"-style only on the first
                tick and each month's 1st. */}
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={0}
                fontSize={10}
                tickFormatter={(value, index) => {
                  const d = localDate(String(value));
                  if (chartData.length <= 14 || index === 0 || d.getDate() === 1) {
                    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  }
                  return String(d.getDate());
                }}
              />
              <ChartTooltip
                cursor={<ThinCursor />}
                content={
                  <ChartTooltipContent
                    className="w-[170px]"
                    labelFormatter={(value, payload) => {
                      const row = payload?.[0]?.payload as DayRow | undefined;
                      const d = localDate(String(value)).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                      return row ? `${d} — ${row.received} received` : d;
                    }}
                  />
                }
              />
              {/* Stack bottom → top: delivered / failed / pending. 2px stroke
                in the card's surface color separates the segments; only the
                topmost segment rounds. Column height = received. */}
              <Bar
                dataKey="delivered"
                stackId="a"
                fill="var(--color-delivered)"
                stroke="var(--card)"
                strokeWidth={2}
                maxBarSize={40}
                className={cn("transition-opacity", dimmed("delivered") && "opacity-25")}
              />
              <Bar
                dataKey="failed"
                stackId="a"
                fill="var(--color-failed)"
                stroke="var(--card)"
                strokeWidth={2}
                maxBarSize={40}
                className={cn("transition-opacity", dimmed("failed") && "opacity-25")}
              />
              <Bar
                dataKey="pending"
                stackId="a"
                fill="var(--color-pending)"
                stroke="var(--card)"
                strokeWidth={2}
                maxBarSize={40}
                radius={[3, 3, 0, 0]}
                className={cn("transition-opacity", dimmed("pending") && "opacity-25")}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
