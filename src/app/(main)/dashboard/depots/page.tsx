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
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

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
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_L: Record<string, string> = { mon: "Mo", tue: "Tu", wed: "We", thu: "Th", fri: "Fr", sat: "Sa", sun: "Su" };
const VEHS = [
  { id: "car", emoji: "\u{1F697}", label: "Car" },
  { id: "van", emoji: "\u{1F690}", label: "Van" },
  { id: "truck", emoji: "\u{1F69B}", label: "Truck" },
];

let acTimer: ReturnType<typeof setTimeout>;

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
          {suggestions.map((s, i) => (
            <button
              key={i}
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
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const mapReadyRef = useRef(false);

  const placePin = useCallback((address: string, name: string) => {
    if (!mapInstanceRef.current || !window.google?.maps) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const loc = results[0].geometry.location;
        mapInstanceRef.current?.panTo(loc);
        mapInstanceRef.current?.setZoom(14);
        if (markerRef.current) markerRef.current.setMap(null);
        markerRef.current = new window.google.maps.Marker({
          position: loc,
          map: mapInstanceRef.current!,
          title: name,
          icon: {
            path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
            scale: 1.8,
            fillColor: "#2563EB",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2.5,
            anchor: new window.google.maps.Point(12, 22),
          },
        });
      }
    });
  }, []);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !mapRef.current || mapReadyRef.current) return;

    const init = () => {
      if (!mapRef.current || mapReadyRef.current) return;
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        zoom: 10,
        center: { lat: 26.2, lng: -80.25 },
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: window.google.maps.ControlPosition.RIGHT_BOTTOM },
        clickableIcons: false,
        styles: [
          { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "transit", stylers: [{ visibility: "off" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#f4f4f4" }] },
          { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e2e2e2" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#c8e6f5" }] },
          { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f8f9fa" }] },
        ],
      });
      mapReadyRef.current = true;
      if (depot?.address) {
        const full = [depot.address, depot.city, depot.state, depot.zipcode].filter(Boolean).join(", ");
        placePin(full, depot.name);
      }
    };

    if (window.google?.maps) {
      init();
      return;
    }
    if (!document.getElementById("gmap-script")) {
      const s = document.createElement("script");
      s.id = "gmap-script";
      s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      s.async = true;
      s.defer = true;
      s.onload = init;
      document.head.appendChild(s);
    } else {
      const iv = setInterval(() => {
        if (window.google?.maps) {
          clearInterval(iv);
          init();
        }
      }, 100);
      return () => clearInterval(iv);
    }
  }, [depot.zipcode, depot?.address, placePin, depot.state, depot.name, depot.city]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapReadyRef.current || !depot) return;
    if (depot.address) {
      const full = [depot.address, depot.city, depot.state, depot.zipcode].filter(Boolean).join(", ");
      placePin(full, depot.name);
    } else {
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      mapInstanceRef.current?.setCenter({ lat: 26.2, lng: -80.25 });
      mapInstanceRef.current?.setZoom(10);
    }
  }, [depot, placePin]);

  return <div ref={mapRef} className="absolute inset-0" />;
}

function DetailPanel({ depot, onSave }: { depot: Depot; onSave: (id: string, data: Partial<Depot>) => Promise<void> }) {
  const [form, setForm] = useState<Partial<Depot>>({ ...depot });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof Depot, v: unknown) => setForm((p) => ({ ...p, [k]: v }));
  const toggleDay = (d: string) => {
    const days = form.working_days || [];
    set("working_days", days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);
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

  const Sec = ({ label }: { label: string }) => (
    <p className="mt-4 mb-2 font-semibold text-[10px] text-muted-foreground/60 uppercase tracking-widest first:mt-0">
      {label}
    </p>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-sm">{depot.name}</p>
            {depot.active !== false ? (
              <Badge variant="outline" className="h-4 border-green-200 bg-green-50 text-[9px] text-green-700">
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="h-4 text-[9px] text-muted-foreground">
                Inactive
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {depot.rt_depot_id && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {depot.rt_depot_id}
              </span>
            )}
            {depot.synced_at && (
              <span className="text-[10px] text-muted-foreground">
                Synced {new Date(depot.synced_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <Sec label="Location" />
        <div className="space-y-2">
          <div>
            <Label className="mb-1 block text-[10px] text-muted-foreground">Street address</Label>
            <AddressAutocomplete
              value={form.address || ""}
              onChange={(v) => set("address", v)}
              onSelect={(a) =>
                setForm((p) => ({ ...p, address: a.address, city: a.city, state: a.state, zipcode: a.zipcode }))
              }
            />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <Label className="mb-1 block text-[10px] text-muted-foreground">City</Label>
              <Input
                value={form.city || ""}
                onChange={(e) => set("city", e.target.value)}
                className="h-8 text-xs"
                placeholder="Coral Springs"
              />
            </div>
            <div>
              <Label className="mb-1 block text-[10px] text-muted-foreground">State</Label>
              <Input
                value={form.state || ""}
                onChange={(e) => set("state", e.target.value)}
                className="h-8 text-xs"
                maxLength={2}
                placeholder="FL"
              />
            </div>
            <div>
              <Label className="mb-1 block text-[10px] text-muted-foreground">ZIP</Label>
              <Input
                value={form.zipcode || ""}
                onChange={(e) => set("zipcode", e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-[10px] text-muted-foreground">End location</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: "return", label: "Return to start" },
                { id: "last_package", label: "Last package" },
                { id: "custom", label: "Other address" },
              ].map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => set("end_location", e.id)}
                  className={`rounded-lg border px-2 py-1.5 text-center font-medium text-[10px] transition-all ${form.end_location === e.id ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                >
                  {e.label}
                </button>
              ))}
            </div>
            {form.end_location === "custom" && (
              <div className="mt-1.5">
                <AddressAutocomplete
                  value={form.custom_end_address || ""}
                  onChange={(v) => set("custom_end_address", v)}
                  onSelect={(a) => set("custom_end_address", [a.address, a.city, a.state].filter(Boolean).join(", "))}
                  placeholder="Search end address..."
                />
              </div>
            )}
          </div>
        </div>

        <Sec label="Schedule" />
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <Label className="mb-1 block text-[10px] text-muted-foreground">Start time</Label>
              <Input
                type="time"
                value={form.start_time || "07:00"}
                onChange={(e) => set("start_time", e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="mb-1 block text-[10px] text-muted-foreground">End time</Label>
              <Input
                type="time"
                value={form.end_time || ""}
                onChange={(e) => set("end_time", e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-[10px] text-muted-foreground">Timezone</Label>
            <Select value={form.timezone || "America/New_York"} onValueChange={(v) => set("timezone", v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/New_York">Eastern (ET)</SelectItem>
                <SelectItem value="America/Chicago">Central (CT)</SelectItem>
                <SelectItem value="America/Denver">Mountain (MT)</SelectItem>
                <SelectItem value="America/Los_Angeles">Pacific (PT)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-[10px] text-muted-foreground">Working days</Label>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`h-7 w-8 rounded-lg border font-semibold text-[10px] transition-all ${(form.working_days || []).includes(d) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
                >
                  {DAY_L[d]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-[10px] text-muted-foreground">
              Time per stop:{" "}
              <span className="font-semibold text-foreground">{form.estimated_time_per_stop || 10} min</span>
            </Label>
            <input
              type="range"
              min="2"
              max="60"
              step="1"
              value={form.estimated_time_per_stop || 10}
              onChange={(e) => set("estimated_time_per_stop", parseInt(e.target.value, 10))}
              className="h-1.5 w-full accent-primary"
            />
          </div>
        </div>

        <Sec label="Route Config" />
        <div className="space-y-2">
          <div>
            <Label className="mb-1 block text-[10px] text-muted-foreground">Vehicle type</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {VEHS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => set("vehicle_type", v.id)}
                  className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 transition-all ${form.vehicle_type === v.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                >
                  <span className="text-lg">{v.emoji}</span>
                  <span className="font-medium text-[10px] text-muted-foreground">{v.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-[10px] text-muted-foreground">Side of road</Label>
            <div className="flex gap-1.5">
              {["either", "right", "left"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("side_of_road", s)}
                  className={`flex-1 rounded-lg border py-1.5 font-medium text-[10px] transition-all ${form.side_of_road === s ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-[10px] text-muted-foreground">
              Avg speed: <span className="font-semibold text-foreground">{form.avg_speed_mph || 35} mph</span>
            </Label>
            <input
              type="range"
              min="15"
              max="80"
              step="5"
              value={form.avg_speed_mph || 35}
              onChange={(e) => set("avg_speed_mph", parseInt(e.target.value, 10))}
              className="h-1.5 w-full accent-primary"
            />
          </div>
          <div>
            <Label className="mb-1 block text-[10px] text-muted-foreground">Max stops / driver</Label>
            <Input
              type="number"
              value={form.max_stops_per_driver ?? ""}
              onChange={(e) => set("max_stops_per_driver", e.target.value ? parseInt(e.target.value, 10) : null)}
              placeholder="Unlimited"
              className="h-8 text-xs"
              min={1}
            />
          </div>
        </div>

        <Sec label="IDs" />
        <div className="space-y-1.5 rounded-xl border bg-muted/40 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">RT Depot ID</span>
            <span className="font-mono font-semibold text-xs">{depot.rt_depot_id || "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Spoke ID</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {depot.spoke_depot_id.replace("depots/", "")}
            </span>
          </div>
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

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, tr] = await Promise.allSettled([fetch("/api/data/spoke-depots"), fetch("/api/tenants")]);
      if (dr.status === "fulfilled" && dr.value.ok) {
        const d = await dr.value.json();
        const list: Depot[] = d.list || [];
        setDepots(list);
        if (!selected && list.length > 0) setSelected(list[0]);
      }
      if (tr.status === "fulfilled" && tr.value.ok) {
        const t = await tr.value.json();
        const tenant = (t.list || []).find((x: Record<string, unknown>) => x.tenant_id === 1);
        if (tenant?.spoke_depot_id) setTenantDepotId(tenant.spoke_depot_id);
      }
    } finally {
      setLoading(false);
    }
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

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
    await fetchAll();
    setSelected((prev) => (prev?.spoke_depot_id === spokeId ? ({ ...prev, ...data } as Depot) : prev));
  };

  const handleAddDepot = async () => {
    if (!addName) return;
    setAddSaving(true);
    await fetch(`/api/data/spoke-depots?id=${encodeURIComponent(addSpokeId || `manual-${Date.now()}`)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addName, spoke_depot_id: addSpokeId || `manual-${Date.now()}` }),
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

  if (loading)
    return (
      <div className="flex h-[calc(100vh-5rem)] gap-0">
        <div className="w-[280px] shrink-0 space-y-2 border-r p-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
        <Skeleton className="m-3 flex-1 rounded-xl" />
        <div className="w-[300px] shrink-0 space-y-2 border-l p-3">
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
        gridTemplateColumns: selected ? "280px 1fr 300px" : "280px 1fr",
        gridTemplateRows: "1fr",
      }}
    >
      {/* COL 1 — Depot List */}
      <div className="flex flex-col overflow-hidden border-r">
        {/* Header */}
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

        {/* Stats */}
        <div className="grid grid-cols-4 border-b">
          {[
            { label: "Total", value: depots.length, color: "text-foreground" },
            { label: "Active", value: activeCount, color: "text-green-600" },
            { label: "Inactive", value: depots.length - activeCount, color: "text-amber-600" },
            { label: "No addr", value: noAddr, color: noAddr > 0 ? "text-rose-600" : "text-muted-foreground" },
          ].map((s) => (
            <div key={s.label} className="border-r px-2 py-2 text-center last:border-r-0">
              <p className={`font-semibold text-base tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Sync message */}
        {syncMsg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="border-b bg-green-50 px-3 py-1.5 font-medium text-[10px] text-green-700"
          >
            Synced — {syncMsg}
          </motion.div>
        )}

        {/* Search */}
        <div className="border-b px-3 py-2">
          <Input
            placeholder="Search depots..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
          />
        </div>

        {/* Warning */}
        {noAddr > 0 && (
          <div className="flex items-center gap-1.5 border-b bg-amber-50 px-3 py-2 text-[10px] text-amber-700">
            <MapPin className="h-3 w-3 shrink-0" />
            <span>
              <strong>{noAddr}</strong> depot{noAddr > 1 ? "s" : ""} missing address
            </span>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-12 text-muted-foreground">
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
                  className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${isSel ? "border-primary border-r-2 bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isPrimary ? "bg-primary/10" : "bg-muted"}`}
                  >
                    <Building2 className={`h-4 w-4 ${isPrimary ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-xs">{depot.name}</span>
                      {isPrimary && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-[9px] text-primary">
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      {depot.rt_depot_id && (
                        <span className="font-mono text-[9px] text-muted-foreground">{depot.rt_depot_id}</span>
                      )}
                      {depot.address ? (
                        <span className="truncate text-[10px] text-muted-foreground">
                          {depot.city}, {depot.state}
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-600">No address</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${depot.active !== false ? "bg-green-500" : "bg-gray-300"}`}
                    />
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
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
                ? "No address set — add one in the detail panel"
                : "Select a depot"}
          </span>
          {selected && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
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

      {/* COL 3 — Detail panel */}
      {selected && (
        <div className="flex flex-col overflow-hidden border-l">
          <DetailPanel key={selected._id} depot={selected} onSave={handleSave} />
        </div>
      )}

      {/* Add depot dialog */}
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
              <p className="mt-1 text-[10px] text-muted-foreground">Leave empty for a manual depot (no Spoke sync)</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddDepot} disabled={!addName || addSaving}>
              {addSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Add depot
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
