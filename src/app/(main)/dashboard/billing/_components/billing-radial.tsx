"use client";

import { Badge } from "@/components/ui/badge";
import { formatCurrencyCents as usd } from "@/lib/ui/format";
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
  /** 0-100, clamped — legacy single-value fill kept for callers that only need a scalar. */
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
 * ceiling (limit + buffer) entirely.
 *
 * UNCHANGED by the 2026-08-12 radial rework below — that rework only
 * changes how BillingRadial RENDERS this classification (two-tone arc
 * instead of a single saturating ring), never the state/overCents math
 * itself, which the alert text, badge copy, and gate logic elsewhere all
 * depend on staying exactly as-is. */
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

/** What the ring itself draws — two stacked arc segments over a track,
 * never a single value. Kept separate from classifyFund (which stays pure
 * money-state math) because this is purely a rendering concern: how the
 * classification maps onto pixels. */
type RingSegments = {
  /** 0-100 — the "within your granted limit" segment, colored by severity. */
  limitPct: number;
  /** 0-100 — the "inside the buffer cushion" segment, always amber. Only
   * ever non-zero for postpaid in_buffer/over_limit. */
  bufferPct: number;
};

function ringSegments(fund: Fund, c: FundClassification): RingSegments {
  if (c.state === "zero_usage") return { limitPct: 0, bufferPct: 0 };
  if (fund.fund_type === "prepaid") {
    // No buffer concept for a wallet — c.ringPct is already correctly
    // capped (100 for overdrawn, proportional to the 4x-threshold reference
    // otherwise), so the whole used portion is just the "limit" segment.
    return { limitPct: c.ringPct, bufferPct: 0 };
  }
  // Postpaid: the ring's 100% is the HARD CEILING (limit + buffer), not the
  // plain limit — that's what leaves visible room on the ring for the
  // buffer band at all times, and is what keeps over_limit from saturating
  // into one undifferentiated red circle. A tenant who's blown through the
  // entire buffer shows the limit segment fully filled AND the buffer
  // segment fully filled (two-tone, still legible), never a single flat 100%.
  const ringTotal = fund.credit_limit_cents + fund.buffer_cents;
  if (ringTotal <= 0) return { limitPct: 0, bufferPct: 0 };
  const usedForRing = Math.min(c.usedCents, ringTotal);
  const limitCents = Math.min(usedForRing, fund.credit_limit_cents);
  const bufferCents = Math.max(0, usedForRing - fund.credit_limit_cents);
  return {
    limitPct: (limitCents / ringTotal) * 100,
    bufferPct: (bufferCents / ringTotal) * 100,
  };
}

const R = 40;
const STROKE_WIDTH = 10;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** One stroke-dasharray/dashoffset arc segment, `startPct` through the
 * circle to `startPct + lengthPct`. Uses the standard SVG stacked-ring
 * technique: dasharray = [segment, gap], dashoffset = -(everything before
 * this segment) so segments abut cleanly with no rounded-cap overlap. */
function ArcSegment({ startPct, lengthPct, color }: { startPct: number; lengthPct: number; color: string }) {
  if (lengthPct <= 0) return null;
  const len = (lengthPct / 100) * CIRCUMFERENCE;
  const offset = -(startPct / 100) * CIRCUMFERENCE;
  return (
    <circle
      cx={50}
      cy={50}
      r={R}
      fill="none"
      stroke={color}
      strokeWidth={STROKE_WIDTH}
      strokeDasharray={`${len} ${CIRCUMFERENCE - len}`}
      strokeDashoffset={offset}
      transform="rotate(-90 50 50)"
    />
  );
}

/* Single shared billing-summary ring — prepaid and postpaid both render
 * through here (Section 5). Hand-built SVG rather than a chart library:
 * a stacked two-tone ring (limit segment + buffer segment) isn't expressible
 * as one RadialBar value, and the prior Recharts implementation's
 * `background` track relied on the library's own internal default fill
 * (an un-tokenized gray, invisible only because a saturated single-color
 * arc covered it) — full control here means every stroke is a real token,
 * checkable by the design-token gate. Center label is the tenant's OWN
 * "available" figure; the state badge now lives INSIDE the center stack,
 * directly under the label, never floating below the ring. Complementary
 * figures (current usage, monthly average, etc.) render in the caller's own
 * stat grid, not here — this component only needs the /fund payload. */
export function BillingRadial({ fund, className }: { fund: Fund; className?: string }) {
  const c = classifyFund(fund);
  const isPrepaid = fund.fund_type === "prepaid";
  const centerCents = isPrepaid ? fund.balance_cents : fund.available_cents;
  const centerLabel = isPrepaid ? "Prepaid balance" : "Available credit";
  const color = STATE_COLOR[c.state];
  const badge = stateBadge(c);
  const seg = ringSegments(fund, c);
  const markerColor = c.state === "zero_usage" ? "var(--border)" : color;

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative mx-auto aspect-square w-full max-w-[220px]">
        <svg viewBox="0 0 100 100" className="size-full">
          <title>{centerLabel}</title>
          {/* Base track — a real token, not a chart library's baked-in default. */}
          <circle cx={50} cy={50} r={R} fill="none" stroke="var(--muted)" strokeWidth={STROKE_WIDTH} />
          <ArcSegment startPct={0} lengthPct={seg.limitPct} color={color} />
          <ArcSegment startPct={seg.limitPct} lengthPct={seg.bufferPct} color="var(--warning)" />
          {/* Marker dot at the ring's start (12 o'clock, angle=0) — a fixed
           * reference point on the track, independent of the fill's own
           * percentage, so the ring reads as a real gauge with a start/end
           * rather than an abstract arc. */}
          <circle cx={50} cy={50 - R} r={2.5} fill={markerColor} stroke="var(--background)" strokeWidth={1} />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-5 text-center">
          <span
            className="font-bold text-2xl tabular-nums"
            style={{ color: c.state === "zero_usage" ? "var(--muted-foreground)" : "var(--foreground)" }}
          >
            {centerCents < 0 ? `-${usd(Math.abs(centerCents))}` : usd(centerCents)}
          </span>
          <span className="text-11 text-muted-foreground">{centerLabel}</span>
          {badge && (
            <Badge
              variant={badge.variant}
              className={cn(
                "!whitespace-normal h-auto max-w-full text-center text-10 leading-tight",
                badge.variant === "secondary" && "border-warning/40 text-warning",
              )}
            >
              {badge.label}
            </Badge>
          )}
        </div>
      </div>

      {c.state === "zero_usage" && <p className="text-10 text-muted-foreground">No activity yet this cycle</p>}
    </div>
  );
}
