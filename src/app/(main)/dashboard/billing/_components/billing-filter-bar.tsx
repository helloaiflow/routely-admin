"use client";

import { Download, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { useBillingFilters } from "./use-billing-filters";

const TYPE_OPTIONS = [
  { value: "all", label: "All activity" },
  { value: "package", label: "Package" },
  { value: "miles", label: "Mileage" },
  { value: "on_demand", label: "On-Demand" },
  { value: "prepaid_label", label: "Label" },
];
const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "unbilled", label: "Unbilled" },
  { value: "documented", label: "Documented" },
];

/* One filter bar, shared verbatim by the Charges grid and Recent Activity —
 * same components, same URL-param contract (via useBillingFilters), so a
 * filter state built on one surface means the same thing on the other. */
export function BillingFilterBar({
  filters,
  setSearch,
  setType,
  setStatus,
  setDateRange,
  clear,
  isActive,
  activeCount,
  searchPlaceholder = "Search tracking ID",
  onExportCsv,
  exporting,
}: ReturnType<typeof useBillingFilters> & {
  searchPlaceholder?: string;
  onExportCsv?: () => void;
  exporting?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[180px] flex-1">
        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={filters.search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-8 text-13"
        />
      </div>
      <Select value={filters.type} onValueChange={setType}>
        <SelectTrigger className="h-8 w-[140px] text-13">
          <SelectValue placeholder="All activity" />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.status} onValueChange={setStatus}>
        <SelectTrigger className="h-8 w-[140px] text-13">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DateRangePicker
        value={{
          from: filters.dateFrom ?? new Date(),
          to: filters.dateTo ?? new Date(),
          label: filters.dateFrom || filters.dateTo ? "Custom" : "Today",
        }}
        onChange={(r) => setDateRange(r)}
      />
      {isActive && (
        <Button size="sm" variant="ghost" className="h-8 gap-1 text-11 text-muted-foreground" onClick={clear}>
          <X className="size-3" /> Clear
          <Badge variant="secondary" className="ml-0.5 text-10">
            {activeCount}
          </Badge>
        </Button>
      )}
      {onExportCsv && (
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-11" onClick={onExportCsv} disabled={exporting}>
          <Download className="size-3.5" /> {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      )}
    </div>
  );
}
