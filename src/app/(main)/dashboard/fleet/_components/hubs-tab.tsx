"use client";

import { useEffect, useState } from "react";

import { Building2, Clock, Loader2, MapPin, Pencil, Plus, Repeat, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    setSheetOpen(true);
  }

  async function submit() {
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
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Hub</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="hidden md:table-cell">Route defaults</TableHead>
                <TableHead className="hidden lg:table-cell">Timezone</TableHead>
                <TableHead className="hidden xl:table-cell">Circuit</TableHead>
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
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{hub.name}</span>
                            {hub.is_default && (
                              <Badge variant="outline" className="gap-1 bg-primary/10 text-primary">
                                <Star className="size-3" aria-hidden="true" /> Default
                              </Badge>
                            )}
                          </div>
                          {/* Route-defaults chips fold under the name on narrow screens */}
                          {chips.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1 md:hidden">
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
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[260px] whitespace-normal text-muted-foreground text-sm">
                      {addressLine(hub) || "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
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
                    <TableCell className="hidden text-muted-foreground text-sm lg:table-cell">
                      {hub.timezone || "—"}
                    </TableCell>
                    <TableCell className="hidden max-w-[140px] xl:table-cell">
                      {hub.external_circuit_id ? (
                        <span className="block truncate font-mono text-muted-foreground text-xs tabular-nums">
                          {hub.external_circuit_id}
                        </span>
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

              <Field label="Hub name" required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Central FL Depot"
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
                      onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
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
                      onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                      placeholder="32801"
                      className="h-9"
                    />
                  </Field>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Timezone">
                  <Input
                    value={form.timezone}
                    onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                    placeholder="America/New_York"
                    className="h-9"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Latitude">
                    <Input
                      value={form.lat}
                      onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                      placeholder="28.5383"
                      inputMode="decimal"
                      className="h-9 font-mono tabular-nums"
                    />
                  </Field>
                  <Field label="Longitude">
                    <Input
                      value={form.lng}
                      onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                      placeholder="-81.3792"
                      inputMode="decimal"
                      className="h-9 font-mono tabular-nums"
                    />
                  </Field>
                </div>
              </div>
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
                    value={form.rdMinutesPerStop}
                    onChange={(e) => setForm((f) => ({ ...f, rdMinutesPerStop: e.target.value }))}
                    placeholder="5"
                    inputMode="numeric"
                    className="h-9 tabular-nums"
                  />
                </Field>
                <Field label="Max stops">
                  <Input
                    value={form.rdMaxStops}
                    onChange={(e) => setForm((f) => ({ ...f, rdMaxStops: e.target.value }))}
                    placeholder="0 = unlimited"
                    inputMode="numeric"
                    className="h-9 tabular-nums"
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
                    onChange={(e) => setForm((f) => ({ ...f, rdStartState: e.target.value }))}
                    placeholder="FL"
                    maxLength={2}
                    className="col-span-1 h-9 uppercase"
                  />
                  <Input
                    value={form.rdStartZip}
                    onChange={(e) => setForm((f) => ({ ...f, rdStartZip: e.target.value }))}
                    placeholder="ZIP"
                    className="col-span-2 h-9"
                  />
                </div>
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
                      onChange={(e) => setForm((f) => ({ ...f, rdEndState: e.target.value }))}
                      placeholder="FL"
                      maxLength={2}
                      className="col-span-1 h-9 uppercase"
                    />
                    <Input
                      value={form.rdEndZip}
                      onChange={(e) => setForm((f) => ({ ...f, rdEndZip: e.target.value }))}
                      placeholder="ZIP"
                      className="col-span-2 h-9"
                    />
                  </div>
                </div>
              )}
            </section>

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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-medium text-sm">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
