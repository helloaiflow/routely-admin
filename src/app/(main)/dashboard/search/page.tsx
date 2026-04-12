"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  DollarSign,
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
  package_vip?: boolean;
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

const HINTS = [
  { label: "West Sample Road", icon: "\u{1F4CD}" },
  { label: "Coral Springs", icon: "\u{1F3D9}\uFE0F" },
  { label: "GONZALEZ", icon: "\u{1F464}" },
  { label: "NORTH FL", icon: "\u{1F33F}" },
  { label: "Kissimmee", icon: "\u{1F4CD}" },
];

const LABEL_STYLE: Record<string, string> = {
  Match: "bg-green-50  text-green-700  border-green-200",
  Unmatch: "bg-amber-50  text-amber-700  border-amber-200",
  Human: "bg-rose-50   text-rose-700   border-rose-200",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [stops, setStops] = useState<StopResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [tab, setTab] = useState<"all" | "scans" | "stops">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setScans([]);
      setStops([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const ql = q.toLowerCase();
      const [scansRes, stopsRes] = await Promise.all([
        fetch("/api/data/package-scans?limit=200"),
        fetch("/api/data/spoke-stops?limit=200"),
      ]);
      if (scansRes.ok) {
        const d = await scansRes.json();
        setScans(
          (d.list || d || []).filter(
            (s: ScanResult) =>
              s.full_name?.toLowerCase().includes(ql) ||
              s.rx_pharma_id?.toLowerCase().includes(ql) ||
              s.address?.toLowerCase().includes(ql) ||
              s.full_address?.toLowerCase().includes(ql) ||
              s.route?.toLowerCase().includes(ql) ||
              s.client_location?.toLowerCase().includes(ql) ||
              String(s.rtscan_id || "").includes(ql),
          ),
        );
      }
      if (stopsRes.ok) {
        const d = await stopsRes.json();
        setStops(
          ((d.list || d || []) as StopResult[]).filter(
            (s) =>
              s.recipient_name?.toLowerCase().includes(ql) ||
              s.rx_pharma_id?.toLowerCase().includes(ql) ||
              s.address?.toLowerCase().includes(ql) ||
              s.route_title?.toLowerCase().includes(ql) ||
              String(s.rtstop_id || "").includes(ql),
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 380);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const visibleScans = tab === "stops" ? [] : scans;
  const visibleStops = tab === "scans" ? [] : stops;
  const total = visibleScans.length + visibleStops.length;

  const highlight = (text: string, q: string) => {
    if (!q || q.length < 2) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="rounded-sm bg-yellow-100 px-0.5 text-yellow-900">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col overflow-hidden bg-background">
      {/* Search hero */}
      <div className="border-b px-6 pt-6 pb-4">
        <div className="mx-auto max-w-3xl">
          <div className="relative">
            <Search className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by address, patient name, Rx#, route..."
              className="h-[52px] w-full rounded-2xl border border-border bg-background py-3.5 pr-12 pl-12 text-sm shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setScans([]);
                  setStops([]);
                  setSearched(false);
                  inputRef.current?.focus();
                }}
                className="absolute top-1/2 right-4 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Hint chips */}
          {!query && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="mr-1 self-center text-[10px] text-muted-foreground">Try:</span>
              {HINTS.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => setQuery(h.label)}
                  className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                >
                  <span>{h.icon}</span>
                  {h.label}
                </button>
              ))}
            </div>
          )}

          {/* Tab bar */}
          {searched && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
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
        <div className="mx-auto max-w-3xl px-6 py-4">
          {/* Empty state */}
          {!searched && !loading && (
            <div className="flex flex-col items-center gap-4 pt-16 text-muted-foreground">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
                <MapPin className="h-7 w-7 opacity-40" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Search by address, patient or Rx#</p>
                <p className="mt-1 text-xs opacity-60">Results from package scans and delivery stops</p>
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="space-y-1.5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-12 rounded-xl" style={{ opacity: 1 - i * 0.13 }} />
              ))}
            </div>
          )}

          {/* No results */}
          {!loading && searched && total === 0 && (
            <div className="flex flex-col items-center gap-3 pt-12 text-muted-foreground">
              <Package className="h-10 w-10 opacity-10" />
              <p className="font-medium text-sm">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-xs opacity-60">Try a different address, name or Rx number</p>
            </div>
          )}

          {/* Results table */}
          {!loading && searched && total > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="overflow-hidden rounded-2xl border bg-card"
            >
              {/* SCANS */}
              {visibleScans.length > 0 && (
                <>
                  <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
                    <ScanLine className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                      Package Scans
                    </span>
                    <span className="ml-1 rounded-full border bg-background px-1.5 py-0.5 font-bold text-[9px] text-muted-foreground">
                      {visibleScans.length}
                    </span>
                  </div>
                  <div className="divide-y">
                    {visibleScans.map((scan) => {
                      const rc = getRC(scan.route);
                      const addr = (scan.full_address || scan.address || "").toLowerCase();
                      const flags = [
                        scan.new_client && {
                          icon: Star,
                          tip: "New client",
                          cls: "border-violet-200 bg-violet-50 text-violet-600",
                        },
                        scan.collect_payment && {
                          icon: DollarSign,
                          tip: `$${scan.collect_amount?.toFixed(0) ?? "0"}`,
                          cls: "border-amber-200 bg-amber-50 text-amber-600",
                        },
                        scan.type?.includes("cold") && {
                          icon: Snowflake,
                          tip: "Cold",
                          cls: "border-cyan-200 bg-cyan-50 text-cyan-600",
                        },
                        scan.signature_required && {
                          icon: PenLine,
                          tip: "Signature",
                          cls: "border-rose-200 bg-rose-50 text-rose-600",
                        },
                        scan.delivery_today && {
                          icon: Truck,
                          tip: "Today",
                          cls: "border-green-200 bg-green-50 text-green-600",
                        },
                      ].filter(Boolean) as { icon: typeof Star; tip: string; cls: string }[];
                      return (
                        <div
                          key={scan._id}
                          className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-sm">
                            {"\u{1F4E6}"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{highlight(toTitle(scan.full_name), query)}</span>
                              {scan.rx_pharma_id && (
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {highlight(scan.rx_pharma_id, query)}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{highlight(toTitle(addr), query)}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {flags.map((f) => (
                              <span
                                key={f.tip}
                                title={f.tip}
                                className={`flex h-5 w-5 items-center justify-center rounded border text-[10px] ${f.cls}`}
                              >
                                <f.icon className="h-3 w-3" />
                              </span>
                            ))}
                            {rc && (
                              <span
                                style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}
                                className="whitespace-nowrap rounded-full px-1.5 py-0.5 font-bold text-[9px]"
                              >
                                {rc.emoji} {scan.route}
                              </span>
                            )}
                            {scan.created_at && (
                              <span className="hidden text-[10px] text-muted-foreground/60 sm:block">
                                {fmt(scan.created_at)}
                              </span>
                            )}
                            <a
                              href={`/dashboard/scans?search=${encodeURIComponent(scan.full_name || scan.rx_pharma_id || "")}`}
                              className="flex h-6 w-6 items-center justify-center rounded-md border opacity-0 transition-all hover:bg-muted group-hover:opacity-100"
                            >
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* STOPS */}
              {visibleStops.length > 0 && (
                <>
                  <div
                    className={`flex items-center gap-2 border-b bg-muted/30 px-4 py-2 ${visibleScans.length > 0 ? "border-t" : ""}`}
                  >
                    <Navigation2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                      Delivery Stops
                    </span>
                    <span className="ml-1 rounded-full border bg-background px-1.5 py-0.5 font-bold text-[9px] text-muted-foreground">
                      {visibleStops.length}
                    </span>
                  </div>
                  <div className="divide-y">
                    {visibleStops.map((stop) => {
                      const rc = getRC(stop.route_title);
                      const labelCls = LABEL_STYLE[stop.label_status || ""] || "";
                      return (
                        <div
                          key={stop._id}
                          className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-sm">
                            {"\u{1F4CD}"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">
                                {highlight(toTitle(stop.recipient_name), query)}
                              </span>
                              {stop.rx_pharma_id && (
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {highlight(stop.rx_pharma_id, query)}
                                </span>
                              )}
                              {stop.stop_position && (
                                <span className="rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                                  #{stop.stop_position}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{highlight(toTitle(stop.address || ""), query)}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {stop.label_status && (
                              <span className={`rounded-full border px-1.5 py-0.5 font-bold text-[9px] ${labelCls}`}>
                                {stop.label_status}
                              </span>
                            )}
                            {stop.delivery_succeeded && (
                              <span className="flex items-center gap-0.5 font-semibold text-[10px] text-green-600">
                                <CheckCircle2 className="h-3 w-3" />
                              </span>
                            )}
                            {rc && (
                              <span
                                style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}
                                className="whitespace-nowrap rounded-full px-1.5 py-0.5 font-bold text-[9px]"
                              >
                                {rc.emoji} {stop.route_title}
                              </span>
                            )}
                            {stop.created_at && (
                              <span className="hidden text-[10px] text-muted-foreground/60 sm:block">
                                {fmt(stop.created_at)}
                              </span>
                            )}
                            <a
                              href={`/dashboard/stops?search=${encodeURIComponent(stop.recipient_name || stop.address || "")}`}
                              className="flex h-6 w-6 items-center justify-center rounded-md border opacity-0 transition-all hover:bg-muted group-hover:opacity-100"
                            >
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
