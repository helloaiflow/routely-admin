"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import type { DashboardData } from "./_types";

// "Stop mix" — ranked horizontal bars (command-center redesign, CEO
// 2026-09-01: comparative bars instead of donuts). Two REAL groupings the
// data supports today: package type and stop type. The reference's third
// tab (Location) overlaps with the dedicated Zones card, so it lives there.
const PACKAGE_LABELS: Record<string, string> = {
  rx: "Rx Prescription",
  cold: "Cold Package",
  specimen: "Lab Specimen",
  medical: "Medical Supply",
  urgent: "Urgent",
  document: "Document",
  regular: "Package",
};
const TYPE_LABELS: Record<string, string> = {
  delivery: "Deliveries",
  pickup: "Pickups",
  dropoff: "Dropoffs",
};

type Mode = "package" | "type";

export function StopMixCard({ data, loading }: { data?: DashboardData; loading: boolean }) {
  const [mode, setMode] = useState<Mode>("package");

  const rows = useMemo(() => {
    const stops = data?.stops ?? [];
    const counts = new Map<string, number>();
    for (const s of stops) {
      const raw = mode === "package" ? s.package_type : s.stop_type;
      const labels = mode === "package" ? PACKAGE_LABELS : TYPE_LABELS;
      const key = labels[(raw ?? "").toLowerCase()] ?? (raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Other");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const total = stops.length || 1;
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [data?.stops, mode]);

  const max = rows[0]?.count ?? 1;
  const total = data?.stops?.length ?? 0;

  return (
    <Card size="sm" className="h-full border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="font-semibold text-sm tracking-tight">Stop mix</CardTitle>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="h-7">
              <TabsTrigger value="package" className="px-2.5 text-xs">
                Package
              </TabsTrigger>
              <TabsTrigger value="type" className="px-2.5 text-xs">
                Type
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <CardDescription className="text-xs">
          {total > 0 ? `${total} stops in period` : "Composition of the selected period"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2.5 pb-3">
        {loading && !data ? (
          <Skeleton className="h-[140px] w-full rounded-lg" />
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground/40 text-sm">No data yet</div>
        ) : (
          <>
            {rows.map((r, i) => (
            <div key={r.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 truncate text-muted-foreground">
                  <span
                    className={cn("size-2 shrink-0 rounded-full")}
                    style={{ background: `var(--chart-${Math.min(i + 1, 5) + 0})` }}
                  />
                  {r.label}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold text-foreground">{r.count}</span>
                  <span className="ml-1.5 text-muted-foreground">{r.pct}%</span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(3, Math.round((r.count / max) * 100))}%`,
                    background: `var(--chart-${Math.min(i + 1, 5)})`,
                  }}
                />
              </div>
            </div>
            ))}
            <div className="mt-auto flex items-center justify-between border-border/40 border-t pt-2 text-xs">
              <span className="font-medium text-muted-foreground">Total</span>
              <span className="font-semibold text-foreground tabular-nums">{total}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
