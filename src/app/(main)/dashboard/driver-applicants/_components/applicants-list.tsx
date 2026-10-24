"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ChevronLeft, ChevronRight, Flag, Search, X } from "lucide-react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  derivedStatusBucketOf,
  STATUS_BUCKET,
  STATUS_BUCKET_COLORS,
  STATUS_BUCKET_LABEL,
  type StatusBucket,
} from "@/lib/driver-applicants";

import { type ApplicantStatus, type ApplicantsListResponse, fmtDate } from "./_types";

type Filters = {
  q: string;
  bucket: StatusBucket | "all";
  source: string; // "all" | "app" | "web"
  stuck: boolean;
  docsFlagged: boolean;
};

const DEFAULT_FILTERS: Filters = { q: "", bucket: "all", source: "all", stuck: false, docsFlagged: false };
const PAGE_SIZE = 25;
const BUCKETS: StatusBucket[] = ["onboarding", "under_review", "waitlisted", "approved", "rejected"];

function statusesForBucket(bucket: StatusBucket): ApplicantStatus[] {
  return Object.entries(STATUS_BUCKET)
    .filter(([, b]) => b === bucket)
    .map(([s]) => s as ApplicantStatus);
}

function buildQuery(filters: Filters, page: number): string {
  const sp = new URLSearchParams();
  if (filters.q.trim()) sp.set("q", filters.q.trim());
  if (filters.bucket !== "all") {
    // The API filters by a single status, not a bucket -- a bucket with >1 status (onboarding,
    // under_review) needs its OWN status query param per member, so just send the first and widen
    // client-side isn't possible server-side; instead we ask the API for every status in the
    // bucket via repeated `status` isn't supported either. Simplest correct fix: the list route
    // only accepts one status value, so bucket filtering for multi-status buckets happens here by
    // requesting the unfiltered page and letting bucket chips double as a visual grouping hint
    // when the bucket has >1 status. For single-status buckets (approved, waitlisted) we can filter
    // server-side exactly.
    const statuses = statusesForBucket(filters.bucket);
    if (statuses.length === 1) sp.set("status", statuses[0]);
  }
  if (filters.source !== "all") sp.set("source", filters.source);
  if (filters.stuck) sp.set("stuck", "true");
  sp.set("page", String(page));
  sp.set("pageSize", String(PAGE_SIZE));
  return sp.toString();
}

const fetcher = async (url: string): Promise<ApplicantsListResponse> => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

function daysWaiting(updatedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000)));
}

/** R29 — Applications list (left column), Stops-style: search + status chips w/ counts, quick
 *  filters, rows with a left border colored by status bucket. Replaces the old shadcn `<Table>`.
 *  Row shape per the mission's own spec: name · status dot · zone/vehicle · days waiting or x/7 ·
 *  RA- ref. No progress bars. */
export function ApplicantsList({
  onSelect,
  selectedKey,
  refreshToken,
}: {
  onSelect: (ref: string) => void;
  selectedKey: string | null;
  refreshToken: number;
}) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  const queryString = useMemo(() => buildQuery(filters, page), [filters, page]);
  const { data, error, isLoading, mutate } = useSWR<ApplicantsListResponse>(
    `/api/client/driver-applicants?${queryString}`,
    fetcher,
    { keepPreviousData: true },
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch only when refreshToken bumps
  useEffect(() => {
    void mutate();
  }, [refreshToken]);

  const set = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);

  const rows = data?.applicants ?? [];
  // Multi-status buckets (onboarding, under_review) aren't filterable server-side by a single
  // `status` param (see buildQuery's own note) — filter client-side on the fetched page for those
  // so the chip still does something useful without a server contract change.
  // R34 A6: the filter now runs for EVERY bucket, on the DERIVED bucket — `waitlisted` is no longer
  // a pure status filter either (an auto-waitlisted lite-funnel applicant reads as Onboarding), so
  // the server-side `status=waitlisted` narrowing still happens, and this drops the automatic ones.
  const visibleRows =
    filters.bucket !== "all"
      ? rows.filter((r) => derivedStatusBucketOf(r.status, r.waitlisted_by_staff) === filters.bucket)
      : rows;
  const docsFlaggedRows = filters.docsFlagged ? visibleRows.filter((r) => r.docs_needs_review) : visibleRows;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const counts = data?.bucket_counts;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2.5 border-b p-3">
        <div className="relative">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Search RA-XXXXXX, name or phone"
            className="pl-8"
            aria-label="Search applicants"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => set("bucket", "all")}
            className="rounded-full border px-2.5 py-1 text-xs data-[active=true]:border-primary data-[active=true]:bg-primary/10"
            data-active={filters.bucket === "all"}
          >
            All {typeof total === "number" && data ? `(${total})` : ""}
          </button>
          {BUCKETS.map((b) => {
            const c = STATUS_BUCKET_COLORS[b];
            return (
              <button
                key={b}
                type="button"
                onClick={() => set("bucket", filters.bucket === b ? "all" : b)}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs data-[active=true]:border-transparent"
                data-active={filters.bucket === b}
                style={filters.bucket === b ? { backgroundColor: c.bg, color: c.fg } : undefined}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
                {STATUS_BUCKET_LABEL[b]}
                {counts ? ` (${counts[b]})` : ""}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant={filters.stuck ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => set("stuck", !filters.stuck)}
          >
            <Flag className="size-3" aria-hidden="true" />
            Stuck &gt;7d
          </Button>
          <Button
            type="button"
            variant={filters.docsFlagged ? "default" : "outline"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => set("docsFlagged", !filters.docsFlagged)}
          >
            Docs flagged
          </Button>
          <Button
            type="button"
            variant={filters.source === "app" ? "default" : "outline"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => set("source", filters.source === "app" ? "all" : "app")}
          >
            App
          </Button>
          <Button
            type="button"
            variant={filters.source === "web" ? "default" : "outline"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => set("source", filters.source === "web" ? "all" : "web")}
          >
            Web
          </Button>
          {(filters.bucket !== "all" || filters.source !== "all" || filters.stuck || filters.docsFlagged) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-1.5 text-xs"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setPage(1);
              }}
            >
              <X className="size-3" aria-hidden="true" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p className="p-4 text-destructive text-sm">Could not load applicants ({error.message}).</p>
        ) : isLoading && !data ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : docsFlaggedRows.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground text-sm">No applicants match these filters.</p>
        ) : (
          <ul>
            {docsFlaggedRows.map((r) => {
              const c = STATUS_BUCKET_COLORS[derivedStatusBucketOf(r.status, r.waitlisted_by_staff)];
              const selected = r.application_ref === selectedKey;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(r.application_ref)}
                    data-selected={selected}
                    className="flex w-full flex-col gap-0.5 border-b border-l-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 data-[selected=true]:bg-muted/60"
                    style={{ borderLeftColor: c.dot }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-sm">{r.name ?? "Unnamed"}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{r.application_ref}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.dot }} />
                      <span className="truncate">
                        {[r.zone, r.vehicle_type].filter(Boolean).join(" · ") || "No zone / vehicle"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {r.stuck ? (
                        <span className="text-amber-600">Waiting {daysWaiting(r.updated_at)}d</span>
                      ) : (
                        <span>
                          {r.requirements_met}/{r.requirements_total} requirements
                        </span>
                      )}
                      <span>{fmtDate(r.updated_at)}</span>
                      {r.docs_needs_review && (
                        <Badge variant="outline" className="h-4 px-1 text-[10px]">
                          docs
                        </Badge>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between border-t px-3 py-2 text-muted-foreground text-xs">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-1.5"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-3" aria-hidden="true" />
            </Button>
            <span>
              {page}/{pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-1.5"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              <ChevronRight className="size-3" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
