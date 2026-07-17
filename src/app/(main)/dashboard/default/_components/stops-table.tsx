"use client";

// ──────────────────────────────────────────────────────────────────────────
// StopsTable — clone of /dashboard/search ResultsTable styling and structure,
// adapted for the Stops tab in /dashboard/default.
//
// Reuses the proven 6-column layout from search (Recipient + Address + Phone
// + Status + Driver + Date) instead of inventing new column shapes. Address
// column now shows the actual street + city/state/zip (was missing before).
// Filter is a shadcn Popover with multi-select (status/source/type/city) —
// replaces the inline disposition pills with the same component family used
// throughout the dashboard.
//
// Row click → calls onSelect(stop_id) which opens the edit sheet beside the
// table. Selected row gets a left inset rail in primary blue, same as search.
// ──────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";

import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { formatPhone, toTitleCase } from "@/lib/ui/format";

import { statusLabel } from "./_helpers";
import type { DashboardStop } from "./_types";

const PAGE_SIZE = 25;

type SortKey = "recipient_name" | "status" | "created_at" | "delivery_city";

// ── Local helpers ───────────────────────────────────────────────────────────
// toTitleCase + formatPhone come from the consolidated module (no local dupes).
// formatDate stays local: this table wants mm/dd/yyyy in ET (date-only, no TZ
// shift), which differs from the module's "Jun 20" format.
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Date-only "YYYY-MM-DD" → mm/dd/yyyy with NO timezone shift (parsing as a Date
  // would roll back a day in ET). Format the parts directly.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) return `${dateOnly[2]}/${dateOnly[3]}/${dateOnly[1]}`;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    // ISO timestamp (e.g. created_at) → mm/dd/yyyy in ET.
    return d.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      timeZone: "America/New_York",
    });
  } catch {
    return "—";
  }
}

// Status pill style — readable tokens. Solid+white where contrast holds; amber
// (unassigned/pending/rts) and unknown statuses use a soft tint with DARK text
// because white-on-amber and muted-on-muted were unreadable.
function statusStyle(status: string): { bg: string; text: string; dot: string } {
  const st = status.toLowerCase();
  if (["delivered", "completed", "picked_up"].includes(st))
    return { bg: "bg-success", text: "text-white", dot: "bg-white/60" };
  if (["in_transit", "out_for_delivery", "dispatched", "assigned", "in_progress"].includes(st))
    return { bg: "bg-primary", text: "text-white", dot: "bg-white/60" };
  if (["failed", "attempted", "cancelled", "failed_not_home"].includes(st))
    return { bg: "bg-destructive", text: "text-white", dot: "bg-white/60" };
  if (["approved", "paid"].includes(st)) return { bg: "bg-info", text: "text-white", dot: "bg-white/60" };
  if (["return_to_sender", "rts", "undeliverable", "unassigned", "pending", "submitted", "created"].includes(st))
    return { bg: "bg-warning", text: "text-white", dot: "bg-white/60" };
  return { bg: "bg-muted border border-border", text: "text-foreground", dot: "bg-muted-foreground/60" };
}

// Quick status segments for the Stops-tab toolbar. `match` is the set of raw
// statuses each chip selects; the dot color matches the row badge treatment so
// the filter reads consistently with the table.
const QUICK_GROUPS = {
  all: { label: "All", match: [] as string[], dot: "" },
  active: {
    label: "Active",
    match: ["in_transit", "out_for_delivery", "dispatched", "assigned", "in_progress"],
    dot: "bg-primary",
  },
  unassigned: { label: "Unassigned", match: ["unassigned", "pending"], dot: "bg-amber-500" },
  delivered: { label: "Delivered", match: ["delivered", "completed", "picked_up"], dot: "bg-emerald-500" },
  failed: { label: "Failed", match: ["failed", "attempted", "cancelled", "failed_not_home"], dot: "bg-rose-500" },
} as const;
const QUICK_ORDER = ["all", "active", "unassigned", "delivered", "failed"] as const;

// Scheduled DELIVERY date for the row (explicit column): same-day → "Same-day",
// else the scheduled delivery_date, else "—". Never created_at.
function deliveryLabel(s: DashboardStop): string {
  if (s.is_same_day) return "Same-day";
  if (s.delivery_date) return formatDate(s.delivery_date);
  return "—";
}

// ── Filter popover ──────────────────────────────────────────────────────────
interface FilterState {
  statuses: string[];
  sources: string[];
  types: string[];
  cities: string[];
}
const EMPTY: FilterState = { statuses: [], sources: [], types: [], cities: [] };
const tog = (a: string[], v: string) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);

function FilterPopover({
  stops,
  filters,
  onApply,
}: {
  stops: DashboardStop[];
  filters: FilterState;
  onApply: (f: FilterState) => void;
}) {
  const [local, setLocal] = useState<FilterState>(filters);
  const opts = useMemo(
    () => ({
      statuses: [...new Set(stops.map((r) => r.status))].sort(),
      sources: ["stop", "draft"] as const,
      types: [...new Set(stops.map((r) => (r.package_type ?? "rx").toLowerCase()))].sort(),
      cities: [...new Set(stops.map((r) => r.delivery_city).filter(Boolean))].sort(),
    }),
    [stops],
  );
  const n = local.statuses.length + local.sources.length + local.types.length + local.cities.length;

  const Row = ({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) => (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/40"
    >
      <span
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded border",
          active ? "border-primary bg-primary" : "border-border",
        )}
      >
        {active && <Check className="size-2 text-white" strokeWidth={3.5} />}
      </span>
      <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
    </button>
  );

  const Sect = ({ title, items, field }: { title: string; items: readonly string[]; field: keyof FilterState }) => (
    <div>
      <p className="mb-1 px-2 font-bold text-[10px] text-muted-foreground/40 uppercase tracking-wider">{title}</p>
      {items.map((v) => (
        <Row
          key={v}
          label={
            field === "statuses" ? statusLabel(v) : v === "stop" ? "Stop" : v === "draft" ? "Draft" : v.toUpperCase()
          }
          active={local[field].includes(v)}
          onToggle={() => setLocal((p) => ({ ...p, [field]: tog(p[field], v) }))}
        />
      ))}
    </div>
  );

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) setLocal(filters);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 gap-1.5 border-border/50 text-[11px] transition-all",
            n > 0 ? "border-primary/50 bg-primary/[0.04] text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="size-3" />
          Filter
          {n > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary font-bold text-[10px] text-white">
              {n}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="end">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="font-semibold text-xs text-foreground">Filters</p>
          {n > 0 && (
            <button
              type="button"
              onClick={() => {
                setLocal(EMPTY);
                onApply(EMPTY);
              }}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
              Clear
            </button>
          )}
        </div>
        <div className="max-h-64 space-y-3 overflow-y-auto">
          {opts.statuses.length > 1 && <Sect title="Status" items={opts.statuses} field="statuses" />}
          <Sect title="Source" items={opts.sources} field="sources" />
          {opts.types.length > 1 && <Sect title="Type" items={opts.types} field="types" />}
          {opts.cities.length > 1 && <Sect title="City" items={opts.cities as string[]} field="cities" />}
        </div>
        <div className="mt-3 border-border/30 border-t pt-2.5">
          <Button size="sm" className="h-7 w-full text-[11px]" onClick={() => onApply(local)}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Main table ──────────────────────────────────────────────────────────────
export function StopsTable({
  stops,
  loading,
  onSelect,
  selectedStopId,
}: {
  stops: DashboardStop[];
  loading: boolean;
  onSelect: (stopId: string) => void;
  selectedStopId: string | null;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "created_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FilterState>(EMPTY);
  // Quick status segments — one-click filtering for daily operator use (the
  // advanced multi-select Popover stays for source/type/city). Each chip maps to
  // a status group; "all" = no quick filter.
  const [quick, setQuick] = useState<keyof typeof QUICK_GROUPS>("all");

  // Apply search + filters
  const filtered = useMemo(() => {
    let r = stops;
    if (quick !== "all") {
      const set = QUICK_GROUPS[quick].match as readonly string[];
      r = r.filter((s) => set.includes(s.status.toLowerCase()));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter(
        (s) =>
          s.recipient_name?.toLowerCase().includes(q) ||
          (s.delivery_city ?? "").toLowerCase().includes(q) ||
          (s.delivery_zip ?? "").toLowerCase().includes(q) ||
          (s.delivery_address ?? "").toLowerCase().includes(q) ||
          (s.stop_id ?? s.id).toLowerCase().includes(q) ||
          (s.package_type ?? "").toLowerCase().includes(q) ||
          (s.driver_name ?? "").toLowerCase().includes(q) ||
          (s.recipient_phone ?? "").toLowerCase().includes(q),
      );
    }
    if (filters.statuses.length) r = r.filter((x) => filters.statuses.includes(x.status));
    if (filters.sources.length) r = r.filter((x) => filters.sources.includes(x.source));
    if (filters.types.length) r = r.filter((x) => filters.types.includes((x.package_type ?? "rx").toLowerCase()));
    if (filters.cities.length) r = r.filter((x) => filters.cities.includes(x.delivery_city));
    return r;
  }, [stops, search, filters, quick]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const m = sort.dir === "asc" ? 1 : -1;
        return (
          String((a as unknown as Record<string, unknown>)[sort.key] ?? "").localeCompare(
            String((b as unknown as Record<string, unknown>)[sort.key] ?? ""),
          ) * m
        );
      }),
    [filtered, sort],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageData = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const fn = filters.statuses.length + filters.sources.length + filters.types.length + filters.cities.length;

  const handleSort = (key: SortKey) => {
    setSort((p) => (p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  };

  const SortBtn = ({ col, label }: { col: SortKey; label: string }) => (
    <button
      type="button"
      onClick={() => handleSort(col)}
      className="inline-flex items-center gap-1 font-bold text-[11px] text-muted-foreground/50 uppercase tracking-wider transition-colors hover:text-foreground/80"
    >
      {label}
      {sort.key === col ? (
        sort.dir === "asc" ? (
          <ChevronUp className="size-3 text-primary" />
        ) : (
          <ChevronDown className="size-3 text-primary" />
        )
      ) : (
        <ArrowUpDown className="size-2.5 opacity-30" />
      )}
    </button>
  );

  // ── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex gap-4 border-border/60 border-b bg-muted/40 px-4 py-2">
          {["w-40", "w-32", "w-20", "w-20", "w-20", "w-16"].map((w) => (
            <div key={w} className={cn("h-2.5 animate-pulse rounded bg-border", w)} />
          ))}
        </div>
        <div className="hidden sm:block">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-border/60 border-b px-4 py-3.5 last:border-0">
              <div className="w-36 space-y-1.5">
                <div className="h-3 w-full animate-pulse rounded bg-border" />
                <div className="h-2 w-2/3 animate-pulse rounded bg-muted" />
              </div>
              <div className="w-40 space-y-1">
                <div className="h-2.5 w-full animate-pulse rounded bg-border" />
                <div className="h-2 w-2/3 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-2.5 w-24 animate-pulse rounded bg-border" />
              <div className="h-6 w-20 animate-pulse rounded-full bg-border" />
              <div className="w-28 space-y-1">
                <div className="h-2.5 w-full animate-pulse rounded bg-border" />
                <div className="h-2 w-2/3 animate-pulse rounded bg-muted" />
              </div>
              <div className="ml-auto h-2.5 w-20 animate-pulse rounded bg-border" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Toolbar: search input + filter popover + result count */}
      <div className="flex flex-col gap-2 border-border/60 border-b bg-muted/40 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <SlidersHorizontal className="pointer-events-none absolute top-1/2 left-2.5 size-3 -translate-y-1/2 text-muted-foreground/50" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, address, RTL, driver…"
              className="h-7 w-full rounded-md border border-border bg-card px-2 pl-8 text-xs text-foreground/80 outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/15 sm:w-72"
            />
          </div>
          <p className="text-xs text-muted-foreground/70">
            <span className="font-semibold text-foreground/80 tabular-nums">{filtered.length}</span>{" "}
            {filtered.length !== 1 ? "results" : "result"}
            {fn > 0 && <span className="ml-1 font-medium text-primary">(filtered)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick status segments — fast one-click filter */}
          <div className="flex flex-wrap items-center gap-1">
            {QUICK_ORDER.map((key) => {
              const g = QUICK_GROUPS[key];
              const active = quick === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setQuick(key);
                    setPage(1);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-[11px] transition-all",
                    active
                      ? "bg-primary text-white shadow-sm"
                      : "bg-card text-muted-foreground/70 ring-1 ring-border hover:bg-muted/40 hover:text-foreground/80",
                  )}
                >
                  {g.dot && (
                    <span className={cn("size-1.5 rounded-full", active ? "bg-card/90" : g.dot)} aria-hidden="true" />
                  )}
                  {g.label}
                </button>
              );
            })}
          </div>
          <FilterPopover
            stops={stops}
            filters={filters}
            onApply={(f) => {
              setFilters(f);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* Desktop: 7-column single-line table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-border/60 border-b bg-muted/30">
              <th className="px-3 py-2.5 text-left">
                <span className="font-bold text-[11px] text-muted-foreground/50 uppercase tracking-wider">Tracking</span>
              </th>
              <th className="px-3 py-2.5 text-left">
                <SortBtn col="recipient_name" label="Recipient" />
              </th>
              <th className="px-3 py-2.5 text-left">
                <SortBtn col="delivery_city" label="Address" />
              </th>
              <th className="px-3 py-2.5 text-left">
                <span className="font-bold text-[11px] text-muted-foreground/50 uppercase tracking-wider">Phone</span>
              </th>
              <th className="px-3 py-2.5 text-left">
                <span className="font-bold text-[11px] text-muted-foreground/50 uppercase tracking-wider">Delivery</span>
              </th>
              <th className="px-3 py-2.5 text-left">
                <SortBtn col="status" label="Status" />
              </th>
              <th className="px-3 py-2.5 text-left">
                <span className="font-bold text-[11px] text-muted-foreground/50 uppercase tracking-wider">Driver</span>
              </th>
              <th className="px-3 py-2.5 text-right">
                <SortBtn col="created_at" label="Created" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-14 text-center text-[13px] text-muted-foreground/50">
                  {search || fn > 0 ? "No stops match the filters" : "No stops today"}
                </td>
              </tr>
            ) : (
              pageData.map((r) => {
                const tid = r.stop_id ?? r.id;
                const isSel = selectedStopId === tid;
                const st = statusStyle(r.status);
                const addr = [r.delivery_address, r.delivery_city, r.delivery_state, r.delivery_zip]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <tr
                    key={r.id}
                    onClick={() => onSelect(tid)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(tid);
                      }
                    }}
                    tabIndex={0}
                    className={cn(
                      "cursor-pointer transition-colors",
                      isSel ? "bg-primary/[0.03] shadow-[inset_3px_0_0_0_var(--primary)]" : "hover:bg-muted/40",
                    )}
                  >
                    {/* 1. Tracking ID */}
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="font-bold font-mono text-primary text-[11px]">{tid}</span>
                    </td>

                    {/* 2. Recipient name */}
                    <td className="max-w-[150px] px-3 py-2.5">
                      <p className="truncate font-semibold text-xs text-foreground">
                        {toTitleCase(r.recipient_name) || "—"}
                      </p>
                    </td>

                    {/* 3. Address — single line */}
                    <td className="max-w-[220px] px-3 py-2.5">
                      <p className="truncate text-xs text-muted-foreground">{addr || "—"}</p>
                    </td>

                    {/* 4. Phone */}
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <p className="text-xs text-muted-foreground">{formatPhone(r.recipient_phone) || "—"}</p>
                    </td>

                    {/* 5. Delivery date (scheduled) */}
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="font-medium text-[11px] text-muted-foreground">{deliveryLabel(r)}</span>
                    </td>

                    {/* 6. Status pill */}
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-semibold text-[11px]",
                          st.bg,
                          st.text,
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", st.dot)} />
                        {statusLabel(r.status)}
                      </span>
                    </td>

                    {/* 6. Driver */}
                    <td className="max-w-[130px] px-3 py-2.5">
                      {r.driver_name ? (
                        <p className="truncate font-medium text-xs text-foreground/80">{toTitleCase(r.driver_name)}</p>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/40">—</span>
                      )}
                    </td>

                    {/* 8. Created (when the stop was entered) */}
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <span className="font-medium text-[11px] text-muted-foreground/70">{formatDate(r.created_at)}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked list */}
      <div className="divide-y divide-border/60 sm:hidden">
        {pageData.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground/50">
            {search || fn > 0 ? "No stops match the filters" : "No stops today"}
          </div>
        ) : (
          pageData.map((r) => {
            const tid = r.stop_id ?? r.id;
            const isSel = selectedStopId === tid;
            const st = statusStyle(r.status);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelect(tid)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
                  isSel ? "bg-primary/[0.04] shadow-[inset_2px_0_0_0_var(--primary)]" : "hover:bg-muted/40",
                )}
              >
                <span className={cn("size-2 shrink-0 rounded-full", st.bg)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold text-[13px] text-foreground">
                      {toTitleCase(r.recipient_name) || "—"}
                    </p>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 font-semibold text-[10px]", st.bg, st.text)}>
                      {statusLabel(r.status)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
                    {r.delivery_address || "—"}
                    {r.delivery_city ? `, ${r.delivery_city}` : ""}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="truncate font-bold font-mono text-primary text-[10px]">{tid}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground/50">{deliveryLabel(r)}</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {sorted.length > 0 && (
        <div className="flex items-center justify-between border-border/60 border-t bg-muted/40 px-4 py-2">
          <p className="text-[11px] text-muted-foreground/50 tabular-nums">
            {sorted.length <= PAGE_SIZE
              ? `${sorted.length} total`
              : `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, sorted.length)} of ${sorted.length}`}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="size-6 p-0 text-muted-foreground/50 hover:text-foreground/80"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="px-2 text-[11px] text-muted-foreground/70 tabular-nums">
                {safePage}/{totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="size-6 p-0 text-muted-foreground/50 hover:text-foreground/80"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
