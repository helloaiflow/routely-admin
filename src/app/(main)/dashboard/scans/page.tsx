"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSearchParams } from "next/navigation";

import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  DollarSign,
  Download,
  MapPin,
  Package,
  PenLine,
  RefreshCw,
  Search,
  Snowflake,
  Star,
  Truck,
  Users,
  X,
  ZoomIn,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface Scan {
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
  new_client?: boolean;
  collect_payment?: boolean;
  collect_amount?: number;
  type?: string;
  signature_required?: boolean;
  delivery_today?: boolean;
  created_at?: string;
  phone?: string;
  dob?: string;
  rx_creation_date?: string;
  note?: string;
  image_url?: string;
  package_vip?: boolean;
  gate_code?: string;
  preset_drop_off?: string;
}

// ── Route color palette ──────────────────────────────────────────────────────
const ROUTE_MAP: Record<string, { bg: string; text: string; border: string; glow: string; emoji: string }> = {
  "CENTRAL FL": { bg: "#fff0f8", text: "#c0006a", border: "#f9a8d4", glow: "rgba(254,33,139,0.20)", emoji: "🌆" },
  "SOUTH FL": { bg: "#fffff0", text: "#7a7200", border: "#fde68a", glow: "rgba(253,255,43,0.25)", emoji: "🌴" },
  "DEERFIELD FL": { bg: "#edfcff", text: "#0079a8", border: "#a5f3fc", glow: "rgba(10,239,255,0.20)", emoji: "🦌" },
  "NORTH FL": { bg: "#edfff5", text: "#007a4a", border: "#6ee7b7", glow: "rgba(10,255,104,0.20)", emoji: "🌿" },
};
const FALLBACK_R = [
  { bg: "#f4f0ff", text: "#5b21b6", border: "#c4b5fd", glow: "rgba(139,92,246,0.15)", emoji: "🔮" },
  { bg: "#fff4ed", text: "#c2410c", border: "#fdba74", glow: "rgba(249,115,22,0.15)", emoji: "🔥" },
  { bg: "#edfcfa", text: "#0f766e", border: "#99f6e4", glow: "rgba(20,184,166,0.15)", emoji: "💎" },
  { bg: "#fdf4ff", text: "#7e22ce", border: "#e9d5ff", glow: "rgba(168,85,247,0.15)", emoji: "⚡" },
];
const _rc: Record<string, (typeof FALLBACK_R)[0]> = {};
let _ri = 0;
function getRouteColor(route: string) {
  if (!route) return { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0", glow: "transparent", emoji: "📍" };
  const up = route.toUpperCase();
  for (const [k, v] of Object.entries(ROUTE_MAP)) if (up.includes(k) || k.includes(up)) return v;
  if (!_rc[route]) {
    _rc[route] = FALLBACK_R[_ri % FALLBACK_R.length];
    _ri++;
  }
  return _rc[route];
}

function RouteBadge({ route, size = "sm" }: { route: string; size?: "xs" | "sm" }) {
  const c = getRouteColor(route);
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, boxShadow: `0 0 8px ${c.glow}` }}
      className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full font-bold ${pad}`}
    >
      <span>{c.emoji}</span>
      {route}
    </span>
  );
}

// ── Flag system ──────────────────────────────────────────────────────────────
const FLAGS = [
  {
    key: "new_client",
    emoji: "🆕",
    icon: Star,
    bg: "bg-violet-500",
    ring: "ring-violet-300",
    pill: "border border-violet-200 bg-violet-50 text-violet-700",
    full: "New Client",
  },
  {
    key: "collect_payment",
    emoji: "💰",
    icon: DollarSign,
    bg: "bg-amber-500",
    ring: "ring-amber-300",
    pill: "border border-amber-200 bg-amber-50 text-amber-700",
    full: "Collect Payment",
  },
  {
    key: "cold",
    emoji: "❄️",
    icon: Snowflake,
    bg: "bg-cyan-500",
    ring: "ring-cyan-300",
    pill: "border border-cyan-200 bg-cyan-50 text-cyan-700",
    full: "Cold Package",
  },
  {
    key: "signature_required",
    emoji: "✍️",
    icon: PenLine,
    bg: "bg-rose-500",
    ring: "ring-rose-300",
    pill: "border border-rose-200 bg-rose-50 text-rose-700",
    full: "Signature Required",
  },
  {
    key: "delivery_today",
    emoji: "🚀",
    icon: Truck,
    bg: "bg-green-500",
    ring: "ring-green-300",
    pill: "border border-green-200 bg-green-50 text-green-700",
    full: "Deliver Today",
  },
  {
    key: "package_vip",
    emoji: "👑",
    icon: Star,
    bg: "bg-yellow-500",
    ring: "ring-yellow-300",
    pill: "border border-yellow-200 bg-yellow-50 text-yellow-700",
    full: "VIP Package",
  },
];

function getScanFlags(scan: Scan) {
  return FLAGS.filter((f) =>
    f.key === "cold" ? scan.type?.includes("cold") : (scan as unknown as Record<string, unknown>)[f.key],
  );
}

function pkgEmoji(type?: string): string {
  if (!type) return "📦";
  const t = type.toLowerCase();
  if (t.includes("cold")) return "🧊";
  if (t.includes("liquid") || t.includes("drop")) return "💧";
  if (t.includes("vial") || t.includes("inject")) return "💉";
  return "📦";
}

function fmt(d?: string, mode: "time" | "date" = "time") {
  if (!d) return "";
  const dt = new Date(d);
  if (mode === "date") return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// ── Leaflet Map ──────────────────────────────────────────────────────────────
function LeafletMap({ scan }: { scan: Scan | null }) {
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const contRef = useRef<HTMLDivElement>(null);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || mapRef.current || !contRef.current) return;
    (async () => {
      const L = await import("leaflet");
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      if (!contRef.current) return;
      mapRef.current = L.map(contRef.current, { zoomControl: true, attributionControl: false }).setView(
        [26.1, -80.2],
        10,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapRef.current);
      // Force tile redraw after flex layout settles
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 400);
    })();
  }, []);

  useEffect(() => {
    if (!scan || typeof window === "undefined") return;
    (async () => {
      const L = await import("leaflet");
      if (!mapRef.current) return;
      const address = scan.full_address || [scan.address, scan.city, scan.state].filter(Boolean).join(", ");
      if (!address) return;
      setGeocoding(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
          { headers: { "Accept-Language": "en" } },
        );
        const results = await res.json();
        if (!results.length) return;
        const { lat, lon } = results[0];
        const ll: [number, number] = [Number.parseFloat(lat), Number.parseFloat(lon)];
        if (markerRef.current) markerRef.current.remove();
        const rc = getRouteColor(scan.route || "");
        const icon = L.divIcon({
          html: `<div style="position:relative;width:28px;height:36px"><div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg) translateX(-30%);background:${rc.text};border:3px solid white;box-shadow:0 4px 16px ${rc.glow}"></div><div style="position:absolute;top:5px;left:50%;transform:translateX(-50%);font-size:12px;z-index:10">${pkgEmoji(scan.type)}</div></div>`,
          className: "",
          iconSize: [28, 36],
          iconAnchor: [14, 36],
        });
        markerRef.current = L.marker(ll, { icon })
          .addTo(mapRef.current)
          .bindPopup(
            `<div style="font-size:13px;font-weight:700;color:#0f172a">${pkgEmoji(scan.type)} ${scan.full_name || ""}</div><div style="font-size:11px;color:#64748b;margin-top:3px">${address}</div>${scan.route ? `<div style="margin-top:5px;display:inline-flex;background:${rc.bg};color:${rc.text};border:1px solid ${rc.border};border-radius:99px;padding:2px 8px;font-size:10px;font-weight:700">${rc.emoji} ${scan.route}</div>` : ""}`,
            { maxWidth: 260 },
          )
          .openPopup();
        mapRef.current.flyTo(ll, 16, { duration: 1.4, easeLinearity: 0.25 });
      } finally {
        setGeocoding(false);
      }
    })();
  }, [scan]);

  if (!scan)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <motion.div
          className="relative"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
        >
          <MapPin className="h-16 w-16 opacity-10" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-4 w-4 animate-ping rounded-full bg-primary/20" />
          </div>
        </motion.div>
        <div className="text-center">
          <p className="font-semibold text-sm">Select a scan</p>
          <p className="mt-1 text-xs opacity-50">Package will be pinned on the map</p>
        </div>
        <p className="text-[10px] opacity-30">OpenStreetMap · Nominatim</p>
      </div>
    );

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <AnimatePresence>
        {geocoding && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-3 left-1/2 z-[1001] flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-4 py-2 font-semibold text-xs shadow-lg backdrop-blur-md"
          >
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            Locating on map...
          </motion.div>
        )}
      </AnimatePresence>
      <div ref={contRef} style={{ height: "100%", width: "100%", minHeight: "300px" }} />
      <div className="pointer-events-none absolute right-4 bottom-4 left-4 z-[1000]">
        <div className="rounded-2xl border bg-background/95 p-3.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
              style={{ background: getRouteColor(scan.route || "").bg }}
            >
              {pkgEmoji(scan.type)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-sm">{scan.full_name}</p>
              <p className="truncate text-muted-foreground text-xs">{scan.full_address || scan.address}</p>
              {scan.route && (
                <div className="mt-1">
                  <RouteBadge route={scan.route} size="xs" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Scan Card ──────────────────────────────────────────────────────────────────
function ScanCard({ scan, selected, onClick }: { scan: Scan; selected: boolean; onClick: () => void }) {
  const flags = getScanFlags(scan);
  const rc = getRouteColor(scan.route || "");
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}
      whileTap={{ scale: 0.98 }}
      className={`relative w-full rounded-xl border text-left transition-colors duration-150 ${selected ? "border-primary/40 bg-primary/5 shadow-md" : "border-border bg-card hover:border-primary/20"}`}
    >
      {selected && (
        <motion.div
          layoutId="scanAccent"
          className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-primary"
        />
      )}
      <div
        className="h-0.5 w-full rounded-t-xl"
        style={{ background: `linear-gradient(90deg, ${rc.text}40, ${rc.text}10)` }}
      />
      <div className="px-3.5 py-3">
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-base leading-none">{pkgEmoji(scan.type)}</span>
              <p className="truncate font-semibold text-sm">{scan.full_name || "—"}</p>
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{scan.rx_pharma_id || "No Rx"}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-medium text-[10px] text-muted-foreground">{fmt(scan.created_at, "date")}</p>
            <p className="text-[9px] text-muted-foreground/50">{fmt(scan.created_at, "time")}</p>
          </div>
        </div>
        <p className="mb-2 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <MapPin className="h-2.5 w-2.5 shrink-0 opacity-60" />
          {scan.full_address || scan.address || "—"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {flags.length > 0 && (
            <div className="flex gap-1">
              {flags.map((f) => (
                <motion.div
                  key={f.key}
                  title={`${f.emoji} ${f.full}`}
                  whileHover={{ scale: 1.2 }}
                  className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-white shadow-sm ring-1 ${f.bg} ${f.ring}`}
                >
                  <f.icon className="h-2.5 w-2.5" />
                </motion.div>
              ))}
            </div>
          )}
          {scan.route && <RouteBadge route={scan.route} size="xs" />}
          {scan.client_location && scan.client_location !== "OTHER" && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-medium text-[9px] text-slate-500">
              {scan.client_location}
            </span>
          )}
          {scan.collect_payment && scan.collect_amount ? (
            <span className="ml-auto font-bold font-mono text-[10px] text-amber-600">
              💰 ${scan.collect_amount.toFixed(2)}
            </span>
          ) : null}
        </div>
      </div>
    </motion.button>
  );
}

// ── Image Card ────────────────────────────────────────────────────────────────
function ImageCard({ imageUrl, fullName, rxId }: { imageUrl: string; fullName?: string; rxId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className="group relative w-full overflow-hidden rounded-xl border bg-muted/20 transition-all hover:border-primary/40 hover:shadow-md"
      >
        <div className="relative">
          {/* biome-ignore lint/performance/noImgElement: label preview */}
          <img
            src={imageUrl}
            alt="Label"
            className="h-28 w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          <div className="absolute right-2 bottom-2 left-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-white/20 backdrop-blur">
                <Camera className="h-3 w-3 text-white" />
              </div>
              <span className="font-semibold text-[10px] text-white/90">Label Image</span>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 backdrop-blur">
              <ZoomIn className="h-2.5 w-2.5 text-white" />
              <span className="font-medium text-[9px] text-white">Expand</span>
            </div>
          </div>
        </div>
      </motion.button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="overflow-hidden rounded-2xl bg-black/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-white/10 border-b px-4 py-3">
              <div>
                <p className="font-semibold text-sm text-white">{fullName}</p>
                <p className="font-mono text-[11px] text-white/50">{rxId}</p>
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
              {/* biome-ignore lint/performance/noImgElement: fullscreen label */}
              <img src={imageUrl} alt="Label" className="w-full rounded-xl" />
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ scan, onClose }: { scan: Scan; onClose: () => void }) {
  const flags = getScanFlags(scan);
  const rc = getRouteColor(scan.route || "");

  return (
    <motion.div
      key={scan._id}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="flex h-full flex-col overflow-hidden"
    >
      <div
        className="flex items-start justify-between gap-2 border-b px-5 py-4"
        style={{ background: `linear-gradient(135deg, ${rc.bg}, transparent)` }}
      >
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-2xl">{pkgEmoji(scan.type)}</span>
            <p className="font-bold text-base leading-tight">{scan.full_name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-muted/80 px-2 py-0.5 font-mono text-muted-foreground text-xs">
              #{scan.rtscan_id}
            </span>
            {scan.route && <RouteBadge route={scan.route} />}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence>
          {flags.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap gap-1.5 px-5 pt-4 pb-1"
            >
              {flags.map((f, i) => (
                <motion.span
                  key={f.key}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold text-[11px] ${f.pill}`}
                >
                  <span>{f.emoji}</span>
                  {f.full}
                  {f.key === "collect_payment" && scan.collect_amount ? ` · $${scan.collect_amount.toFixed(2)}` : ""}
                </motion.span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-4 px-5 py-4">
          {scan.image_url && <ImageCard imageUrl={scan.image_url} fullName={scan.full_name} rxId={scan.rx_pharma_id} />}
          <Sec title="Patient">
            <Row label="Name" value={scan.full_name} />
            <Row label="DOB" value={scan.dob} />
            <Row label="Phone" value={scan.phone} mono />
          </Sec>
          <Sec title="Delivery Address">
            <div className="space-y-1 px-3 py-2.5 text-xs">
              <p className="font-medium">{scan.full_address || scan.address}</p>
              {scan.city && (
                <p className="text-muted-foreground">
                  {scan.city}, {scan.state} {scan.zipcode}
                </p>
              )}
              {scan.gate_code && scan.gate_code !== "No" && (
                <p className="font-semibold text-amber-600">🔑 Gate: {scan.gate_code}</p>
              )}
              {scan.preset_drop_off && scan.preset_drop_off !== "No" && (
                <p className="font-medium text-blue-600">📦 Drop-off: {scan.preset_drop_off}</p>
              )}
            </div>
          </Sec>
          <Sec title="Prescription">
            <Row label="Rx #" value={scan.rx_pharma_id} mono />
            <Row label="Rx Date" value={scan.rx_creation_date} mono />
            <Row label="Branch" value={scan.client_location} />
            <Row label="Route" value={scan.route} />
            <Row label="Type" value={scan.type} />
          </Sec>
          <Sec title="Scanned">
            <Row label="Date" value={scan.created_at ? new Date(scan.created_at).toLocaleString() : undefined} />
          </Sec>
          {scan.note && (
            <Sec title="Notes">
              <div className="px-3 py-2.5">
                <p className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed">{scan.note}</p>
              </div>
            </Sec>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t bg-muted/10 px-5 py-3">
        <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" asChild>
          <a href={`/dashboard/stops?search=${encodeURIComponent(scan.full_name || "")}`}>
            <Truck className="mr-1.5 h-3 w-3" />
            View Stop
          </a>
        </Button>
        {scan.image_url && (
          <Button size="sm" variant="outline" className="h-8 text-xs">
            <Camera className="mr-1.5 h-3 w-3" />
            Label
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1.5 font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">{title}</p>
      <div className="divide-y overflow-hidden rounded-xl border bg-muted/20">{children}</div>
    </section>
  );
}
function Row({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className={`max-w-[190px] truncate text-right font-medium text-[11px] ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ScansPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<Scan[]>([]);
  const [tenants, setTenants] = useState<{ tenant_id: number; company_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Scan | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [routeFilter, setRouteFilter] = useState("all");
  const [flagFilter, setFlagFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("1");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [scanResult, tenantResult] = await Promise.allSettled([
        fetch(`/api/data/package-scans?limit=200&tenant_id=${tenantFilter}`),
        fetch("/api/tenants"),
      ]);

      if (scanResult.status === "fulfilled" && scanResult.value.ok) {
        const d = await scanResult.value.json();
        setData(d.list || d || []);
      }

      if (tenantResult.status === "fulfilled" && tenantResult.value.ok) {
        const t = await tenantResult.value.json();
        setTenants(
          (t.list || []).map((x: Record<string, unknown>) => ({
            tenant_id: x.tenant_id as number,
            company_name: (x.company_name as string) || (x.contact_name as string) || `Tenant ${x.tenant_id}`,
          })),
        );
      }
    } catch (err) {
      console.error("fetchData error:", err);
    } finally {
      setLoading(false);
    }
  }, [tenantFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const routes = useMemo(() => [...new Set(data.map((s) => s.route).filter(Boolean))].sort() as string[], [data]);
  const filtered = useMemo(() => {
    let r = data;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(
        (s) =>
          s.full_name?.toLowerCase().includes(q) ||
          s.rx_pharma_id?.toLowerCase().includes(q) ||
          s.address?.toLowerCase().includes(q) ||
          String(s.rtscan_id || "").includes(q),
      );
    }
    if (routeFilter !== "all") r = r.filter((s) => s.route === routeFilter);
    if (flagFilter === "new") r = r.filter((s) => s.new_client);
    if (flagFilter === "collect") r = r.filter((s) => s.collect_payment);
    if (flagFilter === "cold") r = r.filter((s) => s.type?.includes("cold"));
    if (flagFilter === "sig") r = r.filter((s) => s.signature_required);
    if (flagFilter === "today") r = r.filter((s) => s.delivery_today);
    return r;
  }, [data, search, routeFilter, flagFilter]);

  const exportCsv = () => {
    const h = ["ID", "Patient", "Rx", "Address", "Route", "Branch", "New", "Collect", "Cold", "Sig", "Date"];
    const rows = filtered.map((s) => [
      s.rtscan_id,
      s.full_name,
      s.rx_pharma_id,
      s.full_address,
      s.route,
      s.client_location,
      s.new_client,
      s.collect_amount,
      s.type,
      s.signature_required,
      s.created_at,
    ]);
    const csv = [h, ...rows].map((r) => r.map((c) => `"${c ?? ""}"`).join(",")).join("\n");
    Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: "scans.csv",
    }).click();
  };

  if (loading)
    return (
      <div className="flex h-[calc(100vh-8rem)] gap-3">
        <div className="w-[360px] shrink-0 space-y-2 p-3">
          {["a", "b", "c", "d", "e", "f", "g", "h"].map((k, i) => (
            <Skeleton key={k} className="rounded-xl" style={{ height: 88, opacity: 1 - i * 0.11 }} />
          ))}
        </div>
        <Skeleton className="flex-1 rounded-xl" />
      </div>
    );

  const summaryPills = [
    {
      key: "new",
      emoji: "🆕",
      label: `${data.filter((s) => s.new_client).length}`,
      color: "bg-violet-100 text-violet-700 ring-violet-200",
    },
    {
      key: "collect",
      emoji: "💰",
      label: `$${data
        .filter((s) => s.collect_payment)
        .reduce((a, s) => a + (s.collect_amount || 0), 0)
        .toFixed(0)}`,
      color: "bg-amber-100 text-amber-700 ring-amber-200",
    },
    {
      key: "cold",
      emoji: "❄️",
      label: `${data.filter((s) => s.type?.includes("cold")).length}`,
      color: "bg-cyan-100 text-cyan-700 ring-cyan-200",
    },
    {
      key: "sig",
      emoji: "✍️",
      label: `${data.filter((s) => s.signature_required).length}`,
      color: "bg-rose-100 text-rose-700 ring-rose-200",
    },
  ];

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-0 overflow-hidden rounded-xl border bg-background shadow-sm">
      {/* LEFT: Scan List */}
      <div
        className={`flex shrink-0 flex-col border-r transition-all duration-300 ${selected ? "w-[290px]" : "w-[375px]"}`}
      >
        <div className="space-y-2 border-b bg-muted/10 px-3.5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-bold text-sm">📦 Package Scans</h1>
              <p className="text-[10px] text-muted-foreground">
                {filtered.length} of {data.length}
              </p>
            </div>
            <div className="flex gap-1">
              <motion.button
                whileTap={{ rotate: 180 }}
                type="button"
                onClick={fetchData}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" />
              </motion.button>
              <button
                type="button"
                onClick={exportCsv}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Download className="h-3 w-3" />
              </button>
            </div>
          </div>
          {tenants.length >= 1 && (
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger className="h-7 gap-1 text-xs">
                <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.tenant_id} value={String(t.tenant_id)}>
                    {t.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Patient, Rx #, address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pr-7 pl-8 text-xs"
            />
            <AnimatePresence>
              {search && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          <div className="flex gap-1.5">
            <Select value={routeFilter} onValueChange={setRouteFilter}>
              <SelectTrigger className="h-7 flex-1 text-xs">
                <SelectValue placeholder="Route" />
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
            <Select value={flagFilter} onValueChange={setFlagFilter}>
              <SelectTrigger className="h-7 flex-1 text-xs">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new">🆕 New Client</SelectItem>
                <SelectItem value="collect">💰 Collect $</SelectItem>
                <SelectItem value="cold">❄️ Cold</SelectItem>
                <SelectItem value="sig">✍️ Signature</SelectItem>
                <SelectItem value="today">🚀 Today</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto border-b bg-muted/5 px-3 py-2">
          {summaryPills.map((p) => (
            <motion.button
              key={p.key}
              type="button"
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFlagFilter(flagFilter === p.key ? "all" : p.key)}
              className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 font-bold text-[10px] ring-1 transition-all ${p.color} ${flagFilter === p.key ? "scale-105 shadow-sm ring-2" : "opacity-70 hover:opacity-100"}`}
            >
              {p.emoji} {p.label}
            </motion.button>
          ))}
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-16 text-muted-foreground">
              <Package className="h-12 w-12 opacity-10" />
              <p className="text-sm">No scans found</p>
            </div>
          ) : (
            filtered.map((scan) => (
              <ScanCard
                key={scan._id}
                scan={scan}
                selected={selected?._id === scan._id}
                onClick={() => setSelected((prev) => (prev?._id === scan._id ? null : scan))}
              />
            ))
          )}
        </div>
      </div>

      {/* CENTER: Map */}
      <div
        className={`flex-col transition-all duration-300 ${selected ? "hidden lg:flex lg:w-[380px] lg:shrink-0 lg:border-r" : "flex flex-1"}`}
      >
        <div className="flex items-center gap-2 border-b bg-muted/10 px-4 py-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
            <MapPin className="h-3 w-3 text-primary" />
          </div>
          <span className="flex-1 truncate font-medium text-xs">
            {selected ? `${selected.full_name} · ${selected.full_address || selected.address}` : "Interactive Map"}
          </span>
          {selected?.route && <RouteBadge route={selected.route} size="xs" />}
        </div>
        <div className="flex-1 p-2.5">
          <LeafletMap scan={selected} />
        </div>
      </div>

      {/* RIGHT: Detail Panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key="detail"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="shrink-0 overflow-hidden border-l"
          >
            <DetailPanel scan={selected} onClose={() => setSelected(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
