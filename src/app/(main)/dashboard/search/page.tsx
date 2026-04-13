"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Camera,
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
  RefreshCw,
  ScanLine,
  Search,
  Truck,
  X,
  ZoomIn,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  image_url?: string;
  created_at?: string;
  _score?: number;
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
  plan_id?: string;
  event_type?: string;
  delivery_state?: string;
  label_status?: string;
  delivery_succeeded?: boolean;
  stop_position?: number;
  eta_arrival?: string;
  driver_id?: string;
  driver_name?: string;
  stop_notes?: string;
  tracking_link?: string;
  photo_urls?: string;
  web_app_link?: string;
  created_at?: string | { $date: string };
  _score?: number;
  _scanImage?: string;
}

const ROUTE_MAP: Record<string, { bg: string; text: string; border: string; emoji: string }> = {
  "CENTRAL FL": { bg: "#fff0f8", text: "#c0006a", border: "#f9a8d4", emoji: "\u{1F306}" },
  "SOUTH FL": { bg: "#fffff0", text: "#7a7200", border: "#fde68a", emoji: "\u{1F334}" },
  "DEERFIELD FL": { bg: "#edfcff", text: "#0079a8", border: "#a5f3fc", emoji: "\u{1F98C}" },
  "NORTH FL": { bg: "#edfff5", text: "#007a4a", border: "#6ee7b7", emoji: "\u{1F33F}" },
};
const _rc: Record<string, { bg: string; text: string; border: string; emoji: string }> = {};
let _ri = 0;
const FB = [
  { bg: "#f4f0ff", text: "#5b21b6", border: "#c4b5fd", emoji: "\u{1F52E}" },
  { bg: "#fff4ed", text: "#c2410c", border: "#fdba74", emoji: "\u{1F525}" },
];
function getRC(r?: string) {
  if (!r) return { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0", emoji: "\u{1F4CD}" };
  const u = r.toUpperCase();
  for (const [k, v] of Object.entries(ROUTE_MAP)) if (u.includes(k)) return v;
  if (!_rc[r]) {
    _rc[r] = FB[_ri % FB.length];
    _ri++;
  }
  return _rc[r];
}
function toTitle(s?: string) {
  if (!s) return "\u2014";
  return s.replace(/\b\w+/g, (w) =>
    /^[A-Z]{2}$/.test(w) || /^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1).toLowerCase(),
  );
}
function fmtDate(d?: string | { $date: string }) {
  if (!d) return "";
  const s = typeof d === "object" ? d.$date : d;
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}
function fmtPhone(p?: string) {
  if (!p) return "\u2014";
  const d = p.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}
function fuzzy(text: string, q: string): number {
  if (!text || !q) return 0;
  const t = text.toLowerCase(),
    ql = q.toLowerCase().trim();
  if (t === ql) return 3;
  if (t.startsWith(ql)) return 2.5;
  if (t.includes(ql)) return 2;
  const w = ql.split(/\s+/);
  if (w.every((x) => t.includes(x))) return 1;
  if (w.some((x) => t.includes(x))) return 0.5;
  return 0;
}
function scoreStop(s: StopResult, q: string) {
  return Math.max(
    fuzzy(s.recipient_name || "", q) * 3,
    fuzzy(s.address || "", q) * 2.5,
    fuzzy(s.city || "", q) * 2,
    fuzzy(s.rx_pharma_id || "", q) * 2,
    fuzzy(s.recipient_phone || "", q) * 1.5,
    fuzzy(s.route_title || "", q),
    fuzzy(s.driver_name || "", q),
    fuzzy(String(s.rtstop_id || ""), q),
  );
}
function scoreScan(s: ScanResult, q: string) {
  return Math.max(
    fuzzy(s.full_name || "", q) * 3,
    fuzzy(s.address || "", q) * 2.5,
    fuzzy(s.full_address || "", q) * 2.5,
    fuzzy(s.city || "", q) * 2,
    fuzzy(s.rx_pharma_id || "", q) * 2,
    fuzzy(s.phone || "", q) * 1.5,
    fuzzy(s.route || "", q),
    fuzzy(String(s.rtscan_id || ""), q),
  );
}
function Hl({ text, q }: { text: string; q: string }) {
  if (!q || q.length < 2 || !text) return <>{text || "\u2014"}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase().trim());
  if (idx < 0) return <>{text}</>;
  const n = q.trim().length;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber-100 px-0.5 font-semibold text-amber-900 not-italic">
        {text.slice(idx, idx + n)}
      </mark>
      {text.slice(idx + n)}
    </>
  );
}

function StatusBadge({ state, succeeded }: { state?: string; succeeded?: boolean }) {
  const cls =
    "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-semibold text-[10px]";
  if (succeeded)
    return (
      <span className={`${cls} border-green-200 bg-green-50 text-green-700`}>
        <CheckCircle2 className="h-2.5 w-2.5" />
        Delivered
      </span>
    );
  const s = state?.toLowerCase() || "";
  if (s.includes("failed") || s.includes("unattempted"))
    return (
      <span className={`${cls} border-rose-200 bg-rose-50 text-rose-700`}>
        <AlertCircle className="h-2.5 w-2.5" />
        {toTitle(state)}
      </span>
    );
  if (s.includes("transit") || s.includes("allocated"))
    return (
      <span className={`${cls} border-blue-200 bg-blue-50 text-blue-700`}>
        <Truck className="h-2.5 w-2.5" />
        {toTitle(state)}
      </span>
    );
  if (s.includes("pending") || s.includes("complete") || s.includes("delivered"))
    return (
      <span className={`${cls} border-amber-200 bg-amber-50 text-amber-700`}>
        <Clock className="h-2.5 w-2.5" />
        {toTitle(state)}
      </span>
    );
  return (
    <span className={`${cls} border-border bg-muted/40 font-medium text-muted-foreground`}>
      <Circle className="h-2 w-2" />
      {toTitle(state) || "\u2014"}
    </span>
  );
}
function LabelBadge({ s }: { s?: string }) {
  if (!s) return null;
  const m: Record<string, string> = {
    Match: "border-green-200 bg-green-50 text-green-700",
    Unmatch: "border-amber-200 bg-amber-50 text-amber-700",
    Human: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-bold text-[9px] ${m[s] || "border-border bg-muted text-muted-foreground"}`}
    >
      {s}
    </span>
  );
}
function RouteBadge({ route }: { route?: string }) {
  if (!route) return <span className="text-[10px] text-muted-foreground/40">{"\u2014"}</span>;
  const c = getRC(route);
  return (
    <span
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
      className="inline-flex max-w-full items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 font-bold text-[9px]"
    >
      {c.emoji} <span className="truncate">{route}</span>
    </span>
  );
}
function ImgThumb({ url, alt, fullName, rxId }: { url?: string; alt?: string; fullName?: string; rxId?: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState(false);
  if (!url || err)
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border border-dashed bg-muted/20">
        <Camera className="h-3 w-3 text-muted-foreground/25" />
      </div>
    );
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="group/img relative flex h-7 w-7 shrink-0 overflow-hidden rounded-md border border-border bg-muted transition-all hover:border-primary/40 hover:shadow-sm"
      >
        {/* biome-ignore lint/a11y/useAltText: thumb */}
        <img src={url} alt={alt || "photo"} className="h-full w-full object-cover" onError={() => setErr(true)} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover/img:bg-black/20 group-hover/img:opacity-100">
          <ZoomIn className="h-2.5 w-2.5 text-white" />
        </div>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="overflow-hidden rounded-2xl bg-black/95 shadow-2xl"
          >
            <div className="flex items-center justify-between border-white/10 border-b px-4 py-3">
              <div>
                <p className="font-semibold text-sm text-white">{fullName || alt || "Photo"}</p>
                {rxId && <p className="font-mono text-[11px] text-white/50">{rxId}</p>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="h-7 w-7 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-3">
              {/* biome-ignore lint/a11y/useAltText: full */}
              <img src={url} alt={alt || "photo"} className="w-full rounded-xl object-contain" />
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const HINTS = [
  { label: "Kissimmee", icon: "\u{1F4CD}" },
  { label: "Coral Springs", icon: "\u{1F3D9}\uFE0F" },
  { label: "NORTH FL", icon: "\u{1F33F}" },
  { label: "GONZALEZ", icon: "\u{1F464}" },
  { label: "West Sample Road", icon: "\u{1F6E3}\uFE0F" },
];

const COLS =
  "32px minmax(130px,1.8fr) minmax(90px,1fr) minmax(140px,1.8fr) minmax(70px,.7fr) minmax(100px,.9fr) minmax(90px,.9fr) minmax(90px,.9fr) 60px minmax(100px,1fr) 28px";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [stops, setStops] = useState<StopResult[]>([]);
  const [allScans, setAllScans] = useState<ScanResult[]>([]);
  const [allStops, setAllStops] = useState<StopResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "scans" | "stops">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const boot = useCallback(async (silent = false) => {
    if (!silent) setBooting(true);
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
  }, []);
  useEffect(() => {
    boot();
  }, [boot]);

  const scanImageMap = useRef<Map<number, string>>(new Map());
  useEffect(() => {
    const m = new Map<number, string>();
    for (const s of allScans) {
      if (s.rtscan_id && s.image_url) m.set(s.rtscan_id, s.image_url);
    }
    scanImageMap.current = m;
  }, [allScans]);

  const runFilter = useCallback(
    (q: string) => {
      if (!q.trim() || q.trim().length < 2) {
        setScans([]);
        setStops([]);
        return;
      }
      setScans(
        allScans
          .map((s) => ({ ...s, _score: scoreScan(s, q) }))
          .filter((s) => (s._score || 0) > 0)
          .sort((a, b) => (b._score || 0) - (a._score || 0))
          .slice(0, 150),
      );
      setStops(
        allStops
          .map((s) => ({
            ...s,
            _score: scoreStop(s, q),
            _scanImage: s.rtscan_id ? scanImageMap.current.get(s.rtscan_id) || "" : "",
          }))
          .filter((s) => (s._score || 0) > 0)
          .sort((a, b) => (b._score || 0) - (a._score || 0))
          .slice(0, 150),
      );
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

  const visStops = (() => {
    if (sourceFilter === "scans") return [];
    let r = stops;
    if (routeFilter !== "all") r = r.filter((s) => s.route_title === routeFilter);
    if (statusFilter !== "all")
      r = r.filter((s) => s.delivery_state === statusFilter || (statusFilter === "delivered" && s.delivery_succeeded));
    return r;
  })();
  const visScans =
    sourceFilter === "stops" ? [] : scans.filter((s) => routeFilter === "all" || s.route === routeFilter);
  const total = visScans.length + visStops.length;
  const hasQuery = query.trim().length >= 2;
  const allRoutes = [
    ...new Set([...stops.map((s) => s.route_title), ...scans.map((s) => s.route)].filter(Boolean) as string[]),
  ].sort();
  const allStatuses = [...new Set(stops.map((s) => s.delivery_state).filter(Boolean) as string[])].sort();
  const TH = ({ children }: { children: React.ReactNode }) => (
    <span className="truncate font-semibold text-[9px] text-muted-foreground uppercase tracking-wider">{children}</span>
  );

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col overflow-hidden">
      <div className="flex flex-col gap-2 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-2xl">Package Search</h1>
            <p className="text-muted-foreground text-sm">
              {booting
                ? "Loading..."
                : hasQuery
                  ? `${total} result${total !== 1 ? "s" : ""} found`
                  : `${allStops.length} stops \u00B7 ${allScans.length} scans indexed`}
            </p>
          </div>
          <motion.button
            whileTap={{ rotate: 180 }}
            type="button"
            onClick={() => boot(true)}
            disabled={booting}
            className="flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${booting ? "animate-spin" : ""}`} />
          </motion.button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              {loading ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
              ) : (
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stops, scans..."
              className="h-9 pr-9 pl-9 text-sm"
              autoFocus
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
                  className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as "all" | "scans" | "stops")}>
            <SelectTrigger className="h-9 w-32 text-sm">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent style={{ zIndex: 9999 }}>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="stops">Stops only</SelectItem>
              <SelectItem value="scans">Scans only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={routeFilter} onValueChange={setRouteFilter}>
            <SelectTrigger className="h-9 w-36 text-sm">
              <SelectValue placeholder="All Routes" />
            </SelectTrigger>
            <SelectContent style={{ zIndex: 9999 }}>
              <SelectItem value="all">All Routes</SelectItem>
              {allRoutes.map((r) => (
                <SelectItem key={r} value={r}>
                  {getRC(r).emoji} {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue placeholder="All Delivery" />
            </SelectTrigger>
            <SelectContent style={{ zIndex: 9999 }}>
              <SelectItem value="all">All Delivery</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              {allStatuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {toTitle(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {!hasQuery && !booting && (
          <div className="flex flex-col items-center gap-4 pt-12 text-muted-foreground">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
              <Search className="h-6 w-6 opacity-30" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground text-sm">Search across all records</p>
              <p className="mt-1 text-xs opacity-55">Address \u00B7 patient \u00B7 Rx# \u00B7 phone \u00B7 route</p>
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              {HINTS.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => setQuery(h.label)}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1.5 text-muted-foreground text-xs transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                >
                  <span>{h.icon}</span>
                  {h.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {booting && (
          <div className="space-y-1.5">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 rounded-xl" style={{ opacity: 1 - i * 0.18 }} />
            ))}
          </div>
        )}
        {loading && hasQuery && (
          <div className="space-y-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 rounded-xl" style={{ opacity: 1 - i * 0.13 }} />
            ))}
          </div>
        )}
        {!loading && hasQuery && total === 0 && (
          <div className="flex flex-col items-center gap-3 pt-10 text-muted-foreground">
            <Package className="h-10 w-10 opacity-10" />
            <p className="font-semibold text-sm">No results for &ldquo;{query}&rdquo;</p>
            <p className="text-xs opacity-55">Try a partial address, last name, or Rx number</p>
          </div>
        )}

        {!loading && hasQuery && total > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="overflow-hidden rounded-xl border bg-card shadow-sm"
          >
            <div className="hidden overflow-x-auto md:block">
              <div className="min-w-[900px]">
                <div
                  className="grid items-center gap-2 border-b bg-muted/30 px-4 py-2"
                  style={{ gridTemplateColumns: COLS }}
                >
                  <TH>Img</TH>
                  <TH>Name</TH>
                  <TH>Rx / ID</TH>
                  <TH>Address</TH>
                  <TH>City</TH>
                  <TH>Phone</TH>
                  <TH>Zone</TH>
                  <TH>Driver</TH>
                  <TH>Label</TH>
                  <TH>Status</TH>
                  <TH>{""}</TH>
                </div>
              </div>
            </div>

            {visStops.length > 0 && (
              <>
                <div className="flex items-center gap-2 border-b bg-violet-50/50 px-4 py-1.5">
                  <Navigation2 className="h-3 w-3 text-violet-600" />
                  <span className="font-semibold text-[10px] text-violet-700 uppercase tracking-wider">
                    Delivery Stops
                  </span>
                  <span className="ml-1 rounded-full border border-violet-200 bg-white px-1.5 py-0.5 font-bold text-[9px] text-violet-600">
                    {visStops.length}
                  </span>
                </div>
                <div className="divide-y overflow-x-auto">
                  <div className="min-w-[900px]">
                    {visStops.map((stop, idx) => {
                      const isExp = expanded === stop._id;
                      const name = toTitle(stop.recipient_name);
                      const addr = toTitle(stop.address);
                      const img = stop._scanImage || stop.photo_urls?.split(",")?.[0]?.trim() || "";
                      return (
                        <div
                          key={stop._id}
                          className={`group transition-colors ${isExp ? "bg-primary/[0.025]" : "hover:bg-muted/20"}`}
                          style={{
                            borderLeft: isExp
                              ? "3px solid hsl(var(--primary))"
                              : idx === 0
                                ? "3px solid hsl(var(--primary)/0.25)"
                                : "3px solid transparent",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setExpanded(isExp ? null : stop._id)}
                            className="hidden w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left md:grid"
                            style={{ gridTemplateColumns: COLS }}
                          >
                            <ImgThumb url={img} alt={name} fullName={name} rxId={stop.rx_pharma_id} />
                            <span className="truncate font-medium text-xs">
                              <Hl text={name} q={query} />
                            </span>
                            <span className="truncate font-mono text-[10px] text-muted-foreground">
                              <Hl text={stop.rx_pharma_id || "\u2014"} q={query} />
                            </span>
                            <div className="flex min-w-0 items-center gap-1">
                              <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                              <span className="truncate text-muted-foreground text-xs">
                                <Hl text={addr} q={query} />
                              </span>
                            </div>
                            <span className="truncate text-muted-foreground text-xs">
                              <Hl text={stop.city || "\u2014"} q={query} />
                            </span>
                            <div className="flex min-w-0 items-center gap-1">
                              <Phone className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                              <span className="truncate font-mono text-[10px] text-muted-foreground">
                                <Hl text={fmtPhone(stop.recipient_phone)} q={query} />
                              </span>
                            </div>
                            <RouteBadge route={stop.route_title} />
                            <span className="truncate text-[10px] text-muted-foreground">
                              <Hl text={stop.driver_name || "\u2014"} q={query} />
                            </span>
                            <LabelBadge s={stop.label_status} />
                            <StatusBadge state={stop.delivery_state} succeeded={stop.delivery_succeeded} />
                            <div className="flex justify-end">
                              {isExp ? (
                                <ChevronUp className="h-3.5 w-3.5 text-primary" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground" />
                              )}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpanded(isExp ? null : stop._id)}
                            className="flex w-full items-start gap-3 px-4 py-3 text-left md:hidden"
                          >
                            <ImgThumb url={img} alt={name} fullName={name} rxId={stop.rx_pharma_id} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="truncate font-semibold text-sm">
                                  <Hl text={name} q={query} />
                                </p>
                                <StatusBadge state={stop.delivery_state} succeeded={stop.delivery_succeeded} />
                              </div>
                              <p className="mt-0.5 truncate text-muted-foreground text-xs">
                                <Hl text={addr} q={query} />
                                {stop.city ? `, ${stop.city}` : ""}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {stop.rx_pharma_id && (
                                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                    <Hl text={stop.rx_pharma_id} q={query} />
                                  </span>
                                )}
                                <RouteBadge route={stop.route_title} />
                                <LabelBadge s={stop.label_status} />
                              </div>
                            </div>
                            {isExp ? (
                              <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/30" />
                            )}
                          </button>
                          <AnimatePresence>
                            {isExp && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.16 }}
                                className="overflow-hidden border-primary/10 border-t bg-primary/[0.015]"
                              >
                                <div className="px-4 py-3">
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
                                    {[
                                      { l: "State", v: stop.state },
                                      { l: "Zipcode", v: stop.zipcode },
                                      { l: "Driver", v: stop.driver_name },
                                      { l: "Event", v: stop.event_type?.replace(/^stop\./, "") },
                                      { l: "ETA", v: stop.eta_arrival },
                                      { l: "Date", v: fmtDate(stop.created_at) },
                                      { l: "Stop #", v: stop.stop_position ? `#${stop.stop_position}` : undefined },
                                      {
                                        l: "Stop ID",
                                        v: stop.rtstop_id ? `#${stop.rtstop_id}` : undefined,
                                        mono: true,
                                      },
                                    ]
                                      .filter((f) => f.v)
                                      .map((f) => (
                                        <div key={f.l}>
                                          <p className="font-bold text-[9px] text-muted-foreground/40 uppercase tracking-widest">
                                            {f.l}
                                          </p>
                                          <p
                                            className={`mt-0.5 truncate font-medium text-xs ${f.mono ? "font-mono text-muted-foreground" : ""}`}
                                          >
                                            {f.v}
                                          </p>
                                        </div>
                                      ))}
                                  </div>
                                  {stop.stop_notes && (
                                    <div className="mt-3 rounded-xl border border-border bg-background/60 px-3 py-2">
                                      <p className="font-bold text-[9px] text-muted-foreground/40 uppercase tracking-widest">
                                        Notes
                                      </p>
                                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed">
                                        {stop.stop_notes}
                                      </p>
                                    </div>
                                  )}
                                  <div className="mt-3 flex flex-wrap gap-2 border-border/50 border-t pt-3">
                                    <a
                                      href={`/dashboard/stops?search=${encodeURIComponent(stop.rx_pharma_id || stop.recipient_name || stop.address || "")}`}
                                      className="flex items-center gap-1.5 rounded-xl border border-primary bg-primary px-3 py-1.5 font-semibold text-primary-foreground text-xs shadow-sm transition-all hover:opacity-90"
                                    >
                                      <ArrowRight className="h-3.5 w-3.5" />
                                      Go to Stop
                                    </a>
                                    {stop.tracking_link && (
                                      <a
                                        href={stop.tracking_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 font-medium text-muted-foreground text-xs transition-all hover:border-primary/30 hover:text-primary"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                        Track
                                      </a>
                                    )}
                                    {stop.web_app_link && (
                                      <a
                                        href={stop.web_app_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 font-medium text-muted-foreground text-xs transition-all hover:border-primary/30 hover:text-primary"
                                      >
                                        <Navigation2 className="h-3 w-3" />
                                        Dispatch
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {visScans.length > 0 && (
              <>
                <div
                  className={`flex items-center gap-2 border-b bg-green-50/50 px-4 py-1.5 ${visStops.length > 0 ? "border-t" : ""}`}
                >
                  <ScanLine className="h-3 w-3 text-green-600" />
                  <span className="font-semibold text-[10px] text-green-700 uppercase tracking-wider">
                    Package Scans
                  </span>
                  <span className="ml-1 rounded-full border border-green-200 bg-white px-1.5 py-0.5 font-bold text-[9px] text-green-600">
                    {visScans.length}
                  </span>
                </div>
                <div className="divide-y overflow-x-auto">
                  <div className="min-w-[900px]">
                    {visScans.map((scan, idx) => {
                      const isExp = expanded === scan._id;
                      const name = toTitle(scan.full_name);
                      const addr = toTitle((scan.full_address || scan.address || "").toLowerCase());
                      return (
                        <div
                          key={scan._id}
                          className={`group transition-colors ${isExp ? "bg-primary/[0.025]" : "hover:bg-muted/20"}`}
                          style={{
                            borderLeft: isExp
                              ? "3px solid hsl(var(--primary))"
                              : idx === 0
                                ? "3px solid hsl(var(--primary)/0.25)"
                                : "3px solid transparent",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setExpanded(isExp ? null : scan._id)}
                            className="hidden w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left md:grid"
                            style={{ gridTemplateColumns: COLS }}
                          >
                            <ImgThumb url={scan.image_url} alt={name} fullName={name} rxId={scan.rx_pharma_id} />
                            <span className="truncate font-medium text-xs">
                              <Hl text={name} q={query} />
                            </span>
                            <span className="truncate font-mono text-[10px] text-muted-foreground">
                              <Hl text={scan.rx_pharma_id || "\u2014"} q={query} />
                            </span>
                            <div className="flex min-w-0 items-center gap-1">
                              <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                              <span className="truncate text-muted-foreground text-xs">
                                <Hl text={addr} q={query} />
                              </span>
                            </div>
                            <span className="truncate text-muted-foreground text-xs">
                              <Hl text={scan.city || scan.client_location || "\u2014"} q={query} />
                            </span>
                            <div className="flex min-w-0 items-center gap-1">
                              <Phone className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                              <span className="truncate font-mono text-[10px] text-muted-foreground">
                                <Hl text={fmtPhone(scan.phone)} q={query} />
                              </span>
                            </div>
                            <RouteBadge route={scan.route} />
                            <span className="text-[10px] text-muted-foreground/50">{"\u2014"}</span>
                            <span className="text-[10px] text-muted-foreground/50">{"\u2014"}</span>
                            <span className="text-[10px] text-muted-foreground/60">{fmtDate(scan.created_at)}</span>
                            <div className="flex justify-end">
                              {isExp ? (
                                <ChevronUp className="h-3.5 w-3.5 text-primary" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground" />
                              )}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpanded(isExp ? null : scan._id)}
                            className="flex w-full items-start gap-3 px-4 py-3 text-left md:hidden"
                          >
                            <ImgThumb url={scan.image_url} alt={name} fullName={name} rxId={scan.rx_pharma_id} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold text-sm">
                                <Hl text={name} q={query} />
                              </p>
                              <p className="mt-0.5 truncate text-muted-foreground text-xs">
                                <Hl text={addr} q={query} />
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {scan.rx_pharma_id && (
                                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                    {scan.rx_pharma_id}
                                  </span>
                                )}
                                <RouteBadge route={scan.route} />
                              </div>
                            </div>
                            {isExp ? (
                              <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/30" />
                            )}
                          </button>
                          <AnimatePresence>
                            {isExp && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.16 }}
                                className="overflow-hidden border-primary/10 border-t bg-primary/[0.015]"
                              >
                                <div className="px-4 py-3">
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                                    {[
                                      { l: "State", v: scan.state },
                                      { l: "Zipcode", v: scan.zipcode },
                                      { l: "Type", v: scan.type },
                                      { l: "Branch", v: scan.client_location },
                                      { l: "New client", v: scan.new_client ? "Yes" : undefined },
                                      { l: "Date", v: fmtDate(scan.created_at) },
                                      {
                                        l: "Scan ID",
                                        v: scan.rtscan_id ? `#${scan.rtscan_id}` : undefined,
                                        mono: true,
                                      },
                                    ]
                                      .filter((f) => f.v)
                                      .map((f) => (
                                        <div key={f.l}>
                                          <p className="font-bold text-[9px] text-muted-foreground/40 uppercase tracking-widest">
                                            {f.l}
                                          </p>
                                          <p
                                            className={`mt-0.5 truncate font-medium text-xs ${f.mono ? "font-mono text-muted-foreground" : ""}`}
                                          >
                                            {f.v}
                                          </p>
                                        </div>
                                      ))}
                                  </div>
                                  <div className="mt-3 flex gap-2 border-border/50 border-t pt-3">
                                    <a
                                      href={`/dashboard/scans?search=${encodeURIComponent(scan.full_name || scan.rx_pharma_id || "")}`}
                                      className="flex items-center gap-1.5 rounded-xl border border-primary bg-primary px-3 py-1.5 font-semibold text-primary-foreground text-xs shadow-sm transition-all hover:opacity-90"
                                    >
                                      <ArrowRight className="h-3.5 w-3.5" />
                                      Go to Scan
                                    </a>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
