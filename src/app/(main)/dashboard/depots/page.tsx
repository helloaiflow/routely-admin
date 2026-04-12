"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";
import {
  Building2,
  Check,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  RefreshCw,
  Save,
  Truck,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

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
  { id: "car", emoji: "\u{1F697}", label: "Car" },
  { id: "van", emoji: "\u{1F690}", label: "Van" },
  { id: "truck", emoji: "\u{1F69B}", label: "Truck" },
];

let acTimer: ReturnType<typeof setTimeout>;

function avatar(name: string) {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
];

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
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      const L = await import("leaflet");
      mapRef.current.flyTo([lat, lng], 17, { duration: 1.2, easeLinearity: 0.25 });
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      const icon = L.divIcon({
        html: `<div style="display:flex;flex-direction:column;align-items:center">
          <div style="width:36px;height:36px;background:#2563EB;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(37,99,235,.45)">
            <span style="transform:rotate(45deg);font-size:16px">\u{1F3E2}</span>
          </div>
          <div style="margin-top:5px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600;color:#1e293b;box-shadow:0 2px 8px rgba(0,0,0,.10);white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis">${dep.name}</div>
        </div>`,
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
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(mapRef.current);
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

  const SectionLabel = ({ children }: { children: string }) => (
    <p className="mb-2 font-semibold text-[10px] text-muted-foreground/60 uppercase tracking-widest">{children}</p>
  );

  const CardWrap = ({ children }: { children: React.ReactNode }) => (
    <div className="divide-y overflow-hidden rounded-xl border bg-card">{children}</div>
  );

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="flex-1 text-right">{children}</div>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
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

      {/* Scrollable body */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* LOCATION */}
        <div>
          <SectionLabel>Location</SectionLabel>
          <CardWrap>
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
          </CardWrap>
        </div>

        {/* SCHEDULE */}
        <div>
          <SectionLabel>Schedule</SectionLabel>
          <CardWrap>
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
            <Row label="Timezone">
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
            </Row>
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
            <Row label="Time per stop">
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
            </Row>
          </CardWrap>
        </div>

        {/* ROUTE CONFIG */}
        <div>
          <SectionLabel>Route config</SectionLabel>
          <CardWrap>
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
            <Row label="Side of road">
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
            </Row>
            <Row label="Avg speed">
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
            </Row>
            <Row label="Max stops / driver">
              <Input
                type="number"
                value={form.max_stops_per_driver ?? ""}
                onChange={(e) => set("max_stops_per_driver", e.target.value ? parseInt(e.target.value, 10) : null)}
                placeholder="Unlimited"
                className="h-7 w-28 text-right text-xs"
                min={1}
              />
            </Row>
          </CardWrap>
        </div>

        {/* TENANT */}
        <div>
          <SectionLabel>Tenant</SectionLabel>
          <CardWrap>
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
                        const cls = AVATAR_COLORS[form.tenant_id % AVATAR_COLORS.length];
                        return (
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex h-5 w-5 items-center justify-center rounded-full font-bold text-[9px] ${cls}`}
                            >
                              {avatar(tName)}
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
                    const cls = AVATAR_COLORS[t.tenant_id % AVATAR_COLORS.length];
                    return (
                      <SelectItem key={t.tenant_id} value={String(t.tenant_id)}>
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-full font-bold text-[9px] ${cls}`}
                          >
                            {avatar(tName)}
                          </div>
                          <span>{tName}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </CardWrap>
        </div>

        {/* DRIVERS */}
        <div>
          <SectionLabel>Drivers</SectionLabel>
          <CardWrap>
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
                      const cls = AVATAR_COLORS[i % AVATAR_COLORS.length];
                      return (
                        <button key={d._id} type="button" onClick={() => toggleDriver(d._id)} title={dName}>
                          <div
                            className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 font-bold text-[10px] transition-all ${cls} ${isAssigned ? "border-primary opacity-100 ring-2 ring-primary ring-offset-1" : "border-transparent opacity-40 hover:opacity-70"}`}
                          >
                            {avatar(dName)}
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
                        const cls = AVATAR_COLORS[i % AVATAR_COLORS.length];
                        return (
                          <span
                            key={id}
                            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[10px] ${cls}`}
                          >
                            {avatar(dName)} {dName.split(" ").slice(0, 2).join(" ")}
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
          </CardWrap>
        </div>

        {/* IDS */}
        <div>
          <SectionLabel>IDs</SectionLabel>
          <CardWrap>
            <Row label="RT Depot ID">
              <code className="font-mono font-semibold text-xs">{depot.rt_depot_id || "\u2014"}</code>
            </Row>
            <Row label="Spoke ID">
              <code className="font-mono text-[10px] text-muted-foreground">
                {depot.spoke_depot_id.replace("depots/", "")}
              </code>
            </Row>
          </CardWrap>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-3">
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
  const initDone = useRef(false);

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
        const list: Depot[] = d.list || [];
        setDepots(list);
        initDone.current = true;
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

  const noAddr = depots.filter((d) => !d.address).length;
  const activeCount = depots.filter((d) => d.active !== false).length;

  const _STATS = [
    { emoji: "\u{1F3E2}", value: depots.length, label: "Total", active: false },
    { emoji: "\u2705", value: activeCount, label: "Active", active: true },
    { emoji: "\u23F8\uFE0F", value: depots.length - activeCount, label: "Inactive", active: false },
  ];

  if (loading)
    return (
      <div className="flex h-[calc(100vh-5rem)] gap-0">
        <div className="w-[260px] shrink-0 space-y-2 border-r p-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
        <Skeleton className="m-3 flex-1 rounded-xl" />
        <div className="w-[380px] shrink-0 space-y-2 border-l p-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 rounded-xl" />
          ))}
        </div>
      </div>
    );

  return (
    <div
      className="h-[calc(100vh-5rem)] overflow-hidden rounded-xl border bg-background shadow-sm"
      style={{
        display: "grid",
        gridTemplateColumns: selected ? "260px 1fr 380px" : "260px 1fr",
        gridTemplateRows: "1fr",
      }}
    >
      {/* COL 1 — List */}
      <div className="flex flex-col overflow-hidden border-r">
        <div className="flex items-center justify-between border-b px-3.5 py-3">
          <div>
            <h1 className="font-semibold text-sm">Depots</h1>
            <p className="text-[10px] text-muted-foreground">
              {depots.length} total · {activeCount} active
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleSync}
              disabled={syncing}
              title="Sync Spoke"
            >
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddOpen(true)} title="Add depot">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 border-b px-3 py-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5">
            <span className="font-bold text-foreground text-sm tabular-nums">{depots.length}</span>
            <span className="font-medium text-[9px] text-muted-foreground">total</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-green-50 px-2.5 py-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span className="font-bold text-green-700 text-sm tabular-nums">{activeCount}</span>
            <span className="font-medium text-[9px] text-green-600">active</span>
          </div>
          {depots.length - activeCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span className="font-bold text-amber-700 text-sm tabular-nums">{depots.length - activeCount}</span>
              <span className="font-medium text-[9px] text-amber-600">inactive</span>
            </div>
          )}
        </div>

        {syncMsg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="border-b bg-green-50 px-3 py-1.5 font-medium text-[10px] text-green-700"
          >
            {syncMsg}
          </motion.div>
        )}

        <div className="border-b px-3 py-2">
          <Input
            placeholder="Search depots..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
          />
        </div>

        {noAddr > 0 && (
          <div className="flex items-center gap-1.5 border-b bg-amber-50 px-3 py-1.5 text-[10px] text-amber-700">
            <MapPin className="h-3 w-3 shrink-0" />
            <span>
              <strong>{noAddr}</strong> missing address
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Building2 className="h-8 w-8 opacity-15" />
              <p className="text-xs">No depots — click sync</p>
            </div>
          ) : (
            filtered.map((depot) => {
              const isPrimary = depot.spoke_depot_id === tenantDepotId;
              const isSel = selected?._id === depot._id;
              return (
                <button
                  key={depot._id}
                  type="button"
                  onClick={() => setSelected(depot)}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors ${isSel ? "border-primary border-r-[3px] bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isPrimary ? "bg-primary/10" : "bg-muted"}`}
                  >
                    <Building2 className={`h-3.5 w-3.5 ${isPrimary ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium text-xs">{depot.name}</span>
                      {isPrimary && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 font-bold text-[8px] text-primary">
                          PRIMARY
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {depot.rt_depot_id && (
                        <code className="text-[9px] text-muted-foreground">{depot.rt_depot_id}</code>
                      )}
                      {depot.tenant_id &&
                        (() => {
                          const t = tenants.find((x) => x.tenant_id === depot.tenant_id);
                          const tName = t?.company_name || t?.contact_name;
                          if (!tName) return null;
                          return <span className="truncate font-medium text-[9px] text-blue-600">{tName}</span>;
                        })()}
                      {!depot.tenant_id && depot.address && (
                        <span className="truncate text-[10px] text-muted-foreground">
                          {depot.city}, {depot.state}
                        </span>
                      )}
                      {!depot.address && <span className="text-[10px] text-amber-500">No address</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${depot.active !== false ? "bg-green-500" : "bg-gray-300"}`}
                    />
                    <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* COL 2 — Map */}
      <div className="flex flex-col overflow-hidden">
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

      {/* COL 3 — Detail */}
      {selected && (
        <div className="flex flex-col overflow-hidden border-l">
          <DetailPanel key={selected._id} depot={selected} onSave={handleSave} drivers={drivers} tenants={tenants} />
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
    </div>
  );
}
