"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
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
  ZoomIn,
} from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
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
  eta_earliest?: string;
  eta_latest?: string;
  driver_notes?: string;
  stop_notes?: string;
  tracking_link?: string;
  photo_urls?: string;
  signature_url?: string;
  web_app_link?: string;
  created_at?: string | { $date: string };
}

const RC: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "CENTRAL FL": { bg: "#fff0f8", text: "#c0006a", border: "#f9a8d4", dot: "#c0006a" },
  "SOUTH FL": { bg: "#fffff0", text: "#7a7200", border: "#fde68a", dot: "#7a7200" },
  "DEERFIELD FL": { bg: "#edfcff", text: "#0079a8", border: "#a5f3fc", dot: "#0079a8" },
  "NORTH FL": { bg: "#edfff5", text: "#007a4a", border: "#6ee7b7", dot: "#007a4a" },
};
function getRC(r?: string) {
  if (!r) return null;
  const u = r.toUpperCase();
  for (const [k, v] of Object.entries(RC)) if (u.includes(k)) return v;
  return { bg: "#f4f0ff", text: "#5b21b6", border: "#c4b5fd", dot: "#5b21b6" };
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
function shortPlan(id?: string) {
  if (!id) return "\u2014";
  const p = id.replace("plans/", "");
  return p.length > 10 ? `${p.slice(0, 8)}\u2026` : p;
}
function fuzzy(text: string, q: string) {
  if (!text || !q) return false;
  const t = text.toLowerCase();
  const ql = q.toLowerCase().trim();
  if (t.includes(ql)) return true;
  return ql.split(/\s+/).every((w) => t.includes(w));
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
  if (succeeded)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 font-semibold text-[10px] text-green-700">
        <CheckCircle2 className="h-2.5 w-2.5" />
        Delivered
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

function ImgThumb({ url, alt }: { url?: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  if (!url)
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border border-dashed text-muted-foreground/30">
        <ZoomIn className="h-3 w-3" />
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
        className="group/img relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted transition-all hover:border-primary/40 hover:shadow-sm"
      >
        {/* biome-ignore lint/a11y/useAltText: thumbnail */}
        <img
          src={url}
          alt={alt || "photo"}
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover/img:bg-black/20 group-hover/img:opacity-100">
          <ZoomIn className="h-3 w-3 text-white" />
        </div>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-2">
          {/* biome-ignore lint/a11y/useAltText: fullscreen */}
          <img src={url} alt={alt || "photo"} className="w-full rounded-xl object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}

const HINTS = [
  { label: "Kissimmee", icon: "\u{1F4CD}", cls: "hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700" },
  {
    label: "Coral Springs",
    icon: "\u{1F3D9}\uFE0F",
    cls: "hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700",
  },
  { label: "NORTH FL", icon: "\u{1F33F}", cls: "hover:border-green-300 hover:bg-green-50 hover:text-green-700" },
  { label: "GONZALEZ", icon: "\u{1F464}", cls: "hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700" },
  {
    label: "West Sample Road",
    icon: "\u{1F6E3}\uFE0F",
    cls: "hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700",
  },
];

const STOP_COLS =
  "minmax(160px,1.8fr) minmax(120px,1fr) minmax(160px,1.8fr) minmax(90px,.8fr) minmax(100px,1fr) minmax(100px,1fr) minmax(60px,.5fr) 40px 28px minmax(120px,1fr) 28px";
const SCAN_COLS =
  "minmax(160px,1.8fr) minmax(120px,1fr) minmax(180px,2fr) minmax(90px,.8fr) minmax(100px,1fr) minmax(100px,1fr) 40px minmax(80px,.9fr) 28px";

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
      setScans(
        allScans
          .filter(
            (s) =>
              fuzzy(s.full_name || "", q) ||
              fuzzy(s.rx_pharma_id || "", q) ||
              fuzzy(s.address || "", q) ||
              fuzzy(s.full_address || "", q) ||
              fuzzy(s.city || "", q) ||
              fuzzy(s.route || "", q) ||
              fuzzy(s.phone || "", q) ||
              fuzzy(String(s.rtscan_id || ""), q),
          )
          .slice(0, 150),
      );
      setStops(
        allStops
          .filter(
            (s) =>
              fuzzy(s.recipient_name || "", q) ||
              fuzzy(s.rx_pharma_id || "", q) ||
              fuzzy(s.address || "", q) ||
              fuzzy(s.full_address || "", q) ||
              fuzzy(s.city || "", q) ||
              fuzzy(s.route_title || "", q) ||
              fuzzy(s.recipient_phone || "", q) ||
              fuzzy(String(s.rtstop_id || ""), q) ||
              fuzzy(s.delivery_state || "", q) ||
              fuzzy(s.event_type || "", q),
          )
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

  const visScans = tab === "stops" ? [] : scans;
  const visStops = tab === "scans" ? [] : stops;
  const total = visScans.length + visStops.length;
  const hasQuery = query.trim().length >= 2;

  const TH = ({ children }: { children: React.ReactNode }) => (
    <span className="truncate font-bold text-[9px] text-muted-foreground/50 uppercase tracking-widest">{children}</span>
  );

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col overflow-hidden bg-background">
      {/* Search bar */}
      <div className="border-b bg-background px-5 pt-5 pb-4">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
            ) : (
              <Search className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by address, patient name, Rx#, phone, route..."
            className="h-[52px] w-full rounded-2xl border border-border bg-background py-4 pr-14 pl-12 text-sm shadow-sm outline-none ring-0 transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:shadow-md focus:ring-2 focus:ring-primary/10"
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

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {!hasQuery ? (
            <>
              <span className="mr-0.5 font-medium text-[10px] text-muted-foreground/50">Try:</span>
              {HINTS.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => setQuery(h.label)}
                  className={`flex items-center gap-1 rounded-xl border border-border bg-muted/30 px-2.5 py-1 font-medium text-[11px] text-muted-foreground transition-all ${h.cls}`}
                >
                  <span className="text-xs">{h.icon}</span>
                  {h.label}
                </button>
              ))}
            </>
          ) : !loading && total > 0 ? (
            <>
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
            </>
          ) : null}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto">
        <div className="px-5 py-4">
          {/* Empty state */}
          {!hasQuery && !booting && (
            <div className="flex flex-col items-center gap-5 pt-14 text-muted-foreground">
              <div className="relative">
                <div className="flex h-[72px] w-[72px] items-center justify-center rounded-3xl bg-muted/50 p-5">
                  <Search className="h-8 w-8 opacity-25" />
                </div>
                <div className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-xl bg-primary/10">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground text-sm">Find any delivery instantly</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed opacity-55">
                  Address is the fastest way — also try patient name, Rx#, phone or route
                </p>
              </div>
              <div className="mt-1 grid w-full max-w-xs grid-cols-3 gap-2">
                {[
                  { l: "By address", e: "West Sample Road", i: "\u{1F3E0}" },
                  { l: "By patient", e: "GONZALEZ", i: "\u{1F464}" },
                  { l: "By Rx#", e: "653771-01", i: "\u{1F48A}" },
                ].map((c) => (
                  <button
                    key={c.l}
                    type="button"
                    onClick={() => setQuery(c.e)}
                    className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card px-2 py-3 text-center transition-all hover:border-primary/30 hover:bg-primary/5"
                  >
                    <span className="text-lg">{c.i}</span>
                    <span className="font-bold text-[9px] text-muted-foreground uppercase tracking-wide">{c.l}</span>
                    <span className="font-medium text-[10px] text-foreground">{c.e}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {booting && (
            <div className="space-y-2 pt-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-11 rounded-xl" style={{ opacity: 1 - i * 0.18 }} />
              ))}
            </div>
          )}
          {loading && hasQuery && (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-11 rounded-xl" style={{ opacity: 1 - i * 0.13 }} />
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
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* STOPS TABLE */}
              {visStops.length > 0 && (
                <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                  <div className="flex items-center gap-2 border-b bg-muted/20 px-4 py-2.5">
                    <Navigation2 className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">Delivery Stops</span>
                    <span className="rounded-full border bg-background px-2 py-0.5 font-bold text-[10px] text-muted-foreground">
                      {visStops.length}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <div className="min-w-[900px]">
                      <div
                        className="grid gap-2 border-b bg-muted/10 px-4 py-2"
                        style={{ gridTemplateColumns: STOP_COLS }}
                      >
                        <TH>Name</TH>
                        <TH>Phone</TH>
                        <TH>Address</TH>
                        <TH>City</TH>
                        <TH>Rx / Pkg ID</TH>
                        <TH>Zone</TH>
                        <TH>Stop #</TH>
                        <TH>Img</TH>
                        <TH>{""}</TH>
                        <TH>Status</TH>
                        <TH>{""}</TH>
                      </div>

                      <div className="divide-y">
                        {visStops.map((stop) => {
                          const rc = getRC(stop.route_title);
                          const isExp = expanded === stop._id;
                          const name = toTitle(stop.recipient_name);
                          const addr = toTitle(stop.address);
                          const photo = stop.photo_urls?.split(",")?.[0]?.trim() || "";

                          return (
                            <div
                              key={stop._id}
                              className={`group transition-colors ${isExp ? "bg-primary/[0.025]" : "hover:bg-muted/30"}`}
                              style={{ borderLeft: isExp ? "3px solid hsl(var(--primary))" : "3px solid transparent" }}
                            >
                              <button
                                type="button"
                                onClick={() => setExpanded(isExp ? null : stop._id)}
                                className="grid w-full cursor-pointer items-center gap-2 px-4 py-3 text-left"
                                style={{ gridTemplateColumns: STOP_COLS }}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-xs">
                                    {"\u{1F4CD}"}
                                  </div>
                                  <span className="truncate font-semibold text-xs leading-tight">
                                    <Hl text={name} q={query} />
                                  </span>
                                </div>
                                <div className="flex min-w-0 items-center gap-1">
                                  <Phone className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                                    <Hl text={fmtPhone(stop.recipient_phone)} q={query} />
                                  </span>
                                </div>
                                <div className="flex min-w-0 items-center gap-1">
                                  <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                                  <span className="truncate text-muted-foreground text-xs">
                                    <Hl text={addr} q={query} />
                                  </span>
                                </div>
                                <span className="truncate text-muted-foreground text-xs">
                                  <Hl text={stop.city || "\u2014"} q={query} />
                                </span>
                                <span className="truncate font-mono text-[10px] text-muted-foreground">
                                  <Hl text={stop.rx_pharma_id || "\u2014"} q={query} />
                                </span>
                                <div>
                                  {rc ? (
                                    <span
                                      style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}
                                      className="inline-flex max-w-full items-center gap-0.5 rounded-full px-2 py-0.5 font-bold text-[9px]"
                                    >
                                      <span className="truncate">
                                        <Hl text={stop.route_title || ""} q={query} />
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground/40">{"\u2014"}</span>
                                  )}
                                </div>
                                <div className="flex items-center justify-center">
                                  {stop.stop_position ? (
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted font-bold text-[9px] text-muted-foreground">
                                      {stop.stop_position}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground/30">{"\u2014"}</span>
                                  )}
                                </div>
                                <ImgThumb url={photo} alt={name} />
                                <div className="flex items-center justify-center">
                                  {isExp ? (
                                    <ChevronUp className="h-3.5 w-3.5 text-primary" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground" />
                                  )}
                                </div>
                                <div>
                                  <StatusBadge state={stop.delivery_state} succeeded={stop.delivery_succeeded} />
                                </div>
                                <div />
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
                                      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-4 lg:grid-cols-6">
                                        {[
                                          { l: "State", v: stop.state },
                                          { l: "Zipcode", v: stop.zipcode },
                                          { l: "Event type", v: stop.event_type?.replace(/^stop\./, "") },
                                          { l: "Label status", v: stop.label_status },
                                          { l: "ETA", v: stop.eta_arrival },
                                          { l: "Date", v: fmtDate(stop.created_at) },
                                          { l: "Plan ID", v: shortPlan(stop.plan_id), mono: true },
                                          {
                                            l: "RT Stop ID",
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
                                            Stop notes
                                          </p>
                                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed">
                                            {stop.stop_notes}
                                          </p>
                                        </div>
                                      )}
                                      {stop.signature_url && (
                                        <div className="mt-3 flex items-center gap-2">
                                          <span className="font-bold text-[9px] text-muted-foreground/40 uppercase tracking-widest">
                                            Signature
                                          </span>
                                          <ImgThumb url={stop.signature_url} alt="Signature" />
                                        </div>
                                      )}
                                      <div className="mt-3 flex flex-wrap gap-2 border-border/50 border-t pt-3">
                                        <a
                                          href={`/dashboard/stops?search=${encodeURIComponent(stop.rx_pharma_id || stop.recipient_name || stop.address || "")}`}
                                          className="flex items-center gap-1.5 rounded-xl border border-primary bg-primary px-3 py-1.5 font-semibold text-primary-foreground text-xs shadow-sm transition-all hover:opacity-90"
                                        >
                                          <ArrowRight className="h-3.5 w-3.5" /> Go to Stop detail
                                        </a>
                                        {stop.tracking_link && (
                                          <a
                                            href={stop.tracking_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 font-medium text-muted-foreground text-xs transition-all hover:border-primary/30 hover:text-primary"
                                          >
                                            <ExternalLink className="h-3 w-3" /> Track delivery
                                          </a>
                                        )}
                                        {stop.web_app_link && (
                                          <a
                                            href={stop.web_app_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 font-medium text-muted-foreground text-xs transition-all hover:border-primary/30 hover:text-primary"
                                          >
                                            <Navigation2 className="h-3 w-3" /> Dispatch view
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
                  </div>
                </div>
              )}

              {/* SCANS TABLE */}
              {visScans.length > 0 && (
                <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                  <div className="flex items-center gap-2 border-b bg-muted/20 px-4 py-2.5">
                    <ScanLine className="h-4 w-4 text-green-600" />
                    <span className="font-semibold text-sm">Package Scans</span>
                    <span className="rounded-full border bg-background px-2 py-0.5 font-bold text-[10px] text-muted-foreground">
                      {visScans.length}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="min-w-[800px]">
                      <div
                        className="grid gap-2 border-b bg-muted/10 px-4 py-2"
                        style={{ gridTemplateColumns: SCAN_COLS }}
                      >
                        <TH>Name</TH>
                        <TH>Phone</TH>
                        <TH>Address</TH>
                        <TH>City</TH>
                        <TH>Rx #</TH>
                        <TH>Zone</TH>
                        <TH>Img</TH>
                        <TH>Date</TH>
                        <TH>{""}</TH>
                      </div>
                      <div className="divide-y">
                        {visScans.map((scan) => {
                          const rc = getRC(scan.route);
                          const isExp = expanded === scan._id;
                          const name = toTitle(scan.full_name);
                          const addr = toTitle((scan.full_address || scan.address || "").toLowerCase());
                          return (
                            <div
                              key={scan._id}
                              className={`group transition-colors ${isExp ? "bg-primary/[0.025]" : "hover:bg-muted/30"}`}
                              style={{ borderLeft: isExp ? "3px solid hsl(var(--primary))" : "3px solid transparent" }}
                            >
                              <button
                                type="button"
                                onClick={() => setExpanded(isExp ? null : scan._id)}
                                className="grid w-full cursor-pointer items-center gap-2 px-4 py-3 text-left"
                                style={{ gridTemplateColumns: SCAN_COLS }}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-green-50 text-xs">
                                    {"\u{1F4E6}"}
                                  </div>
                                  <span className="truncate font-semibold text-xs">
                                    <Hl text={name} q={query} />
                                  </span>
                                </div>
                                <div className="flex min-w-0 items-center gap-1">
                                  <Phone className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                                    <Hl text={fmtPhone(scan.phone)} q={query} />
                                  </span>
                                </div>
                                <div className="flex min-w-0 items-center gap-1">
                                  <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                                  <span className="truncate text-muted-foreground text-xs">
                                    <Hl text={addr} q={query} />
                                  </span>
                                </div>
                                <span className="truncate text-muted-foreground text-xs">
                                  <Hl text={scan.city || scan.client_location || "\u2014"} q={query} />
                                </span>
                                <span className="truncate font-mono text-[10px] text-muted-foreground">
                                  <Hl text={scan.rx_pharma_id || "\u2014"} q={query} />
                                </span>
                                <div>
                                  {rc ? (
                                    <span
                                      style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}
                                      className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-bold text-[9px]"
                                    >
                                      {scan.route}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground/40">{"\u2014"}</span>
                                  )}
                                </div>
                                <ImgThumb url={scan.image_url} alt={name} />
                                <span className="text-[10px] text-muted-foreground/60">{fmtDate(scan.created_at)}</span>
                                <div className="flex justify-end">
                                  {isExp ? (
                                    <ChevronUp className="h-3.5 w-3.5 text-primary" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground" />
                                  )}
                                </div>
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
                                      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-4">
                                        {[
                                          { l: "State", v: scan.state },
                                          { l: "Zipcode", v: scan.zipcode },
                                          { l: "Type", v: scan.type },
                                          { l: "Branch", v: scan.client_location },
                                          { l: "New client", v: scan.new_client ? "Yes" : undefined },
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
                                          <ArrowRight className="h-3.5 w-3.5" /> Go to Scan detail
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
