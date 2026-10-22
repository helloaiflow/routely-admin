"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Bookmark, ChevronLeft, ChevronRight, Flag, Search, X } from "lucide-react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type DateRange, DateRangePicker } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { type ApplicantsListResponse, fmt, STATUS_LABEL, statusVariant } from "./_types";

type Filters = {
  q: string;
  status: string; // "all" | ApplicantStatus
  completeness: string; // "all" | "complete" | "incomplete"
  source: string; // "all" | "app" | "web"
  stuck: boolean;
  zone: string;
  vehicle: string;
  from: string; // ISO date or ""
  to: string;
};

const DEFAULT_FILTERS: Filters = {
  q: "",
  status: "all",
  completeness: "all",
  source: "all",
  stuck: false,
  zone: "",
  vehicle: "",
  from: "",
  to: "",
};

const PAGE_SIZE = 25;
const SAVED_VIEWS_KEY = "driver-applicants:saved-views";

/** No "all time" preset exists on the shared DateRangePicker, so the default
 *  is a wide custom range (since M1 shipped) rather than filtering out
 *  anything by default. */
function allTimeRange(): DateRange {
  return { from: new Date(2026, 0, 1), to: new Date(), label: "All time" };
}

type SavedView = { name: string; filters: Filters };

function loadSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

function persistSavedViews(views: SavedView[]) {
  try {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
  } catch {
    /* localStorage unavailable (private mode etc.) — saved views just won't persist */
  }
}

function buildQuery(filters: Filters, page: number): string {
  const sp = new URLSearchParams();
  if (filters.q.trim()) sp.set("q", filters.q.trim());
  if (filters.status !== "all") sp.set("status", filters.status);
  if (filters.completeness !== "all") sp.set("completeness", filters.completeness);
  if (filters.source !== "all") sp.set("source", filters.source);
  if (filters.stuck) sp.set("stuck", "true");
  if (filters.zone.trim()) sp.set("zone", filters.zone.trim());
  if (filters.vehicle.trim()) sp.set("vehicle", filters.vehicle.trim());
  if (filters.from) sp.set("from", filters.from);
  if (filters.to) sp.set("to", filters.to);
  sp.set("page", String(page));
  sp.set("pageSize", String(PAGE_SIZE));
  return sp.toString();
}

const fetcher = async (url: string): Promise<ApplicantsListResponse> => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

/** A02 — the applications data grid: search, filters, server-side pagination,
 *  saved views (localStorage — a per-browser convenience, not shared state). */
export function ApplicantsTable({ onSelect, refreshToken }: { onSelect: (ref: string) => void; refreshToken: number }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>(allTimeRange);

  useEffect(() => setSavedViews(loadSavedViews()), []);

  useEffect(() => {
    setFilters((f) => ({ ...f, from: dateRange.from.toISOString(), to: dateRange.to.toISOString() }));
    setPage(1);
  }, [dateRange]);

  const queryString = useMemo(() => buildQuery(filters, page), [filters, page]);
  const { data, error, isLoading, mutate } = useSWR<ApplicantsListResponse>(
    `/api/client/driver-applicants?${queryString}`,
    fetcher,
    { keepPreviousData: true },
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch only when refreshToken bumps; mutate is stable from useSWR
  useEffect(() => {
    void mutate();
  }, [refreshToken]);

  const set = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => {
    if (k === "q" || k === "from" || k === "to") return false;
    return v !== DEFAULT_FILTERS[k as keyof Filters];
  }).length;

  const rows = data?.applicants ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function saveCurrentView() {
    const name = window.prompt("Name this view (filters are saved in this browser only):");
    if (!name) return;
    const next = [...savedViews.filter((v) => v.name !== name), { name, filters }];
    setSavedViews(next);
    persistSavedViews(next);
  }

  function applyView(v: SavedView) {
    setFilters(v.filters);
    if (v.filters.from && v.filters.to) {
      setDateRange({ from: new Date(v.filters.from), to: new Date(v.filters.to), label: "Saved view" });
    }
    setPage(1);
  }

  function removeView(name: string) {
    const next = savedViews.filter((v) => v.name !== name);
    setSavedViews(next);
    persistSavedViews(next);
  }

  return (
    <div className="space-y-3">
      {/* Search + primary filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Search RA-XXXXXX, name or phone"
            className="pl-8"
            aria-label="Search applicants"
          />
        </div>
        <Select value={filters.status} onValueChange={(v) => set("status", v)}>
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.completeness} onValueChange={(v) => set("completeness", v)}>
          <SelectTrigger className="w-40" aria-label="Filter by completeness">
            <SelectValue placeholder="Completeness" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any completeness</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
            <SelectItem value="incomplete">Incomplete</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.source} onValueChange={(v) => set("source", v)}>
          <SelectTrigger className="w-32" aria-label="Filter by source">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any source</SelectItem>
            <SelectItem value="app">App</SelectItem>
            <SelectItem value="web">Web</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={filters.stuck ? "default" : "outline"}
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => set("stuck", !filters.stuck)}
        >
          <Flag className="size-3.5" aria-hidden="true" />
          Stuck &gt; 7d
        </Button>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Secondary filters (zone / vehicle) + saved views */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={filters.zone}
          onChange={(e) => set("zone", e.target.value)}
          placeholder="Zone"
          className="h-8 w-36 text-xs"
          aria-label="Filter by zone"
        />
        <Input
          value={filters.vehicle}
          onChange={(e) => set("vehicle", e.target.value)}
          placeholder="Vehicle type"
          className="h-8 w-36 text-xs"
          aria-label="Filter by vehicle type"
        />
        {activeFilterCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setDateRange(allTimeRange());
              setPage(1);
            }}
          >
            <X className="size-3" aria-hidden="true" />
            Clear filters
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {savedViews.map((v) => (
            <span
              key={v.name}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/30 pl-2 pr-1 text-xs"
            >
              <button type="button" className="py-1 hover:underline" onClick={() => applyView(v)}>
                {v.name}
              </button>
              <button
                type="button"
                aria-label={`Remove saved view ${v.name}`}
                className="rounded-full p-0.5 hover:bg-muted"
                onClick={() => removeView(v.name)}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={saveCurrentView}>
            <Bookmark className="size-3.5" aria-hidden="true" />
            Save view
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">Could not load applicants ({error.message}).</p>
      ) : isLoading && !data ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No applicants match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => onSelect(r.application_ref)}
                >
                  <TableCell className="font-mono">{r.application_ref}</TableCell>
                  <TableCell>{r.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                  </TableCell>
                  <TableCell>{r.zone ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{r.vehicle_type ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="capitalize">{r.source_category}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {r.flags > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <Flag className="size-3.5" aria-hidden="true" />
                          {r.flags}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                      {r.docs_needs_review && (
                        <Badge variant="outline" className="text-[10px]">
                          docs
                        </Badge>
                      )}
                      {r.stuck && (
                        <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-600">
                          stuck
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmt(r.updated_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between text-muted-foreground text-xs">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              Prev
            </Button>
            <span>
              Page {page} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
