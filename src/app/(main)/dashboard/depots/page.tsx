"use client";

import { useCallback, useEffect, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  RefreshCw,
  Save,
  Truck,
  X,
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

let acTimerRef: ReturnType<typeof setTimeout>;

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
    clearTimeout(acTimerRef);
    setLoading(true);
    acTimerRef = setTimeout(async () => {
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
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            search(e.target.value);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder || "Start typing an address..."}
          className="h-9 text-sm"
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
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted border-b last:border-b-0"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 mt-0.5">
                <MapPin className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.main}</p>
                <p className="truncate text-xs text-muted-foreground">{s.sub}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DepotCard({
  depot,
  isPrimary,
  onSave,
}: {
  depot: Depot;
  isPrimary: boolean;
  onSave: (id: string, data: Partial<Depot>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(isPrimary);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<Partial<Depot>>({ ...depot });
  const set = (k: keyof Depot, v: unknown) => setForm((p) => ({ ...p, [k]: v }));
  const toggleDay = (d: string) => {
    const days = form.working_days || [];
    set("working_days", days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);
  };
  const handleSave = async () => {
    setSaving(true);
    await onSave(depot.spoke_depot_id, form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };
  const hasAddr = !!depot.address;
  const fullAddr = [depot.address, depot.city, [depot.state, depot.zipcode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md ${isPrimary ? "border-primary/30 ring-1 ring-primary/10" : ""}`}
    >
      {isPrimary && <div className="h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-muted/20 transition-colors"
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isPrimary ? "bg-primary/10" : "bg-muted"}`}
        >
          <Building2 className={`h-5 w-5 ${isPrimary ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{depot.name}</span>
            {isPrimary && (
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] h-4">Primary</Badge>
            )}
            {depot.active === false && (
              <Badge variant="secondary" className="text-[10px] h-4">
                Inactive
              </Badge>
            )}
            {depot.rt_depot_id && (
              <Badge variant="outline" className="font-mono text-[10px] h-4 text-muted-foreground">
                {depot.rt_depot_id}
              </Badge>
            )}
            {saved && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100"
              >
                <Check className="h-3 w-3 text-green-600" />
              </motion.span>
            )}
          </div>
          {hasAddr ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{fullAddr}</p>
          ) : (
            <p className="mt-0.5 text-[11px] text-amber-600 font-medium">Warning: No address set — expand to add</p>
          )}
        </div>
        <div className="hidden lg:flex items-center gap-4 text-[11px] text-muted-foreground shrink-0">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {form.start_time || "07:00"}
          </span>
          <span className="flex items-center gap-1">
            <Truck className="h-3 w-3" />
            {form.vehicle_type || "van"}
          </span>
          <span className="flex items-center gap-1">
            <Navigation className="h-3 w-3" />
            {form.avg_speed_mph || 35} mph
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="border-t px-5 pb-6 pt-5 space-y-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    Location
                  </p>
                  <div>
                    <Label className="text-xs mb-1.5 block">Street address</Label>
                    <AddressAutocomplete
                      value={form.address || ""}
                      onChange={(v) => set("address", v)}
                      onSelect={(a) =>
                        setForm((p) => ({ ...p, address: a.address, city: a.city, state: a.state, zipcode: a.zipcode }))
                      }
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs mb-1.5 block">City</Label>
                      <Input
                        value={form.city || ""}
                        onChange={(e) => set("city", e.target.value)}
                        className="h-8 text-xs"
                        placeholder="Coral Springs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">State</Label>
                      <Input
                        value={form.state || ""}
                        onChange={(e) => set("state", e.target.value)}
                        className="h-8 text-xs"
                        maxLength={2}
                        placeholder="FL"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">ZIP</Label>
                      <Input
                        value={form.zipcode || ""}
                        onChange={(e) => set("zipcode", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">End location</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "return", label: "Return to start" },
                        { id: "last_package", label: "Last package" },
                        { id: "custom", label: "Other address" },
                      ].map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => set("end_location", e.id)}
                          className={`rounded-lg border px-2 py-2 text-[10px] font-medium text-center transition-all ${form.end_location === e.id ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
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
                          onSelect={(a) =>
                            set("custom_end_address", [a.address, a.city, a.state].filter(Boolean).join(", "))
                          }
                          placeholder="Search end address..."
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    Schedule
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs mb-1.5 block">Start time</Label>
                      <Input
                        type="time"
                        value={form.start_time || "07:00"}
                        onChange={(e) => set("start_time", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">End time</Label>
                      <Input
                        type="time"
                        value={form.end_time || ""}
                        onChange={(e) => set("end_time", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Timezone</Label>
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
                    <Label className="text-xs mb-1.5 block">Working days</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {DAYS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDay(d)}
                          className={`h-7 w-8 rounded-lg border text-[10px] font-semibold transition-all ${(form.working_days || []).includes(d) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                        >
                          {DAY_L[d]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">
                      Time per stop:{" "}
                      <span className="font-semibold text-foreground">{form.estimated_time_per_stop || 10} min</span>
                    </Label>
                    <input
                      type="range"
                      min="2"
                      max="60"
                      step="1"
                      value={form.estimated_time_per_stop || 10}
                      onChange={(e) => set("estimated_time_per_stop", parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    Route Config
                  </p>
                  <div>
                    <Label className="text-xs mb-1.5 block">Vehicle type</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {VEHS.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => set("vehicle_type", v.id)}
                          className={`flex flex-col items-center gap-1 rounded-xl border py-3 transition-all ${form.vehicle_type === v.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                        >
                          <span className="text-xl">{v.emoji}</span>
                          <span className="text-[10px] font-medium text-muted-foreground">{v.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Side of road</Label>
                    <div className="flex gap-2">
                      {["either", "right", "left"].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => set("side_of_road", s)}
                          className={`flex-1 rounded-lg border py-1.5 text-[10px] font-medium transition-all ${form.side_of_road === s ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                        >
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mt-0 md:mt-[18px]">
                    &nbsp;
                  </p>
                  <div>
                    <Label className="text-xs mb-1.5 block">
                      Avg speed: <span className="font-semibold text-foreground">{form.avg_speed_mph || 35} mph</span>
                    </Label>
                    <input
                      type="range"
                      min="15"
                      max="80"
                      step="5"
                      value={form.avg_speed_mph || 35}
                      onChange={(e) => set("avg_speed_mph", parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Max stops / driver</Label>
                    <Input
                      type="number"
                      value={form.max_stops_per_driver ?? ""}
                      onChange={(e) => set("max_stops_per_driver", e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="Unlimited"
                      className="h-8 text-xs"
                      min={1}
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        RT Depot ID
                      </p>
                      <p className="font-mono text-xs mt-0.5 text-foreground">{depot.rt_depot_id || "—"}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Spoke ID
                      </p>
                      <p className="font-mono text-[10px] mt-0.5 text-muted-foreground truncate">
                        {depot.spoke_depot_id.replace("depots/", "")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2 min-w-32">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function DepotsPage() {
  const [depots, setDepots] = useState<Depot[]>([]);
  const [tenantDepotId, setTenantDepotId] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addSpokeId, setAddSpokeId] = useState("");
  const [addAddr, setAddAddr] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, tr] = await Promise.allSettled([fetch("/api/data/spoke-depots"), fetch("/api/tenants")]);
      if (dr.status === "fulfilled" && dr.value.ok) {
        const d = await dr.value.json();
        setDepots(d.list || []);
      }
      if (tr.status === "fulfilled" && tr.value.ok) {
        const t = await tr.value.json();
        const tenant = (t.list || []).find((x: Record<string, unknown>) => x.tenant_id === 1);
        if (tenant?.spoke_depot_id) setTenantDepotId(tenant.spoke_depot_id);
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
      setSyncMsg(`Synced — ${d.added || 0} added, ${d.updated || 0} updated`);
      await fetchAll();
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
  };

  const handleAddDepot = async () => {
    if (!addName) return;
    setAddSaving(true);
    await fetch("/api/spoke/sync-depots", { method: "POST" });
    await fetch(`/api/data/spoke-depots?id=${encodeURIComponent(addSpokeId || `manual-${Date.now()}`)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addName, spoke_depot_id: addSpokeId || `manual-${Date.now()}`, address: addAddr }),
    });
    setAddSaving(false);
    setAddOpen(false);
    setAddName("");
    setAddSpokeId("");
    setAddAddr("");
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
      <div className="p-6 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    );

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Depots</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {depots.length} depot{depots.length !== 1 ? "s" : ""} · {activeCount} active
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {syncMsg && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-muted-foreground">
              {syncMsg}
            </motion.span>
          )}
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-2">
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync Spoke
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            Add depot
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total depots", value: depots.length, color: "text-foreground" },
          { label: "Active", value: activeCount, color: "text-green-600" },
          { label: "Inactive", value: depots.length - activeCount, color: "text-amber-600" },
          { label: "Missing address", value: noAddr, color: noAddr > 0 ? "text-rose-600" : "text-foreground" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-muted/40 border px-4 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-semibold tabular-nums mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {noAddr > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <MapPin className="h-4 w-4 shrink-0" />
          <span>
            <strong>
              {noAddr} depot{noAddr > 1 ? "s" : ""}
            </strong>{" "}
            missing address — expand to add it. Required for route distance calculations.
          </span>
        </motion.div>
      )}

      <div className="flex items-center gap-2">
        <Input
          placeholder="Search depots..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-9 text-sm"
        />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Building2 className="h-10 w-10 opacity-15" />
            <p className="text-sm">No depots found. Click &quot;Sync Spoke&quot; to import from Circuit.</p>
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              Sync now
            </Button>
          </div>
        ) : (
          filtered.map((depot) => (
            <DepotCard
              key={depot._id}
              depot={depot}
              isPrimary={depot.spoke_depot_id === tenantDepotId}
              onSave={handleSave}
            />
          ))
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add depot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs mb-1.5 block">Depot name *</Label>
              <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="MedFlorida Pharmacy" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Spoke depot ID</Label>
              <Input
                value={addSpokeId}
                onChange={(e) => setAddSpokeId(e.target.value)}
                placeholder="depots/abc123"
                className="font-mono text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">Leave empty to create a manual depot (no Spoke sync)</p>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Address (optional)</Label>
              <Input
                value={addAddr}
                onChange={(e) => setAddAddr(e.target.value)}
                placeholder="12156 West Sample Road, Coral Springs, FL"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddDepot} disabled={!addName || addSaving}>
              {addSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Add depot
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
