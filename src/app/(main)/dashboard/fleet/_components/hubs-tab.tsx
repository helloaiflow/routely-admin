"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ArrowLeft,
  Ban,
  Building2,
  ClipboardList,
  List,
  Lock,
  ChevronDown,
  CircleCheck,
  Clock,
  Copy,
  Loader2,
  Map as MapIcon,
  MapPin,
  Plus,
  Repeat,
  Search,
  Star,
  Users,
  X,
} from "lucide-react";

import {
  AddressAutocomplete,
  type PlaceDetails,
} from "@/components/ui/address-autocomplete";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatDisplayCase } from "@/lib/format-display";
import { cn } from "@/lib/utils";

import { DriverAvatarRow, MobileTabBar, SearchMultiSelect, Stepper, TimeSelect } from "./field-controls";
import { IsoDepotScene } from "./fleet-art";
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
  visibility?: "pool" | "dedicated";
  tenant_ids?: number[];
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
  // Access (tenant scoping): pool = all tenants; dedicated = tenantIds only.
  visibility: "pool" | "dedicated";
  tenantIds: number[];
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
  visibility: "pool",
  tenantIds: [],
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

// Derive the list display values from a hub's route defaults.
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

// Serialize the form → API payload. Pure so manual save and autosave produce
// byte-identical bodies (autosave compares serializations to detect changes).
function payloadFromForm(f: FormState): Record<string, unknown> {
  const lat = f.lat.trim() ? Number(f.lat) : undefined;
  const lng = f.lng.trim() ? Number(f.lng) : undefined;

  const payload: Record<string, unknown> = {
    name: f.name.trim(),
    address: {
      line1: f.line1.trim() || undefined,
      city: f.city.trim() || undefined,
      state: f.state.trim() || undefined,
      zip: f.zip.trim() || undefined,
    },
    timezone: f.timezone.trim() || "America/New_York",
    is_default: f.is_default,
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
  if (f.rdStartTime.trim()) routeDefaults.start_time = f.rdStartTime.trim();
  if (f.rdMinutesPerStop.trim()) {
    const minutes = Number(f.rdMinutesPerStop);
    if (!Number.isNaN(minutes)) routeDefaults.default_time_at_stop = Math.round(minutes * 60);
  }
  if (f.rdEndTime.trim()) routeDefaults.end_time = f.rdEndTime.trim();
  if (f.rdMaxStops.trim()) {
    const maxStops = Number(f.rdMaxStops);
    if (!Number.isNaN(maxStops) && maxStops > 0) routeDefaults.max_stops = Math.round(maxStops);
  }
  if (f.rdRoundTrip) {
    routeDefaults.round_trip = true;
  } else {
    const endAddress = buildAddress(f.rdEndLine1, f.rdEndCity, f.rdEndState, f.rdEndZip);
    if (endAddress) routeDefaults.end_address = endAddress;
  }
  payload.route_defaults = routeDefaults;
  payload.visibility = f.visibility;
  payload.tenant_ids = f.visibility === "dedicated" ? f.tenantIds : [];
  return payload;
}

export function HubsTab() {
  const [hubs, setHubs] = useState<Hub[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Inline center form: `creating` opens a blank form; otherwise a selected hub
  // is edited in place. `editing` mirrors the record backing the form (drives
  // POST vs PATCH + the header/id chip).
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Hub | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);

  // List toolbar state
  const [query, setQuery] = useState("");
  const [rtFilter, setRtFilter] = useState<"all" | "roundtrip" | "oneway">("all");

  // Selected hub → drives the center form + the right map column.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Mobile (<sm) tri-pane navigation: List · Details · Map (Stops pattern).
  const [mobileTab, setMobileTab] = useState<"list" | "detail" | "map">("list");

  // Access control data: tenants (for dedicated scoping) + drivers (for
  // allow/block relations). Loaded once; relations load per selected hub.
  const [tenants, setTenants] = useState<{ tenant_id: number; name: string }[]>([]);
  const [driverOpts, setDriverOpts] = useState<{ id: string; name: string }[]>([]);
  const [relations, setRelations] = useState<{ allowed: string[]; blocked: string[] }>({ allowed: [], blocked: [] });
  const [relationsBusy, setRelationsBusy] = useState(false);

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
    fetch("/api/admin/tenants")
      .then((r) => (r.ok ? r.json() : { tenants: [] }))
      .then((d) => setTenants(d.tenants ?? []))
      .catch(() => setTenants([]));
    fetch("/api/client/drivers")
      .then((r) => (r.ok ? r.json() : { drivers: [] }))
      .then((d) => setDriverOpts(((d.drivers ?? []) as { id: string; name: string }[]).map(({ id, name }) => ({ id, name }))))
      .catch(() => setDriverOpts([]));
  }, []);

  // Load this hub's driver relations; save on every toggle (replace semantics,
  // block wins server-side). Non-blocking: failures surface inline.
  function loadRelations(hubId: string) {
    setRelations({ allowed: [], blocked: [] });
    fetch(`/api/client/hubs/${encodeURIComponent(hubId)}/drivers`)
      .then((r) => (r.ok ? r.json() : { allowed: [], blocked: [] }))
      .then((d) => setRelations({ allowed: d.allowed ?? [], blocked: d.blocked ?? [] }))
      .catch(() => {});
  }

  async function saveRelations(hubId: string, next: { allowed: string[]; blocked: string[] }) {
    setRelations(next); // optimistic — server echo corrects on mismatch
    setRelationsBusy(true);
    const res = await fetch(`/api/client/hubs/${encodeURIComponent(hubId)}/drivers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => null);
    setRelationsBusy(false);
    if (res?.ok) {
      const d = await res.json().catch(() => null);
      if (d) setRelations({ allowed: d.allowed ?? [], blocked: d.blocked ?? [] });
    } else {
      setError("Could not save driver access — try again.");
      loadRelations(hubId);
    }
  }

  function toggleRelation(kind: "allowed" | "blocked", driverId: string) {
    if (!editing) return;
    const cur = relations[kind];
    const other: "allowed" | "blocked" = kind === "allowed" ? "blocked" : "allowed";
    const next = {
      ...relations,
      [kind]: cur.includes(driverId) ? cur.filter((d) => d !== driverId) : [...cur, driverId],
      // adding to one list removes from the other (block wins is server-side,
      // but the UI keeps the lists visually exclusive)
      [other]: relations[other].filter((d) => d !== driverId),
    } as { allowed: string[]; blocked: string[] };
    void saveRelations(editing.id, next);
  }

  // Map a hub record → the editable form state.
  function formFromHub(hub: Hub): FormState {
    const rd = hub.route_defaults ?? {};
    return {
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
      visibility: hub.visibility === "dedicated" ? "dedicated" : "pool",
      tenantIds: Array.isArray(hub.tenant_ids) ? hub.tenant_ids : [],
    };
  }

  function openAdd() {
    setMobileTab("detail");
    setCreating(true);
    setSelectedId(null);
    setEditing(null);
    setForm({ ...EMPTY_FORM, is_default: (hubs ?? []).length === 0 });
    setError("");
    setSavedTick(false);
    setAttempted(false);
  }

  // Select a row → load it into the inline editor. The autosave baseline is the
  // record's own serialized payload — edits are detected against it.
  function selectHub(hub: Hub) {
    setMobileTab("detail");
    setCreating(false);
    setSelectedId(hub.id);
    setEditing(hub);
    const f = formFromHub(hub);
    setForm(f);
    lastSavedRef.current = JSON.stringify(payloadFromForm(f));
    loadRelations(hub.id);
    setError("");
    setSavedTick(false);
    setAttempted(false);
  }

  // Duplicate: open the create form pre-filled from the selected hub (no id).
  // The copy never steals the default flag.
  function duplicateHub() {
    if (!editing) return;
    setCreating(true);
    setSelectedId(null);
    setEditing(null);
    setForm({ ...form, is_default: false });
    setError("");
    setSavedTick(false);
    setAttempted(false);
  }

  // Cancel: discard edits (revert to record) or drop the blank create form.
  function cancelForm() {
    if (creating) {
      setCreating(false);
      setForm(EMPTY_FORM);
    } else if (editing) {
      setForm(formFromHub(editing));
    }
    setError("");
    setSavedTick(false);
    setAttempted(false);
  }

  // Close the center panel entirely (back to empty state).
  function closeForm() {
    setMobileTab("list");
    setCreating(false);
    setSelectedId(null);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setSavedTick(false);
    setAttempted(false);
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
    setSavedTick(false);
    if (!form.name.trim()) {
      setError("Hub name is required.");
      return;
    }
    const serialized = JSON.stringify(payloadFromForm(form));

    setSaving(true);
    setError("");
    const url = editing ? `/api/client/hubs/${encodeURIComponent(editing.id)}` : "/api/client/hubs";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: serialized,
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {};
      setError(j.error || "Could not save the hub. The fleet service may be unavailable — try again shortly.");
      return;
    }
    if (creating) {
      setCreating(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    } else {
      lastSavedRef.current = serialized;
    }
    setSavedTick(true);
    setAttempted(false);
    setTimeout(() => setSavedTick(false), 2500);
    load();
  }

  // Client hint only — the server does the real validation.
  const endBeforeStart =
    Boolean(form.rdStartTime && form.rdEndTime) && form.rdEndTime <= form.rdStartTime;
  const nameError = attempted && !form.name.trim();

  // ── Autosave (existing records only) ──────────────────────────────────────
  // Debounced 1.2s after the last change; compares the serialized payload to
  // the last-saved baseline, PATCHes silently, and shows Saving…/Saved inline.
  // New records save only via the button. Invalid states never autosave.
  const lastSavedRef = useRef("");
  useEffect(() => {
    if (!editing || creating || saving) return;
    if (!form.name.trim() || endBeforeStart) return;
    const serialized = JSON.stringify(payloadFromForm(form));
    if (serialized === lastSavedRef.current) return;
    const t = setTimeout(async () => {
      setSaving(true);
      setError("");
      const res = await fetch(`/api/client/hubs/${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: serialized,
      }).catch(() => null);
      setSaving(false);
      if (!res || !res.ok) {
        const j = res ? await res.json().catch(() => ({})) : {};
        setError(j.error || "Autosave failed — your latest change is not saved yet.");
        return;
      }
      lastSavedRef.current = serialized;
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2500);
      load();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, editing, creating, saving, endBeforeStart]);

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
  const showForm = creating || Boolean(selectedHub);

  // City/state/zip line for the detail header identity block.
  const headerAddr = [form.city, form.state, form.zip]
    .filter(Boolean)
    .join(", ")
    .replace(/, (\d)/, " $1");

  // Stops detail-header icon-button recipe (shared by every header command).
  const HEADER_BTN =
    "flex size-7 items-center justify-center rounded-md transition-all text-muted-foreground/60 hover:bg-muted hover:text-foreground";

  // ── Inline center form (shared by desktop center + mobile overlay) ──
  const centerForm = (
    <div className="flex min-h-full flex-col bg-card sm:min-h-0">
      {/* Header — accent bar + identity block + command row (Stops detail pattern)
          + isometric depot garnish behind the right edge (text stays on top) */}
      <div className="relative sticky top-0 z-10 shrink-0 overflow-hidden border-border/50 border-b bg-card">
        <div className="h-[3px] w-full bg-primary" />
        <IsoDepotScene variant="header" />
        <div className="relative flex items-center justify-between px-4 pt-2.5 pb-1.5">
          <span className="font-mono text-10 text-primary dark:text-white/80">
            {editing ? "Hub" : "New hub"}
          </span>
          <div className="flex items-center gap-1">
            {editing && (
              <button
                type="button"
                onClick={duplicateHub}
                title="Duplicate hub"
                aria-label="Duplicate hub"
                className={HEADER_BTN}
              >
                <Copy className="size-3.5" aria-hidden="true" />
              </button>
            )}
            {/* No Delete: /api/client/hubs/{id} does not expose DELETE (hidden per spec). */}
            <div className="mx-1 h-4 w-px bg-border/60" />
            <button type="button" onClick={closeForm} aria-label="Close" className={HEADER_BTN}>
              <ArrowLeft className="size-3.5 sm:hidden" aria-hidden="true" />
              <X className="hidden size-3.5 sm:block" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="relative px-4 pb-3">
          <p className="truncate font-bold text-base text-foreground leading-tight tracking-tight">
            {formatDisplayCase(form.name.trim()) || "Untitled hub"}
          </p>
          {form.line1 && (
            <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground/70 leading-tight">
              {formatDisplayCase(form.line1)}
            </p>
          )}
          {headerAddr && (
            <p className="truncate text-11 text-muted-foreground/55">{formatDisplayCase(headerAddr)}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {form.is_default && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-10 font-semibold text-primary ring-1 ring-primary/20">
                <Star className="size-3" aria-hidden="true" /> Default
              </span>
            )}
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-10 font-medium text-muted-foreground ring-1 ring-border">
              {form.rdRoundTrip ? "Round-trip" : "One-way"}
            </span>
          </div>
        </div>
      </div>

      {/* Body — borderless collapsible sections */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Location ── */}
        <Group icon={MapPin} title="Location">
          <FieldRow label="Hub name" required error={nameError ? "Hub name is required." : undefined}>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Central FL Depot"
              aria-invalid={nameError || undefined}
              className={cn(ROW_INPUT, "w-full")}
            />
          </FieldRow>

          <StackRow label="Start From" hint="Route origin">
            <AddressField
              value={form.startValue}
              selected={form.startSelected}
              placeholder="Search start address…"
              onChange={(v) => setForm((f) => ({ ...f, startValue: v, startSelected: false }))}
              onPlaceDetails={onStartPlace}
              onClear={clearStart}
            />
          </StackRow>

          {!form.rdRoundTrip && (
            <StackRow label="End To" hint="Route end">
              <AddressField
                value={form.endValue}
                selected={form.endSelected}
                placeholder="Search end address…"
                onChange={(v) => setForm((f) => ({ ...f, endValue: v, endSelected: false }))}
                onPlaceDetails={onEndPlace}
                onClear={clearEnd}
              />
            </StackRow>
          )}

          <FieldRow label="Timezone">
            <Select
              value={form.timezone}
              onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
            >
              <SelectTrigger className="h-7 w-[150px] justify-end gap-1 border-0 bg-transparent pr-1 font-medium text-13 text-foreground focus:ring-0">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent align="end">
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value} className="text-13">
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Default hub">
            <Switch
              checked={form.is_default}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))}
            />
          </FieldRow>
        </Group>

        {/* ── Route defaults ── */}
        <Group
          icon={Clock}
          title="Route defaults"
          note="Defaults a route inherits from this hub — overridable per route."
        >
          <FieldRow label="Start time">
            <TimeSelect
              value={form.rdStartTime}
              onChange={(v) => setForm((f) => ({ ...f, rdStartTime: v }))}
              ariaLabel="Start time"
            />
          </FieldRow>
          <FieldRow label="End time">
            <TimeSelect
              value={form.rdEndTime}
              onChange={(v) => setForm((f) => ({ ...f, rdEndTime: v }))}
              ariaLabel="End time"
            />
          </FieldRow>
          {endBeforeStart && (
            <p className="text-11 text-amber-600 dark:text-amber-500">
              End time is at or before the start time — the route may not fit in the day.
            </p>
          )}

          <FieldRow label="Minutes per stop">
            <Stepper
              value={form.rdMinutesPerStop}
              onChange={(v) => setForm((f) => ({ ...f, rdMinutesPerStop: v }))}
              min={1} max={120} unit="m"
              ariaLabel="minutes per stop"
            />
          </FieldRow>
          <FieldRow label="Max stops">
            <Stepper
              value={form.rdMaxStops}
              onChange={(v) => setForm((f) => ({ ...f, rdMaxStops: v }))}
              min={0} max={200} step={5} zeroLabel="∞"
              ariaLabel="max stops"
            />
          </FieldRow>

          <FieldRow label="Round-trip">
            <Switch
              checked={form.rdRoundTrip}
              onCheckedChange={(v) => setForm((f) => ({ ...f, rdRoundTrip: v }))}
            />
          </FieldRow>
        </Group>

        {/* ── Access — pool vs dedicated tenant scoping ── */}
        <Group
          icon={Lock}
          title="Access"
          note="Pool: every tenant can use this hub (stops stay tenant-filtered). Dedicated: only the tenants listed below."
        >
          <FieldRow label="Visibility">
            <div className="flex overflow-hidden rounded-lg border border-border/60">
              {(["pool", "dedicated"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, visibility: v }))}
                  className={cn(
                    "px-3 py-1 text-11 font-semibold capitalize transition-colors",
                    form.visibility === v
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-muted-foreground hover:bg-muted",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </FieldRow>
          {form.visibility === "dedicated" && (
            <StackRow label="Tenants" hint="Who can use this hub">
              <SearchMultiSelect
                items={tenants.map((t) => ({ id: String(t.tenant_id), label: formatDisplayCase(t.name), hint: `#${t.tenant_id}` }))}
                selected={form.tenantIds.map(String)}
                onToggle={(id) =>
                  setForm((f) => ({
                    ...f,
                    tenantIds: f.tenantIds.includes(Number(id))
                      ? f.tenantIds.filter((t) => t !== Number(id))
                      : [...f.tenantIds, Number(id)],
                  }))
                }
                placeholder="Select tenants"
                searchPlaceholder="Search tenants…"
                emptyText="No tenants found."
              />
            </StackRow>
          )}
        </Group>

        {/* ── Drivers — allowed / blocked for this hub (saved instantly) ── */}
        {editing && (
          <Group
            icon={Users}
            title="Drivers"
            note={relationsBusy ? "Saving driver access…" : "Blocked always wins over allowed."}
          >
            <StackRow label="Allowed drivers" hint="Eligible for this hub">
              <SearchMultiSelect
                items={driverOpts.map((d) => ({ id: d.id, label: d.name }))}
                selected={relations.allowed}
                onToggle={(id) => toggleRelation("allowed", id)}
                placeholder="Allow drivers"
                searchPlaceholder="Search drivers…"
                emptyText="No drivers found."
                icon={Users}
              />
              <DriverAvatarRow
                drivers={driverOpts.filter((d) => relations.allowed.includes(d.id))}
                emptyText="No drivers allowed yet."
              />
            </StackRow>
            <StackRow label="Blocked drivers" hint="Never assigned here">
              <SearchMultiSelect
                items={driverOpts.map((d) => ({ id: d.id, label: d.name }))}
                selected={relations.blocked}
                onToggle={(id) => toggleRelation("blocked", id)}
                placeholder="Block drivers"
                searchPlaceholder="Search drivers…"
                emptyText="No drivers found."
                icon={Ban}
                badgeTone="destructive"
              />
              <DriverAvatarRow
                drivers={driverOpts.filter((d) => relations.blocked.includes(d.id))}
                blocked
                emptyText="No drivers blocked."
              />
            </StackRow>
          </Group>
        )}
      </div>

      {/* Sticky action bar — full-width primary Save (Stops "Submit Order" recipe),
          inline Saving…/Saved status + small ghost Cancel above it. */}
      <div className="sticky bottom-0 z-10 space-y-1.5 border-border/50 border-t bg-card/95 px-3 py-2.5 backdrop-blur-sm">
        <div className="flex min-h-4 items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {error ? (
              <p className="truncate text-11 text-rose-500">{error}</p>
            ) : saving ? (
              <p className="inline-flex items-center gap-1 text-11 text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Saving…
              </p>
            ) : savedTick ? (
              <p className="inline-flex items-center gap-1 text-11 text-emerald-600 dark:text-emerald-500">
                <CircleCheck className="size-3.5" aria-hidden="true" /> Saved
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={cancelForm}
            disabled={saving}
            className="shrink-0 text-11 text-muted-foreground/60 transition-colors hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        <Button
          onClick={submit}
          disabled={saving}
          className="h-8 w-full gap-1.5 rounded-lg bg-primary font-semibold text-xs text-primary-foreground shadow-sm ring-1 ring-primary/20 hover:brightness-110 dark:ring-primary/40"
        >
          {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          Save hub
        </Button>
      </div>
    </div>
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
      {/* ═══ LEFT COLUMN — the list (v2 split: 17% / min 240px; map gets the rest) ═══ */}
      <div className={cn(
        "h-full w-full min-w-0 flex-col overflow-hidden border-r border-border/50 bg-card pb-14 shadow-[inset_-1px_0_0_0_hsl(var(--border)/0.6)] sm:flex sm:w-[17%] sm:min-w-[240px] sm:shrink-0 sm:pb-0",
        mobileTab === "list" ? "flex" : "hidden",
      )}>
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
                className="h-full w-full min-w-0 bg-transparent text-13 outline-none placeholder:text-muted-foreground/40"
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
              className="h-8 w-full border-border/60 bg-background text-13"
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
              <p className="type-body-sm font-medium">{loadError ? "Couldn't load hubs" : "No hubs yet"}</p>
              <p className="type-caption max-w-xs">
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
            <p className="px-4 py-10 text-center text-13 text-muted-foreground">
              No hubs match those filters.
            </p>
          ) : (
            <div>
              {filtered.map((hub) => (
                <HubRow
                  key={hub.id}
                  hub={hub}
                  selected={selectedId === hub.id}
                  onSelect={() => selectHub(hub)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ CENTER COLUMN — inline editable form (v2 split: 21% / min 300px) ═══ */}
      <div className={cn(
        "h-full w-full flex-col overflow-hidden border-r border-border/50 bg-card pb-14 sm:flex sm:w-[21%] sm:min-w-[300px] sm:shrink-0 sm:pb-0",
        mobileTab === "detail" ? "flex" : "hidden",
      )}>
        {showForm ? (
          centerForm
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-muted/15 px-8 text-center">
            <div className="mb-5 w-full">
              <IsoDepotScene variant="empty" />
            </div>
            <p className="type-body-sm font-bold text-foreground">No hub selected</p>
            <p className="type-caption mt-1.5 max-w-[200px] leading-relaxed">
              Select a hub to edit it, or add a new one
            </p>
          </div>
        )}
      </div>

      {/* ═══ MAP COLUMN — persistent (flex-1, now ~62% of the screen) ═══ */}
      <div className={cn(
        "h-full w-full min-h-0 overflow-hidden bg-muted/20 pb-14 sm:block sm:flex-1 sm:pb-0",
        mobileTab === "map" ? "block" : "hidden",
      )}>
        <HubMapPanel hub={selectedHub} />
      </div>

      {/* ═══ MOBILE — sticky bottom nav (List · Details · Map) ═══ */}
      <MobileTabBar
        active={mobileTab}
        onChange={setMobileTab}
        hasSelection={showForm}
        tabs={[
          { key: "list", label: "Hubs", icon: List },
          { key: "detail", label: "Details", icon: ClipboardList },
          { key: "map", label: "Map", icon: MapIcon },
        ]}
      />

    </div>
  );
}

// ── Compact list row — literal Stops row layout (3-line block + right badge) ──
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
  const a = hub.address ?? {};
  const cityLine = [a.city, a.state, a.zip]
    .filter(Boolean)
    .join(", ")
    .replace(/, (\d)/, " $1");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2.5 border-b border-l-2 border-border/50 px-2.5 py-2 text-left transition-colors",
        selected
          ? "border-l-primary bg-blue-50 dark:bg-primary/20"
          : "border-l-transparent bg-card hover:bg-muted/30",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
          hub.is_default ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Building2 className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-13 font-semibold text-foreground leading-tight">{formatDisplayCase(hub.name)}</p>
        {a.line1 && (
          <p className="mt-0.5 truncate text-11 text-foreground/65 leading-tight">{formatDisplayCase(a.line1)}</p>
        )}
        {cityLine && (
          <p className="mt-0.5 truncate text-11 text-foreground/65 leading-tight">{formatDisplayCase(cityLine)}</p>
        )}
        <p className="mt-0.5 truncate font-mono text-10 tabular-nums text-muted-foreground/50">
          {c.start}–{c.end} · max {c.maxStops}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 self-center">
        {hub.is_default ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-10 font-semibold text-primary ring-1 ring-primary/20">
            <Star className="size-3" aria-hidden="true" /> Default
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-10 font-medium text-muted-foreground ring-1 ring-border">
            Hub
          </span>
        )}
        {c.roundtrip && (
          <span className="inline-flex items-center gap-1 text-10 text-muted-foreground/60">
            <Repeat className="size-3" aria-hidden="true" /> RT
          </span>
        )}
      </div>
    </div>
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
          <p className="type-body-sm font-bold text-foreground/70">Fleet map</p>
          <p className="type-caption mt-1 leading-relaxed">
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

// Collapsible section — borderless, divider-separated (matches Stops detail sections).
function Group({
  icon: Icon,
  title,
  note,
  defaultOpen = true,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  note?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/10 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-muted-foreground/50" aria-hidden={true} />
          <span className="text-xs font-semibold tracking-[-0.01em] text-foreground/80">{title}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground/35 transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="px-3 pb-2">
          {note && <p className="mb-1 text-11 text-muted-foreground/55 leading-snug">{note}</p>}
          {children}
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
          className="h-8 border-0 bg-transparent pr-16 text-13 focus-visible:border-0 focus-visible:ring-0"
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

// Shared borderless, right-aligned control style for FieldRow inputs — mirrors
// the Stops detail form (h-7, underline-on-focus, 13px medium, right-aligned).
const ROW_INPUT =
  "h-7 min-w-0 rounded-none border-0 border-b border-transparent bg-transparent px-0.5 text-right text-13 font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-0 focus-visible:ring-0";

// Stops FieldRow: label LEFT, control RIGHT, thin divider between rows.
function FieldRow({
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
    <div className="border-b border-border/[0.07] py-2 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <span className="shrink-0 text-11 text-muted-foreground/65 leading-snug">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </span>
        <div className="flex min-w-0 items-center justify-end gap-1.5">{children}</div>
      </div>
      {error && <p className="mt-1 text-right text-11 text-rose-500">{error}</p>}
    </div>
  );
}

// Wide variant for long controls (address autocompletes): label on top, control
// full-width beneath — same divider rhythm as FieldRow.
function StackRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 border-b border-border/[0.07] py-2 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0 text-11 text-muted-foreground/65 leading-snug">{label}</span>
        {hint && <span className="type-caption truncate">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
