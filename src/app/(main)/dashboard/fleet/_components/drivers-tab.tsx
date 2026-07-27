"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ArrowLeft,
  Ban,
  ClipboardList,
  List,
  Building2,
  ChevronDown,
  ChevronsUpDown,
  CircleCheck,
  Contact,
  Copy,
  Loader2,
  Map as MapIcon,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";

import {
  AddressAutocomplete,
  type PlaceDetails,
} from "@/components/ui/address-autocomplete";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatDisplayCase } from "@/lib/format-display";
import { Group, FieldRow, StackRow, ROW_INPUT } from "@/components/form-rows";
import { type Address, buildAddress, formatAddr, formatPhone, formatPhoneInput, fullAddress, hasAddr } from "@/lib/format";
import { cn } from "@/lib/utils";

import { PersonAvatar } from "@/components/ui/avatar-group";

import { MobileTabBar } from "./field-controls";
import { FleetRouteMap } from "./fleet-route-map";

type Hub = {
  id: string;
  name: string;
  address?: Address | null;
  geo?: { lat?: number; lng?: number } | null;
  is_default?: boolean;
};

type Driver = {
  id: string;
  tenant_id: number;
  name: string;
  phone: string;
  email: string | null;
  hub_id: string | null;
  all_hubs?: boolean;
  hub_ids?: string[];
  vehicle: { description?: string } | Record<string, unknown> | null;
  status: "active" | "inactive";
  external_circuit_id: string | null;
  // Optional — the backend will start returning these; treat absence as empty.
  address?: Address | null;
  geo?: { lat?: number; lng?: number } | null;
  doc?: { display_name?: string; circuit_depots?: unknown; recruiting?: unknown };
  created_at?: string;
  updated_at?: string;
};

type FormState = {
  name: string;
  phone: string;
  email: string;
  allHubs: boolean;
  hubIds: string[];
  vehicle: string;
  // Optional address (maps to payload.address + payload.geo only when filled).
  addressValue: string;
  addressSelected: boolean;
  line1: string;
  city: string;
  state: string;
  zip: string;
  lat: string;
  lng: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  email: "",
  allHubs: false,
  hubIds: [],
  vehicle: "",
  addressValue: "",
  addressSelected: false,
  line1: "",
  city: "",
  state: "",
  zip: "",
  lat: "",
  lng: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function vehicleText(v: Driver["vehicle"]): string {
  if (!v || typeof v !== "object") return "";
  const desc = (v as { description?: unknown }).description;
  return typeof desc === "string" ? desc : "";
}

// Serialize the form → API payload. Pure so manual save and autosave produce
// byte-identical bodies (autosave compares serializations to detect changes).
// Payload shape is unchanged: vehicle {} when empty, address/geo only when filled.
function payloadFromForm(f: FormState): Record<string, unknown> {
  const digits = f.phone.replace(/\D/g, "");
  const payload: Record<string, unknown> = {
    name: f.name.trim(),
    phone: digits,
    email: f.email.trim() || null,
    all_hubs: f.allHubs,
    hub_ids: f.allHubs ? [] : f.hubIds,
    // FastAPI expects a dict for vehicle — send {} (not null) when empty, or it 422s.
    vehicle: f.vehicle.trim() ? { description: f.vehicle.trim() } : {},
  };

  // Optional address — include address + geo ONLY when the user filled it in.
  // When empty, both keys are omitted so existing saves stay byte-identical.
  const driverAddress = buildAddress(f.line1, f.city, f.state, f.zip);
  if (driverAddress) {
    payload.address = driverAddress;
    const lat = f.lat.trim() ? Number(f.lat) : undefined;
    const lng = f.lng.trim() ? Number(f.lng) : undefined;
    if ((lat != null && !Number.isNaN(lat)) || (lng != null && !Number.isNaN(lng))) {
      payload.geo = {
        lat: lat != null && !Number.isNaN(lat) ? lat : undefined,
        lng: lng != null && !Number.isNaN(lng) ? lng : undefined,
      };
    }
  }
  return payload;
}

// Resolve a driver's default hub: the hub matching hub_id (unless all_hubs),
// otherwise the tenant's is_default hub.
function resolveDefaultHub(driver: Driver, hubs: Hub[]): Hub | null {
  if (!driver.all_hubs) {
    const primaryId = driver.hub_id ?? driver.hub_ids?.[0];
    if (primaryId) {
      const match = hubs.find((h) => h.id === primaryId);
      if (match) return match;
    }
  }
  return hubs.find((h) => h.is_default) ?? null;
}

// ── Searchable multi-select of hubs (Popover + Command) ──────────────────────
function HubMultiSelect({
  hubs,
  selected,
  onToggle,
}: {
  hubs: Hub[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedHubs = useMemo(
    () => hubs.filter((h) => selected.includes(h.id)),
    [hubs, selected],
  );

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 w-full justify-between font-normal text-13"
          >
            <span className="flex items-center gap-2 truncate">
              <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              {selected.length > 0 ? (
                <span>
                  Select hubs <span className="text-muted-foreground">· {selected.length} selected</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Select hubs</span>
              )}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search hubs…" />
            <CommandList>
              <CommandEmpty>No hubs found.</CommandEmpty>
              <CommandGroup>
                {hubs.map((h) => {
                  const isSel = selected.includes(h.id);
                  return (
                    <CommandItem
                      key={h.id}
                      value={h.name}
                      data-checked={isSel}
                      onSelect={() => onToggle(h.id)}
                    >
                      <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{h.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedHubs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedHubs.map((h) => (
            <Badge key={h.id} variant="secondary" className="gap-1 pr-1">
              {h.name}
              <button
                type="button"
                onClick={() => onToggle(h.id)}
                className="grid size-4 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                aria-label={`Remove ${h.name}`}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function DriversTab() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loadError, setLoadError] = useState(false);

  // Inline center form: `creating` opens a blank form; otherwise a selected
  // driver is edited in place. `editing` mirrors the record backing the form
  // (drives POST vs PATCH + the header/id chip + status actions).
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);

  const [statusTarget, setStatusTarget] = useState<Driver | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Toolbar filters (the status select replaces the old "Show inactive" switch).
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [query, setQuery] = useState("");

  // Selected driver → drives the center form + the right map column.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Mobile (<sm) tri-pane navigation: List · Details · Map (Stops pattern).
  const [mobileTab, setMobileTab] = useState<"list" | "detail" | "map">("list");

  // Resilient load: on a transient failure at mount, retry once after a short
  // delay before surfacing the error.
  function loadDrivers(retry = true) {
    setLoadError(false);
    fetch("/api/client/drivers")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setDrivers((d.drivers ?? []) as Driver[]))
      .catch(() => {
        if (retry) {
          setTimeout(() => loadDrivers(false), 1200);
          return;
        }
        setDrivers([]);
        setLoadError(true);
      });
  }

  // Hubs are needed to resolve names + map routes. Retry once on failure so a
  // transient hiccup at mount doesn't leave the list stuck on "Unknown hub".
  function loadHubs(retry = true) {
    fetch("/api/client/hubs")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setHubs((d.hubs ?? []) as Hub[]))
      .catch(() => {
        if (retry) {
          setTimeout(() => loadHubs(false), 1200);
          return;
        }
        setHubs([]);
      });
  }

  useEffect(() => {
    loadDrivers();
    loadHubs();
  }, []);

  const hubNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of hubs) map.set(h.id, h.name);
    return map;
  }, [hubs]);

  // Render a driver's hub assignment: a list of hub names, or "—".
  function hubNames(ids: string[]): string {
    const names = ids.map((id) => hubNameMap.get(id) ?? "Unknown hub");
    if (names.length === 0) return "—";
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  }

  const inactiveCount = useMemo(
    () => (drivers ?? []).filter((d) => d.status !== "active").length,
    [drivers],
  );

  // Apply status filter → search query, then keep active-first alphabetical order.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (drivers ?? []).filter((d) => {
      if (statusFilter === "active" && d.status !== "active") return false;
      if (statusFilter === "inactive" && d.status === "active") return false;
      if (!q) return true;
      const phoneDigits = (d.phone || "").replace(/\D/g, "");
      return (
        (d.name || "").toLowerCase().includes(q) ||
        phoneDigits.includes(q.replace(/\D/g, "")) ||
        (d.email ?? "").toLowerCase().includes(q)
      );
    });
    return list.sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [drivers, statusFilter, query]);

  // Resolve the selected driver from the loaded list (stays in sync on reload).
  const selectedDriver = selectedId ? (drivers ?? []).find((d) => d.id === selectedId) ?? null : null;
  const showForm = creating || Boolean(selectedDriver);

  // Map a driver record → the editable form state.
  function formFromDriver(driver: Driver): FormState {
    const ids = Array.isArray(driver.hub_ids)
      ? driver.hub_ids
      : driver.hub_id
        ? [driver.hub_id]
        : [];
    return {
      name: driver.name ?? "",
      phone: formatPhoneInput(driver.phone ?? ""),
      email: driver.email ?? "",
      allHubs: Boolean(driver.all_hubs),
      hubIds: ids,
      vehicle: vehicleText(driver.vehicle),
      addressValue: formatAddr(driver.address),
      addressSelected: hasAddr(driver.address),
      line1: driver.address?.line1 ?? "",
      city: driver.address?.city ?? "",
      state: driver.address?.state ?? "",
      zip: driver.address?.zip ?? "",
      lat: driver.geo?.lat != null ? String(driver.geo.lat) : "",
      lng: driver.geo?.lng != null ? String(driver.geo.lng) : "",
    };
  }

  function openAdd() {
    setMobileTab("detail");
    setCreating(true);
    setSelectedId(null);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setSavedTick(false);
    setAttempted(false);
  }

  // Select a row → load it into the inline editor. The autosave baseline is the
  // record's own serialized payload — edits are detected against it.
  function selectDriver(driver: Driver) {
    setMobileTab("detail");
    setCreating(false);
    setSelectedId(driver.id);
    setEditing(driver);
    const f = formFromDriver(driver);
    setForm(f);
    lastSavedRef.current = JSON.stringify(payloadFromForm(f));
    setError("");
    setSavedTick(false);
    setAttempted(false);
  }

  // Duplicate: open the create form pre-filled from the selected driver (no id).
  function duplicateDriver() {
    if (!editing) return;
    setCreating(true);
    setSelectedId(null);
    setEditing(null);
    setForm({ ...form });
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
      setForm(formFromDriver(editing));
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

  // ── Address handlers ──
  function onAddressPlace(d: PlaceDetails) {
    setForm((f) => ({
      ...f,
      addressValue: d.formatted_address || d.street || f.addressValue,
      line1: d.street ?? "",
      city: d.city ?? "",
      state: d.state ?? "",
      zip: d.zip ?? "",
      lat: d.lat != null ? String(d.lat) : "",
      lng: d.lng != null ? String(d.lng) : "",
      addressSelected: true,
    }));
  }
  function clearAddress() {
    setForm((f) => ({
      ...f,
      addressValue: "",
      line1: "",
      city: "",
      state: "",
      zip: "",
      lat: "",
      lng: "",
      addressSelected: false,
    }));
  }

  const phoneDigits = form.phone.replace(/\D/g, "");
  const phoneInvalid = phoneDigits.length !== 10;
  const emailInvalid = form.email.trim() !== "" && !EMAIL_RE.test(form.email.trim());
  const nameError = attempted && !form.name.trim();
  const phoneError = (attempted || phoneDigits.length > 0) && phoneInvalid;

  async function submit() {
    setAttempted(true);
    setSavedTick(false);
    if (!form.name.trim()) {
      setError("Driver name is required.");
      return;
    }
    if (phoneDigits.length !== 10) {
      setError("Phone must be 10 digits.");
      return;
    }
    if (emailInvalid) {
      setError("Enter a valid email address.");
      return;
    }

    const serialized = JSON.stringify(payloadFromForm(form));

    setSaving(true);
    setError("");
    const url = editing ? `/api/client/drivers/${encodeURIComponent(editing.id)}` : "/api/client/drivers";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: serialized,
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {};
      setError(j.error || "Could not save the driver. The fleet service may be unavailable — try again shortly.");
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
    loadDrivers();
  }

  // ── Autosave (existing records only) ──────────────────────────────────────
  // Debounced 1.2s after the last change; compares the serialized payload to
  // the last-saved baseline, PATCHes silently, and shows Saving…/Saved inline.
  // New records save only via the button. Invalid states never autosave.
  const lastSavedRef = useRef("");
  useEffect(() => {
    if (!editing || creating || saving) return;
    const digits = form.phone.replace(/\D/g, "");
    if (!form.name.trim() || digits.length !== 10) return;
    if (form.email.trim() !== "" && !EMAIL_RE.test(form.email.trim())) return;
    const serialized = JSON.stringify(payloadFromForm(form));
    if (serialized === lastSavedRef.current) return;
    const t = setTimeout(async () => {
      setSaving(true);
      setError("");
      const res = await fetch(`/api/client/drivers/${encodeURIComponent(editing.id)}`, {
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
      loadDrivers();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, editing, creating, saving]);

  async function confirmStatusChange() {
    if (!statusTarget) return;
    const driver = statusTarget;
    const deactivating = driver.status === "active";
    setBusyId(driver.id);
    const res = await fetch(`/api/client/drivers/${encodeURIComponent(driver.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deactivating ? { action: "deactivate" } : { status: "active" }),
    }).catch(() => null);
    setBusyId(null);
    setStatusTarget(null);
    if (res?.ok) {
      // Keep the open editor's header badge in sync with the new status.
      setEditing((prev) =>
        prev && prev.id === driver.id
          ? { ...prev, status: deactivating ? "inactive" : "active" }
          : prev,
      );
      loadDrivers();
    } else {
      // Optimistic-free: surface a transient error inline via the form error banner.
      const j = res ? await res.json().catch(() => ({})) : {};
      setError(j.error || "Could not update the driver's status. Try again shortly.");
    }
  }

  function toggleHub(id: string) {
    setForm((f) => ({
      ...f,
      hubIds: f.hubIds.includes(id) ? f.hubIds.filter((x) => x !== id) : [...f.hubIds, id],
    }));
  }

  const inactive = editing ? editing.status !== "active" : false;


  // Stops detail-header icon-button recipe (shared by every header command).
  const HEADER_BTN =
    "flex size-7 items-center justify-center rounded-md transition-all text-muted-foreground/60 hover:bg-muted hover:text-foreground";

  // ── Inline center form (shared by desktop center + mobile overlay) ──
  const centerForm = (
    <div className="flex min-h-full flex-col bg-card lg:min-h-0">
      {/* Header — accent bar + identity block + command row (Stops detail pattern)
          + isometric courier garnish behind the right edge (text stays on top) */}
      <div className="relative sticky top-0 z-10 shrink-0 overflow-hidden border-border/50 border-b bg-card">
        <div className={cn("h-[3px] w-full", inactive ? "bg-muted-foreground/40" : "bg-primary")} />
        {/* Stops-class header treatment: status-driven soft wash, no artwork */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent",
            inactive ? "from-muted-foreground/15" : "from-primary/15",
          )}
          aria-hidden="true"
        />
        <div className="relative flex items-center justify-between px-4 pt-2.5 pb-1.5">
          <span className="font-mono text-10 text-primary dark:text-white/80">
            {editing ? "Driver" : "New driver"}
          </span>
          <div className="flex items-center gap-1">
            {editing && (
              <button
                type="button"
                onClick={duplicateDriver}
                title="Duplicate driver"
                aria-label="Duplicate driver"
                className={HEADER_BTN}
              >
                <Copy className="size-3.5" aria-hidden="true" />
              </button>
            )}
            {/* Delete = the existing deactivate flow (no driver DELETE API) — only
                offered while active; the confirm dialog stays the gate. */}
            {editing && !inactive && (
              <button
                type="button"
                onClick={() => setStatusTarget(editing)}
                disabled={busyId === editing.id}
                title="Delete (deactivate) driver"
                aria-label="Delete driver"
                className={cn(HEADER_BTN, "hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50")}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            )}
            {editing && (
              <button
                type="button"
                onClick={() => setStatusTarget(editing)}
                disabled={busyId === editing.id}
                title={inactive ? "Reactivate" : "Deactivate"}
                aria-label={inactive ? "Reactivate" : "Deactivate"}
                className={cn(HEADER_BTN, "disabled:opacity-50")}
              >
                {inactive ? (
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                ) : (
                  <Ban className="size-3.5" aria-hidden="true" />
                )}
              </button>
            )}
            <div className="mx-1 h-4 w-px bg-border/60" />
            <button type="button" onClick={closeForm} aria-label="Close" className={HEADER_BTN}>
              <ArrowLeft className="size-3.5 lg:hidden" aria-hidden="true" />
              <X className="hidden size-3.5 lg:block" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="relative px-4 pb-3">
          <p className="truncate pr-12 font-bold text-base text-foreground leading-tight tracking-tight">
            {formatDisplayCase(form.name.trim()) || "Untitled driver"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {inactive ? (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-10 font-semibold text-muted-foreground ring-1 ring-border">
                Inactive
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-10 font-semibold text-primary ring-1 ring-primary/20">
                Active
              </span>
            )}
          </div>
          {/* Corner avatar — overlaps the gradient edge, bottom-right */}
          {form.name.trim() && (
            <PersonAvatar
              person={{ id: editing?.id ?? "new", name: form.name.trim() }}
              size="size-9"
              ring={false}
              className={cn("absolute right-4 -bottom-1 shadow-sm", inactive && "grayscale opacity-80")}
            />
          )}
        </div>
      </div>

      {/* Body — borderless collapsible sections */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Details ── */}
        <Group icon={Contact} title="Details">
          <FieldRow label="Full name" required error={nameError ? "Driver name is required." : undefined}>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Jane Doe"
              aria-invalid={nameError || undefined}
              className={cn(ROW_INPUT, "w-full")}
            />
          </FieldRow>

          <FieldRow
            label="Phone"
            required
            error={phoneError ? "Enter a 10-digit phone number." : undefined}
          >
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneInput(e.target.value) }))}
              placeholder="(305) 555-0100"
              inputMode="tel"
              aria-invalid={phoneError || undefined}
              className={cn(ROW_INPUT, "w-[150px] font-mono tabular-nums")}
            />
          </FieldRow>

          <FieldRow label="Email" error={emailInvalid ? "Enter a valid email." : undefined}>
            <input
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="jane@example.com"
              type="email"
              aria-invalid={emailInvalid || undefined}
              className={cn(ROW_INPUT, "w-full")}
            />
          </FieldRow>

          <FieldRow label="Vehicle">
            <input
              value={form.vehicle}
              onChange={(e) => setForm((f) => ({ ...f, vehicle: e.target.value }))}
              placeholder="White Ford Transit"
              className={cn(ROW_INPUT, "w-full")}
            />
          </FieldRow>

          <StackRow label="Address" hint="Optional">
            <AddressField
              value={form.addressValue}
              selected={form.addressSelected}
              placeholder="Search driver address…"
              onChange={(v) => setForm((f) => ({ ...f, addressValue: v, addressSelected: false }))}
              onPlaceDetails={onAddressPlace}
              onClear={clearAddress}
            />
          </StackRow>
        </Group>

        {/* ── Hubs ── */}
        <Group icon={Building2} title="Hubs">
          <FieldRow label="All hubs">
            <Switch
              checked={form.allHubs}
              onCheckedChange={(v) => setForm((f) => ({ ...f, allHubs: v }))}
            />
          </FieldRow>

          {!form.allHubs && (
            <StackRow label="Assigned hubs">
              {hubs.length === 0 ? (
                <p className="rounded-lg border border-border/60 px-3 py-2 type-caption">
                  No hubs available yet.
                </p>
              ) : (
                <HubMultiSelect hubs={hubs} selected={form.hubIds} onToggle={toggleHub} />
              )}
            </StackRow>
          )}
        </Group>
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
          Save driver
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
        "h-full w-full min-w-0 flex-col overflow-hidden border-r border-border/50 bg-card pb-14 shadow-[inset_-1px_0_0_0_hsl(var(--border)/0.6)] lg:flex lg:w-(--spacing-panel-list-w) lg:shrink-0 lg:pb-0",
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
                placeholder="Search drivers…"
                aria-label="Search drivers"
                className="h-full w-full min-w-0 bg-transparent text-13 outline-none placeholder:text-muted-foreground/40"
              />
            </div>
            <Button size="sm" className="h-9 shrink-0" onClick={openAdd}>
              <Plus className="mr-1 size-4" aria-hidden="true" /> New
            </Button>
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as "active" | "inactive" | "all")}
          >
            <SelectTrigger
              size="sm"
              className="h-8 w-full border-border/60 bg-background text-13"
              aria-label="Filter by status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive{inactiveCount ? ` (${inactiveCount})` : ""}</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          {/* Count chip — respects the active filter: filtered · total */}
          <div className="flex items-center justify-end">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-10 font-medium tabular-nums text-muted-foreground ring-1 ring-border">
              <span className="font-semibold text-foreground">{filtered.length}</span>
              {statusFilter === "all" ? "drivers" : statusFilter}
              <span className="text-muted-foreground/50">·</span>
              {(drivers ?? []).length} total
            </span>
          </div>
        </div>

        {/* List — independent scroll */}
        <div className="flex-1 overflow-y-auto">
          {!drivers ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={`drv-${i}`} className="h-14 w-full" />
              ))}
            </div>
          ) : drivers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                <Users className="size-6" aria-hidden="true" />
              </span>
              <p className="type-body-sm font-medium">{loadError ? "Couldn't load drivers" : "No drivers yet"}</p>
              <p className="type-caption max-w-xs">
                {loadError
                  ? "There was a problem reaching the fleet service. Try again."
                  : "Add the drivers who pick up and deliver packages for Routely."}
              </p>
              {loadError ? (
                <Button size="sm" variant="outline" className="mt-2 h-9" onClick={() => loadDrivers()}>
                  Retry
                </Button>
              ) : (
                <Button size="sm" className="mt-2 h-9" onClick={openAdd}>
                  <Plus className="mr-1.5 size-4" aria-hidden="true" /> Add your first driver
                </Button>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-13 text-muted-foreground">
              No drivers match those filters.
            </p>
          ) : (
            <div>
              {filtered.map((driver) => (
                <DriverRow
                  key={driver.id}
                  driver={driver}
                  hubNames={hubNames}
                  selected={selectedId === driver.id}
                  onSelect={() => selectDriver(driver)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ CENTER COLUMN — inline editable form (v2 split: 21% / min 300px) ═══ */}
      <div className={cn(
        "h-full w-full flex-col overflow-hidden border-r border-border/50 bg-card pb-14 lg:flex lg:w-(--spacing-panel-detail-w) lg:shrink-0 lg:pb-0",
        mobileTab === "detail" ? "flex" : "hidden",
      )}>
        {showForm ? (
          centerForm
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-muted/15 px-8 text-center">
            <div className="mb-5 w-full max-w-[240px] overflow-hidden rounded-2xl shadow-sm ring-1 ring-border/60">
              {/* Higgsfield isometric courier van — premium hero for the empty state */}
              <img
                src="/art/iso-driver.png"
                alt=""
                aria-hidden="true"
                className="block w-full dark:opacity-90"
                loading="lazy"
              />
            </div>
            <p className="type-body-sm font-bold text-foreground">No driver selected</p>
            <p className="type-caption mt-1.5 max-w-[200px] leading-relaxed">
              Select a driver to edit it, or add a new one
            </p>
          </div>
        )}
      </div>

      {/* ═══ MAP COLUMN — persistent (flex-1, now ~62% of the screen) ═══ */}
      <div className={cn(
        "h-full w-full min-h-0 overflow-hidden bg-muted/20 pb-14 lg:block lg:flex-1 lg:pb-0",
        mobileTab === "map" ? "block" : "hidden",
      )}>
        <DriverMapPanel driver={selectedDriver} hubs={hubs} />
      </div>

      {/* ═══ MOBILE — sticky bottom nav (List · Details · Map) ═══ */}
      <MobileTabBar
        active={mobileTab}
        onChange={setMobileTab}
        hasSelection={showForm}
        tabs={[
          { key: "list", label: "Drivers", icon: List },
          { key: "detail", label: "Details", icon: ClipboardList },
          { key: "map", label: "Map", icon: MapIcon },
        ]}
      />


      {/* Status change confirm — rendered regardless of view */}
      <StatusConfirm
        statusTarget={statusTarget}
        setStatusTarget={setStatusTarget}
        confirmStatusChange={confirmStatusChange}
      />
    </div>
  );
}

// ── Compact list row — literal Stops row layout (3-line block + right badge) ──
function DriverRow({
  driver,
  hubNames,
  selected,
  onSelect,
}: {
  driver: Driver;
  hubNames: (ids: string[]) => string;
  selected: boolean;
  onSelect: () => void;
}) {
  const inactive = driver.status !== "active";
  const ids = Array.isArray(driver.hub_ids) ? driver.hub_ids : driver.hub_id ? [driver.hub_id] : [];
  const vehicle = vehicleText(driver.vehicle);
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
        "flex w-full cursor-pointer items-center gap-2 border-b border-l-2 border-border/50 px-2.5 py-1.5 text-left transition-colors",
        inactive && "opacity-60",
        selected
          ? "border-l-primary bg-blue-50 dark:bg-primary/20"
          : "border-l-transparent bg-card hover:bg-muted/30",
      )}
    >
      <PersonAvatar person={{ id: driver.id, name: driver.name }} size="size-7" ring={false} className={cn(inactive && "grayscale opacity-70")} />
      <div className="min-w-0 flex-1">
        {/* Line 1 — name + status (6px dot + colored 10px label) */}
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-12 font-semibold text-foreground leading-snug">
            {formatDisplayCase(driver.name)}
          </p>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 text-10 font-medium",
              inactive ? "text-muted-foreground/60" : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
            {inactive ? "Inactive" : "Active"}
          </span>
        </div>
        {/* Line 2 — phone · hubs · vehicle merged into one muted line */}
        {/* Line 2 — phone · hubs LEFT (truncates w/ tooltip), vehicle RIGHT
            (own slot, never swallowed by the truncation). */}
        <div className="mt-px flex items-center justify-between gap-2">
          {(() => {
            const meta = [
              formatPhone(driver.phone),
              driver.all_hubs ? "All hubs" : formatDisplayCase(hubNames(ids)),
            ]
              .filter((x) => x && x !== "—")
              .join(" · ");
            return (
              <p className="min-w-0 truncate text-11 text-muted-foreground/75 leading-snug tabular-nums" title={meta}>
                {meta || "—"}
              </p>
            );
          })()}
          {vehicle && (
            <span className="max-w-[38%] truncate text-10 text-muted-foreground/60" title={vehicle}>
              {vehicle}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Persistent map panel — empty state when nothing selected ──────────────────
function DriverMapPanel({ driver, hubs }: { driver: Driver | null; hubs: Hub[] }) {
  if (!driver) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border/60">
          <MapIcon className="size-7 text-muted-foreground/50" aria-hidden="true" />
        </div>
        <div className="text-center">
          <p className="type-body-sm font-bold text-foreground/70">Fleet map</p>
          <p className="type-caption mt-1 leading-relaxed">
            Select a driver to see
            <br />
            the route
          </p>
        </div>
      </div>
    );
  }

  const driverAddr = fullAddress(driver.address);
  const defaultHub = resolveDefaultHub(driver, hubs);
  const hubAddr = defaultHub ? fullAddress(defaultHub.address) : "";
  const hubName = defaultHub?.name;

  // Real A→B route when the driver has an address; otherwise a single hub point
  // with a hint prompting the user to add one.
  const showRoute = Boolean(driverAddr && hubAddr);
  const mapHint = !driverAddr && hubAddr ? "Add a driver address to see the route." : "";

  return (
    <div className="relative h-full w-full">
      {showRoute ? (
        <FleetRouteMap
          originAddr={driverAddr}
          originName={driver.name}
          destinationAddr={hubAddr}
          destinationName={hubName}
        />
      ) : (
        <FleetRouteMap singlePoint destinationAddr={hubAddr} destinationName={hubName} />
      )}
      {mapHint && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center p-3">
          <p className="type-caption inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/95 px-3 py-1.5 shadow-sm backdrop-blur-sm">
            <Navigation className="size-3.5" aria-hidden="true" /> {mapHint}
          </p>
        </div>
      )}
    </div>
  );
}

function StatusConfirm({
  statusTarget,
  setStatusTarget,
  confirmStatusChange,
}: {
  statusTarget: Driver | null;
  setStatusTarget: (d: Driver | null) => void;
  confirmStatusChange: () => void;
}) {
  return (
    <AlertDialog open={Boolean(statusTarget)} onOpenChange={(o) => !o && setStatusTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {statusTarget?.status === "active" ? "Deactivate this driver?" : "Reactivate this driver?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {statusTarget?.status === "active"
              ? `${statusTarget?.name} will no longer be assignable to routes until reactivated.`
              : `${statusTarget?.name} will be available for route assignment again.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmStatusChange}
            className={cn(
              statusTarget?.status === "active" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {statusTarget?.status === "active" ? "Deactivate" : "Reactivate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
