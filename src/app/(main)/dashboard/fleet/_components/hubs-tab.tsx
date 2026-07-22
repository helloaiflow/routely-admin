"use client";

import { useEffect, useState } from "react";

import {
  Building2,
  ChevronDown,
  Clock,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Repeat,
  Settings2,
  Star,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  line1: string;
  city: string;
  state: string;
  zip: string;
  timezone: string;
  lat: string;
  lng: string;
  is_default: boolean;
  // Route defaults (all optional; empty strings are omitted on save)
  rdStartTime: string;
  rdStartLine1: string;
  rdStartCity: string;
  rdStartState: string;
  rdStartZip: string;
  rdMinutesPerStop: string; // minutes in the UI, stored ×60 as seconds
  rdEndTime: string;
  rdMaxStops: string;
  rdRoundTrip: boolean;
  rdEndLine1: string;
  rdEndCity: string;
  rdEndState: string;
  rdEndZip: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  line1: "",
  city: "",
  state: "FL",
  zip: "",
  timezone: "America/New_York",
  lat: "",
  lng: "",
  is_default: false,
  rdStartTime: "",
  rdStartLine1: "",
  rdStartCity: "",
  rdStartState: "",
  rdStartZip: "",
  rdMinutesPerStop: "",
  rdEndTime: "",
  rdMaxStops: "",
  rdRoundTrip: false,
  rdEndLine1: "",
  rdEndCity: "",
  rdEndState: "",
  rdEndZip: "",
};

// Common US timezones for the compact Location picker (default America/New_York).
const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
];

function addressLine(hub: Hub): string {
  const a = hub.address ?? {};
  const cityLine = [a.city, a.state, a.zip].filter(Boolean).join(", ").replace(/, (\d)/, " $1");
  return [a.line1, cityLine].filter(Boolean).join(" · ");
}

// Compact summary of a hub's route defaults for the list. Times/numbers render
// mono; flags render plain. default_time_at_stop is seconds → shown as minutes.
function routeDefaultChips(rd?: RouteDefaults | null): Array<{ text: string; mono: boolean }> {
  if (!rd) return [];
  const chips: Array<{ text: string; mono: boolean }> = [];
  if (rd.start_time) {
    chips.push({ text: rd.end_time ? `${rd.start_time}–${rd.end_time}` : rd.start_time, mono: true });
  }
  if (rd.default_time_at_stop != null) {
    chips.push({ text: `${Math.round(rd.default_time_at_stop / 60)}m/stop`, mono: true });
  }
  if (rd.round_trip) chips.push({ text: "roundtrip", mono: false });
  if (rd.max_stops != null && rd.max_stops > 0) chips.push({ text: `max ${rd.max_stops}`, mono: true });
  return chips;
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Hub | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);

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
    setSheetOpen(true);
  }

  function openEdit(hub: Hub) {
    setEditing(hub);
    const rd = hub.route_defaults ?? {};
    setForm({
      name: hub.name ?? "",
      line1: hub.address?.line1 ?? "",
      city: hub.address?.city ?? "",
      state: hub.address?.state ?? "FL",
      zip: hub.address?.zip ?? "",
      timezone: hub.timezone || "America/New_York",
      lat: hub.geo?.lat != null ? String(hub.geo.lat) : "",
      lng: hub.geo?.lng != null ? String(hub.geo.lng) : "",
      is_default: Boolean(hub.is_default),
      rdStartTime: rd.start_time ?? "",
      rdStartLine1: rd.start_address?.line1 ?? "",
      rdStartCity: rd.start_address?.city ?? "",
      rdStartState: rd.start_address?.state ?? "",
      rdStartZip: rd.start_address?.zip ?? "",
      rdMinutesPerStop:
        rd.default_time_at_stop != null ? String(Math.round(rd.default_time_at_stop / 60)) : "",
      rdEndTime: rd.end_time ?? "",
      rdMaxStops: rd.max_stops != null ? String(rd.max_stops) : "",
      rdRoundTrip: Boolean(rd.round_trip),
      rdEndLine1: rd.end_address?.line1 ?? "",
      rdEndCity: rd.end_address?.city ?? "",
      rdEndState: rd.end_address?.state ?? "",
      rdEndZip: rd.end_address?.zip ?? "",
    });
    setError("");
    setAttempted(false);
    setSheetOpen(true);
  }

  async function submit() {
    setAttempted(true);
    if (!form.name.trim()) {
      setError("Hub name is required.");
      return;
    }
    const lat = form.lat.trim() ? Number(form.lat) : undefined;
    const lng = form.lng.trim() ? Number(form.lng) : undefined;
    if ((form.lat.trim() && Number.isNaN(lat!)) || (form.lng.trim() && Number.isNaN(lng!))) {
      setError("Latitude and longitude must be numbers.");
      return;
    }

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
    if (lat != null || lng != null) payload.geo = { lat, lng };

    // Route defaults — include only the fields the user filled in.
    const routeDefaults: RouteDefaults = {};
    if (form.rdStartTime.trim()) routeDefaults.start_time = form.rdStartTime.trim();
    const startAddress = buildAddress(form.rdStartLine1, form.rdStartCity, form.rdStartState, form.rdStartZip);
    if (startAddress) routeDefaults.start_address = startAddress;
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
    setSheetOpen(false);
    load();
  }

  // Client hint only — the server does the real validation.
  const endBeforeStart =
    Boolean(form.rdStartTime && form.rdEndTime) && form.rdEndTime <= form.rdStartTime;
  const nameError = attempted && !form.name.trim();
  const latInvalid = form.lat.trim() !== "" && Number.isNaN(Number(form.lat));
  const lngInvalid = form.lng.trim() !== "" && Number.isNaN(Number(form.lng));
  // Any custom start/end/coordinate value keeps the Advanced disclosure open on edit.
  const advancedFilled =
    Boolean(
      form.lat ||
        form.lng ||
        form.rdStartLine1 ||
        form.rdStartCity ||
        form.rdStartState ||
        form.rdStartZip ||
        form.rdEndLine1 ||
        form.rdEndCity ||
        form.rdEndState ||
        form.rdEndZip,
    );

  return (
    <div className="space-y-5">
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
        <>
          {/* Desktop / tablet: table */}
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Hub</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Route defaults</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hubs.map((hub) => {
                  const chips = routeDefaultChips(hub.route_defaults);
                  return (
                    <TableRow key={hub.id}>
                      <TableCell className="pl-4">
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
                      <TableCell className="max-w-[260px] whitespace-normal text-muted-foreground text-sm">
                        {addressLine(hub) || "—"}
                      </TableCell>
                      <TableCell>
                        {chips.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {chips.map((c) => (
                              <Badge
                                key={c.text}
                                variant="secondary"
                                className={c.mono ? "font-mono text-[11px] tabular-nums" : "text-[11px]"}
                              >
                                {c.text}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => openEdit(hub)}>
                          <Pencil className="mr-1 size-3" aria-hidden="true" /> Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile: stacked card list */}
          <div className="space-y-3 md:hidden">
            {hubs.map((hub) => {
              const chips = routeDefaultChips(hub.route_defaults);
              const addr = addressLine(hub);
              return (
                <Card key={hub.id}>
                  <CardContent className="space-y-2.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={
                            hub.is_default
                              ? "grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"
                              : "grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                          }
                        >
                          <Building2 className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-sm">{hub.name}</span>
                            {hub.is_default && (
                              <Badge variant="outline" className="gap-1 bg-primary/10 text-primary">
                                <Star className="size-3" aria-hidden="true" /> Default
                              </Badge>
                            )}
                          </div>
                          {addr && <p className="mt-0.5 truncate text-muted-foreground text-xs">{addr}</p>}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="-mr-1 h-8 shrink-0 text-xs"
                        onClick={() => openEdit(hub)}
                      >
                        <Pencil className="mr-1 size-3" aria-hidden="true" /> Edit
                      </Button>
                    </div>
                    {chips.length > 0 && (
                      <div className="flex flex-wrap gap-1 pl-[42px]">
                        {chips.map((c) => (
                          <Badge
                            key={c.text}
                            variant="secondary"
                            className={c.mono ? "font-mono text-[10px] tabular-nums" : "text-[10px]"}
                          >
                            {c.text}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Add / edit sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="shrink-0 gap-1 border-b px-5 py-4 pr-12">
            <SheetTitle className="font-semibold text-base">{editing ? "Edit hub" : "New hub"}</SheetTitle>
            <SheetDescription>
              {editing ? "Update this dispatch origin." : "Add a depot where routes start and end."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
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
              <Field label="Street address">
                <Input
                  value={form.line1}
                  onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
                  placeholder="123 Main St"
                  className="h-9"
                />
              </Field>
              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-3">
                  <Field label="City">
                    <Input
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      placeholder="Orlando"
                      className="h-9"
                    />
                  </Field>
                </div>
                <div className="col-span-1">
                  <Field label="State">
                    <Input
                      value={form.state}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))
                      }
                      placeholder="FL"
                      maxLength={2}
                      className="h-9 uppercase"
                    />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="ZIP">
                    <Input
                      value={form.zip}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, zip: e.target.value.replace(/\D/g, "").slice(0, 5) }))
                      }
                      placeholder="32801"
                      inputMode="numeric"
                      maxLength={5}
                      className="h-9 tabular-nums"
                    />
                  </Field>
                </div>
              </div>
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
              <div className="flex items-center justify-between rounded-lg border px-3.5 py-2.5">
                <div>
                  <p className="font-medium text-sm">Set as default hub</p>
                  <p className="text-muted-foreground text-xs">Used automatically when no hub is specified.</p>
                </div>
                <Switch
                  checked={form.is_default}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))}
                />
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

            {/* ── Advanced (collapsed by default) ── */}
            <Collapsible defaultOpen={advancedFilled} className="space-y-4">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="group flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2">
                    <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="font-medium text-sm">Custom start / end point (optional)</p>
                      <p className="text-muted-foreground text-xs">
                        By default the route starts and ends at this hub&apos;s address.
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Latitude" error={latInvalid ? "Must be a number." : undefined}>
                    <Input
                      value={form.lat}
                      onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                      placeholder="28.5383"
                      inputMode="decimal"
                      aria-invalid={latInvalid || undefined}
                      className="h-9 font-mono tabular-nums"
                    />
                  </Field>
                  <Field label="Longitude" error={lngInvalid ? "Must be a number." : undefined}>
                    <Input
                      value={form.lng}
                      onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                      placeholder="-81.3792"
                      inputMode="decimal"
                      aria-invalid={lngInvalid || undefined}
                      className="h-9 font-mono tabular-nums"
                    />
                  </Field>
                </div>

                <div className="space-y-1.5">
                  <Label className="font-medium text-sm">Start address</Label>
                  <p className="text-muted-foreground text-xs">Leave empty to use the hub address.</p>
                  <Input
                    value={form.rdStartLine1}
                    onChange={(e) => setForm((f) => ({ ...f, rdStartLine1: e.target.value }))}
                    placeholder="Street address"
                    className="h-9"
                  />
                  <div className="grid grid-cols-6 gap-3">
                    <div className="col-span-3">
                      <Input
                        value={form.rdStartCity}
                        onChange={(e) => setForm((f) => ({ ...f, rdStartCity: e.target.value }))}
                        placeholder="City"
                        className="h-9"
                      />
                    </div>
                    <Input
                      value={form.rdStartState}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, rdStartState: e.target.value.toUpperCase().slice(0, 2) }))
                      }
                      placeholder="FL"
                      maxLength={2}
                      className="col-span-1 h-9 uppercase"
                    />
                    <Input
                      value={form.rdStartZip}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, rdStartZip: e.target.value.replace(/\D/g, "").slice(0, 5) }))
                      }
                      placeholder="ZIP"
                      inputMode="numeric"
                      maxLength={5}
                      className="col-span-2 h-9 tabular-nums"
                    />
                  </div>
                </div>

                {!form.rdRoundTrip && (
                  <div className="space-y-1.5">
                    <Label className="font-medium text-sm">End address</Label>
                    <p className="text-muted-foreground text-xs">Leave empty to use the hub address.</p>
                    <Input
                      value={form.rdEndLine1}
                      onChange={(e) => setForm((f) => ({ ...f, rdEndLine1: e.target.value }))}
                      placeholder="Street address"
                      className="h-9"
                    />
                    <div className="grid grid-cols-6 gap-3">
                      <div className="col-span-3">
                        <Input
                          value={form.rdEndCity}
                          onChange={(e) => setForm((f) => ({ ...f, rdEndCity: e.target.value }))}
                          placeholder="City"
                          className="h-9"
                        />
                      </div>
                      <Input
                        value={form.rdEndState}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, rdEndState: e.target.value.toUpperCase().slice(0, 2) }))
                        }
                        placeholder="FL"
                        maxLength={2}
                        className="col-span-1 h-9 uppercase"
                      />
                      <Input
                        value={form.rdEndZip}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, rdEndZip: e.target.value.replace(/\D/g, "").slice(0, 5) }))
                        }
                        placeholder="ZIP"
                        inputMode="numeric"
                        maxLength={5}
                        className="col-span-2 h-9 tabular-nums"
                      />
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t px-5 py-3">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />}
              {editing ? "Save changes" : "Create hub"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-medium text-sm">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
