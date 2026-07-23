"use client";

import { useEffect, useMemo, useState } from "react";

import { Building2, Check, CircleCheck, Clock3, Loader2, MapPin, Repeat2, Search, Star } from "lucide-react";

import { AddressAutocomplete, type PlaceDetails } from "@/components/ui/address-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { HubInsights } from "./fleet-insights";
import { FleetHero, FleetWorkspace } from "./fleet-workspace";

type Address = { line1?: string; city?: string; state?: string; zip?: string };

type RouteDefaults = {
  start_time?: string;
  default_time_at_stop?: number;
  end_address?: Address;
  end_time?: string;
  max_stops?: number;
  round_trip?: boolean;
};

type Hub = {
  id: string;
  name: string;
  address: Address | null;
  geo: { lat?: number; lng?: number } | null;
  timezone: string;
  is_default: boolean;
  external_circuit_id: string | null;
  route_defaults?: RouteDefaults | null;
};

type Driver = {
  id: string;
  hub_id: string | null;
  hub_ids?: string[];
  all_hubs?: boolean;
  status: "active" | "inactive";
};

type HubForm = {
  name: string;
  addressValue: string;
  addressSelected: boolean;
  line1: string;
  city: string;
  state: string;
  zip: string;
  lat: string;
  lng: string;
  timezone: string;
  isDefault: boolean;
  startTime: string;
  endTime: string;
  minutesPerStop: string;
  maxStops: string;
  roundTrip: boolean;
  endValue: string;
  endSelected: boolean;
  endLine1: string;
  endCity: string;
  endState: string;
  endZip: string;
};

const EMPTY_FORM: HubForm = {
  name: "",
  addressValue: "",
  addressSelected: false,
  line1: "",
  city: "",
  state: "",
  zip: "",
  lat: "",
  lng: "",
  timezone: "America/New_York",
  isDefault: false,
  startTime: "",
  endTime: "",
  minutesPerStop: "",
  maxStops: "",
  roundTrip: false,
  endValue: "",
  endSelected: false,
  endLine1: "",
  endCity: "",
  endState: "",
  endZip: "",
};

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Los_Angeles", label: "Pacific" },
];

function addressLine(address?: Address | null) {
  if (!address) return "Address not configured";
  const locality = [address.city, address.state, address.zip].filter(Boolean).join(" ");
  return [address.line1, locality].filter(Boolean).join(" · ") || "Address not configured";
}

function formatAddress(address?: Address | null) {
  if (!address) return "";
  return [address.line1, address.city, address.state, address.zip].filter(Boolean).join(", ");
}

function formFromHub(hub: Hub): HubForm {
  const defaults = hub.route_defaults ?? {};
  return {
    name: hub.name ?? "",
    addressValue: formatAddress(hub.address),
    addressSelected: Boolean(hub.address),
    line1: hub.address?.line1 ?? "",
    city: hub.address?.city ?? "",
    state: hub.address?.state ?? "",
    zip: hub.address?.zip ?? "",
    lat: hub.geo?.lat != null ? String(hub.geo.lat) : "",
    lng: hub.geo?.lng != null ? String(hub.geo.lng) : "",
    timezone: hub.timezone || "America/New_York",
    isDefault: Boolean(hub.is_default),
    startTime: defaults.start_time ?? "",
    endTime: defaults.end_time ?? "",
    minutesPerStop: defaults.default_time_at_stop != null ? String(Math.round(defaults.default_time_at_stop / 60)) : "",
    maxStops: defaults.max_stops != null ? String(defaults.max_stops) : "",
    roundTrip: Boolean(defaults.round_trip),
    endValue: formatAddress(defaults.end_address),
    endSelected: Boolean(defaults.end_address),
    endLine1: defaults.end_address?.line1 ?? "",
    endCity: defaults.end_address?.city ?? "",
    endState: defaults.end_address?.state ?? "",
    endZip: defaults.end_address?.zip ?? "",
  };
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid size-7 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="type-caption">{description}</p>
      </div>
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
      <Label className="type-body-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="type-caption text-destructive">{error}</p>}
    </div>
  );
}

export function HubsWorkspace() {
  const [hubs, setHubs] = useState<Hub[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<HubForm>(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);

  const selectedHub = selectedId && selectedId !== "new" ? (hubs?.find((hub) => hub.id === selectedId) ?? null) : null;

  function load(preferredId?: string) {
    setLoadError(false);
    fetch("/api/client/hubs")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        const next = (data.hubs ?? []) as Hub[];
        setHubs(next);
        const wanted =
          (preferredId && next.find((hub) => hub.id === preferredId)) ||
          (selectedId !== "new" && next.find((hub) => hub.id === selectedId)) ||
          next[0];
        if (wanted) {
          setSelectedId(wanted.id);
          setForm(formFromHub(wanted));
        } else if (next.length === 0) {
          setSelectedId("new");
          setForm({ ...EMPTY_FORM, isDefault: true });
        }
      })
      .catch(() => {
        setHubs([]);
        setLoadError(true);
      });
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: initial data load must run once when the workspace mounts
  useEffect(() => {
    load();
    fetch("/api/client/drivers")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => setDrivers((data.drivers ?? []) as Driver[]))
      .catch(() => setDrivers([]));
    // The initial workspace selection is established by load().
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return hubs ?? [];
    return (hubs ?? []).filter(
      (hub) => hub.name.toLowerCase().includes(term) || addressLine(hub.address).toLowerCase().includes(term),
    );
  }, [hubs, query]);

  const assignedDrivers = useMemo(() => {
    if (!selectedHub) return 0;
    return drivers.filter((driver) => {
      if (driver.status !== "active") return false;
      if (driver.all_hubs) return true;
      const ids = driver.hub_ids ?? (driver.hub_id ? [driver.hub_id] : []);
      return ids.includes(selectedHub.id);
    }).length;
  }, [drivers, selectedHub]);

  function selectHub(hub: Hub) {
    setSelectedId(hub.id);
    setForm(formFromHub(hub));
    setAttempted(false);
    setError("");
  }

  function createHub() {
    setSelectedId("new");
    setForm({ ...EMPTY_FORM, isDefault: (hubs ?? []).length === 0 });
    setAttempted(false);
    setError("");
  }

  function setStartAddress(details: PlaceDetails) {
    setForm((current) => ({
      ...current,
      addressValue: details.formatted_address || details.street,
      addressSelected: true,
      line1: details.street,
      city: details.city,
      state: details.state,
      zip: details.zip,
      lat: details.lat != null ? String(details.lat) : "",
      lng: details.lng != null ? String(details.lng) : "",
    }));
  }

  function setEndAddress(details: PlaceDetails) {
    setForm((current) => ({
      ...current,
      endValue: details.formatted_address || details.street,
      endSelected: true,
      endLine1: details.street,
      endCity: details.city,
      endState: details.state,
      endZip: details.zip,
    }));
  }

  async function save() {
    setAttempted(true);
    if (!form.name.trim()) {
      setError("Hub name is required.");
      return;
    }

    const routeDefaults: RouteDefaults = {};
    if (form.startTime) routeDefaults.start_time = form.startTime;
    if (form.endTime) routeDefaults.end_time = form.endTime;
    if (form.minutesPerStop) routeDefaults.default_time_at_stop = Number(form.minutesPerStop) * 60;
    if (form.maxStops) routeDefaults.max_stops = Number(form.maxStops);
    routeDefaults.round_trip = form.roundTrip;
    if (!form.roundTrip && form.endValue) {
      routeDefaults.end_address = {
        line1: form.endLine1 || undefined,
        city: form.endCity || undefined,
        state: form.endState || undefined,
        zip: form.endZip || undefined,
      };
    }

    const payload = {
      name: form.name.trim(),
      address: {
        line1: form.line1 || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        zip: form.zip || undefined,
      },
      geo:
        form.lat || form.lng
          ? {
              lat: form.lat ? Number(form.lat) : undefined,
              lng: form.lng ? Number(form.lng) : undefined,
            }
          : undefined,
      timezone: form.timezone,
      is_default: form.isDefault,
      route_defaults: routeDefaults,
    };

    setSaving(true);
    setError("");
    const editing = selectedId !== null && selectedId !== "new";
    const response = await fetch(editing ? `/api/client/hubs/${encodeURIComponent(selectedId)}` : "/api/client/hubs", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      const body = response ? await response.json().catch(() => ({})) : {};
      setError(body.error || "Could not save this hub. Try again shortly.");
      return;
    }

    const body = await response.json().catch(() => ({}));
    load((body.id ?? body.hub?.id ?? (editing ? selectedId : undefined)) as string | undefined);
  }

  const list = (
    <div className="flex h-full min-h-96 flex-col">
      <div className="border-b px-3 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="type-label text-muted-foreground">Network</p>
            <p className="mt-0.5 font-semibold text-sm">{hubs?.length ?? 0} hubs</p>
          </div>
          <span className="type-caption rounded-md bg-success/10 px-2 py-1 font-medium text-success">
            {drivers.filter((driver) => driver.status === "active").length} drivers
          </span>
        </div>
        <div className="mt-3 flex h-8 items-center gap-2 rounded-lg border bg-background px-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
          <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search hubs"
            aria-label="Search hubs"
            className="type-body-sm h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {hubs == null ? (
          <div className="space-y-2">
            {[1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-20 w-full" />
            ))}
          </div>
        ) : loadError ? (
          <div className="px-3 py-12 text-center">
            <p className="font-medium text-sm">Could not load hubs</p>
            <p className="type-caption mt-1">Check the fleet service and retry.</p>
            <Button variant="outline" size="sm" className="mt-3 h-8" onClick={() => load()}>
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-12 text-center">
            <Building2 className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 font-medium text-sm">No hubs found</p>
            <p className="type-caption mt-1">{query ? "Try another search." : "Create the first dispatch origin."}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((hub) => {
              const active = selectedId === hub.id;
              return (
                <button
                  key={hub.id}
                  type="button"
                  onClick={() => selectHub(hub)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg border-l-2 px-2.5 py-2.5 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-transparent hover:bg-muted/30",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Building2 className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="type-body-sm truncate font-medium">{hub.name}</span>
                      {hub.is_default && <Star className="size-3 fill-primary text-primary" aria-label="Default hub" />}
                    </span>
                    <span className="type-caption mt-0.5 block truncate">{addressLine(hub.address)}</span>
                    <span className="type-caption mt-1 flex items-center gap-1.5">
                      <Clock3 className="size-3" aria-hidden="true" />
                      {hub.route_defaults?.start_time || "Not set"} to {hub.route_defaults?.end_time || "Not set"}
                    </span>
                  </span>
                  {active && <Check className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const editor = (
    <div className="flex h-full min-h-96 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="font-semibold text-sm">{selectedId === "new" ? "New hub" : "Hub details"}</p>
          <p className="type-caption">Location and route defaults</p>
        </div>
        <span
          className={cn(
            "type-label rounded-md px-2 py-1",
            form.isDefault ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {form.isDefault ? "Default" : "Standard"}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-6 px-4 py-4">
          <FleetHero variant="hub" selectedLabel={selectedId === "new" ? "New hub" : (selectedHub?.name ?? null)} />

          <section>
            <SectionHeading icon={MapPin} title="Dispatch origin" description="Where drivers begin their routes" />
            <div className="mt-4 space-y-3.5">
              <Field label="Hub name" required error={attempted && !form.name.trim() ? "Enter a hub name." : undefined}>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Central FL Hub"
                  className="h-9"
                />
              </Field>
              <Field label="Start address">
                <div className="relative">
                  <AddressAutocomplete
                    value={form.addressValue}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        addressValue: value,
                        addressSelected: false,
                      }))
                    }
                    onPlaceDetails={setStartAddress}
                    placeholder="Search a dispatch address"
                    className={cn("h-9", form.addressSelected && "border-success pr-9")}
                  />
                  {form.addressSelected && (
                    <CircleCheck
                      className="absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-success"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Timezone">
                  <Select
                    value={form.timezone}
                    onValueChange={(value) => setForm((current) => ({ ...current, timezone: value }))}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((timezone) => (
                        <SelectItem key={timezone.value} value={timezone.value}>
                          {timezone.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Default hub">
                  <div className="flex h-9 items-center justify-between rounded-lg border px-3">
                    <span className="type-caption">Auto-select</span>
                    <Switch
                      checked={form.isDefault}
                      onCheckedChange={(checked) => setForm((current) => ({ ...current, isDefault: checked }))}
                    />
                  </div>
                </Field>
              </div>
            </div>
          </section>

          <section className="border-t pt-5">
            <SectionHeading icon={Repeat2} title="Route defaults" description="Applied when dispatch creates a route" />
            <div className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start time">
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
                    className="h-9 font-mono"
                  />
                </Field>
                <Field label="End time">
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
                    className="h-9 font-mono"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Minutes per stop">
                  <Input
                    type="number"
                    min={0}
                    value={form.minutesPerStop}
                    onChange={(event) => setForm((current) => ({ ...current, minutesPerStop: event.target.value }))}
                    placeholder="5"
                    className="h-9"
                  />
                </Field>
                <Field label="Max stops">
                  <Input
                    type="number"
                    min={0}
                    value={form.maxStops}
                    onChange={(event) => setForm((current) => ({ ...current, maxStops: event.target.value }))}
                    placeholder="Unlimited"
                    className="h-9"
                  />
                </Field>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5">
                <div>
                  <p className="type-body-sm font-medium">Round trip</p>
                  <p className="type-caption">Return to this hub after the final stop</p>
                </div>
                <Switch
                  checked={form.roundTrip}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, roundTrip: checked }))}
                />
              </div>
              {!form.roundTrip && (
                <Field label="End address">
                  <div className="relative">
                    <AddressAutocomplete
                      value={form.endValue}
                      onChange={(value) => setForm((current) => ({ ...current, endValue: value, endSelected: false }))}
                      onPlaceDetails={setEndAddress}
                      placeholder="Search final destination"
                      className={cn("h-9", form.endSelected && "border-success pr-9")}
                    />
                    {form.endSelected && (
                      <CircleCheck
                        className="absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-success"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </Field>
              )}
            </div>
          </section>

          {error && <p className="type-body-sm rounded-lg bg-destructive/10 px-3 py-2 text-destructive">{error}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3">
        <p className="type-caption">{selectedId === "new" ? "Unsaved hub" : "Changes apply to future routes"}</p>
        <Button size="sm" className="h-9" onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {selectedId === "new" ? "Create hub" : "Save changes"}
        </Button>
      </div>
    </div>
  );

  return (
    <FleetWorkspace
      title="Hubs"
      description="Dispatch origins, route defaults, and network performance"
      entityLabel="hub"
      onCreate={createHub}
      list={list}
      editor={editor}
      insights={<HubInsights hub={selectedHub} assignedDrivers={assignedDrivers} />}
    />
  );
}
