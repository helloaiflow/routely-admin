"use client";

import { useMemo } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { DashboardData } from "./_types";

// Unified KPI command strip (command-center redesign, CEO 2026-09-01):
// replaces the four separate KPI cards with ONE horizontal strip — Total ·
// Delivered · In transit · Unassigned · Failed · Success rate — per the
// reference. Percentages of total are computed here from the SAME kpis
// object every other card reads; the success-rate ring is the only radial
// element on the page. "vs previous period" comparisons are NOT rendered:
// the API only exposes vs-yesterday deltas today (documented gap).
interface Cell {
  key: string;
  label: string;
  value: number;
  pct: number | null; // % of total, when meaningful
  tone?: "danger" | "warning";
  title: string;
}

function SuccessRing({ pct }: { pct: number | null }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const filled = pct == null ? 0 : (pct / 100) * c;
  return (
    <svg viewBox="0 0 44 44" className="size-12 shrink-0" role="img" aria-label={`Success rate ${pct ?? "—"}%`}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--muted)" strokeWidth="5" opacity="0.5" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${c - filled}`}
        transform="rotate(-90 22 22)"
      />
    </svg>
  );
}

export function OpsMetricStrip({ data, loading }: { data?: DashboardData; loading: boolean }) {
  const cells = useMemo<Cell[]>(() => {
    const k = data?.kpis;
    const stops = data?.stops ?? [];
    const total = k?.total ?? 0;
    const unassigned = stops.filter((s) => s.status === "unassigned").length;
    const pctOf = (n: number) => (total > 0 ? Math.round((n / total) * 100) : null);
    return [
      { key: "total", label: "Total stops", value: total, pct: null, title: "Stops scheduled in the selected period" },
      {
        key: "delivered",
        label: "Delivered",
        value: k?.delivered ?? 0,
        pct: pctOf(k?.delivered ?? 0),
        title: "Delivered in the selected period (Spoke-confirmed)",
      },
      {
        key: "in_transit",
        label: "In transit",
        value: k?.in_transit ?? 0,
        pct: pctOf(k?.in_transit ?? 0),
        title: "Currently assigned / moving",
      },
      {
        key: "unassigned",
        label: "Unassigned",
        value: unassigned,
        pct: pctOf(unassigned),
        tone: "warning",
        title: "Stops with no driver or route yet",
      },
      {
        key: "failed",
        label: "Failed",
        value: k?.failed ?? 0,
        pct: pctOf(k?.failed ?? 0),
        tone: "danger",
        title: "Could not be delivered",
      },
    ];
  }, [data?.kpis, data?.stops]);

  const successPct = useMemo(() => {
    const k = data?.kpis;
    if (!k || k.delivered + k.failed === 0) return null;
    return Math.round((k.delivered / (k.delivered + k.failed)) * 100);
  }, [data?.kpis]);

  return (
    <Card size="sm" className="border-border/60 py-0 shadow-sm">
      <div className="grid grid-cols-2 divide-border/60 sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
        {cells.map((c) => (
          <div key={c.key} className="flex flex-col gap-0.5 px-4 py-3" title={c.title}>
            <span
              className={cn(
                "text-[11px] uppercase tracking-wide",
                c.tone === "danger"
                  ? "font-medium text-rose-600 dark:text-rose-400"
                  : c.tone === "warning"
                    ? "font-medium text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground",
              )}
            >
              {c.label}
            </span>
            {loading && !data ? (
              <div className="h-8 w-14 animate-pulse rounded bg-muted" />
            ) : (
              <span className="flex items-baseline gap-1.5">
                <span className="font-bold text-3xl tracking-tight tabular-nums">{c.value}</span>
                {c.pct != null && <span className="text-muted-foreground text-xs tabular-nums">{c.pct}%</span>}
              </span>
            )}
          </div>
        ))}
        <div
          className="flex items-center gap-3 px-4 py-3.5"
          title="Delivered ÷ (delivered + failed) — pre-terminal stops don't count against the rate"
        >
          <SuccessRing pct={loading && !data ? null : successPct} />
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Success rate</span>
            {loading && !data ? (
              <div className="h-8 w-14 animate-pulse rounded bg-muted" />
            ) : (
              <span className="font-bold text-3xl tracking-tight tabular-nums">
                {successPct == null ? "—" : `${successPct}%`}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
