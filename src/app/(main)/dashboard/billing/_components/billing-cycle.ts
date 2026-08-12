import type { Overview } from "./amount-due-card";

export type CyclePeriod = { start: Date; end: Date };

const CADENCE_MS: Record<string, number> = {
  weekly: 7 * 86400_000,
  biweekly: 14 * 86400_000,
};

/* cycle.next_close_at is the one date-math result routely-api actually owns
 * (billing_cycles table, per-tenant cadence/anchor_day/timezone — see
 * app/services/billing.py close_cycle_for_tenant). Reimplementing full
 * cadence math client-side would drift from that the moment a tenant's
 * cadence/anchor changes; instead this trusts next_close_at as the cycle's
 * END and derives START by stepping back exactly one cadence period, which
 * is only ever used for DISPLAY (the header period label, the timeline) —
 * never for anything that gates money. Monthly (today's only seeded
 * cadence) steps back a calendar month; weekly/biweekly step back fixed
 * days; unknown cadences fall back to monthly's calendar-month step. */
export function computeCyclePeriod(cycle: Overview["cycle"]): CyclePeriod | null {
  if (!cycle?.next_close_at) return null;
  const end = new Date(cycle.next_close_at);
  if (Number.isNaN(end.getTime())) return null;

  const ms = CADENCE_MS[cycle.cadence];
  if (ms) return { start: new Date(end.getTime() - ms), end };

  // monthly / custom_day / unknown: step back one calendar month
  const start = new Date(end);
  start.setMonth(start.getMonth() - 1);
  return { start, end };
}

const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtFull = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "Aug 1–31, 2026" (same month) or "Aug 1 – Sep 1, 2026" (spans months). */
export function formatPeriodLabel(period: CyclePeriod): string {
  const displayEnd = new Date(period.end.getTime() - 86400_000); // end is exclusive (next cycle's start)
  const sameMonth =
    period.start.getMonth() === displayEnd.getMonth() && period.start.getFullYear() === displayEnd.getFullYear();
  if (sameMonth) {
    return `${period.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${displayEnd.getDate()}, ${displayEnd.getFullYear()}`;
  }
  return `${fmtDay(period.start)} – ${fmtFull(displayEnd)}`;
}

export { fmtDay };
