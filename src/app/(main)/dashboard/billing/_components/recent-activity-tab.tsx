"use client";

import { useEffect, useState } from "react";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyCents as centsToUsd } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

import { computeCyclePeriod } from "./billing-cycle";
import { BillingFilterBar } from "./billing-filter-bar";
import { ChargeDetailDrawer, type ChargeRow } from "./charge-detail-drawer";
import { OUTCOME_DOT, TYPE_LABEL } from "./charge-detail-panel";
import { DailyChargesChart } from "./daily-charges-chart";
import { useBillingFilters } from "./use-billing-filters";

const PAGE_SIZE = 15;
const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/* Recent Activity — its own tab (Section 3), moved out of Overview.
 * Richer than the old embedded snippet: the daily chart, the SAME shared
 * filter bar/URL contract Charges uses, and the full list (not a 8-row
 * teaser). Reuses ChargeDetailDrawer — clicking a row here opens the exact
 * same detail surface Charges does. */
export function RecentActivityTab() {
  const filterState = useBillingFilters("attempted_at");
  const { filters, setOffset } = filterState;

  const [cyclePeriod, setCyclePeriod] = useState<{ start: Date; end: Date } | null>(null);
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [selected, setSelected] = useState<ChargeRow | null>(null);

  useEffect(() => {
    fetch("/api/client/billing/overview")
      .then((r) => r.json())
      .then((d) => setCyclePeriod(computeCyclePeriod(d.cycle)))
      .catch(() => {
        /* best-effort — chart just shows its own error state */
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    setErrored(false);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(filters.offset) });
    if (filters.type !== "all") params.set("resolved_type", filters.type);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.dateFrom) params.set("date_from", toISODate(filters.dateFrom));
    if (filters.dateTo) params.set("date_to", toISODate(filters.dateTo));
    if (filters.sortBy) params.set("sort_by", filters.sortBy);
    params.set("sort_dir", filters.sortDir);
    fetch(`/api/client/billing/ledger?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => setErrored(true))
      .finally(() => setLoading(false));
  }, [filters]);

  const page = Math.floor(filters.offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : filters.offset + 1;
  const rangeEnd = Math.min(filters.offset + PAGE_SIZE, total);

  return (
    <div className="space-y-4">
      <DailyChargesChart cycleStart={cyclePeriod?.start ?? null} cycleEnd={cyclePeriod?.end ?? null} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <BillingFilterBar {...filterState} />

          {loading ? (
            <div className="space-y-2 pt-2">
              {Array.from({ length: 6 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton count, list never reorders
                <Skeleton key={`ra-${i}`} className="h-9 w-full" />
              ))}
            </div>
          ) : errored ? (
            <p className="p-6 text-center text-13 text-muted-foreground">Couldn't load recent activity.</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-13 text-muted-foreground">No charges match these filters.</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-13">
                  <thead>
                    <tr className="border-border/60 border-b text-11 text-muted-foreground">
                      <th className="w-6 px-2 py-2" />
                      <th className="px-2 py-2 text-left font-medium">Tracking ID</th>
                      <th className="px-2 py-2 text-left font-medium">Type</th>
                      <th className="px-2 py-2 text-left font-medium">Attempt</th>
                      <th className="px-2 py-2 text-left font-medium">Status</th>
                      <th className="px-2 py-2 text-left font-medium">Date</th>
                      <th className="px-2 py-2 text-right font-medium">Amount</th>
                      <th className="w-8 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className="h-9 cursor-pointer border-border/40 border-b transition-colors last:border-0 hover:bg-muted/50"
                        onClick={() => setSelected(r)}
                      >
                        <td className="px-2">
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              OUTCOME_DOT[r.outcome] ?? "bg-muted-foreground",
                            )}
                          />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-12">{r.stop_id}</td>
                        <td className="px-2 py-1.5">
                          <Badge variant="outline" className="text-10">
                            {TYPE_LABEL[r.resolved_type] ?? r.resolved_type}
                          </Badge>
                        </td>
                        <td className="px-2 py-1.5">
                          {r.attempt_seq != null && (
                            <Badge variant="secondary" className="text-10">
                              Attempt {r.attempt_seq}
                            </Badge>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Badge variant={r.document_id ? "secondary" : "outline"} className="text-10">
                            {r.document_id ? "Invoiced" : "Unbilled"}
                          </Badge>
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {new Date(r.attempted_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {centsToUsd(r.amount_cents)}
                        </td>
                        <td className="px-2 py-1.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-6"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelected(r)}>View details</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-border/60 sm:hidden">
                {rows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelected(r)}
                    className="flex w-full flex-col gap-1 px-1 py-2.5 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-mono text-12">
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            OUTCOME_DOT[r.outcome] ?? "bg-muted-foreground",
                          )}
                        />
                        {r.stop_id}
                      </span>
                      <span className="font-medium tabular-nums">{centsToUsd(r.amount_cents)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-11 text-muted-foreground">
                      <Badge variant="outline" className="text-10">
                        {TYPE_LABEL[r.resolved_type] ?? r.resolved_type}
                      </Badge>
                      <Badge variant={r.document_id ? "secondary" : "outline"} className="text-10">
                        {r.document_id ? "Invoiced" : "Unbilled"}
                      </Badge>
                      <span>{new Date(r.attempted_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between border-border/60 border-t pt-2.5 text-11">
                <span className="text-muted-foreground">
                  Showing {rangeStart}–{rangeEnd} of {total}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    disabled={filters.offset === 0}
                    onClick={() => setOffset(Math.max(0, filters.offset - PAGE_SIZE))}
                  >
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  {Array.from({ length: pageCount }, (_, i) => i + 1)
                    .slice(0, 5)
                    .map((p) => (
                      <Button
                        key={p}
                        size="icon"
                        variant={p === page ? "outline" : "ghost"}
                        className="size-7 text-11"
                        onClick={() => setOffset((p - 1) * PAGE_SIZE)}
                      >
                        {p}
                      </Button>
                    ))}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    disabled={filters.offset + PAGE_SIZE >= total}
                    onClick={() => setOffset(filters.offset + PAGE_SIZE)}
                  >
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ChargeDetailDrawer charge={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
