"use client";

import { useMemo } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isDelivered } from "@/lib/status";

import type { DashboardData } from "./_types";

// "Zones" as delivery PROGRESS per zone (CEO, 2026-09-01 v2): each bar is
// delivered ÷ total for that zone — "North · 25 / 50 · 50% completed" —
// computed from the same stops population every other card reads. Zone
// names stay fully dynamic (D46): whatever keys the data carries render,
// never a hardcoded list.
interface ZoneRow {
  zone: string;
  delivered: number;
  total: number;
  pct: number;
}

export function ZonesCapacityCard({ data, loading }: { data?: DashboardData; loading: boolean }) {
  const { rows, totals } = useMemo(() => {
    const stops = data?.stops ?? [];
    const byZone = new Map<string, { delivered: number; total: number }>();
    for (const s of stops) {
      const zone = s.zone?.trim() || "Unassigned";
      const e = byZone.get(zone) ?? { delivered: 0, total: 0 };
      e.total++;
      if (isDelivered(s)) e.delivered++;
      byZone.set(zone, e);
    }
    const rows: ZoneRow[] = [...byZone.entries()]
      .map(([zone, e]) => ({
        zone,
        delivered: e.delivered,
        total: e.total,
        pct: e.total > 0 ? Math.round((e.delivered / e.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
    const delivered = rows.reduce((a, r) => a + r.delivered, 0);
    const total = rows.reduce((a, r) => a + r.total, 0);
    return {
      rows,
      totals: { delivered, total, pct: total > 0 ? Math.round((delivered / total) * 100) : 0 },
    };
  }, [data?.stops]);

  return (
    <Card size="sm" className="h-full border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="font-semibold text-sm tracking-tight">Zones</CardTitle>
        <CardDescription className="text-xs">
          {rows.length > 0 ? `Delivery progress · ${rows.length} zones` : "Delivery progress by zone"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 pb-3">
        {loading && !data ? (
          <Skeleton className="h-[140px] w-full rounded-lg" />
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground/40 text-sm">No data yet</div>
        ) : (
          <>
            {rows.map((r) => (
              <div key={r.zone} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-foreground">{r.zone}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    <span className="font-semibold text-foreground">{r.delivered}</span> / {r.total} ·{" "}
                    {r.pct}% completed
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-muted/50"
                  role="progressbar"
                  aria-valuenow={r.pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${r.zone}: ${r.delivered} of ${r.total} delivered`}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${r.pct}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="mt-auto flex items-center justify-between border-border/40 border-t pt-2 text-xs">
              <span className="font-medium text-muted-foreground">Total</span>
              <span className="text-muted-foreground tabular-nums">
                <span className="font-semibold text-foreground">{totals.delivered}</span> / {totals.total} ·{" "}
                {totals.pct}% completed
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
