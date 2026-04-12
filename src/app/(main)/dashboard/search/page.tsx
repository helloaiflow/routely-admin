"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  DollarSign,
  type LucideIcon,
  MapPin,
  Navigation2,
  Package,
  PenLine,
  ScanLine,
  Search,
  Snowflake,
  Star,
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
  full_address?: string;
  route?: string;
  client_location?: string;
  type?: string;
  new_client?: boolean;
  collect_payment?: boolean;
  collect_amount?: number;
  signature_required?: boolean;
  delivery_today?: boolean;
  created_at?: string;
}
interface StopResult {
  _id: string;
  rtstop_id?: number;
  recipient_name?: string;
  rx_pharma_id?: string;
  address?: string;
  route_title?: string;
  stop_position?: number;
  label_status?: string;
  delivery_succeeded?: boolean;
  created_at?: string;
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
function fmt(d?: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!text || !query) return false;
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (t.includes(q)) return true;
  const words = q.split(/\s+/);
  return words.every((w) => t.includes(w));
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || query.length < 2) return <>{text}</>;
  const q = query.toLowerCase().trim();
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-yellow-100 px-0.5 text-yellow-900">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

const HINTS = [
  { label: "West Sample Road", icon: "\u{1F4CD}" },
  { label: "Coral Springs", icon: "\u{1F3D9}\uFE0F" },
  { label: "GONZALEZ", icon: "\u{1F464}" },
  { label: "NORTH FL", icon: "\u{1F33F}" },
  { label: "Kissimmee", icon: "\u{1F4CD}" },
];

const LABEL_STYLE: Record<string, string> = {
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
      const matchScan = (s: ScanResult) =>
        fuzzyMatch(s.full_name || "", q) ||
        fuzzyMatch(s.rx_pharma_id || "", q) ||
        fuzzyMatch(s.address || "", q) ||
        fuzzyMatch(s.full_address || "", q) ||
        fuzzyMatch(s.route || "", q) ||
        fuzzyMatch(s.client_location || "", q) ||
        fuzzyMatch(String(s.rtscan_id || ""), q);

      const matchStop = (s: StopResult) =>
        fuzzyMatch(s.recipient_name || "", q) ||
        fuzzyMatch(s.rx_pharma_id || "", q) ||
        fuzzyMatch(s.address || "", q) ||
        fuzzyMatch(s.route_title || "", q) ||
        fuzzyMatch(String(s.rtstop_id || ""), q);

      setScans(allScans.filter(matchScan).slice(0, 100));
      setStops(allStops.filter(matchStop).slice(0, 100));
    },
    [allScans, allStops],
  );

  useEffect(() => {
    if (booting) return;
    setLoading(true);
    const t = setTimeout(() => {
      runFilter(query);
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [query, runFilter, booting]);

  const visScans = tab === "stops" ? [] : scans;
  const visStops = tab === "scans" ? [] : stops;
  const total = visScans.length + visStops.length;
  const hasQuery = query.trim().length >= 2;

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col overflow-hidden bg-background">
      {/* Search bar */}
      <div className="border-b px-6 pt-5 pb-4">
        <div className="mx-auto max-w-4xl">
          <div className="relative">
            <Search className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by address, patient, Rx#, route..."
              className="h-[52px] w-full rounded-2xl border border-border bg-background py-3.5 pr-12 pl-12 text-sm shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setScans([]);
                  setStops([]);
                  inputRef.current?.focus();
                }}
                className="absolute top-1/2 right-4 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Hints */}
          {!query && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 self-center text-[10px] text-muted-foreground">Try:</span>
              {HINTS.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => setQuery(h.label)}
                  className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                >
                  <span className="text-xs">{h.icon}</span>
                  {h.label}
                </button>
              ))}
            </div>
          )}

          {/* Tabs */}
          {hasQuery && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-center gap-1"
            >
              {(["all", "scans", "stops"] as const).map((t) => {
                const cnt = t === "all" ? scans.length + stops.length : t === "scans" ? scans.length : stops.length;
                const active = tab === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-xs transition-all ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {t === "scans" ? (
                      <ScanLine className="h-3 w-3" />
                    ) : t === "stops" ? (
                      <Navigation2 className="h-3 w-3" />
                    ) : (
                      <Search className="h-3 w-3" />
                    )}
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                    <span className={`rounded-full px-1.5 font-bold text-[9px] ${active ? "bg-white/20" : "bg-muted"}`}>
                      {cnt}
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

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-4">
          {!hasQuery && !booting && (
            <div className="flex flex-col items-center gap-4 pt-14 text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
                <MapPin className="h-6 w-6 opacity-40" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Search stops, scans and more</p>
                <p className="mt-1 text-xs opacity-60">Address is the fastest way to find a delivery</p>
              </div>
            </div>
          )}

          {booting && (
            <div className="space-y-1.5 pt-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 rounded-xl" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          )}

          {loading && hasQuery && (
            <div className="space-y-1.5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-10 rounded-xl" style={{ opacity: 1 - i * 0.13 }} />
              ))}
            </div>
          )}

          {!loading && hasQuery && total === 0 && (
            <div className="flex flex-col items-center gap-3 pt-10 text-muted-foreground">
              <Package className="h-10 w-10 opacity-10" />
              <p className="font-medium text-sm">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-xs opacity-60">Try a partial address, last name, or Rx number</p>
            </div>
          )}

          {!loading && hasQuery && total > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="overflow-hidden rounded-2xl border bg-card shadow-sm"
            >
              {/* Table header */}
              <div className="grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-0 border-b bg-muted/30 px-4 py-2">
                <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                  Patient / Name
                </span>
                <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                  Address
                </span>
                <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">Rx #</span>
                <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">Route</span>
                <span className="w-16 font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                  Status
                </span>
              </div>

              {/* SCANS */}
              {visScans.length > 0 && (
                <>
                  <div className="flex items-center gap-2 border-b bg-muted/10 px-4 py-1.5">
                    <ScanLine className="h-3 w-3 text-muted-foreground" />
                    <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                      Package Scans
                    </span>
                    <span className="ml-1 rounded-full border bg-background px-1.5 py-0.5 font-bold text-[9px] text-muted-foreground">
                      {visScans.length}
                    </span>
                  </div>
                  {visScans.map((scan) => {
                    const rc = getRC(scan.route);
                    const addr = toTitle((scan.full_address || scan.address || "").toLowerCase());
                    const flags = [
                      scan.new_client && { icon: Star, cls: "text-violet-500", tip: "New" },
                      scan.collect_payment && {
                        icon: DollarSign,
                        cls: "text-amber-500",
                        tip: `$${scan.collect_amount?.toFixed(0) ?? 0}`,
                      },
                      scan.type?.includes("cold") && { icon: Snowflake, cls: "text-cyan-500", tip: "Cold" },
                      scan.signature_required && { icon: PenLine, cls: "text-rose-500", tip: "Sig" },
                      scan.delivery_today && { icon: Truck, cls: "text-green-500", tip: "Today" },
                    ].filter(Boolean) as { icon: LucideIcon; cls: string; tip: string }[];
                    return (
                      <div
                        key={scan._id}
                        className="group grid grid-cols-[2fr_2fr_1fr_1fr_auto] items-center gap-0 border-b px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/30"
                      >
                        <div className="flex min-w-0 items-center gap-2 pr-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-green-50 text-xs">
                            {"\u{1F4E6}"}
                          </div>
                          <span className="truncate font-medium text-xs">
                            <Highlight text={toTitle(scan.full_name)} query={query} />
                          </span>
                          {flags.map((f) => {
                            const Icon = f.icon;
                            return (
                              <span key={f.tip} title={f.tip}>
                                <Icon className={`h-3 w-3 shrink-0 ${f.cls}`} />
                              </span>
                            );
                          })}
                        </div>
                        <div className="flex min-w-0 items-center gap-1 pr-3">
                          <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" />
                          <span className="truncate text-muted-foreground text-xs">
                            <Highlight text={addr} query={query} />
                          </span>
                        </div>
                        <span className="truncate pr-2 font-mono text-[10px] text-muted-foreground">
                          {scan.rx_pharma_id ? <Highlight text={scan.rx_pharma_id} query={query} /> : "\u2014"}
                        </span>
                        <div className="pr-2">
                          {rc ? (
                            <span
                              style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}
                              className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 font-bold text-[9px]"
                            >
                              {rc.emoji} {scan.route}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/40">{"\u2014"}</span>
                          )}
                        </div>
                        <div className="flex w-16 items-center justify-between gap-1">
                          <span className="text-[10px] text-muted-foreground/50">{fmt(scan.created_at)}</span>
                          <a
                            href={`/dashboard/scans?search=${encodeURIComponent(scan.full_name || scan.rx_pharma_id || "")}`}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded border opacity-0 transition-all hover:bg-muted group-hover:opacity-100"
                          >
                            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* STOPS */}
              {visStops.length > 0 && (
                <>
                  <div
                    className={`flex items-center gap-2 border-b bg-muted/10 px-4 py-1.5 ${visScans.length > 0 ? "border-t" : ""}`}
                  >
                    <Navigation2 className="h-3 w-3 text-muted-foreground" />
                    <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                      Delivery Stops
                    </span>
                    <span className="ml-1 rounded-full border bg-background px-1.5 py-0.5 font-bold text-[9px] text-muted-foreground">
                      {visStops.length}
                    </span>
                  </div>
                  {visStops.map((stop) => {
                    const rc = getRC(stop.route_title);
                    return (
                      <div
                        key={stop._id}
                        className="group grid grid-cols-[2fr_2fr_1fr_1fr_auto] items-center gap-0 border-b px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/30"
                      >
                        <div className="flex min-w-0 items-center gap-2 pr-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-50 text-xs">
                            {"\u{1F4CD}"}
                          </div>
                          <span className="truncate font-medium text-xs">
                            <Highlight text={toTitle(stop.recipient_name)} query={query} />
                          </span>
                          {stop.delivery_succeeded && <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />}
                        </div>
                        <div className="flex min-w-0 items-center gap-1 pr-3">
                          <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" />
                          <span className="truncate text-muted-foreground text-xs">
                            <Highlight text={toTitle(stop.address || "")} query={query} />
                          </span>
                        </div>
                        <span className="truncate pr-2 font-mono text-[10px] text-muted-foreground">
                          {stop.rx_pharma_id ? <Highlight text={stop.rx_pharma_id} query={query} /> : "\u2014"}
                        </span>
                        <div className="pr-2">
                          {rc ? (
                            <span
                              style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}
                              className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 font-bold text-[9px]"
                            >
                              {rc.emoji} {stop.route_title}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/40">{"\u2014"}</span>
                          )}
                        </div>
                        <div className="flex w-16 items-center justify-between gap-1">
                          {stop.label_status ? (
                            <span
                              className={`rounded-full border px-1.5 py-0.5 font-bold text-[8px] ${LABEL_STYLE[stop.label_status] || ""}`}
                            >
                              {stop.label_status}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/50">{fmt(stop.created_at)}</span>
                          )}
                          <a
                            href={`/dashboard/stops?search=${encodeURIComponent(stop.recipient_name || stop.address || "")}`}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded border opacity-0 transition-all hover:bg-muted group-hover:opacity-100"
                          >
                            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
