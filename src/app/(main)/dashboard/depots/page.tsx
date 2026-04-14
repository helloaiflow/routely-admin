"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  Check,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  RefreshCw,
  Save,
  Search,
  Truck,
  Users,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-is-mobile";

import "leaflet/dist/leaflet.css";

interface Depot {
  _id: string;
  spoke_depot_id: string;
  rt_depot_id?: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  start_time?: string;
  end_time?: string;
  end_location?: string;
  custom_end_address?: string;
  estimated_time_per_stop?: number;
  max_stops_per_driver?: number | null;
  vehicle_type?: string;
  side_of_road?: string;
  avg_speed_mph?: number;
  working_days?: string[];
  timezone?: string;
  tenant_id?: number;
  active?: boolean;
  synced_at?: string;
  assigned_drivers?: string[];
}
interface Driver {
  _id: string;
  full_name?: string;
  name?: string;
  email?: string;
}
interface Tenant {
  tenant_id: number;
  company_name?: string;
  contact_name?: string;
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_L: Record<string, string> = { mon: "Mo", tue: "Tu", wed: "We", thu: "Th", fri: "Fr", sat: "Sa", sun: "Su" };
const VEHS = [
  { id: "car", emoji: "🚗", label: "Car" },
  { id: "van", emoji: "🚐", label: "Van" },
  { id: "truck", emoji: "🚛", label: "Truck" },
];
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
];
function av(name: string) {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
let acTimer: ReturnType<typeof setTimeout>;

// ── DepotCard — same design as ScanCard ──────────────────────────────────────
function DepotCard({
  depot,
  tenantDepotId,
  tenants,
  isSelected,
  onClick,
}: {
  depot: Depot;
  tenantDepotId: string;
  tenants: Tenant[];
  isSelected: boolean;
  onClick: () => void;
}) {
  const isPrimary = depot.spoke_depot_id === tenantDepotId;
  const tenantName = depot.tenant_id
    ? (() => {
        const t = tenants.find((x) => x.tenant_id === depot.tenant_id);
        return t?.company_name || t?.contact_name || null;
      })()
    : null;
  const syncDate = depot.synced_at
    ? new Date(depot.synced_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const addressLine = depot.address ? [depot.address, depot.city, depot.state].filter(Boolean).join(", ") : null;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}
      whileTap={{ scale: 0.98 }}
      className={`relative w-full rounded-xl border text-left transition-all duration-200 ${
        isSelected
          ? "border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/20"
          : "border-border/60 bg-card hover:border-primary/25 hover:shadow-sm"
      }`}
    >
      <div className="px-3.5 py-3">
        {/* Top: emoji + name + sync date — same structure as ScanCard */}
        <div className="mb-1.5 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-base leading-none">{isPrimary ? "⭐" : "🏢"}</span>
              <p className="truncate font-semibold text-xs">{depot.name}</p>
            </div>
            {depot.rt_depot_id && (
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{depot.rt_depot_id}</p>
            )}
          </div>
          {syncDate && (
            <div className="shrink-0 text-right">
              <p className="font-medium text-[10px] text-muted-foreground">{syncDate}</p>
            </div>
          )}
        </div>
        {/* Middle: address line — same as scan address */}
        <p
          className={`mb-1.5 flex items-center gap-1 truncate text-[11px] ${addressLine ? "text-muted-foreground" : "text-amber-500"}`}
        >
          <MapPin className="h-2.5 w-2.5 shrink-0 opacity-60" />
          {addressLine || "No address — click to add"}
        </p>
        {/* Bottom: badges — same as scan route badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-bold text-[9px] ${depot.active !== false ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-500"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${depot.active !== false ? "bg-green-500" : "bg-gray-400"}`} />
            {depot.active !== false ? "Active" : "Inactive"}
          </span>
          {isPrimary && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/20 bg-primary/5 px-1.5 py-0.5 font-bold text-[9px] text-primary">
              <Zap className="h-2.5 w-2.5" /> Primary
            </span>
          )}
          {tenantName && (
            <span className="truncate rounded-full bg-blue-50 px-1.5 py-0.5 font-medium text-[9px] text-blue-600 border border-blue-100">
              {tenantName}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ── Address autocomplete ──────────────────────────────────────────────────────
function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (a: { address: string; city: string; state: string; zipcode: string }) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<{ main: string; sub: string; data: Record<string, string> }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const search = (q: string) => {
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    clearTimeout(acTimer);
    setLoading(true);
    acTimer = setTimeout(async () => {
      try {
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=4&lang=en`);
        const data = await res.json();
        const items = (data.features || []).map((f: Record<string, unknown>) => {
          const p = f.properties as Record<string, string>;
          return {
            main: p.name || p.street || q,
            sub: [p.street && p.name ? p.street : "", p.city || p.county, p.state, p.country]
              .filter(Boolean)
              .join(", "),
            data: {
              address: [p.housenumber, p.street].filter(Boolean).join(" ") || p.name || "",
              city: p.city || p.county || "",
              state: p.state || "",
              zipcode: p.postcode || "",
            },
          };
        });
        setSuggestions(items);
        setOpen(items.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  };
  return (
    <div className="relative">
      <div className="relative">
        {loading && (
          <Loader2 className="absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            search(e.target.value);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder || "Start typing..."}
          className="h-8 text-xs"
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-xl border bg-background shadow-lg">
          {suggestions.map((s) => (
            <button
              key={s.main + s.sub}
              type="button"
              onMouseDown={() => {
                onSelect(s.data as { address: string; city: string; state: string; zipcode: string });
                onChange(s.data.address || s.main);
                setOpen(false);
              }}
              className="flex w-full items-start gap-2.5 border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-muted"
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
              <div className="min-w-0">
                <p className="truncate font-medium text-xs">{s.main}</p>
                <p className="truncate text-[10px] text-muted-foreground">{s.sub}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Static map ────────────────────────────────────────────────────────────────
function StaticMap({ depot }: { depot: Depot | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const mapReadyRef = useRef(false);
  const depotRef = useRef<Depot | null>(depot);
  depotRef.current = depot;

  const flyTo = useCallback(async (dep: Depot) => {
    if (!mapRef.current) return;
    const addr = [dep.address, dep.city, dep.state, dep.zipcode].filter(Boolean).join(", ");
    if (!addr.trim()) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1&countrycodes=us`,
        { headers: { "Accept-Language": "en", "User-Agent": "Routely-Admin/1.0" } },
      );
      const data = await res.json();
      if (!data.length || !mapRef.current) return;
      const lat = parseFloat(data[0].lat),
        lng = parseFloat(data[0].lon);
      const L = await import("leaflet");
      mapRef.current.flyTo([lat, lng], 17, { duration: 1.2, easeLinearity: 0.25 });
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      const icon = L.divIcon({
        html: `<div style="display:flex;flex-direction:column;align-items:center"><div style="width:36px;height:36px;background:#2563EB;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(37,99,235,.45)"><span style="transform:rotate(45deg);font-size:16px">🏢</span></div><div style="margin-top:5px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600;color:#1e293b;box-shadow:0 2px 8px rgba(0,0,0,.10);white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis">${dep.name}</div></div>`,
        className: "",
        iconSize: [36, 60],
        iconAnchor: [18, 36],
      });
      markerRef.current = L.marker([lat, lng], { icon }).addTo(mapRef.current);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || mapReadyRef.current || !containerRef.current) return;
    (async () => {
      const L = await import("leaflet");
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      if (!containerRef.current) return;
      mapRef.current = L.map(containerRef.current, { zoomControl: true, attributionControl: false }).setView(
        [26.2, -80.25],
        10,
      );
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(
        mapRef.current,
      );
      setTimeout(() => {
        mapRef.current?.invalidateSize();
        mapReadyRef.current = true;
        if (depotRef.current?.address) flyTo(depotRef.current);
      }, 400);
    })();
  }, [flyTo]);

  useEffect(() => {
    if (!mapReadyRef.current) return;
    if (depot?.address) {
      flyTo(depot);
    } else {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      mapRef.current?.setView([26.2, -80.25], 10);
    }
  }, [depot, flyTo]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({
  depot,
  onSave,
  drivers,
  tenants,
}: {
  depot: Depot;
  onSave: (id: string, data: Partial<Depot>) => Promise<void>;
  drivers: Driver[];
  tenants: Tenant[];
}) {
  const [form, setForm] = useState<Partial<Depot>>({ ...depot });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof Depot, v: unknown) => setForm((p) => ({ ...p, [k]: v }));
  const toggleDay = (d: string) => {
    const days = form.working_days || [];
    set("working_days", days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);
  };
  const toggleDriver = (id: string) => {
    const arr = form.assigned_drivers || [];
    set("assigned_drivers", arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  };
  useEffect(() => {
    setForm({ ...depot });
  }, [depot]);
  const handleSave = async () => {
    setSaving(true);
    await onSave(depot.spoke_depot_id, form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const SL = ({ children }: { children: string }) => (
    <p className="mb-2 font-semibold text-[10px] text-muted-foreground/60 uppercase tracking-widest">{children}</p>
  );
  const CW = ({ children }: { children: React.ReactNode }) => (
    <div className="divide-y overflow-hidden rounded-xl border bg-card">{children}</div>
  );
  const R = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="flex-1 text-right">{children}</div>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="flex-1 truncate font-semibold text-sm leading-tight">{depot.name}</p>
          {depot.active !== false ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-[9px] text-green-700">
              Active
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-[9px] text-muted-foreground">
              Inactive
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          {depot.rt_depot_id && (
            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {depot.rt_depot_id}
            </code>
          )}
          {depot.synced_at && (
            <span className="text-[10px] text-muted-foreground">
              Synced {new Date(depot.synced_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div>
          <SL>Location</SL>
          <CW>
            <div className="px-3 py-2">
              <p className="mb-1 text-[10px] text-muted-foreground">Street address</p>
              <AddressAutocomplete
                value={form.address || ""}
                onChange={(v) => set("address", v)}
                onSelect={(a) =>
                  setForm((p) => ({ ...p, address: a.address, city: a.city, state: a.state, zipcode: a.zipcode }))
                }
              />
            </div>
            <div className="border-t px-3 py-2">
              <p className="mb-1 text-[10px] text-muted-foreground">City</p>
              <Input
                value={(form.city as string) || ""}
                onChange={(e) => set("city", e.target.value)}
                placeholder="City"
                className="h-7 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 divide-x border-t">
              <div className="px-3 py-2">
                <p className="mb-1 text-[10px] text-muted-foreground">State</p>
                <Input
                  value={(form.state as string) || ""}
                  onChange={(e) => set("state", e.target.value)}
                  maxLength={2}
                  placeholder="FL"
                  className="h-7 text-xs"
                />
              </div>
              <div className="px-3 py-2">
                <p className="mb-1 text-[10px] text-muted-foreground">ZIP</p>
                <Input
                  value={(form.zipcode as string) || ""}
                  onChange={(e) => set("zipcode", e.target.value)}
                  placeholder="33065"
                  className="h-7 text-xs"
                />
              </div>
            </div>
            <div className="px-3 py-2">
              <p className="mb-1.5 text-[10px] text-muted-foreground">End location</p>
              <div className="flex gap-1.5">
                {[
                  { id: "return", label: "Return to start" },
                  { id: "last_package", label: "Last package" },
                  { id: "custom", label: "Other address" },
                ].map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => set("end_location", e.id)}
                    className={`flex-1 rounded-lg border px-1.5 py-1.5 text-center font-medium text-[10px] transition-all ${form.end_location === e.id ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
              {form.end_location === "custom" && (
                <div className="mt-2">
                  <AddressAutocomplete
                    value={form.custom_end_address || ""}
                    onChange={(v) => set("custom_end_address", v)}
                    onSelect={(a) => set("custom_end_address", [a.address, a.city, a.state].filter(Boolean).join(", "))}
                    placeholder="Search end address..."
                  />
                </div>
              )}
            </div>
          </CW>
        </div>
        <div>
          <SL>Schedule</SL>
          <CW>
            <div className="grid grid-cols-2 divide-x">
              <div className="px-3 py-2">
                <p className="mb-1 text-[10px] text-muted-foreground">Start time</p>
                <Input
                  type="time"
                  value={form.start_time || "07:00"}
                  onChange={(e) => set("start_time", e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="px-3 py-2">
                <p className="mb-1 text-[10px] text-muted-foreground">End time</p>
                <Input
                  type="time"
                  value={form.end_time || ""}
                  onChange={(e) => set("end_time", e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            </div>
            <R label="Timezone">
              <Select value={form.timezone || "America/New_York"} onValueChange={(v) => set("timezone", v)}>
                <SelectTrigger className="h-7 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern (ET)</SelectItem>
                  <SelectItem value="America/Chicago">Central (CT)</SelectItem>
                  <SelectItem value="America/Denver">Mountain (MT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific (PT)</SelectItem>
                </SelectContent>
              </Select>
            </R>
            <div className="px-3 py-2">
              <p className="mb-1.5 text-[10px] text-muted-foreground">Working days</p>
              <div className="flex gap-1">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`h-6 w-7 rounded-md border font-semibold text-[9px] transition-all ${(form.working_days || []).includes(d) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    {DAY_L[d]}
                  </button>
                ))}
              </div>
            </div>
            <R label="Time per stop">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-xs">{form.estimated_time_per_stop || 10} min</span>
                <input
                  type="range"
                  min="2"
                  max="60"
                  step="1"
                  value={form.estimated_time_per_stop || 10}
                  onChange={(e) => set("estimated_time_per_stop", parseInt(e.target.value, 10))}
                  className="h-1.5 w-24 accent-primary"
                />
              </div>
            </R>
          </CW>
        </div>
        <div>
          <SL>Route config</SL>
          <CW>
            <div className="px-3 py-2">
              <p className="mb-1.5 text-[10px] text-muted-foreground">Vehicle type</p>
              <div className="flex gap-2">
                {VEHS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => set("vehicle_type", v.id)}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-lg border py-2 font-medium text-xs transition-all ${form.vehicle_type === v.id ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    <span className="text-sm">{v.emoji}</span>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <R label="Side of road">
              <div className="flex gap-1">
                {["either", "right", "left"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set("side_of_road", s)}
                    className={`rounded-md border px-2 py-1 font-medium text-[10px] transition-all ${form.side_of_road === s ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </R>
            <R label="Avg speed">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-xs">{form.avg_speed_mph || 35} mph</span>
                <input
                  type="range"
                  min="15"
                  max="80"
                  step="5"
                  value={form.avg_speed_mph || 35}
                  onChange={(e) => set("avg_speed_mph", parseInt(e.target.value, 10))}
                  className="h-1.5 w-24 accent-primary"
                />
              </div>
            </R>
            <R label="Max stops / driver">
              <Input
                type="number"
                value={form.max_stops_per_driver ?? ""}
                onChange={(e) => set("max_stops_per_driver", e.target.value ? parseInt(e.target.value, 10) : null)}
                placeholder="Unlimited"
                className="h-7 w-28 text-right text-xs"
                min={1}
              />
            </R>
          </CW>
        </div>
        <div>
          <SL>Tenant</SL>
          <CW>
            <div className="px-3 py-2">
              <Select
                value={form.tenant_id ? String(form.tenant_id) : ""}
                onValueChange={(v) => set("tenant_id", parseInt(v, 10))}
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue placeholder="Select tenant...">
                    {form.tenant_id &&
                      (() => {
                        const t = tenants.find((x) => x.tenant_id === form.tenant_id);
                        const tName = t?.company_name || t?.contact_name || `Tenant ${form.tenant_id}`;
                        return (
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex h-5 w-5 items-center justify-center rounded-full font-bold text-[9px] ${AVATAR_COLORS[form.tenant_id % AVATAR_COLORS.length]}`}
                            >
                              {av(tName)}
                            </div>
                            <span>{tName}</span>
                          </div>
                        );
                      })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent style={{ zIndex: 9999 }}>
                  {tenants.map((t) => {
                    const tName = t.company_name || t.contact_name || `Tenant ${t.tenant_id}`;
                    return (
                      <SelectItem key={t.tenant_id} value={String(t.tenant_id)}>
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-full font-bold text-[9px] ${AVATAR_COLORS[t.tenant_id % AVATAR_COLORS.length]}`}
                          >
                            {av(tName)}
                          </div>
                          <span>{tName}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </CW>
        </div>
        <div>
          <SL>Drivers</SL>
          <CW>
            <div className="px-3 py-3">
              {drivers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No drivers found</p>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Drivers ({drivers.length})</span>
                    <span className="font-medium text-[10px] text-primary">
                      {(form.assigned_drivers || []).length} assigned
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {drivers.map((d, i) => {
                      const dName = d.full_name || d.name || "Driver";
                      const isAssigned = (form.assigned_drivers || []).includes(d._id);
                      return (
                        <button key={d._id} type="button" onClick={() => toggleDriver(d._id)} title={dName}>
                          <div
                            className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 font-bold text-[10px] transition-all ${AVATAR_COLORS[i % AVATAR_COLORS.length]} ${isAssigned ? "border-primary opacity-100 ring-2 ring-primary ring-offset-1" : "border-transparent opacity-40 hover:opacity-70"}`}
                          >
                            {av(dName)}
                            {isAssigned && (
                              <span className="absolute -right-0.5 -bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-primary">
                                <Check className="h-2 w-2 text-white" />
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {(form.assigned_drivers || []).length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5 border-t pt-2.5">
                      {(form.assigned_drivers || []).map((id, i) => {
                        const d = drivers.find((x) => x._id === id);
                        if (!d) return null;
                        const dName = d.full_name || d.name || "Driver";
                        return (
                          <span
                            key={id}
                            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[10px] ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                          >
                            {av(dName)} {dName.split(" ").slice(0, 2).join(" ")}
                            <button
                              type="button"
                              onClick={() => toggleDriver(id)}
                              className="ml-0.5 opacity-60 hover:opacity-100"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </CW>
        </div>
        <div>
          <SL>IDs</SL>
          <CW>
            <R label="RT Depot ID">
              <code className="font-mono font-semibold text-xs">{depot.rt_depot_id || "—"}</code>
            </R>
            <R label="Spoke ID">
              <code className="font-mono text-[10px] text-muted-foreground">
                {depot.spoke_depot_id.replace("depots/", "")}
              </code>
            </R>
          </CW>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t bg-muted/10 px-5 py-3">
        <Button onClick={handleSave} disabled={saving} size="sm" className="w-full gap-2">
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : saved ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saving ? "Saving..." : saved ? "Saved!" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DepotsPage() {
  const [depots, setDepots] = useState<Depot[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantDepotId, setTenantDepotId] = useState("");
  const [selected, setSelected] = useState<Depot | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addSpokeId, setAddSpokeId] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const isMobile = useIsMobile();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, tr, dvr] = await Promise.allSettled([
        fetch("/api/data/spoke-depots"),
        fetch("/api/tenants"),
        fetch("/api/data/drivers?limit=50"),
      ]);
      if (dr.status === "fulfilled" && dr.value.ok) {
        const d = await dr.value.json();
        setDepots(d.list || []);
      }
      if (tr.status === "fulfilled" && tr.value.ok) {
        const t = await tr.value.json();
        const list = t.list || [];
        setTenants(list);
        const tenant = list.find((x: Record<string, unknown>) => x.tenant_id === 1);
        if (tenant?.spoke_depot_id) setTenantDepotId(tenant.spoke_depot_id);
      }
      if (dvr.status === "fulfilled" && dvr.value.ok) {
        const d = await dvr.value.json();
        setDrivers(d.list || d.drivers || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/spoke/sync-depots", { method: "POST" });
      const d = await res.json();
      setSyncMsg(`${d.added || 0} added, ${d.updated || 0} updated`);
      await fetchAll();
      setTimeout(() => setSyncMsg(""), 3000);
    } catch {
      setSyncMsg("Sync failed");
    } finally {
      setSyncing(false);
    }
  };
  const handleSave = async (spokeId: string, data: Partial<Depot>) => {
    await fetch(`/api/data/spoke-depots?id=${encodeURIComponent(spokeId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setDepots((prev) => prev.map((d) => (d.spoke_depot_id === spokeId ? { ...d, ...data } : d)));
    setSelected((prev) => (prev?.spoke_depot_id === spokeId ? ({ ...prev, ...data } as Depot) : prev));
  };
  const handleAddDepot = async () => {
    if (!addName) return;
    setAddSaving(true);
    const newId = addSpokeId || `manual-${Date.now()}`;
    await fetch(`/api/data/spoke-depots?id=${encodeURIComponent(newId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addName, spoke_depot_id: newId }),
    });
    setAddSaving(false);
    setAddOpen(false);
    setAddName("");
    setAddSpokeId("");
    await fetchAll();
  };

  const filtered = search
    ? depots.filter(
        (d) =>
          d.name.toLowerCase().includes(search.toLowerCase()) ||
          d.address?.toLowerCase().includes(search.toLowerCase()),
      )
    : depots;
  const activeCount = depots.filter((d) => d.active !== false).length;
  const noAddr = depots.filter((d) => !d.address).length;

  if (loading)
    return (
      <div className="flex h-[calc(100vh-8rem)] gap-3">
        <div className="w-[280px] shrink-0 space-y-2 p-3">
          {[1, 2, 3, 4].map((i, idx) => (
            <Skeleton key={i} className="rounded-xl" style={{ height: 88, opacity: 1 - idx * 0.18 }} />
          ))}
        </div>
        <Skeleton className="flex-1 rounded-xl" />
      </div>
    );

  // Summary pills — same as scans
  const pills = [
    { k: "all", e: "🏢", v: depots.length, c: "bg-slate-100 text-slate-700 ring-slate-200" },
    { k: "active", e: "✅", v: activeCount, c: "bg-green-100 text-green-700 ring-green-200" },
    { k: "noaddr", e: "📍", v: noAddr, c: "bg-amber-100 text-amber-700 ring-amber-200" },
  ];

  return (
    <>
      <div
        className="h-[calc(100vh-5rem)] overflow-hidden rounded-xl border bg-background shadow-sm"
        style={
          isMobile
            ? { display: "flex", flexDirection: "column" }
            : {
                display: "grid",
                gridTemplateColumns: selected ? "clamp(240px,26vw,280px) 1fr 360px" : "clamp(240px,26vw,280px) 1fr",
                gridTemplateRows: "1fr",
              }
        }
      >
        {/* COL 1 — List */}
        <div className={`flex min-w-0 flex-col overflow-hidden border-r ${selected && isMobile ? "hidden" : ""}`}>
          {/* Header — exact scans pattern */}
          <div className="space-y-2 border-b bg-muted/10 px-3.5 py-3">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-bold text-sm">🏢 Spoke Depots</h1>
                <p className="text-[10px] text-muted-foreground">
                  {filtered.length} of {depots.length}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <motion.button
                  whileTap={{ rotate: 180 }}
                  type="button"
                  onClick={() => fetchAll()}
                  disabled={loading}
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <RefreshCw className="h-3 w-3" />
                </motion.button>
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex h-6 items-center gap-1 rounded-lg bg-primary/10 px-2 font-semibold text-[10px] text-primary hover:bg-primary/20 disabled:opacity-50"
                >
                  {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}Sync
                </button>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
            {syncMsg && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-lg bg-green-50 px-2.5 py-1 font-medium text-[10px] text-green-700"
              >
                ✓ {syncMsg}
              </motion.div>
            )}
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search depots..."
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
          </div>

          {/* Summary pills — same as scans */}
          <div className="flex gap-1.5 overflow-x-auto border-b bg-muted/5 px-3 py-2">
            {pills.map((p) => (
              <motion.div
                key={p.k}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.95 }}
                className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 font-bold text-[10px] ring-1 opacity-80 ${p.c}`}
              >
                {p.e} {p.v}
              </motion.div>
            ))}
          </div>

          {/* Cards list — same spacing as scans */}
          <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 pt-16 text-muted-foreground">
                <Building2 className="h-12 w-12 opacity-10" />
                <div className="text-center">
                  <p className="font-semibold text-sm">No depots found</p>
                  <p className="mt-0.5 text-xs opacity-60">Click ⚡ Sync to import from Spoke</p>
                </div>
              </div>
            ) : (
              filtered.map((depot) => (
                <DepotCard
                  key={depot._id}
                  depot={depot}
                  tenantDepotId={tenantDepotId}
                  tenants={tenants}
                  isSelected={selected?._id === depot._id}
                  onClick={() => setSelected(depot)}
                />
              ))
            )}
          </div>
        </div>

        {/* COL 2 — Map */}
        <div className="hidden flex-col overflow-hidden md:flex">
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/10 px-4 py-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
              <MapPin className="h-3 w-3 text-primary" />
            </div>
            <span className="flex-1 truncate font-medium text-xs">
              {selected?.address
                ? `${selected.address}, ${selected.city}, ${selected.state}`
                : selected
                  ? "No address — add in detail panel"
                  : "Select a depot"}
            </span>
            {selected && (
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {selected.start_time || "07:00"}
                </span>
                <span className="flex items-center gap-1">
                  <Truck className="h-3 w-3" />
                  {selected.vehicle_type || "van"}
                </span>
                <span className="flex items-center gap-1">
                  <Navigation className="h-3 w-3" />
                  {selected.avg_speed_mph || 35} mph
                </span>
                {(selected.assigned_drivers || []).length > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {(selected.assigned_drivers || []).length} drivers
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="relative min-h-0 flex-1">
            <StaticMap depot={selected} />
            {!selected && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-[2px]">
                <motion.div
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
                >
                  <MapPin className="h-12 w-12 opacity-10" />
                </motion.div>
                <div className="rounded-2xl border bg-background/95 px-5 py-3 text-center shadow-md">
                  <p className="font-medium text-sm">Select a depot</p>
                  <p className="mt-0.5 text-muted-foreground text-xs">Location will appear on the map</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COL 3 — Detail panel (desktop 3rd column) */}
        {selected && (
          <div className="hidden min-w-0 flex-col overflow-hidden border-l md:flex">
            <DetailPanel key={selected._id} depot={selected} onSave={handleSave} drivers={drivers} tenants={tenants} />
          </div>
        )}
      </div>

      {/* Mobile bottom sheet */}
      {selected && isMobile && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t bg-background shadow-2xl"
          style={{ height: "85vh", animation: "slideUp 0.25s ease-out" }}
        >
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex items-center gap-1.5 font-semibold text-primary text-sm"
            >
              ← Back
            </button>
            <span className="truncate font-semibold text-sm">{selected.name}</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <DetailPanel
              key={`m_${selected._id}`}
              depot={selected}
              onSave={handleSave}
              drivers={drivers}
              tenants={tenants}
            />
          </div>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add depot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <Label className="mb-1.5 block text-xs">Depot name *</Label>
              <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="MedFlorida Pharmacy" />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Spoke depot ID</Label>
              <Input
                value={addSpokeId}
                onChange={(e) => setAddSpokeId(e.target.value)}
                placeholder="depots/abc123"
                className="font-mono text-sm"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">Leave empty for a manual depot</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddDepot} disabled={!addName || addSaving}>
              {addSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Add depot
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
