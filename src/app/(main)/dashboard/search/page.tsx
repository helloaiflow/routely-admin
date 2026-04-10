"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Filter,
  MapPin,
  Package,
  PenLine,
  Search,
  Snowflake,
  Star,
  Truck,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

type ActiveTab = "all" | "scans" | "stops";

const ROUTE_COLORS: Record<string, { bg: string; text: string; border: string; emoji: string }> = {
  "CENTRAL FL": { bg: "#fff0f8", text: "#c0006a", border: "#f9a8d4", emoji: "🌆" },
  "SOUTH FL": { bg: "#fffff0", text: "#7a7200", border: "#fde68a", emoji: "🌴" },
  "DEERFIELD FL": { bg: "#edfcff", text: "#0079a8", border: "#a5f3fc", emoji: "🦌" },
  "NORTH FL": { bg: "#edfff5", text: "#007a4a", border: "#6ee7b7", emoji: "🌿" },
};
function getRouteColor(route?: string) {
  if (!route) return { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0", emoji: "📍" };
  const up = route.toUpperCase();
  for (const [k, v] of Object.entries(ROUTE_COLORS)) if (up.includes(k)) return v;
  return { bg: "#f4f0ff", text: "#5b21b6", border: "#c4b5fd", emoji: "🔮" };
}

function RouteBadge({ route }: { route?: string }) {
  if (!route) return null;
  const c = getRouteColor(route);
  return (
    <span
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
      className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 font-bold text-[9px]"
    >
      {c.emoji} {route}
    </span>
  );
}

function LabelBadge({ status }: { status?: string }) {
  if (!status) return null;
  const m: Record<string, string> = {
    Match: "border-green-200 bg-green-100 text-green-700",
    Unmatch: "border-amber-200 bg-amber-100 text-amber-700",
    Human: "border-rose-200 bg-rose-100 text-rose-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-bold text-[9px] ${m[status] || ""}`}
    >
      {status}
    </span>
  );
}

function toTitle(s?: string) {
  if (!s) return "—";
  return s.replace(/\b\w+/g, (w) =>
    /^[A-Z]{2}$/.test(w) || /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );
}

function fmt(d?: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ScanCard({ scan }: { scan: ScanResult }) {
  const flags = [
    scan.new_client && { icon: Star, label: "New", cls: "text-violet-600" },
    scan.collect_payment && { icon: DollarSign, label: `$${scan.collect_amount?.toFixed(0)}`, cls: "text-amber-600" },
    scan.type?.includes("cold") && { icon: Snowflake, label: "Cold", cls: "text-cyan-600" },
    scan.signature_required && { icon: PenLine, label: "Sig", cls: "text-rose-600" },
    scan.delivery_today && { icon: Truck, label: "Today", cls: "text-green-600" },
  ].filter(Boolean) as { icon: typeof Star; label: string; cls: string }[];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-2xl border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl">📦</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-bold text-sm">{toTitle(scan.full_name)}</p>
            <Badge variant="outline" className="border-green-200 bg-green-50 text-[10px] text-green-700">
              Scan
            </Badge>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {scan.rx_pharma_id && (
              <span className="font-mono text-[10px] text-muted-foreground">Rx: {scan.rx_pharma_id}</span>
            )}
            {scan.rtscan_id && (
              <span className="font-mono text-[10px] text-muted-foreground/60">#{scan.rtscan_id}</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate capitalize">{(scan.full_address || scan.address || "—").toLowerCase()}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <RouteBadge route={scan.route} />
            {scan.client_location && scan.client_location !== "OTHER" && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-medium text-[9px] text-slate-500">
                {scan.client_location}
              </span>
            )}
            {flags.map((f) => (
              <span key={f.label} className={`inline-flex items-center gap-0.5 font-semibold text-[10px] ${f.cls}`}>
                <f.icon className="h-3 w-3" />
                {f.label}
              </span>
            ))}
            {scan.created_at && (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/60">
                <Clock className="h-2.5 w-2.5" />
                {fmt(scan.created_at)}
              </span>
            )}
          </div>
        </div>
        <a
          href={`/dashboard/scans?search=${encodeURIComponent(scan.rx_pharma_id || scan.full_name || "")}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border opacity-0 transition-all hover:bg-muted group-hover:opacity-100"
        >
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </a>
      </div>
    </motion.div>
  );
}

function StopCard({ stop }: { stop: StopResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-2xl border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-xl">📍</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-bold text-sm">{toTitle(stop.recipient_name)}</p>
            <Badge variant="outline" className="border-violet-200 bg-violet-50 text-[10px] text-violet-700">
              Stop
            </Badge>
            <LabelBadge status={stop.label_status} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            {stop.rx_pharma_id && (
              <span className="font-mono text-[10px] text-muted-foreground">Rx: {stop.rx_pharma_id}</span>
            )}
            {stop.stop_position && (
              <span className="rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                Stop #{stop.stop_position}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate capitalize">{(stop.address || "—").toLowerCase()}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <RouteBadge route={stop.route_title} />
            {stop.delivery_succeeded && (
              <span className="inline-flex items-center gap-0.5 font-semibold text-[10px] text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                Delivered
              </span>
            )}
          </div>
        </div>
        <a
          href={`/dashboard/stops?search=${encodeURIComponent(stop.recipient_name || stop.address || "")}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border opacity-0 transition-all hover:bg-muted group-hover:opacity-100"
        >
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </a>
      </div>
    </motion.div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [stops, setStops] = useState<StopResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const [scansRes, stopsRes] = await Promise.all([
        fetch("/api/data/package-scans?limit=100"),
        fetch("/api/data/spoke-stops"),
      ]);
      const ql = query.toLowerCase();
      if (scansRes.ok) {
        const d = await scansRes.json();
        setScans(
          (d.list || d || []).filter(
            (s: ScanResult) =>
              s.full_name?.toLowerCase().includes(ql) ||
              s.rx_pharma_id?.toLowerCase().includes(ql) ||
              s.address?.toLowerCase().includes(ql) ||
              s.full_address?.toLowerCase().includes(ql) ||
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
              String(s.rtstop_id || "").includes(ql),
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (query.length < 2) {
      setScans([]);
      setStops([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(doSearch, 400);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const routes = useMemo(
    () =>
      [
        ...new Set([...scans.map((s) => s.route), ...stops.map((s) => s.route_title)].filter(Boolean) as string[]),
      ].sort(),
    [scans, stops],
  );
  const filteredScans = useMemo(() => {
    let r = scans;
    if (routeFilter !== "all") r = r.filter((s) => s.route === routeFilter);
    return r;
  }, [scans, routeFilter]);
  const filteredStops = useMemo(() => {
    let r = stops;
    if (routeFilter !== "all") r = r.filter((s) => s.route_title === routeFilter);
    return r;
  }, [stops, routeFilter]);
  const totalCount =
    activeTab === "all"
      ? filteredScans.length + filteredStops.length
      : activeTab === "scans"
        ? filteredScans.length
        : filteredStops.length;

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col overflow-hidden">
      <div className="border-b bg-background px-6 py-4">
        <div className="mx-auto max-w-4xl space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by patient name, Rx#, address, phone..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
                className="h-11 pr-10 pl-10 text-sm"
                autoFocus
              />
              <AnimatePresence>
                {query && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => {
                      setQuery("");
                      setScans([]);
                      setStops([]);
                      setSearched(false);
                    }}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
            <Button
              variant="outline"
              size="sm"
              className={`h-11 gap-1.5 ${showFilters ? "bg-muted" : ""}`}
              onClick={() => setShowFilters((p) => !p)}
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
            </Button>
          </div>
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-2 overflow-hidden"
              >
                <Select value={routeFilter} onValueChange={setRouteFilter}>
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue placeholder="All Routes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Routes</SelectItem>
                    {routes.map((r) => (
                      <SelectItem key={r} value={r}>
                        {getRouteColor(r).emoji} {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {routeFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => setRouteFilter("all")}
                    className="flex items-center gap-1 rounded-md px-2 text-muted-foreground text-xs hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {searched && !loading && (
            <div className="flex items-center gap-1">
              {(["all", "scans", "stops"] as const).map((tab) => {
                const count =
                  tab === "all"
                    ? filteredScans.length + filteredStops.length
                    : tab === "scans"
                      ? filteredScans.length
                      : filteredStops.length;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-xs transition-colors ${activeTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {tab === "scans" ? (
                      <Package className="h-3 w-3" />
                    ) : tab === "stops" ? (
                      <MapPin className="h-3 w-3" />
                    ) : (
                      <Search className="h-3 w-3" />
                    )}
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-bold text-[9px] ${activeTab === tab ? "bg-white/20" : "bg-muted"}`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
              <span className="ml-auto text-[11px] text-muted-foreground">{totalCount} results</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-2 p-6">
          {!searched && !loading && (
            <div className="flex flex-col items-center gap-4 pt-16 text-muted-foreground">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                <Search className="h-9 w-9 opacity-40" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-base">Search across all records</p>
                <p className="mt-1 text-sm opacity-60">Type a patient name, Rx#, address, or phone number</p>
              </div>
              <div className="flex gap-2 text-xs">
                {["GONZALEZ", "650410", "Kissimmee", "+1954"].map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => setQuery(hint)}
                    className="rounded-full border px-3 py-1.5 transition-colors hover:bg-muted"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          )}
          {loading &&
            ["a", "b", "c", "d", "e"].map((k, i) => (
              <Skeleton key={k} className="h-24 rounded-2xl" style={{ opacity: 1 - i * 0.15 }} />
            ))}
          {!loading && searched && totalCount === 0 && (
            <div className="flex flex-col items-center gap-3 pt-12 text-muted-foreground">
              <Package className="h-12 w-12 opacity-10" />
              <p className="font-medium">No results for &ldquo;{query}&rdquo;</p>
            </div>
          )}
          {!loading && searched && (
            <div className="space-y-2">
              {(activeTab === "all" || activeTab === "scans") &&
                filteredScans.map((s) => <ScanCard key={s._id} scan={s} />)}
              {(activeTab === "all" || activeTab === "stops") &&
                filteredStops.map((s) => <StopCard key={s._id} stop={s} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
