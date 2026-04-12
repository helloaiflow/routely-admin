"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  ExternalLink,
  MapPin,
  Navigation2,
  Package,
  Phone,
  ScanLine,
  Search,
  Truck,
  X,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

interface ScanResult {
  _id: string;
  rtscan_id?: number;
  full_name?: string;
  rx_pharma_id?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  full_address?: string;
  route?: string;
  client_location?: string;
  type?: string;
  new_client?: boolean;
  collect_payment?: boolean;
  collect_amount?: number;
  signature_required?: boolean;
  delivery_today?: boolean;
  phone?: string;
  created_at?: string;
}

interface StopResult {
  _id: string;
  rtstop_id?: number;
  rtscan_id?: number;
  recipient_name?: string;
  recipient_phone?: string;
  rx_pharma_id?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  full_address?: string;
  route_title?: string;
  event_type?: string;
  delivery_state?: string;
  label_status?: string;
  delivery_succeeded?: boolean;
  stop_position?: number;
  eta_arrival?: string;
  driver_notes?: string;
  tracking_link?: string;
  created_at?: string | { $date: string };
}

const ROUTE_COLORS: Record<string, { bg: string; text: string; border: string; emoji: string }> = {
  "CENTRAL FL": { bg: "#fff0f8", text: "#c0006a", border: "#f9a8d4", emoji: "\u{1F306}" },
  "SOUTH FL": { bg: "#fffff0", text: "#7a7200", border: "#fde68a", emoji: "\u{1F334}" },
  "DEERFIELD FL": { bg: "#edfcff", text: "#0079a8", border: "#a5f3fc", emoji: "\u{1F98C}" },
  "NORTH FL": { bg: "#edfff5", text: "#007a4a", border: "#6ee7b7", emoji: "\u{1F33F}" },
};
function getRC(route?: string) {
  if (!route) return null;
  const up = route.toUpperCase();
  for (const [k, v] of Object.entries(ROUTE_COLORS)) if (up.includes(k)) return v;
  return { bg: "#f4f0ff", text: "#5b21b6", border: "#c4b5fd", emoji: "\u{1F52E}" };
}

function toTitle(s?: string) {
  if (!s) return "\u2014";
  return s.replace(/\b\w+/g, (w) =>
    /^[A-Z]{2}$/.test(w) || /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );
}

function fmt(d?: string | { $date: string }) {
  if (!d) return "";
  const str = typeof d === "object" ? d.$date : d;
  return new Date(str).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function formatPhone(p?: string) {
  if (!p) return "\u2014";
  const digits = p.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return p;
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!text || !query) return false;
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (t.includes(q)) return true;
  return q.split(/\s+/).every((w) => t.includes(w));
}

function Hl({ text, q }: { text: string; q: string }) {
  if (!q || q.length < 2 || !text) return <>{text || "\u2014"}</>;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase().trim());
  if (idx < 0) return <>{text}</>;
  const len = q.trim().length;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber-100 px-0.5 font-semibold text-amber-900 not-italic">
        {text.slice(idx, idx + len)}
      </mark>
      {text.slice(idx + len)}
    </>
  );
}

function DeliveryBadge({ state, succeeded }: { state?: string; succeeded?: boolean }) {
  if (succeeded)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 font-semibold text-[10px] text-green-700">
        <CheckCircle2 className="h-2.5 w-2.5" /> Delivered
      </span>
    );
  const s = state?.toLowerCase() || "";
  if (s.includes("failed") || s.includes("unattempted"))
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-[10px] text-rose-700">
        <AlertCircle className="h-2.5 w-2.5" />
        {toTitle(state)}
      </span>
    );
  if (s.includes("transit") || s.includes("allocated"))
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-semibold text-[10px] text-blue-700">
        <Truck className="h-2.5 w-2.5" />
        {toTitle(state)}
      </span>
    );
  if (s.includes("pending") || s.includes("unassigned"))
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-[10px] text-amber-700">
        <Clock className="h-2.5 w-2.5" />
        {toTitle(state)}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 font-medium text-[10px] text-muted-foreground">
      <Circle className="h-2 w-2" />
      {toTitle(state) || "\u2014"}
    </span>
  );
}

const HINTS = [
  { label: "Kissimmee", icon: "\u{1F4CD}", color: "hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700" },
  {
    label: "Coral Springs",
    icon: "\u{1F3D9}\uFE0F",
    color: "hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700",
  },
  { label: "NORTH FL", icon: "\u{1F33F}", color: "hover:border-green-300 hover:bg-green-50 hover:text-green-700" },
  { label: "GONZALEZ", icon: "\u{1F464}", color: "hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700" },
  {
    label: "West Sample Road",
    icon: "\u{1F6E3}\uFE0F",
    color: "hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700",
  },
];

const _LABEL_STYLE: Record<string, string> = {
  Match: "bg-green-50 text-green-700 border-green-200",
  Unmatch: "bg-amber-50 text-amber-700 border-amber-200",
  Human: "bg-rose-50  text-rose-700  border-rose-200",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [stops, setStops] = useState<StopResult[]>([]);
  const [allScans, setAllScans] = useState<ScanResult[]>([]);
  const [allStops, setAllStops] = useState<StopResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<"all" | "scans" | "stops">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      setBooting(true);
      try {
        const [sr, tr] = await Promise.all([
          fetch("/api/data/package-scans?limit=500"),
          fetch("/api/data/spoke-stops?limit=500"),
        ]);
        if (sr.ok) {
          const d = await sr.json();
          setAllScans(d.list || d || []);
        }
        if (tr.ok) {
          const d = await tr.json();
          setAllStops(d.list || d || []);
        }
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const runFilter = useCallback(
    (q: string) => {
      if (!q.trim() || q.trim().length < 2) {
        setScans([]);
        setStops([]);
        return;
      }
      const ms = (s: ScanResult) =>
        fuzzyMatch(s.full_name || "", q) ||
        fuzzyMatch(s.rx_pharma_id || "", q) ||
        fuzzyMatch(s.address || "", q) ||
        fuzzyMatch(s.full_address || "", q) ||
        fuzzyMatch(s.city || "", q) ||
        fuzzyMatch(s.route || "", q) ||
        fuzzyMatch(s.phone || "", q) ||
        fuzzyMatch(String(s.rtscan_id || ""), q);
      const mt = (s: StopResult) =>
        fuzzyMatch(s.recipient_name || "", q) ||
        fuzzyMatch(s.rx_pharma_id || "", q) ||
        fuzzyMatch(s.address || "", q) ||
        fuzzyMatch(s.full_address || "", q) ||
        fuzzyMatch(s.city || "", q) ||
        fuzzyMatch(s.route_title || "", q) ||
        fuzzyMatch(s.recipient_phone || "", q) ||
        fuzzyMatch(String(s.rtstop_id || ""), q) ||
        fuzzyMatch(s.delivery_state || "", q) ||
        fuzzyMatch(s.event_type || "", q);
      setScans(allScans.filter(ms).slice(0, 150));
      setStops(allStops.filter(mt).slice(0, 150));
    },
    [allScans, allStops],
  );

  useEffect(() => {
    if (booting) return;
    setLoading(true);
    const t = setTimeout(() => {
      runFilter(query);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query, runFilter, booting]);

  const visScans = tab === "stops" ? [] : scans;
  const visStops = tab === "scans" ? [] : stops;
  const total = visScans.length + visStops.length;
  const hasQuery = query.trim().length >= 2;

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col overflow-hidden bg-background">
      {/* Hero search bar */}
      <div className="border-b bg-background px-4 pt-5 pb-4 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
              ) : (
                <Search className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by address, patient name, Rx#, phone, route..."
              className="h-14 w-full rounded-2xl border border-border bg-background py-4 pr-14 pl-12 text-sm shadow-sm outline-none ring-0 transition-all placeholder:text-muted-foreground/60 focus:border-primary focus:shadow-md focus:ring-2 focus:ring-primary/10"
            />
            <AnimatePresence>
              {query && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setScans([]);
                    setStops([]);
                    inputRef.current?.focus();
                  }}
                  className="absolute inset-y-0 right-4 flex items-center text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Hint chips */}
          {!hasQuery && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex flex-wrap items-center gap-2"
            >
              <span className="font-medium text-[11px] text-muted-foreground/60">Quick search:</span>
              {HINTS.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => setQuery(h.label)}
                  className={`flex items-center gap-1.5 rounded-xl border border-border bg-muted/30 px-3 py-1.5 font-medium text-muted-foreground text-xs transition-all ${h.color}`}
                >
                  <span>{h.icon}</span>
                  {h.label}
                </button>
              ))}
            </motion.div>
          )}

          {/* Tab bar */}
          {hasQuery && !loading && total > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex flex-wrap items-center gap-1.5"
            >
              {(
                [
                  { id: "all", label: "All", icon: Search, count: scans.length + stops.length },
                  { id: "stops", label: "Stops", icon: Navigation2, count: stops.length },
                  { id: "scans", label: "Scans", icon: ScanLine, count: scans.length },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-semibold text-xs transition-all ${tab === t.id ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"}`}
                  >
                    <Icon className="h-3 w-3" />
                    {t.label}
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-bold text-[9px] ${tab === t.id ? "bg-white/25" : "bg-muted"}`}
                    >
                      {t.count}
                    </span>
                  </button>
                );
              })}
              <span className="ml-auto text-[11px] text-muted-foreground">
                {total} result{total !== 1 ? "s" : ""}
              </span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-8">
          {/* Empty state */}
          {!hasQuery && !booting && (
            <div className="flex flex-col items-center gap-5 pt-16 text-muted-foreground">
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-muted/50">
                  <Search className="h-9 w-9 opacity-30" />
                </div>
                <div className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10">
                  <MapPin className="h-4 w-4 text-primary" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-semibold text-base text-foreground">Find any delivery instantly</p>
                <p className="mt-1.5 max-w-xs text-sm leading-relaxed opacity-60">
                  Search by address, patient name, Rx number, phone or route — results from scans and stops
                </p>
              </div>
              <div className="mt-2 grid w-full max-w-sm grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  { label: "By address", example: "344 Cardiff Dr", icon: "\u{1F3E0}" },
                  { label: "By patient", example: "GONZALEZ", icon: "\u{1F464}" },
                  { label: "By Rx#", example: "653771-01", icon: "\u{1F48A}" },
                ].map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => setQuery(c.example)}
                    className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-3 py-3 text-center transition-all hover:border-primary/30 hover:bg-primary/5"
                  >
                    <span className="text-2xl">{c.icon}</span>
                    <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
                      {c.label}
                    </span>
                    <span className="font-medium text-foreground text-xs">{c.example}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {booting && (
            <div className="space-y-2 pt-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 rounded-xl" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          )}

          {loading && hasQuery && (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-12 rounded-xl" style={{ opacity: 1 - i * 0.12 }} />
              ))}
            </div>
          )}

          {!loading && hasQuery && total === 0 && (
            <div className="flex flex-col items-center gap-3 pt-12 text-muted-foreground">
              <Package className="h-12 w-12 opacity-10" />
              <p className="font-semibold text-sm">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-xs opacity-60">Try a partial address, last name, or Rx number</p>
              <div className="mt-1 flex gap-2">
                {HINTS.slice(0, 3).map((h) => (
                  <button
                    key={h.label}
                    type="button"
                    onClick={() => setQuery(h.label)}
                    className="rounded-xl border border-border bg-muted/30 px-3 py-1.5 text-muted-foreground text-xs hover:bg-muted"
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {!loading && hasQuery && total > 0 && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* STOPS */}
              {visStops.length > 0 && (
                <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                  <div className="flex items-center gap-2 border-b bg-muted/20 px-4 py-2.5">
                    <Navigation2 className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">Delivery Stops</span>
                    <span className="rounded-full border bg-background px-2 py-0.5 font-bold text-[10px] text-muted-foreground">
                      {visStops.length}
                    </span>
                  </div>

                  <div
                    className="hidden border-b bg-muted/10 px-4 py-2 md:grid"
                    style={{
                      gridTemplateColumns:
                        "minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.8fr) minmax(0,.7fr) minmax(0,.7fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,.8fr) 32px",
                    }}
                  >
                    {["Name", "Phone", "Address", "City", "State", "Rx #", "Route", "Status", ""].map((h, i) => (
                      <span
                        key={h || i}
                        className="truncate font-bold text-[9px] text-muted-foreground/60 uppercase tracking-widest"
                      >
                        {h}
                      </span>
                    ))}
                  </div>

                  <div className="divide-y">
                    {visStops.map((stop) => {
                      const rc = getRC(stop.route_title);
                      const isExp = expanded === stop._id;
                      const name = toTitle(stop.recipient_name);
                      const addr = toTitle(stop.address);
                      return (
                        <div key={stop._id}>
                          {/* Desktop row */}
                          <button
                            type="button"
                            onClick={() => setExpanded(isExp ? null : stop._id)}
                            className="hidden w-full cursor-pointer items-center gap-0 px-4 py-3 text-left transition-colors hover:bg-muted/20 md:grid"
                            style={{
                              gridTemplateColumns:
                                "minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.8fr) minmax(0,.7fr) minmax(0,.7fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,.8fr) 32px",
                            }}
                          >
                            <div className="flex min-w-0 items-center gap-2 pr-3">
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-xs">
                                {"\u{1F4CD}"}
                              </div>
                              <span className="truncate font-semibold text-xs">
                                <Hl text={name} q={query} />
                              </span>
                            </div>
                            <div className="flex min-w-0 items-center gap-1 pr-2">
                              <Phone className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />
                              <span className="truncate font-mono text-[10px] text-muted-foreground">
                                <Hl text={formatPhone(stop.recipient_phone)} q={query} />
                              </span>
                            </div>
                            <div className="flex min-w-0 items-center gap-1 pr-2">
                              <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />
                              <span className="truncate text-muted-foreground text-xs">
                                <Hl text={addr} q={query} />
                              </span>
                            </div>
                            <span className="truncate pr-2 text-muted-foreground text-xs">
                              <Hl text={stop.city || "\u2014"} q={query} />
                            </span>
                            <span className="truncate pr-2 font-medium text-xs">{stop.state || "\u2014"}</span>
                            <span className="truncate pr-2 font-mono text-[10px] text-muted-foreground">
                              <Hl text={stop.rx_pharma_id || "\u2014"} q={query} />
                            </span>
                            <div className="pr-2">
                              {rc ? (
                                <span
                                  style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}
                                  className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 font-bold text-[9px]"
                                >
                                  {rc.emoji} <Hl text={stop.route_title || ""} q={query} />
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/40">{"\u2014"}</span>
                              )}
                            </div>
                            <div className="pr-2">
                              <DeliveryBadge state={stop.delivery_state} succeeded={stop.delivery_succeeded} />
                            </div>
                            <div className="flex items-center justify-end">
                              {isExp ? (
                                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />
                              )}
                            </div>
                          </button>

                          {/* Mobile card */}
                          <button
                            type="button"
                            onClick={() => setExpanded(isExp ? null : stop._id)}
                            className="w-full cursor-pointer px-4 py-3 text-left transition-colors hover:bg-muted/20 md:hidden"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-start gap-2.5">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-base">
                                  {"\u{1F4CD}"}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-sm">
                                    <Hl text={name} q={query} />
                                  </p>
                                  <p className="mt-0.5 truncate text-muted-foreground text-xs">
                                    <Hl text={addr} q={query} />
                                    {stop.city ? `, ${stop.city}` : ""}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                    {stop.rx_pharma_id && (
                                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                        <Hl text={stop.rx_pharma_id} q={query} />
                                      </span>
                                    )}
                                    {rc && (
                                      <span
                                        style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}
                                        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold text-[9px]"
                                      >
                                        {rc.emoji} {stop.route_title}
                                      </span>
                                    )}
                                    <DeliveryBadge state={stop.delivery_state} succeeded={stop.delivery_succeeded} />
                                  </div>
                                </div>
                              </div>
                              {isExp ? (
                                <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40" />
                              )}
                            </div>
                          </button>

                          {/* Expanded detail */}
                          <AnimatePresence>
                            {isExp && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden border-t bg-muted/10"
                              >
                                <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
                                  {[
                                    { label: "Phone", value: formatPhone(stop.recipient_phone) },
                                    { label: "City", value: stop.city },
                                    { label: "State", value: stop.state },
                                    { label: "Zipcode", value: stop.zipcode },
                                    { label: "Rx #", value: stop.rx_pharma_id, mono: true },
                                    { label: "Event", value: stop.event_type?.replace("stop.", "") },
                                    {
                                      label: "Stop #",
                                      value: stop.stop_position ? `#${stop.stop_position}` : undefined,
                                    },
                                    { label: "ETA", value: stop.eta_arrival },
                                    { label: "Label", value: stop.label_status },
                                    { label: "Date", value: fmt(stop.created_at) },
                                  ]
                                    .filter((f) => f.value)
                                    .map((f) => (
                                      <div key={f.label}>
                                        <p className="font-semibold text-[9px] text-muted-foreground/50 uppercase tracking-widest">
                                          {f.label}
                                        </p>
                                        <p
                                          className={`mt-0.5 truncate font-medium text-xs ${f.mono ? "font-mono text-muted-foreground" : ""}`}
                                        >
                                          {f.value}
                                        </p>
                                      </div>
                                    ))}
                                </div>
                                <div className="flex gap-2 border-t px-4 py-2.5">
                                  <a
                                    href={`/dashboard/stops?search=${encodeURIComponent(stop.recipient_name || stop.address || "")}`}
                                    className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-muted-foreground text-xs transition-colors hover:border-primary/30 hover:text-primary"
                                  >
                                    <ExternalLink className="h-3 w-3" /> View in Stops
                                  </a>
                                  {stop.tracking_link && (
                                    <a
                                      href={stop.tracking_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-muted-foreground text-xs transition-colors hover:border-primary/30 hover:text-primary"
                                    >
                                      <ArrowUpRight className="h-3 w-3" /> Track
                                    </a>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SCANS */}
              {visScans.length > 0 && (
                <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                  <div className="flex items-center gap-2 border-b bg-muted/20 px-4 py-2.5">
                    <ScanLine className="h-4 w-4 text-green-600" />
                    <span className="font-semibold text-sm">Package Scans</span>
                    <span className="rounded-full border bg-background px-2 py-0.5 font-bold text-[10px] text-muted-foreground">
                      {visScans.length}
                    </span>
                  </div>

                  <div
                    className="hidden border-b bg-muted/10 px-4 py-2 md:grid"
                    style={{
                      gridTemplateColumns:
                        "minmax(0,1.8fr) minmax(0,1fr) minmax(0,2fr) minmax(0,.8fr) minmax(0,1fr) minmax(0,.8fr) 32px",
                    }}
                  >
                    {["Name", "Rx #", "Address", "City", "Route", "Date", ""].map((h, i) => (
                      <span
                        key={h || i}
                        className="truncate font-bold text-[9px] text-muted-foreground/60 uppercase tracking-widest"
                      >
                        {h}
                      </span>
                    ))}
                  </div>

                  <div className="divide-y">
                    {visScans.map((scan) => {
                      const rc = getRC(scan.route);
                      const isExp = expanded === scan._id;
                      const name = toTitle(scan.full_name);
                      const addr = toTitle((scan.full_address || scan.address || "").toLowerCase());
                      return (
                        <div key={scan._id}>
                          <button
                            type="button"
                            onClick={() => setExpanded(isExp ? null : scan._id)}
                            className="hidden w-full cursor-pointer items-center px-4 py-3 text-left transition-colors hover:bg-muted/20 md:grid"
                            style={{
                              gridTemplateColumns:
                                "minmax(0,1.8fr) minmax(0,1fr) minmax(0,2fr) minmax(0,.8fr) minmax(0,1fr) minmax(0,.8fr) 32px",
                            }}
                          >
                            <div className="flex min-w-0 items-center gap-2 pr-3">
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-green-50 text-xs">
                                {"\u{1F4E6}"}
                              </div>
                              <span className="truncate font-semibold text-xs">
                                <Hl text={name} q={query} />
                              </span>
                            </div>
                            <span className="truncate pr-2 font-mono text-[10px] text-muted-foreground">
                              <Hl text={scan.rx_pharma_id || "\u2014"} q={query} />
                            </span>
                            <div className="flex min-w-0 items-center gap-1 pr-2">
                              <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />
                              <span className="truncate text-muted-foreground text-xs">
                                <Hl text={addr} q={query} />
                              </span>
                            </div>
                            <span className="truncate pr-2 text-muted-foreground text-xs">
                              <Hl text={scan.city || scan.client_location || "\u2014"} q={query} />
                            </span>
                            <div className="pr-2">
                              {rc ? (
                                <span
                                  style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}
                                  className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 font-bold text-[9px]"
                                >
                                  {rc.emoji} <Hl text={scan.route || ""} q={query} />
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/40">{"\u2014"}</span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground/60">{fmt(scan.created_at)}</span>
                            <div className="flex justify-end">
                              {isExp ? (
                                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />
                              )}
                            </div>
                          </button>

                          {/* Mobile */}
                          <button
                            type="button"
                            onClick={() => setExpanded(isExp ? null : scan._id)}
                            className="w-full cursor-pointer px-4 py-3 text-left transition-colors hover:bg-muted/20 md:hidden"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-start gap-2.5">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-green-50 text-base">
                                  {"\u{1F4E6}"}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-sm">
                                    <Hl text={name} q={query} />
                                  </p>
                                  <p className="mt-0.5 truncate text-muted-foreground text-xs">
                                    <Hl text={addr} q={query} />
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                    {scan.rx_pharma_id && (
                                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                        {scan.rx_pharma_id}
                                      </span>
                                    )}
                                    {rc && (
                                      <span
                                        style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}
                                        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold text-[9px]"
                                      >
                                        {rc.emoji} {scan.route}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {isExp ? (
                                <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40" />
                              )}
                            </div>
                          </button>

                          <AnimatePresence>
                            {isExp && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden border-t bg-muted/10"
                              >
                                <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
                                  {[
                                    { label: "Rx #", value: scan.rx_pharma_id, mono: true },
                                    { label: "City", value: scan.city },
                                    { label: "Route", value: scan.route },
                                    { label: "Branch", value: scan.client_location },
                                    { label: "Type", value: scan.type },
                                    { label: "Date", value: fmt(scan.created_at) },
                                    { label: "Scan ID", value: scan.rtscan_id ? `#${scan.rtscan_id}` : undefined },
                                  ]
                                    .filter((f) => f.value)
                                    .map((f) => (
                                      <div key={f.label}>
                                        <p className="font-semibold text-[9px] text-muted-foreground/50 uppercase tracking-widest">
                                          {f.label}
                                        </p>
                                        <p
                                          className={`mt-0.5 truncate font-medium text-xs ${f.mono ? "font-mono text-muted-foreground" : ""}`}
                                        >
                                          {f.value}
                                        </p>
                                      </div>
                                    ))}
                                </div>
                                <div className="border-t px-4 py-2.5">
                                  <a
                                    href={`/dashboard/scans?search=${encodeURIComponent(scan.full_name || scan.rx_pharma_id || "")}`}
                                    className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-muted-foreground text-xs transition-colors hover:border-primary/30 hover:text-primary"
                                  >
                                    <ExternalLink className="h-3 w-3" /> View in Scans
                                  </a>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
