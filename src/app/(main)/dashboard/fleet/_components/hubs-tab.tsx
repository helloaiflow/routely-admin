"use client";

import { useEffect, useMemo, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  CircleCheck,
  Clock,
  Loader2,
  Map as MapIcon,
  MapPin,
  Pencil,
  Plus,
  Repeat,
  Search,
  Star,
  X,
} from "lucide-react";

import {
  AddressAutocomplete,
  type PlaceDetails,
} from "@/components/ui/address-autocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { FleetRouteMap } from "./fleet-route-map";

type Address = { line1?: string; city?: string; state?: string; zip?: string };

type RouteDefaults = {
  start_time?: string;
  start_address?: Address;
  default_time_at_stop?: number;
  end_address?: Address;
  end_time?: string;
  max_stops?: number;
  round_trip?: boolean;
};

type Hub = {
  id: string;
  tenant_id: number;
  name: string;
  address: Address | null;
  geo: { lat?: number; lng?: number } | null;
  timezone: string;
  is_default: boolean;
  external_circuit_id: string | null;
  route_defaults?: RouteDefaults | null;
  created_at?: string;
  updated_at?: string;
};

type FormState = {
  name: string;
  // Start From — the hub origin. Maps to payload.address + payload.geo.
  startValue: string; // display string in the autocomplete
  startSelected: boolean; // a real place has been chosen
  line1: string;
  city: string;
  state: string;
  zip: string;
  lat: string;
  lng: string;
  timezone: string;
  is_default: boolean;
  // Route defaults
  rdStartTime: string;
  rdEndTime: string;
  rdMinutesPerStop: string; // minutes in the UI, stored ×60 as seconds
  rdMaxStops: string;
  rdRoundTrip: boolean;
  // End To — route_defaults.end_address (only when not round-trip).
  endValue: string;
  endSelected: boolean;
  rdEndLine1: string;
  rdEndCity: string;
  rdEndState: string;
  rdEndZip: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  startValue: "",
  startSelected: false,
  line1: "",
  city: "",
  state: "",
  zip: "",
  lat: "",
  lng: "",
  timezone: "America/New_York",
  is_default: false,
  rdStartTime: "",
  rdEndTime: "",
  rdMinutesPerStop: "",
  rdMaxStops: "",
  rdRoundTrip: false,
  endValue: "",
  endSelected: false,
  rdEndLine1: "",
  rdEndCity: "",
  rdEndState: "",
  rdEndZip: "",
};

// Common US timezones for the compact picker (default America/New_York).
const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
];

// Human-readable one-line address for the list.
function addressLine(hub: Hub): string {
  const a = hub.address ?? {};
  const cityLine = [a.city, a.state, a.zip].filter(Boolean).join(", ").replace(/, (\d)/, " $1");
  return [a.line1, cityLine].filter(Boolean).join(" · ");
}

// Joined address string used to pre-fill the autocomplete display value on edit.
function formatAddr(a?: Address | null): string {
  if (!a) return "";
  return [a.line1, a.city, a.state, a.zip].filter(Boolean).join(", ");
}

function hasAddr(a?: Address | null): boolean {
  return Boolean(a && (a.line1 || a.city || a.state || a.zip));
}

// Full one-line address string for map queries: "line1, City, ST zip".
function fullAddress(a?: Address | null): string {
  if (!a) return "";
  const cityState = [a.city, a.state].filter(Boolean).join(", ");
  const tail = [cityState, a.zip].filter(Boolean).join(" ").trim();
  return [a.line1, tail].filter(Boolean).join(", ");
}

// Derive the list/table display values from a hub's route defaults.
function routeCells(rd?: RouteDefaults | null) {
  return {
    start: rd?.start_time || "—",
    end: rd?.end_time || "—",
    maxStops: rd?.max_stops != null && rd.max_stops > 0 ? String(rd.max_stops) : rd ? "∞" : "—",
    minPerStop:
      rd?.default_time_at_stop != null ? `${Math.round(rd.default_time_at_stop / 60)}m` : "—",
    roundtrip: Boolean(rd?.round_trip),
  };
}

// Build an Address from four inputs, or undefined when they're all empty.
function buildAddress(line1: string, city: string, state: string, zip: string): Address | undefined {
  const addr: Address = {
    line1: line1.trim() || undefined,
    city: city.trim() || undefined,
    state: state.trim() || undefined,
    zip: zip.trim() || undefined,
  };
  return Object.values(addr).some(Boolean) ? addr : undefined;
}

export function HubsTab() {
  const [hubs, setHubs] = useState<Hub[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Hub | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);

  // List toolbar state
  const [query, setQuery] = useState("");
  const [rtFilter, setRtFilter] = useState<"all" | "roundtrip" | "oneway">("all");

  // Selected hub → drives the center detail panel + the right map column.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Resilient load: on a transient failure at mount, retry once after a short
  // delay before surfacing the error (keeps the list from getting stuck empty).
  function load(retry = true) {
    setLoadError(false);
    fetch("/api/client/hubs")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setHubs((d.hubs ?? []) as Hub[]))
      .catch(() => {
        if (retry) {
          setTimeout(() => load(false), 1200);
          return;
        }
        setHubs([]);
        setLoadError(true);
      });
  }

  useEffect(() => {
    load();
  }, []);

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, is_default: (hubs ?? []).length === 0 });
    setError("");
    setAttempted(false);
    setFormOpen(true);
  }

  function openEdit(hub: Hub) {
    setEditing(hub);
    const rd = hub.route_defaults ?? {};
    setForm({
      name: hub.name ?? "",
      startValue: formatAddr(hub.address),
      startSelected: hasAddr(hub.address),
      line1: hub.address?.line1 ?? "",
      city: hub.address?.city ?? "",
      state: hub.address?.state ?? "",
      zip: hub.address?.zip ?? "",
      lat: hub.geo?.lat != null ? String(hub.geo.lat) : "",
      lng: hub.geo?.lng != null ? String(hub.geo.lng) : "",
      timezone: hub.timezone || "America/New_York",
      is_default: Boolean(hub.is_default),
      rdStartTime: rd.start_time ?? "",
      rdEndTime: rd.end_time ?? "",
      rdMinutesPerStop:
        rd.default_time_at_stop != null ? String(Math.round(rd.default_time_at_stop / 60)) : "",
      rdMaxStops: rd.max_stops != null ? String(rd.max_stops) : "",
      rdRoundTrip: Boolean(rd.round_trip),
      endValue: formatAddr(rd.end_address),
      endSelected: hasAddr(rd.end_address),
      rdEndLine1: rd.end_address?.line1 ?? "",
      rdEndCity: rd.end_address?.city ?? "",
      rdEndState: rd.end_address?.state ?? "",
      rdEndZip: rd.end_address?.zip ?? "",
    });
    setError("");
    setAttempted(false);
    setFormOpen(true);
  }

  // ── Start From handlers ──
  function onStartPlace(d: PlaceDetails) {
    setForm((f) => ({
      ...f,
      startValue: d.formatted_address || d.street || f.startValue,
      line1: d.street ?? "",
      city: d.city ?? "",
      state: d.state ?? "",
      zip: d.zip ?? "",
      lat: d.lat != null ? String(d.lat) : "",
      lng: d.lng != null ? String(d.lng) : "",
      startSelected: true,
    }));
  }
  function clearStart() {
    setForm((f) => ({
      ...f,
      startValue: "",
      line1: "",
      city: "",
      state: "",
      zip: "",
      lat: "",
      lng: "",
      startSelected: false,
    }));
  }

  // ── End To handlers ──
  function onEndPlace(d: PlaceDetails) {
    setForm((f) => ({
      ...f,
      endValue: d.formatted_address || d.street || f.endValue,
      rdEndLine1: d.street ?? "",
      rdEndCity: d.city ?? "",
      rdEndState: d.state ?? "",
      rdEndZip: d.zip ?? "",
      endSelected: true,
    }));
  }
  function clearEnd() {
    setForm((f) => ({
      ...f,
      endValue: "",
      rdEndLine1: "",
      rdEndCity: "",
      rdEndState: "",
      rdEndZip: "",
      endSelected: false,
    }));
  }

  async function submit() {
    setAttempted(true);
    if (!form.name.trim()) {
      setError("Hub name is required.");
      return;
    }
    const lat = form.lat.trim() ? Number(form.lat) : undefined;
    const lng = form.lng.trim() ? Number(form.lng) : undefined;

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      address: {
        line1: form.line1.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        zip: form.zip.trim() || undefined,
      },
      timezone: form.timezone.trim() || "America/New_York",
      is_default: form.is_default,
    };
    if ((lat != null && !Number.isNaN(lat)) || (lng != null && !Number.isNaN(lng))) {
      payload.geo = {
        lat: lat != null && !Number.isNaN(lat) ? lat : undefined,
        lng: lng != null && !Number.isNaN(lng) ? lng : undefined,
      };
    }

    // Route defaults — include only the fields the user filled in. start_address
    // is intentionally omitted (it defaults to the hub address).
    const routeDefaults: RouteDefaults = {};
    if (form.rdStartTime.trim()) routeDefaults.start_time = form.rdStartTime.trim();
    if (form.rdMinutesPerStop.trim()) {
      const minutes = Number(form.rdMinutesPerStop);
      if (!Number.isNaN(minutes)) routeDefaults.default_time_at_stop = Math.round(minutes * 60);
    }
    if (form.rdEndTime.trim()) routeDefaults.end_time = form.rdEndTime.trim();
    if (form.rdMaxStops.trim()) {
      const maxStops = Number(form.rdMaxStops);
      if (!Number.isNaN(maxStops) && maxStops > 0) routeDefaults.max_stops = Math.round(maxStops);
    }
    if (form.rdRoundTrip) {
      routeDefaults.round_trip = true;
    } else {
      const endAddress = buildAddress(form.rdEndLine1, form.rdEndCity, form.rdEndState, form.rdEndZip);
      if (endAddress) routeDefaults.end_address = endAddress;
    }
    payload.route_defaults = routeDefaults;

    setSaving(true);
    setError("");
    const url = editing ? `/api/client/hubs/${encodeURIComponent(editing.id)}` : "/api/client/hubs";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {};
      setError(j.error || "Could not save the hub. The fleet service may be unavailable — try again shortly.");
      return;
    }
    setFormOpen(false);
    load();
  }

  // Client hint only — the server does the real validation.
  const endBeforeStart =
    Boolean(form.rdStartTime && form.rdEndTime) && form.rdEndTime <= form.rdStartTime;
  const nameError = attempted && !form.name.trim();

  // Filter the list (Stops-style — the left column scrolls the full result set).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (hubs ?? []).filter((hub) => {
      const rt = Boolean(hub.route_defaults?.round_trip);
      if (rtFilter === "roundtrip" && !rt) return false;
      if (rtFilter === "oneway" && rt) return false;
      if (!q) return true;
      return (
        (hub.name ?? "").toLowerCase().includes(q) ||
        addressLine(hub).toLowerCase().includes(q)
      );
    });
  }, [hubs, query, rtFilter]);

  // Resolve the currently selected hub from the loaded list (stays in sync on reload).
  const selectedHub = selectedId ? (hubs ?? []).find((h) => h.id === selectedId) ?? null : null;

  // ── Add/Edit form dialog (shared by New + Edit) ──
  const formDialog = (
    <Dialog open={formOpen} onOpenChange={setFormOpen}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-[600px]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{editing ? "Edit hub" : "New hub"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update this dispatch origin." : "Add a depot where routes start and end."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto px-5 py-5">
          {/* ── Location ── */}
          <section className="space-y-4">
              <div className="flex items-center gap-2">
                <MapPin className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <h4 className="font-semibold text-sm">Location</h4>
              </div>
              <Separator />

              <Field label="Hub name" required error={nameError ? "Hub name is required." : undefined}>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Central FL Depot"
                  aria-invalid={nameError || undefined}
                  className="h-9"
                />
              </Field>

              <Field label="Start From" hint="Where the route starts — the hub's origin.">
                <AddressField
                  value={form.startValue}
                  selected={form.startSelected}
                  placeholder="Search start address…"
                  onChange={(v) => setForm((f) => ({ ...f, startValue: v, startSelected: false }))}
                  onPlaceDetails={onStartPlace}
                  onClear={clearStart}
                />
              </Field>

              {!form.rdRoundTrip && (
                <Field label="End To" hint="Where the route ends.">
                  <AddressField
                    value={form.endValue}
                    selected={form.endSelected}
                    placeholder="Search end address…"
                    onChange={(v) => setForm((f) => ({ ...f, endValue: v, endSelected: false }))}
                    onPlaceDetails={onEndPlace}
                    onClear={clearEnd}
                  />
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Timezone">
                  <Select
                    value={form.timezone}
                    onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Default hub">
                  <div className="flex h-9 items-center justify-between rounded-lg border px-3">
                    <span className="text-muted-foreground text-xs">Use when unspecified</span>
                    <Switch
                      checked={form.is_default}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))}
                    />
                  </div>
                </Field>
              </div>
            </section>

            {/* ── Route defaults ── */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <h4 className="font-semibold text-sm">Route defaults</h4>
              </div>
              <p className="-mt-2 text-muted-foreground text-xs">
                Defaults a route inherits from this hub — overridable per route.
              </p>
              <Separator />

              <div className="grid grid-cols-2 gap-3">
                <Field label="Start time">
                  <Input
                    type="time"
                    value={form.rdStartTime}
                    onChange={(e) => setForm((f) => ({ ...f, rdStartTime: e.target.value }))}
                    placeholder="07:00"
                    className="h-9 font-mono tabular-nums"
                  />
                </Field>
                <Field label="End time">
                  <Input
                    type="time"
                    value={form.rdEndTime}
                    onChange={(e) => setForm((f) => ({ ...f, rdEndTime: e.target.value }))}
                    placeholder="HH:MM"
                    className="h-9 font-mono tabular-nums"
                  />
                </Field>
              </div>
              {endBeforeStart && (
                <p className="text-amber-600 text-xs dark:text-amber-500">
                  End time is at or before the start time — the route may not fit in the day.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Minutes per stop">
                  <Input
                    type="number"
                    min={0}
                    value={form.rdMinutesPerStop}
                    onChange={(e) => setForm((f) => ({ ...f, rdMinutesPerStop: e.target.value }))}
                    placeholder="5"
                    inputMode="numeric"
                    className="h-9 tabular-nums"
                  />
                </Field>
                <Field label="Max stops">
                  <Input
                    type="number"
                    min={0}
                    value={form.rdMaxStops}
                    onChange={(e) => setForm((f) => ({ ...f, rdMaxStops: e.target.value }))}
                    placeholder="0 = unlimited"
                    inputMode="numeric"
                    className="h-9 tabular-nums"
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between rounded-lg border px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <Repeat className="size-4 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-sm">Round-trip</p>
                    <p className="text-muted-foreground text-xs">Route ends where it starts.</p>
                  </div>
                </div>
                <Switch
                  checked={form.rdRoundTrip}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, rdRoundTrip: v }))}
                />
              </div>
            </section>

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <DialogFooter className="border-t px-5 py-3">
          <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />}
            {editing ? "Save changes" : "Create hub"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ══ Full-bleed 3-pane shell — a literal clone of /dashboard/stops ══
  return (
    <div
      className="flex h-full overflow-hidden"
      style={{
        backgroundColor: "hsl(var(--muted) / 0.4)",
        backgroundImage: "radial-gradient(hsl(var(--border)) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      {formDialog}

      {/* ═══ LEFT COLUMN — the list ═══ */}
      <div className="flex h-full w-full min-w-0 flex-col overflow-hidden border-border/50 bg-card shadow-[inset_-1px_0_0_0_hsl(var(--border)/0.6)] lg:w-[360px] lg:shrink-0 lg:border-r">
        {/* Toolbar */}
        <div className="shrink-0 space-y-2 border-b border-border/50 bg-card px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-2.5 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 dark:bg-input/30">
              <Search className="size-3.5 shrink-0 text-muted-foreground/40" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search hubs…"
                aria-label="Search hubs"
                className="h-full w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/40"
              />
            </div>
            <Button size="sm" className="h-9 shrink-0" onClick={openAdd}>
              <Plus className="mr-1 size-4" aria-hidden="true" /> New
            </Button>
          </div>
          <Select
            value={rtFilter}
            onValueChange={(v) => setRtFilter(v as "all" | "roundtrip" | "oneway")}
          >
            <SelectTrigger
              size="sm"
              className="h-8 w-full border-border/60 bg-background text-[13px]"
              aria-label="Filter by roundtrip"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All hubs</SelectItem>
              <SelectItem value="roundtrip">Roundtrip only</SelectItem>
              <SelectItem value="oneway">One-way only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List — independent scroll */}
        <div className="flex-1 overflow-y-auto">
          {!hubs ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={`hub-${i}`} className="h-14 w-full" />
              ))}
            </div>
          ) : hubs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                <Building2 className="size-6" aria-hidden="true" />
              </span>
              <p className="font-medium text-sm">{loadError ? "Couldn't load hubs" : "No hubs yet"}</p>
              <p className="max-w-xs text-muted-foreground text-xs">
                {loadError
                  ? "There was a problem reaching the fleet service. Try again."
                  : "Add the depots where Routely drivers start and finish their routes."}
              </p>
              {loadError ? (
                <Button size="sm" variant="outline" className="mt-2 h-9" onClick={() => load()}>
                  Retry
                </Button>
              ) : (
                <Button size="sm" className="mt-2 h-9" onClick={openAdd}>
                  <Plus className="mr-1.5 size-4" aria-hidden="true" /> Add your first hub
                </Button>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-muted-foreground text-[13px]">
              No hubs match those filters.
            </p>
          ) : (
            <div>
              {filtered.map((hub) => (
                <HubRow
                  key={hub.id}
                  hub={hub}
                  selected={selectedId === hub.id}
                  onSelect={() => setSelectedId(hub.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ CENTER COLUMN — detail panel (desktop) ═══ */}
      <div className="hidden h-full flex-col overflow-hidden border-border/50 bg-card lg:flex lg:w-[440px] lg:shrink-0 lg:border-r">
        {selectedHub ? (
          <HubDetailPanel
            hub={selectedHub}
            onClose={() => setSelectedId(null)}
            onEdit={() => openEdit(selectedHub)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-muted/15 px-8 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border">
              <Building2 className="size-7 text-muted-foreground/30" aria-hidden="true" />
            </div>
            <p className="font-bold text-sm text-foreground">No hub selected</p>
            <p className="mt-1.5 max-w-[200px] text-muted-foreground text-xs leading-relaxed">
              Click a hub from the list to view details
            </p>
          </div>
        )}
      </div>

      {/* ═══ MAP COLUMN — persistent (desktop, flex-1) ═══ */}
      <div className="hidden overflow-hidden bg-muted/20 lg:block lg:flex-1">
        <HubMapPanel hub={selectedHub} />
      </div>

      {/* ═══ MOBILE — full-screen overlay: detail + map stacked ═══ */}
      <AnimatePresence>
        {selectedHub && (
          <motion.div
            key={selectedHub.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-background lg:hidden"
          >
            <HubDetailPanel
              hub={selectedHub}
              onClose={() => setSelectedId(null)}
              onEdit={() => openEdit(selectedHub)}
            />
            <div className="h-72 shrink-0 overflow-hidden border-border/50 border-t">
              <HubMapPanel hub={selectedHub} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Compact list row (Stops-density) ──────────────────────────────────────────
function HubRow({
  hub,
  selected,
  onSelect,
}: {
  hub: Hub;
  selected: boolean;
  onSelect: () => void;
}) {
  const c = routeCells(hub.route_defaults);
  const addr = addressLine(hub);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 border-border/20 border-b border-l-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/30",
        selected ? "border-l-primary bg-primary/5" : "border-l-transparent",
      )}
    >
      <span
        className={
          hub.is_default
            ? "grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"
            : "grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
        }
      >
        <Building2 className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium text-[13px]">{hub.name}</span>
          {hub.is_default && (
            <Badge variant="outline" className="gap-1 bg-primary/10 text-primary">
              <Star className="size-3" aria-hidden="true" /> Default
            </Badge>
          )}
        </span>
        {addr && (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{addr}</span>
        )}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          <span className="font-mono tabular-nums">
            {c.start}–{c.end}
          </span>
          <span>·</span>
          <span className="font-mono tabular-nums">max {c.maxStops}</span>
          {c.roundtrip && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Repeat className="size-3" aria-hidden="true" /> roundtrip
              </span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}

// ── Persistent map panel — empty state when nothing selected ──────────────────
function HubMapPanel({ hub }: { hub: Hub | null }) {
  if (!hub) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-muted/30">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border/60">
          <MapIcon className="size-7 text-muted-foreground/50" aria-hidden="true" />
        </div>
        <div className="text-center">
          <p className="font-bold text-[13px] text-foreground/70">Fleet map</p>
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
            Select a hub to see
            <br />
            it on the map
          </p>
        </div>
      </div>
    );
  }
  const addr = fullAddress(hub.address);
  return <FleetRouteMap singlePoint destinationAddr={addr} destinationName={hub.name} />;
}

// A read-only label/value row for the detail panel.
function DetailRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className="flex items-start justify-between gap-4 border-border/[0.12] border-b py-2 last:border-0">
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      <span className={cn("min-w-0 text-right text-foreground text-xs", mono && "font-mono tabular-nums")}>
        {value}
      </span>
    </div>
  );
}

// ── Hub detail panel: read-only info + Edit (map lives in its own column) ──
function HubDetailPanel({
  hub,
  onClose,
  onEdit,
}: {
  hub: Hub;
  onClose: () => void;
  onEdit: () => void;
}) {
  const addr = fullAddress(hub.address);
  const rd = hub.route_defaults ?? {};
  const c = routeCells(hub.route_defaults);

  return (
    <div className="flex min-h-full flex-col bg-card lg:min-h-0">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-border/50 border-b bg-card/95 px-4 py-2.5 backdrop-blur-sm">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to list"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <ArrowLeft className="size-4 lg:hidden" aria-hidden="true" />
          <X className="hidden size-4 lg:block" aria-hidden="true" />
        </button>
        <span className="text-muted-foreground/60 text-xs">Hub details</span>
        <Button size="sm" className="ml-auto h-8" onClick={onEdit}>
          <Pencil className="mr-1.5 size-3.5" aria-hidden="true" /> Edit
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Title + default badge */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={
                hub.is_default
                  ? "grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"
                  : "grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
              }
            >
              <Building2 className="size-4" aria-hidden="true" />
            </span>
            <h4 className="type-card-title">{hub.name}</h4>
            {hub.is_default && (
              <Badge variant="outline" className="gap-1 bg-primary/10 text-primary">
                <Star className="size-3" aria-hidden="true" /> Default
              </Badge>
            )}
          </div>
          {addr && <p className="type-desc pl-10">{addr}</p>}
        </div>

        {/* Read rows */}
        <div className="rounded-xl border border-border/60 bg-card px-3 py-1">
          <DetailRow label="Address" value={addr || "—"} />
          <DetailRow label="Timezone" value={hub.timezone || "—"} />
          <DetailRow label="Start time" value={c.start} mono />
          <DetailRow label="End time" value={c.end} mono />
          <DetailRow label="Min per stop" value={c.minPerStop} mono />
          <DetailRow label="Max stops" value={c.maxStops} mono />
          <DetailRow label="Round-trip" value={rd.round_trip ? "Yes" : "No"} />
          <DetailRow label="Hub ID" value={hub.id} mono />
        </div>
      </div>
    </div>
  );
}

// Stops-styled address input: emerald border + check when a place is chosen,
// with a clear button. Wraps the shared AddressAutocomplete (borderless inside).
function AddressField({
  value,
  selected,
  placeholder,
  onChange,
  onPlaceDetails,
  onClear,
}: {
  value: string;
  selected: boolean;
  placeholder: string;
  onChange: (v: string) => void;
  onPlaceDetails: (d: PlaceDetails) => void;
  onClear: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15",
        selected ? "border-emerald-400 bg-emerald-50/30" : "border-input",
      )}
    >
      <div className="relative flex items-center">
        <AddressAutocomplete
          value={value}
          onChange={onChange}
          onPlaceDetails={onPlaceDetails}
          placeholder={placeholder}
          className="h-9 border-0 bg-transparent pr-16 text-sm focus-visible:border-0 focus-visible:ring-0"
        />
        <div className="pointer-events-none absolute right-2.5 flex items-center gap-1.5">
          {selected && <CircleCheck className="size-3.5 shrink-0 text-emerald-500" aria-hidden="true" />}
          {value && (
            <button
              type="button"
              aria-label="Clear address"
              onClick={onClear}
              className="pointer-events-auto text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-medium text-sm">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
