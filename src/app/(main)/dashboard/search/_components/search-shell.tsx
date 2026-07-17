"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Package, AlertCircle, Clock, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ResultsTable } from "./results-table";
import { ResultsMobile } from "./results-mobile";
import { StopDetailView } from "./stop-detail-view";
import type { SearchResult, SearchCounts } from "./_types";

// ── Recent searches ──────────────────────────────────────────────────────────
const LS_KEY = "routely_recent_searches";
const MAX_RECENT = 5;
function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch { return []; }
}
function saveRecent(q: string) {
  const prev = getRecent().filter(s => s !== q);
  localStorage.setItem(LS_KEY, JSON.stringify([q, ...prev].slice(0, MAX_RECENT)));
}

type StatusFilter = "all" | "delivered" | "in_transit" | "failed" | "pending" | "drafts";
const FILTER_STATUSES: Record<StatusFilter, string[]> = {
  all:        [],
  delivered:  ["delivered","completed","picked_up"],
  in_transit: ["in_transit","out_for_delivery","dispatched","assigned"],
  failed:     ["failed","attempted","cancelled","failed_not_home"],
  pending:    ["pending","draft","approved","paid","unassigned","created"],
  drafts:     [],
};

// ── Status filter bar ────────────────────────────────────────────────────────
function FilterBar({ counts, activeFilter, onFilter }: {
  counts: SearchCounts; activeFilter: StatusFilter; onFilter: (f: StatusFilter) => void;
}) {
  const pills: { key: StatusFilter; label: string; count: number; activeCls: string; dot?: string }[] = [
    { key:"all" as StatusFilter,        label:"All",        count:counts.total,      activeCls:"bg-foreground text-background" },
    { key:"delivered" as StatusFilter,  label:"Delivered",  count:counts.delivered,  activeCls:"bg-emerald-500 text-white", dot:"bg-emerald-400" },
    { key:"in_transit" as StatusFilter, label:"In Transit", count:counts.in_transit, activeCls:"bg-primary text-white",  dot:"bg-blue-300" },
    { key:"failed" as StatusFilter,     label:"Failed",     count:counts.failed,     activeCls:"bg-rose-500 text-white",  dot:"bg-rose-300" },
    { key:"pending" as StatusFilter,    label:"Pending",    count:counts.pending,    activeCls:"bg-amber-500 text-white",  dot:"bg-amber-300" },
    { key:"drafts" as StatusFilter,     label:"Drafts",     count:counts.drafts,     activeCls:"bg-muted-foreground text-background",  dot:"bg-muted-foreground/40" },
  ].filter(f => f.key === "all" || f.count > 0);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {pills.map(f => {
        const on = activeFilter === f.key;
        return (
          <button key={f.key} type="button" onClick={() => onFilter(f.key)}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 rounded-md px-2.5 text-xs font-medium transition-all whitespace-nowrap select-none",
              on
                ? cn(f.activeCls, "shadow-sm")
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}>
            {f.key !== "all" && on && f.dot && (
              <span className={cn("size-1.5 rounded-full shrink-0", f.dot)} />
            )}
            {f.label}
            <span className={cn(
              "tabular-nums text-[10px] font-semibold",
              on ? "opacity-70" : "opacity-45",
            )}>{f.count}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────────
export function SearchShell() {
  const router         = useRouter();
  const searchParams   = useSearchParams();
  const selectedStopId = searchParams.get("stop");

  const [query, setQuery]               = useState("");
  const [results, setResults]           = useState<SearchResult[]>([]);
  const [counts, setCounts]             = useState<SearchCounts | null>(null);
  const [fromStops, setFromStops]       = useState(0);
  const [fromDrafts, setFromDrafts]     = useState(0);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [hasSearched, setHasSearched]   = useState(false);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const abortRef    = useRef<AbortController | null>(null);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setRecentSearches(getRecent()); }, []);

  // PUNTO 1: Si carga con ?stop pero sin query (refresh sin búsqueda), limpiar el panel
  useEffect(() => {
    if (selectedStopId && !query && !hasSearched) {
      router.replace("/dashboard/search");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const selectedItem = selectedStopId
    ? results.find(r => (r.stop_id ?? r.id) === selectedStopId || r.id === selectedStopId || r.stop_id === selectedStopId)
    : null;

  const handleSelect = useCallback((r: SearchResult) => {
    const id = r.stop_id ?? r.id;
    // Always use URL param — opens right panel on desktop AND mobile
    router.replace(`/dashboard/search?stop=${encodeURIComponent(id)}`);
  }, [router]);

  const closePanel = useCallback(() => router.replace("/dashboard/search"), [router]);

  const doSearch = useCallback(async (q: string) => {
    setShowDropdown(false);
    if (q.length < 2) {
      setResults([]); setCounts(null); setFromStops(0); setFromDrafts(0);
      setHasSearched(false); setLoading(false); setActiveFilter("all"); return;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true); setError(null); setHasSearched(true);
    try {
      const res = await fetch(`/api/client/search?q=${encodeURIComponent(q)}&limit=200`, { signal: abortRef.current.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setResults(d.results ?? []);
      setCounts(d.counts ?? null);
      setFromStops(d.from_stops ?? 0);
      setFromDrafts(d.from_drafts ?? 0);
      setActiveFilter("all");
      saveRecent(q.trim());
      setRecentSearches(getRecent());
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") return;
      setError("Search failed. Please try again.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(query.trim()), 350);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, doSearch]);

  const filteredResults = activeFilter === "all"
    ? results
    : activeFilter === "drafts"
      ? results.filter(r => r.source === "draft")
      : results.filter(r => FILTER_STATUSES[activeFilter].includes(r.status));

  const panelOpen  = !!selectedStopId;
  const isEmpty    = !loading && hasSearched && results.length === 0;
  const hasResults = !loading && results.length > 0;
  const SUGGESTIONS = ["Miner, Robert", "Boynton Beach", "(561) 759-9540", "RTL-1779302475"];

  return (
    <div className="flex h-full overflow-hidden bg-background">

      {/* ── LEFT — fixed header + scrollable content ───────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background min-h-0">

        {/* Top bar */}
        <div className="shrink-0 bg-background px-5 pb-3 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h1 className="type-page-title text-foreground">Shipment Search</h1>
              <p className="mt-0.5 text-xs text-muted-foreground/55">Search across stops and draft stops</p>
            </div>
            {hasResults && counts && (
              <span className="text-xs tabular-nums text-muted-foreground/50">
                <span className="font-semibold text-foreground/70">{counts.total}</span> results
              </span>
            )}
          </div>

          {/* Search input + dropdown */}
          <div className="relative" ref={dropdownRef}>
            <div className={cn(
              // Inset field that reads consistently in light AND dark (was bg-card
              // → looked like a bright white bar in dark mode).
              "flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3.5 transition-all dark:bg-input/30",
              showDropdown || query
                ? "border-primary/50 ring-2 ring-primary/10"
                : "border-border/60 hover:border-border/80",
            )}>
              <Search className="size-4 shrink-0 text-muted-foreground/35" />
              <Input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                placeholder="Name, tracking ID, phone, address, city..."
                className="h-10 flex-1 border-0 bg-transparent p-0 text-[13px] shadow-none placeholder:text-muted-foreground/35 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {loading
                ? <div className="size-4 shrink-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                : query
                  ? <button type="button" onClick={() => { setQuery(""); setHasSearched(false); inputRef.current?.focus(); }}
                      className="shrink-0 rounded p-0.5 text-muted-foreground/40 transition-colors hover:bg-muted/60 hover:text-muted-foreground">
                      <X className="size-3.5" />
                    </button>
                  : null}
            </div>

            {/* Recent/suggestions dropdown */}
            <AnimatePresence>
              {showDropdown && !query && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-border/40 bg-popover shadow-lg shadow-black/[0.06]"
                >
                  {recentSearches.length > 0 && (
                    <div className="border-b border-border/20 p-2">
                      <p className="mb-1 px-2 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">Recent</p>
                      {recentSearches.map(s => (
                        <button key={s} type="button"
                          onMouseDown={e => { e.preventDefault(); setQuery(s); doSearch(s); }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted/40">
                          <Clock className="size-3.5 shrink-0 text-muted-foreground/30" />
                          <span className="text-[13px] text-foreground/75 truncate">{s}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="p-2">
                    <p className="mb-1 px-2 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">Try searching</p>
                    {SUGGESTIONS.map(s => (
                      <button key={s} type="button"
                        onMouseDown={e => { e.preventDefault(); setQuery(s); doSearch(s); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted/40">
                        <Search className="size-3.5 shrink-0 text-muted-foreground/20" />
                        <span className="text-[13px] text-muted-foreground truncate">{s}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Filter bar */}
          {hasResults && counts && (
            <div className="mt-2.5">
              <FilterBar counts={counts} activeFilter={activeFilter} onFilter={setActiveFilter} />
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-border/30 shrink-0" />

        {/* Content — scrollable, grid with independent scroll */}
        <div className="flex-1 overflow-y-auto bg-background min-h-0">
          {error && (
            <div className="m-4 flex items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertCircle className="size-4 shrink-0" />{error}
              <button type="button" onClick={() => doSearch(query.trim())} className="ml-auto text-xs font-semibold underline">Retry</button>
            </div>
          )}

          {/* Initial empty state */}
          {!hasSearched && !loading && (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/[0.07] ring-1 ring-primary/[0.12]">
                <Search className="size-6 text-primary/60" />
              </div>
              <p className="text-sm font-semibold text-foreground">Find any shipment</p>
              <p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-muted-foreground/55">
                Search by tracking ID, recipient name, phone number, or delivery address
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-1.5">
                {[
                  { l:"Stops",      c:"bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/25" },
                  { l:"Delivered",  c:"bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25" },
                  { l:"In Transit", c:"bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/25" },
                  { l:"Pending",    c:"bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25" },
                ].map(c => (
                  <span key={c.l} className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium", c.c)}>{c.l}</span>
                ))}
              </div>
            </div>
          )}

          {/* No results */}
          {isEmpty && !error && (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted/50">
                <Package className="size-5 text-muted-foreground/30" />
              </div>
              <p className="text-[13px] font-semibold text-foreground">No results for &ldquo;{query}&rdquo;</p>
              <p className="mt-1 text-xs text-muted-foreground/50">Try a tracking ID, recipient name, or address</p>
            </div>
          )}

          {/* Table */}
          {(loading || hasResults) && (
            <div className="px-5 py-4">
              <div className="hidden sm:block">
                <ResultsTable
                  results={filteredResults}
                  loading={loading}
                  onSelect={handleSelect}
                  fromStops={fromStops}
                  fromDrafts={fromDrafts}
                  selectedId={selectedStopId}
                />
              </div>
              <div className="sm:hidden">
                <ResultsMobile results={filteredResults} loading={loading} onSelect={handleSelect} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT panel ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            key={selectedStopId}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-background lg:relative lg:inset-auto lg:z-auto lg:w-[420px] lg:shrink-0 lg:min-h-0"
            style={{
              boxShadow: "-1px 0 0 0 rgba(0,0,0,0.06), -4px 0 16px -4px rgba(0,0,0,0.04)",
            }}
          >
            <StopDetailView
              id={selectedStopId}
              initialData={selectedItem ?? undefined}
              mode="panel"
              onClose={closePanel}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
