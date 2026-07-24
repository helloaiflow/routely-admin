"use client";

import { useEffect, useMemo, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Ban,
  Building2,
  Car,
  ChevronsUpDown,
  CircleCheck,
  Contact,
  Loader2,
  Mail,
  Map as MapIcon,
  Navigation,
  Pencil,
  Plus,
  RotateCcw,
  Search,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { FleetRouteMap } from "./fleet-route-map";

type Address = { line1?: string; city?: string; state?: string; zip?: string };

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

// Format the visible phone value as (XXX) XXX-XXXX while typing. Non-digits are
// stripped and the value is capped at 10 digits; submit uses digits only.
function formatPhoneInput(raw: string): string {
  const d = (raw || "").replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function formatPhone(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw || "—";
}

function vehicleText(v: Driver["vehicle"]): string {
  if (!v || typeof v !== "object") return "";
  const desc = (v as { description?: unknown }).description;
  return typeof desc === "string" ? desc : "";
}

function hasAddr(a?: Address | null): boolean {
  return Boolean(a && (a.line1 || a.city || a.state || a.zip));
}

// Joined display string to pre-fill the autocomplete on edit.
function formatAddr(a?: Address | null): string {
  if (!a) return "";
  return [a.line1, a.city, a.state, a.zip].filter(Boolean).join(", ");
}

// Full one-line address for map queries: "line1, City, ST zip".
function fullAddress(a?: Address | null): string {
  if (!a) return "";
  const cityState = [a.city, a.state].filter(Boolean).join(", ");
  const tail = [cityState, a.zip].filter(Boolean).join(" ").trim();
  return [a.line1, tail].filter(Boolean).join(", ");
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
            className="h-9 w-full justify-between font-normal"
          >
            <span className="flex items-center gap-2 truncate">
              <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {selected.length > 0 ? (
                <span>
                  Select hubs <span className="text-muted-foreground">· {selected.length} selected</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Select hubs</span>
              )}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
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

  // Add/Edit form opens in a modal Dialog (shared by New + Edit).
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);

  const [statusTarget, setStatusTarget] = useState<Driver | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Toolbar filters (the status select replaces the old "Show inactive" switch).
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [query, setQuery] = useState("");

  // Selected driver → drives the center detail panel + the right map column.
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setAttempted(false);
    setFormOpen(true);
  }

  function openEdit(driver: Driver) {
    setEditing(driver);
    const ids = Array.isArray(driver.hub_ids)
      ? driver.hub_ids
      : driver.hub_id
        ? [driver.hub_id]
        : [];
    setForm({
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
    });
    setError("");
    setAttempted(false);
    setFormOpen(true);
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

    const hubIds = form.allHubs ? [] : form.hubIds;
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      phone: phoneDigits,
      email: form.email.trim() || null,
      all_hubs: form.allHubs,
      hub_ids: hubIds,
      // FastAPI expects a dict for vehicle — send {} (not null) when empty, or it 422s.
      vehicle: form.vehicle.trim() ? { description: form.vehicle.trim() } : {},
    };

    // Optional address — include address + geo ONLY when the user filled it in.
    // When empty, both keys are omitted so existing saves stay byte-identical.
    const driverAddress = buildAddress(form.line1, form.city, form.state, form.zip);
    if (driverAddress) {
      payload.address = driverAddress;
      const lat = form.lat.trim() ? Number(form.lat) : undefined;
      const lng = form.lng.trim() ? Number(form.lng) : undefined;
      if ((lat != null && !Number.isNaN(lat)) || (lng != null && !Number.isNaN(lng))) {
        payload.geo = {
          lat: lat != null && !Number.isNaN(lat) ? lat : undefined,
          lng: lng != null && !Number.isNaN(lng) ? lng : undefined,
        };
      }
    }

    setSaving(true);
    setError("");
    const url = editing ? `/api/client/drivers/${encodeURIComponent(editing.id)}` : "/api/client/drivers";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {};
      setError(j.error || "Could not save the driver. The fleet service may be unavailable — try again shortly.");
      return;
    }
    setFormOpen(false);
    loadDrivers();
  }

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
      loadDrivers();
    } else {
      // Optimistic-free: surface a transient error inline via the list error banner.
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

  // ── Add/Edit form dialog (shared by New + Edit) ──
  const formDialog = (
    <Dialog open={formOpen} onOpenChange={setFormOpen}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-[600px]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{editing ? "Edit driver" : "New driver"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update this driver's details." : "Add a driver to the Routely fleet."}
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="max-h-[70vh] space-y-6 overflow-y-auto px-5 py-5">
          {/* ── Details ── */}
          <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Contact className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <h4 className="font-semibold text-sm">Details</h4>
                </div>
                <Separator />

                <Field label="Full name" required error={nameError ? "Driver name is required." : undefined}>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Jane Doe"
                    aria-invalid={nameError || undefined}
                    className="h-9"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Phone"
                    required
                    error={phoneError ? "Enter a 10-digit phone number." : undefined}
                  >
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneInput(e.target.value) }))}
                      placeholder="(305) 555-0100"
                      inputMode="tel"
                      aria-invalid={phoneError || undefined}
                      className="h-9 font-mono tabular-nums"
                    />
                  </Field>
                  <Field label="Email" error={emailInvalid ? "Enter a valid email." : undefined}>
                    <Input
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="jane@example.com"
                      type="email"
                      aria-invalid={emailInvalid || undefined}
                      className="h-9"
                    />
                  </Field>
                </div>
                <Field label="Vehicle">
                  <div className="relative">
                    <Car
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      value={form.vehicle}
                      onChange={(e) => setForm((f) => ({ ...f, vehicle: e.target.value }))}
                      placeholder="White Ford Transit"
                      className="h-9 pl-9"
                    />
                  </div>
                </Field>
                <Field label="Address" hint="Optional — used to map the route to the driver's home hub.">
                  <AddressField
                    value={form.addressValue}
                    selected={form.addressSelected}
                    placeholder="Search driver address…"
                    onChange={(v) => setForm((f) => ({ ...f, addressValue: v, addressSelected: false }))}
                    onPlaceDetails={onAddressPlace}
                    onClear={clearAddress}
                  />
                </Field>
              </section>

              {/* ── Hubs ── */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <h4 className="font-semibold text-sm">Hubs</h4>
                </div>
                <Separator />

                <div className="flex items-center justify-between rounded-lg border px-3.5 py-2.5">
                  <div>
                    <p className="font-medium text-sm">All hubs</p>
                    <p className="text-muted-foreground text-xs">Available at every hub in the fleet.</p>
                  </div>
                  <Switch
                    checked={form.allHubs}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, allHubs: v }))}
                  />
                </div>

                {!form.allHubs && (
                  <Field label="Assigned hubs">
                    {hubs.length === 0 ? (
                      <p className="rounded-lg border px-3.5 py-2.5 text-muted-foreground text-sm">
                        No hubs available yet.
                      </p>
                    ) : (
                      <HubMultiSelect hubs={hubs} selected={form.hubIds} onToggle={toggleHub} />
                    )}
                  </Field>
                )}
              </section>

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t px-5 py-3">
          <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />}
            {editing ? "Save changes" : "Create driver"}
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
                placeholder="Search drivers…"
                aria-label="Search drivers"
                className="h-full w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/40"
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
              className="h-8 w-full border-border/60 bg-background text-[13px]"
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
        </div>

        {/* List — independent scroll */}
        <div className="flex-1 overflow-y-auto">
          {error && !statusTarget && (
            <p className="px-3 pt-3 text-destructive text-xs">{error}</p>
          )}
          {!drivers ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={`drv-${i}`} className="h-14 w-full" />
              ))}
            </div>
          ) : drivers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                <Users className="size-6" aria-hidden="true" />
              </span>
              <p className="font-medium text-sm">{loadError ? "Couldn't load drivers" : "No drivers yet"}</p>
              <p className="max-w-xs text-muted-foreground text-xs">
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
            <p className="px-4 py-10 text-center text-muted-foreground text-[13px]">
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
                  onSelect={() => setSelectedId(driver.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ CENTER COLUMN — detail panel (desktop) ═══ */}
      <div className="hidden h-full flex-col overflow-hidden border-border/50 bg-card lg:flex lg:w-[440px] lg:shrink-0 lg:border-r">
        {selectedDriver ? (
          <DriverDetailPanel
            driver={selectedDriver}
            hubs={hubs}
            onClose={() => setSelectedId(null)}
            onEdit={() => openEdit(selectedDriver)}
            onStatus={() => setStatusTarget(selectedDriver)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-muted/15 px-8 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border">
              <Users className="size-7 text-muted-foreground/30" aria-hidden="true" />
            </div>
            <p className="font-bold text-sm text-foreground">No driver selected</p>
            <p className="mt-1.5 max-w-[200px] text-muted-foreground text-xs leading-relaxed">
              Click a driver from the list to view details
            </p>
          </div>
        )}
      </div>

      {/* ═══ MAP COLUMN — persistent (desktop, flex-1) ═══ */}
      <div className="hidden overflow-hidden bg-muted/20 lg:block lg:flex-1">
        <DriverMapPanel driver={selectedDriver} hubs={hubs} />
      </div>

      {/* ═══ MOBILE — full-screen overlay: detail + map stacked ═══ */}
      <AnimatePresence>
        {selectedDriver && (
          <motion.div
            key={selectedDriver.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-background lg:hidden"
          >
            <DriverDetailPanel
              driver={selectedDriver}
              hubs={hubs}
              onClose={() => setSelectedId(null)}
              onEdit={() => openEdit(selectedDriver)}
              onStatus={() => setStatusTarget(selectedDriver)}
            />
            <div className="h-72 shrink-0 overflow-hidden border-border/50 border-t">
              <DriverMapPanel driver={selectedDriver} hubs={hubs} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status change confirm — rendered regardless of view */}
      <StatusConfirm
        statusTarget={statusTarget}
        setStatusTarget={setStatusTarget}
        confirmStatusChange={confirmStatusChange}
      />
    </div>
  );
}

// ── Compact list row (Stops-density) ──────────────────────────────────────────
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
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 border-border/20 border-b border-l-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/30",
        inactive && "opacity-55",
        selected ? "border-l-primary bg-primary/5" : "border-l-transparent",
      )}
    >
      <span
        className={
          inactive
            ? "grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
            : "grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"
        }
      >
        <Users className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium text-[13px]">{driver.name}</span>
          {inactive ? (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              Inactive
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-primary/10 text-primary">
              Active
            </Badge>
          )}
        </span>
        <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground tabular-nums">
          {formatPhone(driver.phone)}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {driver.all_hubs ? "All hubs" : hubNames(ids)}
        </span>
      </span>
    </button>
  );
}

// ── Persistent map panel — empty state when nothing selected ──────────────────
function DriverMapPanel({ driver, hubs }: { driver: Driver | null; hubs: Hub[] }) {
  if (!driver) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-muted/30">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border/60">
          <MapIcon className="size-7 text-muted-foreground/50" aria-hidden="true" />
        </div>
        <div className="text-center">
          <p className="font-bold text-[13px] text-foreground/70">Fleet map</p>
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
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
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/95 px-3 py-1.5 text-muted-foreground text-xs shadow-sm backdrop-blur-sm">
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

// ── Driver detail panel: read-only info + Edit / status (map lives in its own column) ──
function DriverDetailPanel({
  driver,
  hubs,
  onClose,
  onEdit,
  onStatus,
}: {
  driver: Driver;
  hubs: Hub[];
  onClose: () => void;
  onEdit: () => void;
  onStatus: () => void;
}) {
  const inactive = driver.status !== "active";
  const ids = Array.isArray(driver.hub_ids) ? driver.hub_ids : driver.hub_id ? [driver.hub_id] : [];
  const assignedNames = driver.all_hubs
    ? "All hubs"
    : ids.map((id) => hubs.find((h) => h.id === id)?.name ?? "Unknown hub").join(", ") || "—";

  const driverAddr = fullAddress(driver.address);
  const defaultHub = resolveDefaultHub(driver, hubs);

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
        <span className="text-muted-foreground/60 text-xs">Driver details</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={onStatus}
          >
            {inactive ? (
              <>
                <RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" /> Reactivate
              </>
            ) : (
              <>
                <Ban className="mr-1.5 size-3.5" aria-hidden="true" /> Deactivate
              </>
            )}
          </Button>
          <Button size="sm" className="h-8" onClick={onEdit}>
            <Pencil className="mr-1.5 size-3.5" aria-hidden="true" /> Edit
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Title + status */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={
                inactive
                  ? "grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                  : "grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"
              }
            >
              <Users className="size-4" aria-hidden="true" />
            </span>
            <h4 className="type-card-title">{driver.name}</h4>
            {inactive ? (
              <Badge variant="outline" className="bg-muted text-muted-foreground">
                Inactive
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-primary/10 text-primary">
                Active
              </Badge>
            )}
          </div>
          {vehicleText(driver.vehicle) && <p className="type-desc pl-10">{vehicleText(driver.vehicle)}</p>}
        </div>

        {driver.email && (
          <p className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
            <Mail className="size-3.5" aria-hidden="true" /> {driver.email}
          </p>
        )}

        {/* Read rows */}
        <div className="rounded-xl border border-border/60 bg-card px-3 py-1">
          <DetailRow label="Phone" value={formatPhone(driver.phone)} mono />
          <DetailRow label="Email" value={driver.email || "—"} />
          <DetailRow label="Vehicle" value={vehicleText(driver.vehicle) || "—"} />
          <DetailRow label="Assigned hubs" value={assignedNames} />
          <DetailRow label="Default hub" value={defaultHub?.name || "—"} />
          <DetailRow label="Address" value={driverAddr || "—"} />
          <DetailRow label="Driver ID" value={driver.id} mono />
        </div>
      </div>
    </div>
  );
}
