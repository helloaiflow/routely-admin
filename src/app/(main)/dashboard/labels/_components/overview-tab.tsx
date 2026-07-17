"use client";

import { useMemo, useState } from "react";

import {
  AlertTriangle,
  ArrowUpRight,
  RotateCcw,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import { LabelDetailSheet } from "./label-detail-sheet";
import { CarrierChip, StatusBadge } from "./labels-table";
import { type LabelOrder, money, RANGE_DAYS, type RangeKey, STATUS_META, shortDate } from "./types";

/* ── KPI + charts + quick-access — derived STRICTLY from our orders ───────── */

function windowed(orders: LabelOrder[], range: RangeKey): { current: LabelOrder[]; previous: LabelOrder[] } {
  if (range === "all") return { current: orders, previous: [] };
  const days = RANGE_DAYS[range];
  const now = Date.now();
  const start = now - days * 86400_000;
  const prevStart = start - days * 86400_000;
  const current: LabelOrder[] = [];
  const previous: LabelOrder[] = [];
  for (const o of orders) {
    const t = new Date(o.created_at).getTime();
    if (t >= start) current.push(o);
    else if (t >= prevStart) previous.push(o);
  }
  return { current, previous };
}

function deltaBadge(curr: number, prev: number, hasPrev: boolean) {
  if (!hasPrev || prev === 0) return null;
  const pct = Math.round(((curr - prev) / prev) * 100);
  const up = pct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-xs",
        up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
      )}
    >
      {up ? (
        <TrendingUp className="size-3" aria-hidden="true" />
      ) : (
        <TrendingDown className="size-3" aria-hidden="true" />
      )}
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

/* Interactive bar chart (shadcn dashboard-01 pattern) — two clickable metric
 * headers switch the active series. Real data only. */
const barConfig = {
  purchased: { label: "Purchased", color: "var(--primary)" },
  spent: { label: "Spent", color: "var(--chart-2)" },
} satisfies ChartConfig;

type BarMetric = keyof typeof barConfig;

export function OverviewTab({ orders, range }: { orders: LabelOrder[]; range: RangeKey }) {
  const [metric, setMetric] = useState<BarMetric>("purchased");
  const [selected, setSelected] = useState<LabelOrder | null>(null);

  const { current, previous } = useMemo(() => windowed(orders, range), [orders, range]);

  const kpis = useMemo(() => {
    const purch = current.filter((o) => o.status === "purchased");
    const prevPurch = previous.filter((o) => o.status === "purchased");
    const spent = purch.reduce((s, o) => s + (o.rate?.client_price ?? 0), 0);
    const prevSpent = prevPurch.reduce((s, o) => s + (o.rate?.client_price ?? 0), 0);
    const refunded = current.filter((o) => o.status === "refunded" || o.status === "refund_failed");
    const refundedAmt = refunded.reduce((s, o) => s + (o.rate?.client_price ?? 0), 0);
    const withTracking = purch.filter((o) => o.shippo?.tracking_number).length;
    return { purch, prevPurch, spent, prevSpent, refunded, refundedAmt, withTracking };
  }, [current, previous]);

  const daily = useMemo(() => {
    const map = new Map<string, { date: string; purchased: number; spent: number }>();
    const days = range === "all" ? 90 : RANGE_DAYS[range];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
      const key = d.toISOString().slice(0, 10);
      map.set(key, { date: key, purchased: 0, spent: 0 });
    }
    for (const o of current) {
      if (o.status !== "purchased") continue;
      const key = new Date(o.created_at).toISOString().slice(0, 10);
      const row = map.get(key);
      if (!row) continue;
      row.purchased += 1;
      row.spent += o.rate?.client_price ?? 0;
    }
    return [...map.values()].map((r) => ({ ...r, spent: Math.round(r.spent * 100) / 100 }));
  }, [current, range]);

  const totals = useMemo(
    () => ({
      purchased: kpis.purch.length,
      spent: kpis.spent,
    }),
    [kpis],
  );

  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of current) m.set(o.status, (m.get(o.status) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [current]);

  const byCarrier = useMemo(() => {
    const m = new Map<string, number>();
    let total = 0;
    for (const o of current) {
      if (o.status !== "purchased") continue;
      const c = o.rate?.provider ?? "Other";
      m.set(c, (m.get(c) ?? 0) + 1);
      total += 1;
    }
    return { total, rows: [...m.entries()].sort((a, b) => b[1] - a[1]) };
  }, [current]);

  const attention = useMemo(
    () =>
      current
        .filter((o) => o.status === "refunded" || o.status === "refund_failed" || o.status === "failed")
        .slice(0, 4),
    [current],
  );

  const recent = useMemo(() => current.slice(0, 5), [current]);

  const hasPrev = range !== "all";

  const cards = [
    {
      label: "Labels Purchased",
      value: kpis.purch.length.toLocaleString(),
      action: deltaBadge(kpis.purch.length, kpis.prevPurch.length, hasPrev),
      icon: ShoppingCart,
      footer: hasPrev ? `${kpis.prevPurch.length} in the previous period` : "All time",
      sub: "Completed label purchases",
    },
    {
      label: "Total Spent",
      value: money(kpis.spent),
      action: deltaBadge(kpis.spent, kpis.prevSpent, hasPrev),
      icon: Wallet,
      footer: hasPrev ? `${money(kpis.prevSpent)} previous period` : "All time",
      sub: "Sum of purchased label prices",
    },
    {
      label: "Shipped",
      value: kpis.withTracking.toLocaleString(),
      action: null,
      icon: Truck,
      footer: "Awaiting carrier scans",
      sub: "Labels with a tracking number",
    },
    {
      label: "Refunded",
      value: kpis.refunded.length.toLocaleString(),
      action:
        kpis.refunded.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive text-xs">
            {money(kpis.refundedAmt)}
          </span>
        ) : null,
      icon: RotateCcw,
      footer: kpis.refunded.length ? `${money(kpis.refundedAmt)} returned` : "No refunds in range",
      sub: "Auto-refunds on failed purchases",
    },
  ];

  const ceoCard =
    "@container/card border-0 bg-gradient-to-t from-primary/5 to-card shadow-xs ring-1 ring-foreground/10";

  return (
    <div className="@container/main space-y-4">
      {/* KPI cards */}
      <div className="grid @5xl/main:grid-cols-4 @xl/main:grid-cols-2 grid-cols-1 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className={ceoCard}>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <c.icon className="size-3.5 text-primary/70" aria-hidden="true" />
                {c.label}
              </CardDescription>
              <CardTitle className="font-semibold text-2xl tabular-nums">{c.value}</CardTitle>
              {c.action && <CardAction>{c.action}</CardAction>}
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1 text-sm">
              <div className="line-clamp-1 font-medium">{c.footer}</div>
              <div className="text-muted-foreground">{c.sub}</div>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Interactive bar chart — dashboard-01 pattern, real series */}
      <Card className="gap-0 border-border/60 py-0">
        <CardHeader className="flex flex-col items-stretch border-b !p-0 sm:flex-row">
          <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:pb-4">
            <CardTitle className="type-card-title">Label activity</CardTitle>
            <CardDescription>Daily totals for the selected range</CardDescription>
          </div>
          <div className="flex">
            {(Object.keys(barConfig) as BarMetric[]).map((key) => (
              <button
                key={key}
                type="button"
                data-active={metric === key}
                onClick={() => setMetric(key)}
                className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-5"
              >
                <span className="text-muted-foreground text-xs">{barConfig[key].label}</span>
                <span className="font-bold text-lg leading-none tabular-nums sm:text-2xl">
                  {key === "spent" ? money(totals.spent) : totals.purchased.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:p-6">
          <ChartContainer config={barConfig} className="aspect-auto h-[230px] w-full">
            <BarChart data={daily} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.25} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
                tickFormatter={(v: string) =>
                  new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                }
              />
              <ChartTooltip
                cursor={{ fill: "var(--primary)", fillOpacity: 0.06, radius: 4 }}
                content={
                  <ChartTooltipContent
                    className="w-[160px]"
                    nameKey={metric}
                    labelFormatter={(v) =>
                      new Date(String(v)).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    }
                  />
                }
              />
              <Bar dataKey={metric} fill={`var(--color-${metric})`} radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* ── Quick-access grid (dashboard-01 style, real data) ── */}
      <div className="grid @5xl/main:grid-cols-4 @xl/main:grid-cols-2 grid-cols-1 gap-4">
        {/* Recent Labels */}
        <Card className={ceoCard}>
          <CardHeader>
            <CardTitle className="type-card-title">Recent Labels</CardTitle>
            <CardDescription>Last {recent.length || 0} in range</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {recent.length === 0 && <p className="type-desc">Nothing yet.</p>}
            {recent.map((o) => (
              <button
                key={o.order_id}
                type="button"
                onClick={() => setSelected(o)}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted/40"
              >
                <CarrierChip provider={o.rate?.provider} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11px] text-primary tabular-nums">{o.order_id}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{o.to_address?.name ?? "—"}</span>
                </span>
                <span className="shrink-0 font-semibold text-[13px] tabular-nums">{money(o.rate?.client_price)}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* By Status */}
        <Card className={ceoCard}>
          <CardHeader>
            <CardTitle className="type-card-title">By Status</CardTitle>
            <CardDescription>All orders in range</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {byStatus.length === 0 && <p className="type-desc">Nothing yet.</p>}
            {byStatus.map(([st, count]) => {
              const meta = STATUS_META[st as keyof typeof STATUS_META];
              return (
                <div key={st} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[13px]">
                    <span
                      className={cn("size-2 rounded-full", meta?.dot ?? "bg-muted-foreground/40")}
                      aria-hidden="true"
                    />
                    {meta?.label ?? st}
                  </span>
                  <span className="font-semibold text-[13px] tabular-nums">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* By Carrier */}
        <Card className={ceoCard}>
          <CardHeader>
            <CardTitle className="type-card-title">By Carrier</CardTitle>
            <CardDescription>Purchased labels</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {byCarrier.rows.length === 0 && <p className="type-desc">Nothing yet.</p>}
            {byCarrier.rows.map(([c, count]) => {
              const pct = byCarrier.total ? Math.round((count / byCarrier.total) * 100) : 0;
              return (
                <div key={c} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="flex items-center gap-2">
                      <CarrierChip provider={c} />
                      {c}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {count} <span className="font-normal text-muted-foreground">· {pct}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Needs Attention */}
        <Card className={ceoCard}>
          <CardHeader>
            <CardTitle className="type-card-title flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-destructive" aria-hidden="true" />
              Needs Attention
            </CardTitle>
            <CardDescription>Refunds & failures in range</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {attention.length === 0 && <p className="type-desc">All clear — no failed or refunded labels.</p>}
            {attention.map((o) => (
              <button
                key={o.order_id}
                type="button"
                onClick={() => setSelected(o)}
                className="flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-mono text-[11px] text-primary tabular-nums">{o.order_id}</span>
                    <StatusBadge status={o.status} />
                  </span>
                  {o.error && <span className="mt-0.5 block truncate text-[11px] text-destructive/80">{o.error}</span>}
                </span>
                <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
                  {shortDate(o.created_at)}
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <LabelDetailSheet order={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
