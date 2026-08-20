"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCurrencyCents as centsToUsd } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

import { BillingFilterBar } from "./billing-filter-bar";
import { ChargeDetailDrawer, type ChargeRow } from "./charge-detail-drawer";
import { ChargeDetailPanel, OUTCOME_DOT, TYPE_LABEL } from "./charge-detail-panel";
import { exportChargesToCsv } from "./export-charges-csv";
import { useBillingFilters } from "./use-billing-filters";

const PAGE_SIZE = 25;
const toISODate = (d: Date) => d.toISOString().slice(0, 10);

type SortableColumn = { key: string; label: string; align?: "right" };
const COLUMNS: SortableColumn[] = [
  { key: "attempted_at", label: "Date" },
  { key: "stop_id", label: "Stop" },
  { key: "resolved_type", label: "Type" },
  { key: "units", label: "Qty" },
  { key: "amount_cents", label: "Amount", align: "right" },
  { key: "document_number", label: "Document" },
  { key: "status", label: "Status" },
];

/* Full Charges data grid (Section 1) — filter parity with Recent Activity
 * via the shared useBillingFilters/BillingFilterBar (same URL-param
 * contract), server-side sorting on every meaningful column, and inline row
 * expansion on desktop (a Sheet on mobile, via useIsMobile) reusing the
 * SAME ChargeDetailPanel every other billing surface uses. */
export function ChargesTab() {
  const filterState = useBillingFilters("attempted_at");
  const { filters, setOffset } = filterState;
  const isMobile = useIsMobile();

  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmountCents, setTotalAmountCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<ChargeRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  // Was a plain function redefined on every render — the effect below
  // depended on it directly, so its identity never stabilized and the
  // effect re-fired on every render (including the ones ITS OWN setState
  // calls caused), refetching in an infinite loop. Overlapping, uncancelled
  // requests could then resolve out of order and let a stale response
  // overwrite a newer one (2026-08-19, found live: the header showed
  // unfiltered all-time totals while the table — set from the SAME
  // response object, just a later-arriving one — showed the correctly
  // filtered zero rows). Memoizing on `filters` (itself stable via
  // useBillingFilters' own useMemo) fixes both: the effect now only re-runs
  // when filters actually change.
  const buildParams = useCallback(
    (includePagination: boolean) => {
      const p = new URLSearchParams();
      if (includePagination) {
        p.set("limit", String(PAGE_SIZE));
        p.set("offset", String(filters.offset));
      }
      if (filters.type !== "all") p.set("resolved_type", filters.type);
      if (filters.status !== "all") p.set("status", filters.status);
      if (filters.search.trim()) p.set("search", filters.search.trim());
      if (filters.dateFrom) p.set("date_from", toISODate(filters.dateFrom));
      if (filters.dateTo) p.set("date_to", toISODate(filters.dateTo));
      if (filters.sortBy) p.set("sort_by", filters.sortBy === "status" ? "status" : filters.sortBy);
      p.set("sort_dir", filters.sortDir);
      return p;
    },
    [filters],
  );

  useEffect(() => {
    setLoading(true);
    setErrored(false);
    const ctrl = new AbortController();
    fetch(`/api/client/billing/ledger?${buildParams(true).toString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
        setTotalAmountCents(d.total_amount_cents ?? 0);
        setLoading(false);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setErrored(true);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [buildParams]);

  async function handleExport() {
    setExporting(true);
    setExportMsg(null);
    try {
      const { rows: n, truncated } = await exportChargesToCsv(buildParams(false));
      setExportMsg(
        truncated
          ? `Exported first ${n.toLocaleString()} rows (filtered set is larger).`
          : `Exported ${n.toLocaleString()} rows.`,
      );
    } catch {
      setExportMsg("Export failed — nothing was downloaded.");
    } finally {
      setExporting(false);
    }
  }

  function handleRowClick(row: ChargeRow) {
    if (isMobile) {
      setSelected(row);
    } else {
      setExpandedId((id) => (id === row.id ? null : row.id));
    }
  }

  const page = Math.floor(filters.offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 py-3">
          <BillingFilterBar {...filterState} onExportCsv={handleExport} exporting={exporting} />
          <div className="flex items-center justify-between text-11 text-muted-foreground">
            {total > 0 && (
              <span>
                {total.toLocaleString()} charges · {centsToUsd(totalAmountCents)} total
              </span>
            )}
            {exportMsg && <span>{exportMsg}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton count, list never reorders
                <Skeleton key={`chg-${i}`} className="h-10 w-full" />
              ))}
            </div>
          ) : errored ? (
            <p className="p-6 text-center text-13 text-muted-foreground">Couldn't load charges.</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-13 text-muted-foreground">No charges match these filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6" />
                  {COLUMNS.map((col) => (
                    <TableHead key={col.key} className={col.align === "right" ? "text-right" : undefined}>
                      <button
                        type="button"
                        onClick={() => filterState.setSort(col.key)}
                        className={cn(
                          "flex items-center gap-1 text-11 hover:text-foreground",
                          col.align === "right" && "ml-auto",
                        )}
                      >
                        {col.label}
                        {filters.sortBy === col.key &&
                          (filters.sortDir === "asc" ? (
                            <ChevronUp className="size-3" />
                          ) : (
                            <ChevronDown className="size-3" />
                          ))}
                      </button>
                    </TableHead>
                  ))}
                  <TableHead className="w-6" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isExpanded = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <TableRow
                        key={r.id}
                        className="cursor-pointer"
                        aria-expanded={isExpanded}
                        onClick={() => handleRowClick(r)}
                      >
                        <TableCell>
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              OUTCOME_DOT[r.outcome] ?? "bg-muted-foreground",
                            )}
                          />
                        </TableCell>
                        <TableCell className="text-12 text-muted-foreground">
                          {new Date(r.attempted_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-12">{r.stop_id}</span>
                            {r.attempt_seq != null && (
                              <span className="text-10 text-muted-foreground">Attempt {r.attempt_seq}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-10">
                            {TYPE_LABEL[r.resolved_type] ?? r.resolved_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">{r.units ?? "—"}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {r.credit ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-10 text-muted-foreground line-through decoration-1">
                                {centsToUsd(r.amount_cents)}
                              </span>
                              <span>{centsToUsd(r.net_amount_cents)}</span>
                            </div>
                          ) : (
                            centsToUsd(r.amount_cents)
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.document_id ? "secondary" : "outline"} className="text-10">
                            {r.document_number ?? "Unbilled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-11 text-muted-foreground">
                          {r.document_id ? "Invoiced" : "Unbilled"}
                        </TableCell>
                        <TableCell>
                          {isExpanded ? (
                            <ChevronUp className="size-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && !isMobile && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={COLUMNS.length + 2} className="whitespace-normal bg-muted/30 py-4">
                            <ChargeDetailPanel charge={r} className="mx-auto max-w-2xl" />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-13">
          <span className="text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={filters.offset === 0}
              onClick={() => setOffset(Math.max(0, filters.offset - PAGE_SIZE))}
            >
              <ChevronLeft className="size-3.5" /> Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={filters.offset + PAGE_SIZE >= total}
              onClick={() => setOffset(filters.offset + PAGE_SIZE)}
            >
              Next <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      <ChargeDetailDrawer charge={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
