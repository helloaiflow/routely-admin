"use client";

import { useEffect, useState } from "react";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type DailyResponse = {
  days: Array<Record<string, number | string>>;
  totals: Record<string, { cents: number; qty: number }>;
};

const CHART_CONFIG = {
  package_cents: { label: "Packages", color: "var(--chart-1)" },
  miles_cents: { label: "Mileage", color: "var(--chart-2)" },
  prepaid_label_cents: { label: "Labels", color: "var(--chart-3)" },
  on_demand_cents: { label: "Additional services", color: "var(--chart-4)" },
} satisfies ChartConfig;

const SERIES = Object.keys(CHART_CONFIG) as Array<keyof typeof CHART_CONFIG>;

/* Interactive daily-charges Bar Chart (Section 4) — Packages · Mileage ·
 * Labels · Additional services (on_demand — see daily/route.ts's docstring
 * for why "additional services" maps there; there's no literal
 * "additional services" resolved_type in billing_ledger). Reuses the
 * EXISTING /api/client/billing/daily aggregate (extended, not duplicated,
 * to add the Labels series and an explicit date_from/date_to mode so
 * "current cycle" reconciles exactly with the cycle figures shown
 * elsewhere on Overview, not an independent day-count window). */
export function DailyChargesChart({ cycleStart, cycleEnd }: { cycleStart: Date | null; cycleEnd: Date | null }) {
  const [data, setData] = useState<DailyResponse | null>(null);
  const [errored, setErrored] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!cycleStart || !cycleEnd) return;
    const params = new URLSearchParams({
      date_from: cycleStart.toISOString().slice(0, 10),
      date_to: cycleEnd.toISOString().slice(0, 10),
    });
    setErrored(false);
    fetch(`/api/client/billing/daily?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setErrored(true));
  }, [cycleStart, cycleEnd]);

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const cycleTotalCents = data ? Object.values(data.totals).reduce((s, t) => s + t.cents, 0) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-sm">Daily charges this cycle</CardTitle>
          <p className="text-11 text-muted-foreground">By type — click a legend chip to toggle it.</p>
        </div>
        {data && (
          <span className="text-11 text-muted-foreground">
            Cycle total: {(cycleTotalCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </span>
        )}
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-4">
        {errored ? (
          <p className="p-6 text-center text-13 text-muted-foreground">Couldn't load the daily chart.</p>
        ) : !data ? (
          <Skeleton className="h-[220px] w-full" />
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-2">
              {SERIES.map((key) => {
                const cfg = CHART_CONFIG[key];
                const isHidden = hidden.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-10 transition-colors",
                      isHidden ? "border-border/60 text-muted-foreground" : "border-transparent",
                    )}
                    style={
                      !isHidden ? { backgroundColor: `color-mix(in oklab, ${cfg.color} 15%, transparent)` } : undefined
                    }
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: isHidden ? "var(--muted-foreground)" : cfg.color }}
                    />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[220px] w-full">
              <BarChart data={data.days} margin={{ left: 4, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={20}
                  className="text-xs"
                  tickFormatter={(v: string) =>
                    new Date(`${v}T00:00:00`).toLocaleDateString("en-US", { day: "numeric", month: "short" })
                  }
                />
                <ChartTooltip
                  cursor={{ fill: "var(--primary)", fillOpacity: 0.06, radius: 4 }}
                  content={
                    <ChartTooltipContent
                      className="w-44"
                      labelFormatter={(v) =>
                        new Date(`${String(v)}T00:00:00`).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })
                      }
                      formatter={(value, name) => [
                        ` ${((value as number) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}`,
                        CHART_CONFIG[name as keyof typeof CHART_CONFIG]?.label ?? name,
                      ]}
                    />
                  }
                />
                {SERIES.map((key) =>
                  hidden.has(key) ? null : (
                    <Bar key={key} dataKey={key} stackId="a" fill={`var(--color-${key})`} radius={[0, 0, 0, 0]} />
                  ),
                )}
              </BarChart>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}
