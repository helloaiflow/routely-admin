"use client";

import { useCallback, useMemo } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { DateRange } from "@/components/ui/date-range-picker";

/* One filter contract, one set of URL param names, shared by Charges,
 * Recent Activity, and (for its own list) Invoices — per the mission's
 * explicit ask: "One filter implementation shared between both surfaces,
 * not two divergent ones," and filter state that's "shareable and
 * agent-consumable" via the URL. Charges and Recent Activity intentionally
 * share the SAME param names (q/type/status/from/to/sort/dir/offset) since
 * only one of BillingShell's tabs is ever mounted at a time — switching
 * tabs carrying the filter forward is the intended behavior, not a bug. */
export type BillingFilterState = {
  search: string;
  type: string;
  status: string;
  dateFrom: Date | null;
  dateTo: Date | null;
  sortBy: string | null;
  sortDir: "asc" | "desc";
  offset: number;
};

type Patch = Partial<Omit<BillingFilterState, "dateFrom" | "dateTo">> & {
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const fromISODate = (s: string) => {
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function useBillingFilters(defaultSortBy: string | null = null) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters: BillingFilterState = useMemo(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    return {
      search: searchParams.get("q") ?? "",
      type: searchParams.get("type") ?? "all",
      status: searchParams.get("status") ?? "all",
      dateFrom: from ? fromISODate(from) : null,
      dateTo: to ? fromISODate(to) : null,
      sortBy: searchParams.get("sort") ?? defaultSortBy,
      sortDir: searchParams.get("dir") === "asc" ? "asc" : "desc",
      offset: Number(searchParams.get("offset") ?? 0) || 0,
    };
  }, [searchParams, defaultSortBy]);

  const apply = useCallback(
    (patch: Patch, opts: { resetOffset?: boolean } = { resetOffset: true }) => {
      const params = new URLSearchParams(searchParams.toString());
      const setOrDelete = (key: string, value: string | null | undefined) => {
        if (!value) params.delete(key);
        else params.set(key, value);
      };
      if (patch.search !== undefined) setOrDelete("q", patch.search.trim() || null);
      if (patch.type !== undefined) setOrDelete("type", patch.type === "all" ? null : patch.type);
      if (patch.status !== undefined) setOrDelete("status", patch.status === "all" ? null : patch.status);
      if (patch.dateFrom !== undefined) setOrDelete("from", patch.dateFrom ? toISODate(patch.dateFrom) : null);
      if (patch.dateTo !== undefined) setOrDelete("to", patch.dateTo ? toISODate(patch.dateTo) : null);
      if (patch.sortBy !== undefined) setOrDelete("sort", patch.sortBy);
      if (patch.sortDir !== undefined) setOrDelete("dir", patch.sortDir === "asc" ? "asc" : null);
      if (opts.resetOffset !== false) params.delete("offset");
      else if (patch.offset !== undefined) setOrDelete("offset", patch.offset ? String(patch.offset) : null);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const setSearch = useCallback((v: string) => apply({ search: v }), [apply]);
  const setType = useCallback((v: string) => apply({ type: v }), [apply]);
  const setStatus = useCallback((v: string) => apply({ status: v }), [apply]);
  const setDateRange = useCallback(
    (range: DateRange | null) => apply({ dateFrom: range?.from ?? null, dateTo: range?.to ?? null }),
    [apply],
  );
  const setSort = useCallback(
    (sortBy: string) => {
      if (filters.sortBy === sortBy)
        apply({ sortDir: filters.sortDir === "asc" ? "desc" : "asc" }, { resetOffset: false });
      else apply({ sortBy, sortDir: "desc" }, { resetOffset: false });
    },
    [apply, filters.sortBy, filters.sortDir],
  );
  const setOffset = useCallback((offset: number) => apply({ offset }, { resetOffset: false }), [apply]);
  const clear = useCallback(
    () => apply({ search: "", type: "all", status: "all", dateFrom: null, dateTo: null }),
    [apply],
  );

  const isActive =
    filters.search !== "" ||
    filters.type !== "all" ||
    filters.status !== "all" ||
    !!filters.dateFrom ||
    !!filters.dateTo;
  const activeCount = [
    filters.search !== "",
    filters.type !== "all",
    filters.status !== "all",
    !!filters.dateFrom || !!filters.dateTo,
  ].filter(Boolean).length;

  return { filters, setSearch, setType, setStatus, setDateRange, setSort, setOffset, clear, isActive, activeCount };
}
