"use client";

import { useMemo } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isDelivered, isFailed, isInMotion } from "@/lib/status";

import type { DashboardData } from "./_types";

// "Delivery status" — one horizontal stacked bar + a compact table
// (command-center redesign, CEO 2026-09-01: no concentric donuts). The
// four groups reuse the SAME canonical classifiers (lib/status.ts) the
// KPIs use, so this card can never disagree with the strip above it.
const GROUPS = [
  { key: "delivered", label: "Delivered", color: "var(--primary)" },
  { key: "in_transit", label: "In transit", color: "var(--chart-2)" },
  { key: "unassigned", label: "Unassigned", color: "var(--color-amber-500)" },
  { key: "pending", label: "Pending", color: "var(--chart-1)" },
  { key: "failed", label: "Failed", color: "var(--destructive)" },
] as const;

export function DeliveryStatusCard({ data, loading }: { data?: DashboardData; loading: boolean }) {
  const rows = useMemo(() => {
    const stops = data?.stops ?? [];
    const counts: Record<string, number> = { delivered: 0, in_transit: 0, unassigned: 0, pending: 0, failed: 0 };
    for (const s of stops) {
      if (isDelivered(s)) counts.delivered++;
      else if (isFailed(s)) counts.failed++;
      else if (isInMotion(s)) counts.in_transit++;
      else if (s.status === "unassigned") counts.unassigned++;
      else counts.pending++;
    }
    const total = stops.length;
    return GROUPS.map((g) => ({
      ...g,
      count: counts[g.key],
      pct: total > 0 ? Math.round((counts[g.key] / total) * 100) : 0,
    })).filter((r) => r.count > 0);
  }, [data?.stops]);

  const total = data?.stops?.length ?? 0;

  return (
    <Card size="sm" className="h-full border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="font-semibold text-sm tracking-tight">Delivery status</CardTitle>
        <CardDescription className="text-xs">
          {total > 0 ? `${total} stops · same classifiers as the KPIs` : "Status breakdown"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 pb-3">
        {loading && !data ? (
          <Skeleton className="h-[140px] w-full rounded-lg" />
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground/40 text-sm">No data yet</div>
        ) : (
          <>
            {/* Single stacked distribution bar */}
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full"
              role="img"
              aria-label={rows.map((r) => `${r.label} ${r.count} (${r.pct}%)`).join(", ")}
            >
              {rows.map((r) => (
                <div
                  key={r.key}
                  style={{ width: `${Math.max(2, r.pct)}%`, background: r.color }}
                  title={`${r.label} — ${r.count} (${r.pct}%)`}
                />
              ))}
            </div>
            <div className="flex flex-col">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-border/40 border-b pb-1 text-[11px] text-muted-foreground">
                <span>Status</span>
                <span className="text-right">Stops</span>
                <span className="w-12 text-right">% of total</span>
              </div>
              {rows.map((r) => (
                <div
                  key={r.key}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-border/30 border-b py-1.5 text-xs"
                >
                  <span className="flex items-center gap-1.5 truncate text-muted-foreground">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />
                    {r.label}
                  </span>
                  <span className="text-right font-semibold text-foreground tabular-nums">{r.count}</span>
                  <span className="w-12 text-right text-muted-foreground tabular-nums">{r.pct}%</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-1.5 text-xs">
                <span className="font-medium text-foreground">Total</span>
                <span className="text-right font-semibold text-foreground tabular-nums">{total}</span>
                <span className="w-12 text-right text-muted-foreground tabular-nums">100%</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
