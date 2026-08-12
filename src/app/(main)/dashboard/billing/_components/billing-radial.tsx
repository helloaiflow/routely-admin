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

// over_limit (postpaid) and overdrawn (prepaid) are deliberately DISTINCT
// states, not the same state reused across fund types — they have different
// causes and different remedies. over_limit means committed+unpaid exceeded
// the credit line Routely extended (remedy: raise the limit, or collect via
// invoice — the money is a receivable, tracked in billing_ledger/documents
// regardless of method). overdrawn means the wallet itself — real money
// Routely already holds — has gone negative (remedy: top up now; this can
// happen post-Part-A since a charge always debits at settle time with no
// gate there, only at reservation time, so a charge that lands without a
// reservation, e.g. a legacy/manual path or one whose reservation's orphan-
// expiry already fired, can overdraw the balance). Conflating them under one
// label would tell a prepaid tenant to "raise their limit" when the actual
// fix is "add funds," so the copy and the color both stay separate below.
export type FundState = "healthy" | "healthy_watch" | "in_buffer" | "over_limit" | "overdrawn" | "zero_usage";

export type FundClassification = {
  state: FundState;
  /** 0-100, clamped — what the ring itself renders. */
  ringPct: number;
  /** Unclamped usage as a fraction of capacity — can exceed 100 for postpaid over-limit. */
  usedPct: number;
  capacityCents: number;
  usedCents: number;
  /** Only set for in_buffer/over_limit/overdrawn — the amount past the healthy zero-point. */
  overCents: number;
};

/* Pure classification — no fetch, no side effects — so every state can be
 * fed synthetic fixtures for verification without touching real tenant data.
 * Postpaid math is exactly compute_available_fund's formula (app/services/
 * fund.py, corrected 2026-08-11): available_cents = credit_limit_cents -
 * reserved_cents - unpaid_ledger_cents — relative to the PLAIN limit. The
 * buffer is additional headroom BEYOND that limit, never a carve-out of it
 * (the earlier version subtracted the buffer here too, which silently
 * withheld 10% of the credit line a tenant was promised — a tenant with a
 * $1000 limit could only actually spend $900 before being blocked at
 * draft->stop time). So: available>=0 is healthy (at/under the limit);
 * available in [-buffer, 0) is "in the cushion" (past the limit, buffer
 * absorbing it, never blocking); available < -buffer is past the hard
 * ceiling (limit + buffer) entirely. */
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
      // Past the HARD ceiling (limit + buffer), not just past the plain
      // limit — the buffer's own amount has to come off too, or this would
      // double-count the cushion as still-available when it's already gone.
      overCents = usedCents - capacityCents - fund.buffer_cents;
    }
    return { state, ringPct: Math.min(100, usedPct), usedPct, capacityCents, usedCents, overCents };
  }

  // Prepaid: no buffer, no nominal "limit" to divide by (a wallet can always
  // be topped up further) — the ring instead gauges balance against a
  // comfortable reference point (4x the configured low-balance threshold),
  // which is always available on this same payload with no extra fetch.
  //
  // Classification runs off balance_cents alone, NOT available_cents
  // (balance - held). held_cents is a soft, temporary earmark for in-flight
  // reservations — real money nobody has taken yet — surfaced separately in
  // the "Held" stat cell, but it does not make the wallet overdrawn on its
  // own. Only balance_cents < 0 is an actual overdraft: real money already
  // spent (settle_charge debits unconditionally at charge time — Part A) that
  // the wallet didn't have. Gating on available_cents here would have flagged
  // "over limit" the moment holds alone exceeded a perfectly solvent balance,
  // which is a different, much milder situation than genuinely being negative.
  const capacityCents = Math.max(fund.low_balance_threshold_cents * 4, 1);
  const usedCents = fund.balance_cents;
  if (fund.balance_cents === 0 && fund.held_cents === 0) {
    return { state: "zero_usage", ringPct: 0, usedPct: 0, capacityCents, usedCents: 0, overCents: 0 };
  }
  if (fund.balance_cents < 0) {
    return {
      state: "overdrawn",
      ringPct: 100,
      usedPct: 100,
      capacityCents,
      usedCents,
      overCents: -fund.balance_cents,
    };
  }
  const ringPct = Math.min(100, (fund.balance_cents / capacityCents) * 100);
  const state: FundState = fund.balance_cents <= fund.low_balance_threshold_cents ? "healthy_watch" : "healthy";
  return { state, ringPct, usedPct: ringPct, capacityCents, usedCents, overCents: 0 };
}

const STATE_COLOR: Record<FundState, string> = {
  healthy: "var(--success)",
  healthy_watch: "var(--warning)",
  in_buffer: "var(--warning)",
  over_limit: "var(--destructive)",
  overdrawn: "var(--destructive)",
  zero_usage: "var(--muted-foreground)",
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

// One badge, always in NORMAL FLOW below the ring — never absolutely
// positioned over it. An earlier version pinned the over_limit/in_buffer/
// overdrawn badges to the ring's own bottom edge, which visually collided
// with the ring's colored arc at exactly the percentages those states
// produce (both are ~100% filled by construction) and made the badge text
// unreadable. One consistent slot avoids that entirely.
function stateBadge(c: FundClassification): { label: string; variant: "secondary" | "outline" | "destructive" } | null {
  switch (c.state) {
    case "healthy":
      return null;
    case "healthy_watch":
      return { label: "Approaching limit", variant: "secondary" };
    case "in_buffer":
      return { label: `${usd(c.overCents)} into buffer — past the safe limit`, variant: "secondary" };
    case "over_limit":
      return { label: `${usd(c.overCents)} past hard ceiling (limit + buffer)`, variant: "destructive" };
    case "overdrawn":
      return { label: `${usd(c.overCents)} overdrawn — add funds`, variant: "destructive" };
    case "zero_usage":
      return null;
  }
}

/* Single shared billing-summary ring — prepaid and postpaid both render
 * through here (Section 5). Center label is the tenant's OWN "available"
 * figure (available credit for postpaid, balance for prepaid) since that's
 * the number the ring's fullness/emptiness directly represents; complementary
 * figures (current usage, monthly average, projected end of cycle, limit)
 * render as a compact row below, fed by the caller from /summary — this
 * component only needs the /fund payload for its own math. */
export function BillingRadial({ fund, className }: { fund: Fund; className?: string }) {
  const c = classifyFund(fund);
  const isPrepaid = fund.fund_type === "prepaid";
  const centerCents = isPrepaid ? fund.balance_cents : fund.available_cents;
  const centerLabel = isPrepaid ? "Prepaid balance" : "Available credit";
  const color = STATE_COLOR[c.state];
  const badge = stateBadge(c);
  const chartData = [{ metric: "used", value: c.ringPct, fill: color }];

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative mx-auto aspect-square w-full max-w-[220px]">
        {/* Marker dot at the ring's start (12 o'clock, angle=0) — a fixed
         * reference point on the track, independent of the fill's own
         * percentage, so the ring reads as a real gauge with a start/end
         * rather than an abstract arc. */}
        <span
          className="-translate-x-1/2 absolute top-0 left-1/2 z-10 size-2 rounded-full border-2 border-background"
          style={{ backgroundColor: color }}
        />
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
      </div>

      {badge && (
        <Badge
          variant={badge.variant}
          className={cn("text-10", badge.variant === "secondary" && "border-warning/40 text-warning")}
        >
          {badge.label}
        </Badge>
      )}
      {c.state === "zero_usage" && <p className="text-10 text-muted-foreground">No activity yet this cycle</p>}
    </div>
  );
}
