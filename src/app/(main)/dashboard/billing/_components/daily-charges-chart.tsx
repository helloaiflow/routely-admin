"use client";

import { useEffect, useState } from "react";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyCents as usd } from "@/lib/ui/format";

type DailyResponse = {
  days: Array<Record<string, number | string>>;
  totals: Record<string, { cents: number; qty: number }>;
};

// Order + labels per the mission spec: Packages · Mileage · On-Demand ·
// Labels. Differs deliberately from this chart's own previous stacked+toggle
// version (which labeled on_demand "Additional services" and put Labels at
// chart-3) — this is the one canonical chart now, shared in shape with
// routely-client's copy, so the recolor/relabel is consistent everywhere.
const CHART_CONFIG = {
  package_cents: { label: "Packages", color: "var(--chart-1)" },
  miles_cents: { label: "Mileage", color: "var(--chart-2)" },
  on_demand_cents: { label: "On-Demand", color: "var(--chart-3)" },
  prepaid_label_cents: { label: "Labels", color: "var(--chart-4)" },
} satisfies ChartConfig;

const SERIES = Object.keys(CHART_CONFIG) as Array<keyof typeof CHART_CONFIG>;
const TOTAL_KEY: Record<keyof typeof CHART_CONFIG, string> = {
  package_cents: "package",
  miles_cents: "miles",
  on_demand_cents: "on_demand",
  prepaid_label_cents: "prepaid_label",
};

/* Interactive daily-charges bar chart (Mission item 5b) — shadcn's
 * ChartBarInteractive pattern (https://ui.shadcn.com/charts/bar#charts),
 * replacing this file's previous stacked-bar + toggle-legend chart. Moved
 * from the Recent Activity tab to Overview, full-width below the two cards —
 * Recent Activity's own charge list/filter bar stays there; only the chart
 * moved, so there's exactly one daily-charges chart in this module, not two
 * answering the same question in different tabs. Header splits into a title
 * block + one selector button per billing type, each showing that type's
 * period total; clicking switches which single series the BarChart renders.
 * Same /api/client/billing/daily contract as before (unchanged) — totals
 * here still reconcile with the cards above to the cent. */
export function DailyChargesChart({ cycleStart, cycleEnd }: { cycleStart: Date | null; cycleEnd: Date | null }) {
  const [data, setData] = useState<DailyResponse | null>(null);
  const [errored, setErrored] = useState(false);
  const [active, setActive] = useState<keyof typeof CHART_CONFIG>("package_cents");

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

  // Default to the first series with real activity — today's reality is
  // "everything is Packages," so landing on an empty Mileage/On-Demand/Labels
  // view by default would look broken even though it's correctly zero.
  useEffect(() => {
    if (!data) return;
    const firstNonZero = SERIES.find((k) => (data.totals[TOTAL_KEY[k]]?.cents ?? 0) > 0);
    if (firstNonZero) setActive(firstNonZero);
  }, [data]);

  if (errored) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-13 text-muted-foreground">
          Couldn't load the daily charges chart.
        </CardContent>
      </Card>
    );
  }

  // No billing cycle has started yet (e.g. a brand-new trial with zero
  // activity) — cycleStart/cycleEnd stay null forever, so without this the
  // chart below would sit in its loading skeleton indefinitely instead of
  // honestly saying there's nothing to chart yet.
  if (!cycleStart || !cycleEnd) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Daily charges this cycle</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[220px] flex-col items-center justify-center gap-1 text-center">
          <p className="text-13 text-muted-foreground">No billing cycle yet.</p>
          <p className="text-11 text-muted-foreground">This chart appears once your first cycle starts.</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Daily charges this cycle</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[240px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const allZero = SERIES.every((k) => (data.totals[TOTAL_KEY[k]]?.cents ?? 0) === 0);

  return (
    <Card className="py-0">
      <CardHeader className="flex flex-col items-stretch border-b !p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-4 py-4 sm:py-5">
          <CardTitle className="text-sm">Daily charges this cycle</CardTitle>
          <CardDescription className="text-11">By billing type — select one to chart it.</CardDescription>
        </div>
        <div className="flex">
          {SERIES.map((key) => {
            const cfg = CHART_CONFIG[key];
            const total = data.totals[TOTAL_KEY[key]]?.cents ?? 0;
            return (
              <button
                key={key}
                type="button"
                data-active={active === key}
                onClick={() => setActive(key)}
                className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-4 py-3 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-6 sm:py-4"
              >
                <span className="text-10 text-muted-foreground">{cfg.label}</span>
                <span className="font-bold text-13 leading-none tabular-nums sm:text-xl">{usd(total)}</span>
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {allZero ? (
          <div className="flex h-[220px] w-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-13 text-muted-foreground">No charges yet this cycle.</p>
            <p className="text-11 text-muted-foreground">Charges appear here as deliveries complete.</p>
          </div>
        ) : (
          <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[220px] w-full">
            <BarChart data={data.days} margin={{ left: 4, right: 4, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={20}
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
                    formatter={(value) => [` ${usd(value as number)}`, CHART_CONFIG[active].label]}
                  />
                }
              />
              <Bar dataKey={active} fill={`var(--color-${active})`} radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
