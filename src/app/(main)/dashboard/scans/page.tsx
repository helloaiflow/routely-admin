"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSearchParams } from "next/navigation";

import {
  Clock,
  DollarSign,
  Download,
  MapPin,
  Package,
  PenLine,
  RefreshCw,
  Search,
  Snowflake,
  Star,
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

const ROUTE_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
  "bg-rose-100 text-rose-700",
  "bg-lime-100 text-lime-700",
];
const routeColorCache: Record<string, string> = {};
let routeColorIdx = 0;
function routeColor(route: string): string {
  if (!route) return "bg-slate-100 text-slate-600";
  if (!routeColorCache[route]) {
    routeColorCache[route] = ROUTE_COLORS[routeColorIdx % ROUTE_COLORS.length];
    routeColorIdx++;
  }
  return routeColorCache[route];
}

const FLAGS = [
  {
    key: "new_client",
    label: "New",
    icon: Star,
    bg: "bg-violet-500",
    pill: "border border-violet-200 bg-violet-100 text-violet-700",
    full: "New Client",
  },
  {
    key: "collect_payment",
    label: "$",
    icon: DollarSign,
    bg: "bg-amber-500",
    pill: "border border-amber-200 bg-amber-100 text-amber-700",
    full: "Collect Payment",
  },
  {
    key: "cold",
    label: "❄",
    icon: Snowflake,
    bg: "bg-cyan-500",
    pill: "border border-cyan-200 bg-cyan-100 text-cyan-700",
    full: "Cold Package",
  },
  {
    key: "signature_required",
    label: "✍",
    icon: PenLine,
    bg: "bg-rose-500",
    pill: "border border-rose-200 bg-rose-100 text-rose-700",
    full: "Signature Required",
  },
  {
    key: "delivery_today",
    label: "🚀",
    icon: Clock,
    bg: "bg-green-500",
    pill: "border border-green-200 bg-green-100 text-green-700",
    full: "Deliver Today",
  },
  {
    key: "package_vip",
    label: "VIP",
    icon: Star,
    bg: "bg-yellow-500",
    pill: "border border-yellow-200 bg-yellow-100 text-yellow-700",
    full: "VIP Package",
  },
];

function getScanFlags(scan: Scan) {
  return FLAGS.filter((f) =>
    f.key === "cold" ? scan.type?.includes("cold") : (scan as unknown as Record<string, unknown>)[f.key],
  );
}

function formatTime(d?: string) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function formatDate(d?: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Leaflet Map ──────────────────────────────────────────────────────────────
function LeafletMap({ scan }: { scan: Scan | null }) {
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || mapRef.current || !containerRef.current) return;
    (async () => {
      const L = await import("leaflet");
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      if (!containerRef.current) return;
      mapRef.current = L.map(containerRef.current, { zoomControl: true, attributionControl: false }).setView(
        [26.1, -80.2],
        10,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapRef.current);
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
        const latLng: [number, number] = [Number.parseFloat(lat), Number.parseFloat(lon)];
        if (markerRef.current) markerRef.current.remove();
        const icon = L.divIcon({
          html: `<div style="position:relative"><div style="width:20px;height:20px;border-radius:50%;background:#2563EB;border:3px solid white;box-shadow:0 2px 12px rgba(37,99,235,0.5);animation:mp 0.4s cubic-bezier(0.34,1.56,0.64,1)"></div><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,30%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #2563EB"></div></div><style>@keyframes mp{from{transform:scale(0) translateY(10px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}</style>`,
          className: "",
          iconSize: [20, 28],
          iconAnchor: [10, 28],
        });
        markerRef.current = L.marker(latLng, { icon })
          .addTo(mapRef.current)
          .bindPopup(
            `<div style="font-size:12px;font-weight:700;color:#0f172a">${scan.full_name || ""}</div><div style="font-size:11px;color:#64748b;margin-top:2px">${address}</div>${scan.route ? `<div style="font-size:11px;color:#2563eb;margin-top:4px;font-weight:600">${scan.route}</div>` : ""}`,
            { maxWidth: 240 },
          )
          .openPopup();
        mapRef.current.flyTo(latLng, 16, { duration: 1.4, easeLinearity: 0.25 });
      } finally {
        setGeocoding(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan?._id, scan.full_address, scan.state, scan.city, scan.address, scan.full_name, scan.route, scan]);

  if (!scan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <div className="relative">
          <MapPin className="h-16 w-16 opacity-10" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-3 w-3 animate-ping rounded-full bg-primary/30" />
          </div>
        </div>
        <div className="text-center">
          <p className="font-medium text-sm">No scan selected</p>
          <p className="mt-1 text-xs opacity-60">Click a scan to pin it on the map</p>
        </div>
        <p className="text-[10px] opacity-40">Powered by OpenStreetMap</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      {geocoding && (
        <div className="absolute top-3 left-1/2 z-[1001] flex -translate-x-1/2 items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 font-medium text-xs shadow backdrop-blur">
          <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Locating address...
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute right-4 bottom-4 left-4 z-[1000]">
        <div className="rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur-md">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-sm">{scan.full_name}</p>
              <p className="truncate text-muted-foreground text-xs">{scan.full_address || scan.address}</p>
              {scan.route && (
                <span
                  className={`mt-1 inline-flex rounded-full px-2 py-0.5 font-semibold text-[10px] ${routeColor(scan.route)}`}
                >
                  {scan.route}
                </span>
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full cursor-pointer rounded-xl border text-left transition-all duration-200 ${selected ? "scale-[0.99] border-primary/50 bg-primary/5 shadow-md" : "border-border bg-card hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent/30 hover:shadow-sm"}`}
    >
      {selected && <div className="absolute top-0 left-0 h-full w-1 rounded-l-xl bg-primary" />}
      <div className="px-4 py-3">
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-sm">{scan.full_name || "—"}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{scan.rx_pharma_id || "No Rx"}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-medium text-[10px] text-muted-foreground">{formatDate(scan.created_at)}</p>
            <p className="text-[10px] text-muted-foreground/60">{formatTime(scan.created_at)}</p>
          </div>
        </div>
        <p className="mb-2.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          {scan.full_address || scan.address || "—"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {flags.length > 0 && (
            <div className="flex gap-1">
              {flags.map((f) => (
                <div
                  key={f.key}
                  title={f.full}
                  className={`flex h-5 w-5 items-center justify-center rounded-full font-bold text-[9px] text-white shadow-sm ${f.bg}`}
                >
                  <f.icon className="h-2.5 w-2.5" />
                </div>
              ))}
            </div>
          )}
          {scan.route && (
            <span
              className={`inline-flex rounded-full px-2 py-0.5 font-semibold text-[10px] ${routeColor(scan.route)}`}
            >
              {scan.route}
            </span>
          )}
          {scan.client_location && scan.client_location !== "OTHER" && (
            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-medium text-[10px] text-slate-600">
              {scan.client_location}
            </span>
          )}
          {scan.collect_payment && scan.collect_amount ? (
            <span className="ml-auto font-bold font-mono text-[10px] text-amber-600">
              ${scan.collect_amount.toFixed(2)}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ scan, onClose }: { scan: Scan; onClose: () => void }) {
  const [imgOpen, setImgOpen] = useState(false);
  const flags = getScanFlags(scan);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-2 border-b bg-muted/20 px-5 py-4">
        <div>
          <p className="font-bold text-base leading-tight">{scan.full_name}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-muted-foreground text-xs">
              #{scan.rtscan_id}
            </span>
            {scan.route && (
              <span
                className={`inline-flex rounded-full px-2 py-0.5 font-semibold text-[10px] ${routeColor(scan.route)}`}
              >
                {scan.route}
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-5 pt-4 pb-2">
            {flags.map((f) => (
              <span
                key={f.key}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold text-[11px] ${f.pill}`}
              >
                <f.icon className="h-3 w-3" />
                {f.full}
                {f.key === "collect_payment" && scan.collect_amount ? ` — $${scan.collect_amount.toFixed(2)}` : ""}
              </span>
            ))}
          </div>
        )}

        {scan.image_url && (
          <div className="px-5 pt-3 pb-0">
            <button
              type="button"
              onClick={() => setImgOpen(true)}
              className="group relative w-full overflow-hidden rounded-xl border bg-muted/30 transition-all hover:border-primary/40"
            >
              {/* biome-ignore lint/performance/noImgElement: label preview */}
              <img
                src={scan.image_url}
                alt="Label"
                className="max-h-32 w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                <ZoomIn className="h-7 w-7 text-white drop-shadow" />
              </div>
              <div className="absolute right-2 bottom-2 rounded-md bg-background/80 px-2 py-0.5 font-medium text-[10px] backdrop-blur">
                Click to expand
              </div>
            </button>
          </div>
        )}

        <div className="space-y-4 px-5 py-4">
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
                <p className="font-semibold text-amber-600">Gate Code: {scan.gate_code}</p>
              )}
              {scan.preset_drop_off && scan.preset_drop_off !== "No" && (
                <p className="font-medium text-blue-600">Drop-off: {scan.preset_drop_off}</p>
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
          <a href={`/dashboard/stops?search=${encodeURIComponent(scan.full_name || "")}`}>View Stop</a>
        </Button>
        {scan.image_url && (
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setImgOpen(true)}>
            View Label
          </Button>
        )}
      </div>

      <Dialog open={imgOpen} onOpenChange={setImgOpen}>
        <DialogContent className="max-w-2xl border-0 bg-black/90 p-2">
          {/* biome-ignore lint/performance/noImgElement: fullscreen label */}
          <img src={scan.image_url} alt="Label" className="w-full rounded-lg" />
          <p className="pb-1 text-center text-white/50 text-xs">
            {scan.full_name} — {scan.rx_pharma_id}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1.5 font-bold text-[10px] text-muted-foreground/70 uppercase tracking-widest">{title}</p>
      <div className="divide-y overflow-hidden rounded-xl border bg-muted/20 text-sm">{children}</div>
    </section>
  );
}

function Row({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className={`max-w-[180px] truncate text-right font-medium text-[11px] ${mono ? "font-mono" : ""}`}>
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
      const [scanRes, tenantRes] = await Promise.all([
        fetch(`/api/data/package-scans?limit=200&clientId=${tenantFilter}`),
        fetch("https://routelypro.com/api/tenants"),
      ]);
      if (scanRes.ok) {
        const d = await scanRes.json();
        setData(d.list || d || []);
      }
      if (tenantRes.ok) {
        const t = await tenantRes.json();
        setTenants(
          (t.list || []).map((x: Record<string, unknown>) => ({
            tenant_id: x.tenant_id as number,
            company_name: (x.company_name as string) || (x.contact_name as string) || `Tenant ${x.tenant_id}`,
          })),
        );
      }
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
    const h = ["Scan ID", "Patient", "Rx #", "Address", "Route", "Branch", "New", "Collect", "Cold", "Sig", "Date"];
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
      <div className="flex h-[calc(100vh-8rem)] gap-3 p-0">
        <div className="w-[360px] shrink-0 space-y-2 p-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={`sk-${i}`} className="h-24 rounded-xl" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
        <Skeleton className="flex-1 rounded-xl" />
      </div>
    );

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-0 overflow-hidden rounded-xl border bg-background shadow-sm">
      {/* LEFT — Scan List */}
      <div
        className={`flex shrink-0 flex-col border-r transition-all duration-300 ${selected ? "w-[300px]" : "w-[380px]"}`}
      >
        <div className="space-y-2 border-b bg-muted/10 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-bold text-sm">Package Scans</h1>
              <p className="text-[10px] text-muted-foreground">
                {filtered.length} of {data.length} scans
              </p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchData}>
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={exportCsv}>
                <Download className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {tenants.length > 1 && (
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger className="h-7 text-xs">
                <Users className="mr-1 h-3 w-3" />
                <SelectValue placeholder="Tenant" />
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
              placeholder="Search patient, Rx, address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-8 text-xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
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
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={flagFilter} onValueChange={setFlagFilter}>
              <SelectTrigger className="h-7 flex-1 text-xs">
                <SelectValue placeholder="Flag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new">New Client</SelectItem>
                <SelectItem value="collect">Collect $</SelectItem>
                <SelectItem value="cold">Cold</SelectItem>
                <SelectItem value="sig">Signature</SelectItem>
                <SelectItem value="today">Today</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto border-b bg-muted/5 px-3 py-2">
          {[
            {
              key: "new",
              label: `${data.filter((s) => s.new_client).length} New`,
              icon: Star,
              color: "bg-violet-100 text-violet-700",
            },
            {
              key: "collect",
              label: `$${data
                .filter((s) => s.collect_payment)
                .reduce((a, s) => a + (s.collect_amount || 0), 0)
                .toFixed(0)}`,
              icon: DollarSign,
              color: "bg-amber-100 text-amber-700",
            },
            {
              key: "cold",
              label: `${data.filter((s) => s.type?.includes("cold")).length} ❄`,
              icon: Snowflake,
              color: "bg-cyan-100 text-cyan-700",
            },
            {
              key: "sig",
              label: `${data.filter((s) => s.signature_required).length} ✍`,
              icon: PenLine,
              color: "bg-rose-100 text-rose-700",
            },
          ].map((p) => (
            <button
              key={p.key}
              type="button"
              title={p.key}
              onClick={() => setFlagFilter(flagFilter === p.key ? "all" : p.key)}
              className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 font-semibold text-[10px] transition-all duration-150 ${p.color} ${flagFilter === p.key ? "scale-105 ring-2 ring-current ring-offset-1" : "opacity-75 hover:scale-105 hover:opacity-100"}`}
            >
              <p.icon className="h-2.5 w-2.5" />
              {p.label}
            </button>
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
                onClick={() => setSelected(scan)}
              />
            ))
          )}
        </div>
      </div>

      {/* CENTER — Map */}
      <div
        className={`flex-col transition-all duration-300 ${selected ? "hidden lg:flex lg:w-[400px] lg:shrink-0 lg:border-r" : "flex flex-1"}`}
      >
        <div className="flex items-center gap-2 border-b bg-muted/10 px-4 py-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
            <MapPin className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="flex-1 truncate font-medium text-xs">
            {selected ? `${selected.full_name} · ${selected.full_address || selected.address}` : "Interactive Map"}
          </span>
          {selected?.route && (
            <span
              className={`inline-flex shrink-0 rounded-full px-2 py-0.5 font-semibold text-[10px] ${routeColor(selected.route)}`}
            >
              {selected.route}
            </span>
          )}
        </div>
        <div className="flex-1 p-2.5">
          <LeafletMap scan={selected} />
        </div>
      </div>

      {/* RIGHT — Detail */}
      {selected && (
        <div className="w-[320px] shrink-0 border-l">
          <DetailPanel scan={selected} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}
