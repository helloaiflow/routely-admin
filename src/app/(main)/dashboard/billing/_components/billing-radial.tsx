"use client";

import { Label, PolarAngleAxis, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";

import { Badge } from "@/components/ui/badge";
import { ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export type Reservation = {
  id: number;
  stop_id: string;
  resolved_type: string;
  reserved_cents: number;
  reserved_units: number | null;
  created_at: string;
};

export type Fund =
  | {
      fund_type: "prepaid";
      balance_cents: number;
      held_cents: number;
      available_cents: number;
      low_balance_threshold_cents: number;
      active_reservations: Reservation[];
    }
  | {
      fund_type: "postpaid";
      credit_limit_cents: number;
      buffer_cents: number;
      reserved_cents: number;
      unpaid_ledger_cents: number;
      available_cents: number;
      alert_threshold_pct: number;
      active_reservations: Reservation[];
    };

export type FundState = "healthy" | "healthy_watch" | "in_buffer" | "over_limit" | "zero_usage";

export type FundClassification = {
  state: FundState;
  /** 0-100, clamped — what the ring itself renders. */
  ringPct: number;
  /** Unclamped usage as a fraction of capacity — can exceed 100 for postpaid over-limit. */
  usedPct: number;
  capacityCents: number;
  usedCents: number;
  /** Only set for in_buffer/over_limit — the amount past the healthy zero-point. */
  overCents: number;
};

/* Pure classification — no fetch, no side effects — so the 4 states can be
 * fed synthetic fixtures for verification without touching real tenant data.
 * Postpaid math is exactly compute_available_fund's formula (app/services/
 * fund.py): available_cents = credit_limit_cents - buffer_cents -
 * reserved_cents - unpaid_ledger_cents. Verified against tenant 1's live
 * numbers: credit_limit $1000, buffer $100, unpaid $1216 -> available -$316
 * (reconciles to the cent). That means available==0 lands at used==limit-
 * buffer (the practical safe ceiling); available in [-buffer, 0) is "in the
 * cushion" (used has passed that ceiling but not the nominal limit yet);
 * available < -buffer is genuinely past the nominal limit itself. */
export function classifyFund(fund: Fund): FundClassification {
  if (fund.fund_type === "postpaid") {
    const capacityCents = fund.credit_limit_cents;
    const usedCents = fund.reserved_cents + fund.unpaid_ledger_cents;
    const usedPct = capacityCents > 0 ? (usedCents / capacityCents) * 100 : 0;
    if (usedCents === 0) {
      return { state: "zero_usage", ringPct: 0, usedPct: 0, capacityCents, usedCents, overCents: 0 };
    }
    let state: FundState;
    let overCents = 0;
    if (fund.available_cents >= 0) {
      state = usedPct >= fund.alert_threshold_pct ? "healthy_watch" : "healthy";
    } else if (fund.available_cents >= -fund.buffer_cents) {
      state = "in_buffer";
      overCents = -fund.available_cents;
    } else {
      state = "over_limit";
      overCents = usedCents - capacityCents;
    }
    return { state, ringPct: Math.min(100, usedPct), usedPct, capacityCents, usedCents, overCents };
  }

  // Prepaid: no buffer, no nominal "limit" to divide by (a wallet can always
  // be topped up further) — the ring instead gauges balance against a
  // comfortable reference point (4x the configured low-balance threshold),
  // which is always available on this same payload with no extra fetch.
  const capacityCents = Math.max(fund.low_balance_threshold_cents * 4, 1);
  const usedCents = fund.balance_cents; // "used" here reads as "held", ring fill reads as balance below
  if (fund.balance_cents === 0 && fund.held_cents === 0) {
    return { state: "zero_usage", ringPct: 0, usedPct: 0, capacityCents, usedCents: 0, overCents: 0 };
  }
  if (fund.available_cents < 0) {
    return {
      state: "over_limit",
      ringPct: 100,
      usedPct: 100,
      capacityCents,
      usedCents,
      overCents: -fund.available_cents,
    };
  }
  const ringPct = Math.min(100, (fund.balance_cents / capacityCents) * 100);
  const state: FundState = fund.available_cents <= fund.low_balance_threshold_cents ? "healthy_watch" : "healthy";
  return { state, ringPct, usedPct: ringPct, capacityCents, usedCents, overCents: 0 };
}

const STATE_COLOR: Record<FundState, string> = {
  healthy: "var(--success)",
  healthy_watch: "var(--warning)",
  in_buffer: "var(--warning)",
  over_limit: "var(--destructive)",
  zero_usage: "var(--muted-foreground)",
};

const STATE_BADGE: Record<FundState, { label: string; variant: "secondary" | "outline" | "destructive" } | null> = {
  healthy: null,
  healthy_watch: { label: "Approaching limit", variant: "secondary" },
  in_buffer: { label: "In buffer — past safe limit", variant: "secondary" },
  over_limit: { label: "Over limit", variant: "destructive" },
  zero_usage: null,
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/* Single shared billing-summary ring — prepaid and postpaid both render
 * through here (Section 5). Center label is the tenant's OWN "available"
 * figure (available credit for postpaid, balance for prepaid) since that's
 * the number the ring's fullness/emptiness directly represents; complementary
 * figures (current usage, monthly average, projected end of cycle, limit)
 * render as a compact row below, fed by the caller from /summary — this
 * component only needs the /fund payload for its own math. */
export function BillingRadial({
  fund,
  stats,
  className,
}: {
  fund: Fund;
  stats?: { currentUsageCents?: number; monthlyAverageCents?: number; projectedEndOfCycleCents?: number };
  className?: string;
}) {
  const c = classifyFund(fund);
  const isPrepaid = fund.fund_type === "prepaid";
  const centerCents = isPrepaid ? fund.balance_cents : fund.available_cents;
  const centerLabel = isPrepaid ? "Prepaid balance" : "Available credit";
  const color = STATE_COLOR[c.state];
  const badge = STATE_BADGE[c.state];
  const chartData = [{ metric: "used", value: c.ringPct, fill: color }];

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative mx-auto aspect-square w-full max-w-[220px]">
        <ChartContainer
          config={{ value: { label: centerLabel, color } }}
          className="mx-auto aspect-square max-h-[220px]"
        >
          <RadialBarChart data={chartData} startAngle={90} endAngle={-270} innerRadius={78} outerRadius={100}>
            {/* RadialBarChart's implicit angle axis defaults its domain to
             * [0, max(value)] across the dataset — with a single row that
             * max IS the row's own value, so every non-zero fill would
             * render as a full circle regardless of the real percentage.
             * Locking the domain to a fixed 0-100 makes the sweep actually
             * proportional. */}
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              className="fill-muted first:fill-muted last:fill-transparent"
              polarRadius={[86, 74]}
            />
            <RadialBar
              dataKey="value"
              background
              cornerRadius={c.ringPct > 0 && c.ringPct < 100 ? 6 : 0}
              fill={color}
            />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false} domain={[0, 100]}>
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                  const cx = viewBox.cx ?? 0;
                  const cy = viewBox.cy ?? 0;
                  return (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan
                        x={cx}
                        y={(cy ?? 0) - 6}
                        className="font-bold text-2xl tabular-nums"
                        style={{ fill: c.state === "zero_usage" ? "var(--muted-foreground)" : "var(--foreground)" }}
                      >
                        {centerCents < 0 ? `-${usd(Math.abs(centerCents))}` : usd(centerCents)}
                      </tspan>
                      <tspan x={cx} y={(cy ?? 0) + 16} className="fill-muted-foreground text-11">
                        {centerLabel}
                      </tspan>
                    </text>
                  );
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
        {c.state === "over_limit" && (
          <Badge variant="destructive" className="absolute bottom-0 left-1/2 -translate-x-1/2 text-10">
            {usd(c.overCents)} over limit
          </Badge>
        )}
        {c.state === "in_buffer" && (
          <Badge
            variant="secondary"
            className="absolute bottom-0 left-1/2 -translate-x-1/2 border-warning/40 text-10 text-warning"
          >
            {usd(c.overCents)} into buffer
          </Badge>
        )}
        {c.state === "zero_usage" && (
          <p className="absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap text-10 text-muted-foreground">
            No activity yet this cycle
          </p>
        )}
      </div>

      {badge && c.state !== "in_buffer" && c.state !== "over_limit" && (
        <Badge variant={badge.variant} className="text-10">
          {badge.label}
        </Badge>
      )}

      <div className="grid w-full grid-cols-2 gap-x-3 gap-y-1.5 text-11">
        <StatCell
          label={isPrepaid ? "Held (reservations)" : "Credit limit"}
          value={isPrepaid ? usd(fund.held_cents) : usd(fund.credit_limit_cents)}
        />
        <StatCell label="Current usage" value={stats?.currentUsageCents != null ? usd(stats.currentUsageCents) : "—"} />
        <StatCell
          label="Monthly average"
          value={stats?.monthlyAverageCents != null ? usd(stats.monthlyAverageCents) : "—"}
        />
        <StatCell
          label="Projected end of cycle"
          value={stats?.projectedEndOfCycleCents != null ? usd(stats.projectedEndOfCycleCents) : "—"}
        />
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-border/60 border-b pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
