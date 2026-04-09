"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  spoke_stop_id?: string;
  recipient_id?: number;
  package_vip?: boolean;
  gate_code?: string;
  address_fix?: string;
  preset_drop_off?: string;
}

function formatTime(d?: string) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDate(d?: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function FlagChip({ label, icon: Icon, color }: { label: string; icon: typeof Star; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function ScanCard({ scan, selected, onClick }: { scan: Scan; selected: boolean; onClick: () => void }) {
  const flags: { label: string; icon: typeof Star; color: string }[] = [];
  if (scan.new_client) flags.push({ label: "New", icon: Star, color: "bg-violet-100 text-violet-700" });
  if (scan.collect_payment)
    flags.push({
      label: `$${scan.collect_amount?.toFixed(2)}`,
      icon: DollarSign,
      color: "bg-amber-100 text-amber-700",
    });
  if (scan.type?.includes("cold")) flags.push({ label: "Cold", icon: Snowflake, color: "bg-cyan-100 text-cyan-700" });
  if (scan.signature_required) flags.push({ label: "Sig", icon: PenLine, color: "bg-rose-100 text-rose-700" });
  if (scan.delivery_today) flags.push({ label: "Today", icon: Clock, color: "bg-green-100 text-green-700" });

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full cursor-pointer rounded-xl border px-4 py-3 text-left transition-all hover:shadow-md ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/30"}`}
    >
      {selected && <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-primary" />}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{scan.full_name || "—"}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{scan.rx_pharma_id || "No Rx"}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[10px] text-muted-foreground">{formatDate(scan.created_at)}</span>
          <span className="text-[10px] text-muted-foreground">{formatTime(scan.created_at)}</span>
        </div>
      </div>
      <p className="mb-2 truncate text-[11px] text-muted-foreground">{scan.full_address || scan.address}</p>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {flags.map((f) => (
            <FlagChip key={f.label} {...f} />
          ))}
          {scan.route && (
            <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
              {scan.route}
            </span>
          )}
          {scan.client_location && scan.client_location !== "OTHER" && (
            <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
              {scan.client_location}
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground/60">#{scan.rtscan_id}</span>
      </div>
    </button>
  );
}

function MapView({ scan }: { scan: Scan | null }) {
  const address = scan?.full_address || scan?.address;
  if (!address || !scan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <MapPin className="h-12 w-12 opacity-20" />
        <p className="text-sm">Select a scan to view location</p>
      </div>
    );
  }
  const encoded = encodeURIComponent(address);
  const mapSrc = `https://www.google.com/maps/embed/v1/place?key=AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY&q=${encoded}&zoom=15`;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border bg-muted">
      <iframe
        title="Map"
        src={mapSrc}
        className="h-full w-full border-0"
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="absolute bottom-4 left-4 right-4 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <MapPin className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{scan.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{address}</p>
            {scan.route && <p className="mt-0.5 text-[11px] font-medium text-primary">Route: {scan.route}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ scan, onClose }: { scan: Scan; onClose: () => void }) {
  const flags = [
    scan.new_client && { label: "New Client", icon: Star, color: "border-violet-200 bg-violet-100 text-violet-700" },
    scan.collect_payment && {
      label: `Collect $${scan.collect_amount?.toFixed(2)}`,
      icon: DollarSign,
      color: "border-amber-200 bg-amber-100 text-amber-700",
    },
    scan.type?.includes("cold") && {
      label: "Cold Package",
      icon: Snowflake,
      color: "border-cyan-200 bg-cyan-100 text-cyan-700",
    },
    scan.signature_required && {
      label: "Signature Required",
      icon: PenLine,
      color: "border-rose-200 bg-rose-100 text-rose-700",
    },
    scan.delivery_today && {
      label: "Deliver Today",
      icon: Clock,
      color: "border-green-200 bg-green-100 text-green-700",
    },
    scan.package_vip && { label: "VIP Package", icon: Star, color: "border-yellow-200 bg-yellow-100 text-yellow-700" },
  ].filter(Boolean) as { label: string; icon: typeof Star; color: string }[];

  const sections: { title: string; rows: [string, string | undefined][] }[] = [
    {
      title: "Patient",
      rows: [
        ["Name", scan.full_name],
        ["DOB", scan.dob],
        ["Phone", scan.phone],
      ],
    },
    {
      title: "Prescription",
      rows: [
        ["Rx #", scan.rx_pharma_id],
        ["Rx Date", scan.rx_creation_date],
        ["Branch", scan.client_location],
        ["Route", scan.route],
        ["Type", scan.type],
      ],
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-2 border-b px-5 py-4">
        <div>
          <p className="text-base font-bold">{scan.full_name}</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">Scan #{scan.rtscan_id}</p>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {flags.map((f) => (
              <span
                key={f.label}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${f.color}`}
              >
                <f.icon className="h-3 w-3" />
                {f.label}
              </span>
            ))}
          </div>
        )}

        {sections.map((s) => (
          <section key={s.title}>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{s.title}</p>
            <div className="divide-y rounded-xl border bg-muted/30 text-sm">
              {s.rows.map(
                ([l, v]) =>
                  v && (
                    <div key={l} className="flex justify-between px-3 py-2.5">
                      <span className="text-xs text-muted-foreground">{l}</span>
                      <span className="max-w-[160px] truncate text-right font-mono text-xs font-medium">{v}</span>
                    </div>
                  ),
              )}
            </div>
          </section>
        ))}

        <section>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Delivery Address</p>
          <div className="rounded-xl border bg-muted/30 px-3 py-2.5">
            <p className="text-xs font-medium">{scan.full_address || scan.address}</p>
            {scan.city && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {scan.city}, {scan.state} {scan.zipcode}
              </p>
            )}
            {scan.gate_code && scan.gate_code !== "No" && (
              <p className="mt-1 text-xs font-semibold text-amber-600">Gate: {scan.gate_code}</p>
            )}
            {scan.preset_drop_off && scan.preset_drop_off !== "No" && (
              <p className="mt-1 text-xs font-medium text-blue-600">Drop-off: {scan.preset_drop_off}</p>
            )}
          </div>
        </section>

        <section>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Scanned</p>
          <div className="rounded-xl border bg-muted/30 px-3 py-2.5 text-xs">
            <p className="font-medium">{scan.created_at ? new Date(scan.created_at).toLocaleString() : "—"}</p>
          </div>
        </section>

        {scan.note && (
          <section>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Notes</p>
            <div className="rounded-xl border bg-muted/30 px-3 py-2.5">
              <p className="whitespace-pre-wrap text-xs leading-relaxed">{scan.note}</p>
            </div>
          </section>
        )}

        {scan.image_url && (
          <section>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Label Image</p>
            <div className="overflow-hidden rounded-xl border">
              {/* biome-ignore lint/performance/noImgElement: label preview */}
              <img src={scan.image_url} alt="Label" className="w-full object-cover" />
            </div>
          </section>
        )}
      </div>

      <div className="flex gap-2 border-t px-5 py-3">
        <Button size="sm" variant="outline" className="flex-1" asChild>
          <a href={`/dashboard/stops?search=${encodeURIComponent(scan.full_name || "")}`}>View Stop</a>
        </Button>
        {scan.image_url && (
          <Button size="sm" variant="outline" asChild>
            <a href={scan.image_url} target="_blank" rel="noreferrer">
              Image
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ScansPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Scan | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [routeFilter, setRouteFilter] = useState("all");
  const [flagFilter, setFlagFilter] = useState("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data/package-scans?limit=200");
      if (res.ok) {
        const d = await res.json();
        setData(d.list || d || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

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
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: "scans.csv",
    });
    a.click();
  };

  if (loading)
    return (
      <div className="flex h-[calc(100vh-8rem)] gap-4 p-0">
        <div className="w-[340px] shrink-0 space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={`sk-${i}`} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="flex-1 rounded-xl" />
      </div>
    );

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-0 overflow-hidden rounded-xl border bg-background shadow-sm">
      {/* LEFT — Scan List */}
      <div className={`flex shrink-0 flex-col border-r transition-all ${selected ? "w-[320px]" : "w-[400px]"}`}>
        <div className="space-y-2 border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold">Package Scans</h1>
              <p className="text-xs text-muted-foreground">
                {filtered.length} of {data.length}
              </p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchData}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search scans..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
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

        <div className="flex gap-1.5 overflow-x-auto border-b px-4 py-2">
          {[
            {
              key: "new",
              label: `${data.filter((s) => s.new_client).length} New`,
              color: "bg-violet-50 text-violet-700",
            },
            {
              key: "collect",
              label: `${data.filter((s) => s.collect_payment).length} Collect`,
              color: "bg-amber-50 text-amber-700",
            },
            {
              key: "cold",
              label: `${data.filter((s) => s.type?.includes("cold")).length} Cold`,
              color: "bg-cyan-50 text-cyan-700",
            },
            {
              key: "sig",
              label: `${data.filter((s) => s.signature_required).length} Sig`,
              color: "bg-rose-50 text-rose-700",
            },
          ].map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setFlagFilter(flagFilter === p.key ? "all" : p.key)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all ${p.color} ${flagFilter === p.key ? "ring-1 ring-current" : "opacity-70 hover:opacity-100"}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 pt-16 text-muted-foreground">
              <Package className="h-10 w-10 opacity-20" />
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
      <div className={`flex-1 transition-all ${selected ? "hidden lg:flex" : "flex"} flex-col`}>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {selected
              ? `${selected.full_name} — ${selected.full_address || selected.address}`
              : "Select a scan to pin on map"}
          </span>
        </div>
        <div className="flex-1 p-3">
          <MapView scan={selected} />
        </div>
      </div>

      {/* RIGHT — Detail panel */}
      {selected && (
        <div className="w-[340px] shrink-0 border-l">
          <DetailPanel scan={selected} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}
