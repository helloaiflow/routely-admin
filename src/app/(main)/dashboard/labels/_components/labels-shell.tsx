"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CalendarRange, Check, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ActivityTab } from "./activity-tab";
import { LabelsTable } from "./labels-table";
import { OverviewTab } from "./overview-tab";
import { type LabelOrder, RANGE_DAYS, type RangeKey } from "./types";

const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

export function LabelsShell() {
  const [orders, setOrders] = useState<LabelOrder[] | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState<RangeKey>("30d");
  const errorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/client/labels")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!cancelled) setOrders((d.orders ?? []) as LabelOrder[]);
      })
      .catch(() => {
        if (!cancelled) {
          setOrders([]);
          setError("Couldn't load your labels. Refresh to try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  /* Range filter shared by the tabs (Overview computes its own deltas). */
  const ranged = useMemo(() => {
    if (!orders) return [];
    if (range === "all") return orders;
    const start = Date.now() - RANGE_DAYS[range] * 86400_000;
    return orders.filter((o) => new Date(o.created_at).getTime() >= start);
  }, [orders, range]);

  const loading = orders === null;

  // No max-w on the root: the dashboard layout applies the user's
  // centered/full-width preference — a hardcoded container would override it.
  return (
    <div className="@container/main w-full space-y-4 px-4 py-4 sm:px-6">
      {/* ── Header: title + controls ON TOP (CEO rule) ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="type-page-title">Shipping Labels</h1>
          <p className="type-desc mt-0.5">USPS · UPS · FedEx labels bought through Routely</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              aria-label="Date range"
              className="h-8 gap-1.5 rounded-md border-border bg-background px-2.5 font-medium text-xs hover:bg-muted dark:bg-input/30"
            >
              <CalendarRange className="size-3.5" aria-hidden="true" />
              {RANGE_LABELS[range]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
              <DropdownMenuItem key={k} onClick={() => setRange(k)} className="justify-between gap-4 text-xs">
                {RANGE_LABELS[k]}
                {range === k && <Check className="size-3.5" aria-hidden="true" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button asChild className="h-9 gap-1.5 bg-primary font-semibold text-white hover:bg-primary/90">
          <a href="/dashboard/orders/new">
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Buy Label</span>
          </a>
        </Button>
      </div>

      {error && (
        <div
          ref={errorRef}
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-destructive text-sm"
        >
          <X className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{error}</span>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="labels">Labels</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3">
          {loading ? <OverviewSkeleton /> : <OverviewTab orders={orders} range={range} />}
        </TabsContent>
        <TabsContent value="labels" className="mt-3">
          {loading ? <TableSkeleton /> : <LabelsTable orders={ranged} />}
        </TabsContent>
        <TabsContent value="activity" className="mt-3">
          {loading ? <TableSkeleton /> : <ActivityTab orders={ranged} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[280px] rounded-xl" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-9 rounded-lg" />
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Skeleton key={i} className="h-12 rounded-lg" />
      ))}
    </div>
  );
}
