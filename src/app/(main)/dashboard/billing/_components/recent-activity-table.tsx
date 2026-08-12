"use client";

import { useEffect, useState } from "react";

import { ChevronLeft, ChevronRight, MoreHorizontal, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type DateRange, DateRangePicker } from "@/components/ui/date-range-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { ChargeDetailDrawer, type ChargeRow } from "./charge-detail-drawer";

const PAGE_SIZE = 8;
const TYPE_LABEL: Record<string, string> = {
  package: "Package",
  miles: "Miles",
  on_demand: "On-Demand",
  prepaid_label: "Label",
};
const OUTCOME_DOT: Record<string, string> = { delivered: "bg-success", failed: "bg-destructive" };
const centsToUsd = (c: number | null) => `$${((c ?? 0) / 100).toFixed(2)}`;
const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/* Row 3 (Section 9) — the full data grid, distinct from Overview's old
 * 15-row list: server-side search/filter/date-range/pagination, all via the
 * SAME /api/client/billing/ledger proxy the Charges tab already uses (no new
 * endpoint). PAGE_SIZE=8 matches the reference's "Showing 1–8 of 15"
 * footer — deliberately smaller than Charges' own 25/page since this is a
 * glance-level feed, not the primary data-grid surface. */
export function RecentActivityTable({
  defaultRange,
  onViewAll,
}: {
  defaultRange: DateRange | null;
  onViewAll: () => void;
}) {
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange | null>(defaultRange);
  const [selected, setSelected] = useState<ChargeRow | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: seed the date filter once the cycle period resolves, without fighting the user's own later picks
  useEffect(() => {
    if (defaultRange && !range) setRange(defaultRange);
  }, [defaultRange]);

  useEffect(() => {
    setLoading(true);
    setErrored(false);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (type !== "all") params.set("resolved_type", type);
    if (search.trim()) params.set("search", search.trim());
    if (range) {
      params.set("date_from", toISODate(range.from));
      params.set("date_to", toISODate(range.to));
    }
    fetch(`/api/client/billing/ledger?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => setErrored(true))
      .finally(() => setLoading(false));
  }, [offset, type, search, range]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm">Recent activity</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-[180px]">
            <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search tracking ID"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              className="h-8 pl-8 text-13"
            />
          </div>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v);
              setOffset(0);
            }}
          >
            <SelectTrigger className="h-8 w-[130px] text-13">
              <SelectValue placeholder="All activity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All activity</SelectItem>
              <SelectItem value="package">Package</SelectItem>
              <SelectItem value="miles">Miles</SelectItem>
              <SelectItem value="on_demand">On-Demand</SelectItem>
            </SelectContent>
          </Select>
          {range && (
            <DateRangePicker
              value={range}
              onChange={(r) => {
                setRange(r);
                setOffset(0);
              }}
            />
          )}
          <button
            type="button"
            onClick={onViewAll}
            className="whitespace-nowrap text-12 text-muted-foreground hover:text-foreground"
          >
            View all charges →
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
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
                    <th className="w-6 px-4 py-2" />
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
                      <td className="px-4">
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
                      <td className="px-2 py-1.5 text-right font-medium tabular-nums">{centsToUsd(r.amount_cents)}</td>
                      <td className="px-2 py-1.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-6" onClick={(e) => e.stopPropagation()}>
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
                  className="flex w-full flex-col gap-1 px-4 py-2.5 text-left"
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

            <div className="flex items-center justify-between border-border/60 border-t px-4 py-2.5 text-11">
              <span className="text-muted-foreground">
                Showing {rangeStart}–{rangeEnd} of {total}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
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
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <ChargeDetailDrawer charge={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </Card>
  );
}
