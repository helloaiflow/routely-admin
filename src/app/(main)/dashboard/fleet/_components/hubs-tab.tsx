"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Loader2,
  MapPin,
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
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

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

const PAGE_SIZE = 25;

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
  const [page, setPage] = useState(0);

  function load() {
    setLoadError(false);
    fetch("/api/client/hubs")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setHubs((d.hubs ?? []) as Hub[]))
      .catch(() => {
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

  const resetPage = () => setPage(0);

  // Filter + paginate the list (Labels grid pattern).
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

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

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

  // ── List view: Labels-style grid card ──
  return (
    <div className="space-y-5">
      {formDialog}
      {/* Header + add */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg tracking-tight">Hubs</h3>
          <p className="text-muted-foreground text-sm">Dispatch origins where routes begin and end.</p>
        </div>
        <Button size="sm" className="h-9" onClick={openAdd}>
          <Plus className="mr-1.5 size-4" aria-hidden="true" /> New hub
        </Button>
      </div>

      {/* List */}
      {!hubs ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={`hub-${i}`} className="h-14 w-full" />
          ))}
        </div>
      ) : hubs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Building2 className="size-6" aria-hidden="true" />
            </span>
            <p className="font-medium text-sm">{loadError ? "Couldn't load hubs" : "No hubs yet"}</p>
            <p className="max-w-sm text-muted-foreground text-xs">
              {loadError
                ? "There was a problem reaching the fleet service. Try again."
                : "Add the depots where Routely drivers start and finish their routes."}
            </p>
            {loadError ? (
              <Button size="sm" variant="outline" className="mt-2 h-9" onClick={load}>
                Retry
              </Button>
            ) : (
              <Button size="sm" className="mt-2 h-9" onClick={openAdd}>
                <Plus className="mr-1.5 size-4" aria-hidden="true" /> Add your first hub
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
          {/* ── Toolbar — lives INSIDE the card, separated by border-b ── */}
          <div className="flex flex-col gap-2 border-border/60 border-b px-3 py-2.5 sm:flex-row sm:items-center">
            <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
              <Search className="size-3.5 shrink-0 text-primary/60" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  resetPage();
                }}
                placeholder="Search hubs by name or address…"
                aria-label="Search hubs"
                className="h-full w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground/50 sm:text-[13px]"
              />
            </div>
            <Select
              value={rtFilter}
              onValueChange={(v) => {
                setRtFilter(v as "all" | "roundtrip" | "oneway");
                resetPage();
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-9 w-[150px] border-border/60 text-[13px]"
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

          {/* ── Desktop table ── */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Hub Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>End Time</TableHead>
                  <TableHead>Max Stops</TableHead>
                  <TableHead>Minutes per Stop</TableHead>
                  <TableHead>Roundtrip</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((hub) => {
                  const c = routeCells(hub.route_defaults);
                  return (
                    <TableRow key={hub.id} className="cursor-pointer" onClick={() => openEdit(hub)}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span
                            className={
                              hub.is_default
                                ? "grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"
                                : "grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                            }
                          >
                            <Building2 className="size-4" aria-hidden="true" />
                          </span>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="font-medium text-sm">{hub.name}</span>
                            {hub.is_default && (
                              <Badge variant="outline" className="gap-1 bg-primary/10 text-primary">
                                <Star className="size-3" aria-hidden="true" /> Default
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[240px] whitespace-normal text-muted-foreground text-sm">
                        {addressLine(hub) || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm tabular-nums">{c.start}</TableCell>
                      <TableCell className="font-mono text-sm tabular-nums">{c.end}</TableCell>
                      <TableCell className="font-mono text-sm tabular-nums">{c.maxStops}</TableCell>
                      <TableCell className="font-mono text-sm tabular-nums">{c.minPerStop}</TableCell>
                      <TableCell>
                        {c.roundtrip ? (
                          <Badge variant="secondary" className="gap-1">
                            <Check className="size-3" aria-hidden="true" /> Yes
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* ── Mobile rows (same card, divided) ── */}
          <div className="divide-y divide-border/40 sm:hidden">
            {rows.map((hub) => {
              const c = routeCells(hub.route_defaults);
              const addr = addressLine(hub);
              return (
                <button
                  key={hub.id}
                  type="button"
                  onClick={() => openEdit(hub)}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/30"
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
                    <span className="flex items-center gap-2">
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
                      <span>·</span>
                      <span className="font-mono tabular-nums">{c.minPerStop}/stop</span>
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
            })}
          </div>

          {/* ── Footer: empty-filter state + pagination inside the card ── */}
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-muted-foreground text-sm">No hubs match those filters.</p>
          )}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-border/60 border-t px-3 py-2">
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 border-border/60"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  <ChevronLeft className="size-3.5" aria-hidden="true" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 border-border/60"
                  disabled={safePage >= pages - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  Next
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
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
