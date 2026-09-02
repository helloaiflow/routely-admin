"use client";

import { useMemo } from "react";

import { AlertTriangle, ChevronRight, Clock, PenLine, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isDelivered, isInMotion } from "@/lib/status";
import { cn } from "@/lib/utils";

import type { DashboardData } from "./_types";

// "Needs attention" — the dispatcher action card (command-center redesign,
// CEO 2026-09-01). Every row is computed from the SAME stops the rest of
// the dashboard reads, and every button performs a REAL action (jumps to
// the Stops tab, where the full grid lives). The risk line is deliberately
// DETERMINISTIC — in-transit stops whose ETA is already in the past — not
// a fake AI prediction; a real SLA model is a backend mission.
interface AttentionRow {
  key: string;
  icon: typeof AlertTriangle;
  iconCls: string;
  borderCls?: string;
  count: number;
  label: string;
  sub: string;
  action: string;
}

export function NeedsAttentionCard({
  data,
  loading,
  onGoToStops,
}: {
  data?: DashboardData;
  loading: boolean;
  onGoToStops: () => void;
}) {
  const rows = useMemo<AttentionRow[]>(() => {
    const stops = data?.stops ?? [];
    const unassigned = stops.filter((s) => s.status === "unassigned").length;
    const failed = data?.kpis?.failed ?? 0;
    const sigPending = stops.filter((s) => s.requires_signature === true && !isDelivered(s)).length;
    const out: AttentionRow[] = [];
    if (unassigned > 0)
      out.push({
        key: "unassigned",
        icon: AlertTriangle,
        iconCls: "text-amber-500",
        borderCls: "border-amber-300/60 dark:border-amber-700/50",
        count: unassigned,
        label: `${unassigned} unassigned stop${unassigned === 1 ? "" : "s"}`,
        sub: "Require assignment to a driver or route",
        action: "Assign",
      });
    if (failed > 0)
      out.push({
        key: "failed",
        icon: XCircle,
        iconCls: "text-rose-500",
        borderCls: "border-rose-300/60 dark:border-rose-800/50",
        count: failed,
        label: `${failed} failed deliver${failed === 1 ? "y" : "ies"}`,
        sub: "Need resolution or reattempt",
        action: "Review",
      });
    if (sigPending > 0)
      out.push({
        key: "signature",
        icon: PenLine,
        iconCls: "text-muted-foreground",
        count: sigPending,
        label: `${sigPending} signature-required`,
        sub: "Awaiting recipient signature",
        action: "View",
      });
    return out;
  }, [data?.stops, data?.kpis?.failed]);

  // Deterministic risk: in-transit stops whose ETA timestamp already passed.
  const pastEta = useMemo(() => {
    const now = Date.now();
    return (data?.stops ?? []).filter((s) => {
      if (!isInMotion(s) || !s.eta_at) return false;
      const t = new Date(s.eta_at).getTime();
      return Number.isFinite(t) && t < now;
    }).length;
  }, [data?.stops]);

  const totalIssues = rows.reduce((a, r) => a + r.count, 0);

  return (
    <Card size="sm" className="h-full border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-semibold text-sm tracking-tight">
          Needs attention
          {totalIssues > 0 && (
            <span className="rounded-full bg-rose-500/10 px-2 py-0.5 font-semibold text-[11px] text-rose-600 tabular-nums dark:text-rose-400">
              {totalIssues}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 pb-3">
        {loading && !data ? (
          <>
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-6 text-muted-foreground/50 text-sm">
            Nothing needs attention — all clear
          </div>
        ) : (
          rows.map((r) => (
            <div
              key={r.key}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2",
                r.borderCls,
              )}
            >
              <r.icon className={cn("size-4 shrink-0", r.iconCls)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[13px] text-foreground leading-tight">{r.label}</p>
                <p className="truncate text-[11px] text-muted-foreground leading-tight">{r.sub}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 shrink-0 px-2.5 text-xs"
                onClick={onGoToStops}
                aria-label={`${r.action} — open the Stops tab`}
              >
                {r.action}
              </Button>
            </div>
          ))
        )}

        {/* Deterministic risk block — real ETAs, not a prediction model */}
        {!loading && data && (
          <div className="mt-auto border-border/40 border-t pt-2.5">
            <p className="font-semibold text-[13px] text-foreground">
              {pastEta > 0 ? (
                <>
                  <span className="text-rose-600 dark:text-rose-400">{pastEta}</span> stop
                  {pastEta === 1 ? " is" : "s are"} past their ETA
                </>
              ) : (
                "No stops past their ETA"
              )}
            </p>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="size-3" aria-hidden="true" />
                Based on live ETAs of in-transit stops
              </p>
              <button
                type="button"
                onClick={onGoToStops}
                className="flex shrink-0 items-center gap-0.5 font-medium text-[11px] text-primary hover:underline"
              >
                Open stops
                <ChevronRight className="size-3" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
