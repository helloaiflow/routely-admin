"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Ban,
  Building2,
  Car,
  ChevronsUpDown,
  Contact,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Users,
  X,
} from "lucide-react";

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
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { cn } from "@/lib/utils";

type Hub = {
  id: string;
  name: string;
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
};

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  email: "",
  allHubs: false,
  hubIds: [],
  vehicle: "",
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

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);

  const [statusTarget, setStatusTarget] = useState<Driver | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Fleet default: only ACTIVE drivers are shown; inactive are hidden behind a toggle.
  const [showInactive, setShowInactive] = useState(false);

  function loadDrivers() {
    setLoadError(false);
    fetch("/api/client/drivers")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setDrivers((d.drivers ?? []) as Driver[]))
      .catch(() => {
        setDrivers([]);
        setLoadError(true);
      });
  }

  useEffect(() => {
    loadDrivers();
    fetch("/api/client/hubs")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setHubs((d.hubs ?? []) as Hub[]))
      .catch(() => setHubs([]));
  }, []);

  const hubNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of hubs) map.set(h.id, h.name);
    return map;
  }, [hubs]);

  // Render a driver's hub assignment: "All hubs" badge, a list of hub names, or "—".
  function hubNames(ids: string[]): string {
    const names = ids.map((id) => hubNameMap.get(id) ?? "Unknown hub");
    if (names.length === 0) return "—";
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  }

  // Active first, then inactive; each group alphabetical by name.
  const ordered = useMemo(() => {
    const list = [...(drivers ?? [])];
    return list.sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [drivers]);

  const inactiveCount = useMemo(() => (drivers ?? []).filter((d) => d.status !== "active").length, [drivers]);
  // Default view = active only; the toggle reveals inactive drivers too.
  const visible = useMemo(
    () => (showInactive ? ordered : ordered.filter((d) => d.status === "active")),
    [ordered, showInactive],
  );

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setAttempted(false);
    setSheetOpen(true);
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
    });
    setError("");
    setAttempted(false);
    setSheetOpen(true);
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
    setSheetOpen(false);
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

  return (
    <div className="space-y-5">
      {/* Header + add */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg tracking-tight">Drivers</h3>
          <p className="text-muted-foreground text-sm">The people who run Routely deliveries.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-muted-foreground text-xs">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Show inactive{inactiveCount ? ` (${inactiveCount})` : ""}
          </label>
          <Button size="sm" className="h-9" onClick={openAdd}>
            <Plus className="mr-1.5 size-4" aria-hidden="true" /> New driver
          </Button>
        </div>
      </div>

      {error && !sheetOpen && !statusTarget && (
        <p className="text-destructive text-sm">{error}</p>
      )}

      {/* List */}
      {!drivers ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={`drv-${i}`} className="h-14 w-full" />
          ))}
        </div>
      ) : drivers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Users className="size-6" aria-hidden="true" />
            </span>
            <p className="font-medium text-sm">{loadError ? "Couldn't load drivers" : "No drivers yet"}</p>
            <p className="max-w-sm text-muted-foreground text-xs">
              {loadError
                ? "There was a problem reaching the fleet service. Try again."
                : "Add the drivers who pick up and deliver packages for Routely."}
            </p>
            {loadError ? (
              <Button size="sm" variant="outline" className="mt-2 h-9" onClick={loadDrivers}>
                Retry
              </Button>
            ) : (
              <Button size="sm" className="mt-2 h-9" onClick={openAdd}>
                <Plus className="mr-1.5 size-4" aria-hidden="true" /> Add your first driver
              </Button>
            )}
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No active drivers. Turn on &ldquo;Show inactive&rdquo; to see deactivated drivers
            {inactiveCount ? ` (${inactiveCount})` : ""}.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop / tablet: table */}
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Driver</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Hubs</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((driver) => {
                  const inactive = driver.status !== "active";
                  const busy = busyId === driver.id;
                  const ids = Array.isArray(driver.hub_ids)
                    ? driver.hub_ids
                    : driver.hub_id
                      ? [driver.hub_id]
                      : [];
                  return (
                    <TableRow key={driver.id} className={cn(inactive && "opacity-55")}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={
                              inactive
                                ? "grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                                : "grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"
                            }
                          >
                            <Users className="size-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{driver.name}</p>
                            {vehicleText(driver.vehicle) && (
                              <p className="truncate text-muted-foreground text-xs">{vehicleText(driver.vehicle)}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm tabular-nums">{formatPhone(driver.phone)}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {driver.all_hubs ? (
                          <Badge variant="outline" className="bg-primary/10 text-primary">
                            All hubs
                          </Badge>
                        ) : (
                          hubNames(ids)
                        )}
                      </TableCell>
                      <TableCell>
                        {inactive ? (
                          <Badge variant="outline" className="bg-muted text-muted-foreground">
                            Inactive
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 bg-primary/10 text-primary">
                            Active
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => openEdit(driver)}>
                            <Pencil className="mr-1 size-3" aria-hidden="true" /> Edit
                          </Button>
                          {inactive ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs"
                              disabled={busy}
                              onClick={() => setStatusTarget(driver)}
                            >
                              {busy ? (
                                <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <RotateCcw className="mr-1 size-3" aria-hidden="true" />
                              )}
                              Reactivate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-destructive text-xs hover:bg-destructive/10 hover:text-destructive"
                              disabled={busy}
                              onClick={() => setStatusTarget(driver)}
                            >
                              {busy ? (
                                <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <Ban className="mr-1 size-3" aria-hidden="true" />
                              )}
                              Deactivate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile: stacked card list */}
          <div className="space-y-3 md:hidden">
            {visible.map((driver) => {
              const inactive = driver.status !== "active";
              const busy = busyId === driver.id;
              const ids = Array.isArray(driver.hub_ids)
                ? driver.hub_ids
                : driver.hub_id
                  ? [driver.hub_id]
                  : [];
              return (
                <Card key={driver.id} className={cn(inactive && "opacity-55")}>
                  <CardContent className="space-y-2.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={
                            inactive
                              ? "grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                              : "grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"
                          }
                        >
                          <Users className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-sm">{driver.name}</span>
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
                          {vehicleText(driver.vehicle) && (
                            <p className="truncate text-muted-foreground text-xs">{vehicleText(driver.vehicle)}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="-mr-1 h-8 shrink-0 text-xs"
                        onClick={() => openEdit(driver)}
                      >
                        <Pencil className="mr-1 size-3" aria-hidden="true" /> Edit
                      </Button>
                    </div>
                    <div className="space-y-1 pl-[42px]">
                      <p className="font-mono text-sm tabular-nums">{formatPhone(driver.phone)}</p>
                      {driver.email && (
                        <p className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Mail className="size-3.5" aria-hidden="true" /> {driver.email}
                        </p>
                      )}
                      <p className="text-muted-foreground text-xs">
                        {driver.all_hubs ? (
                          <Badge variant="outline" className="bg-primary/10 text-primary">
                            All hubs
                          </Badge>
                        ) : (
                          hubNames(ids)
                        )}
                      </p>
                    </div>
                    <div className="flex items-center justify-end border-t pt-2.5">
                      {inactive ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs"
                          disabled={busy}
                          onClick={() => setStatusTarget(driver)}
                        >
                          {busy ? (
                            <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <RotateCcw className="mr-1 size-3" aria-hidden="true" />
                          )}
                          Reactivate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-destructive text-xs hover:bg-destructive/10 hover:text-destructive"
                          disabled={busy}
                          onClick={() => setStatusTarget(driver)}
                        >
                          {busy ? (
                            <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <Ban className="mr-1 size-3" aria-hidden="true" />
                          )}
                          Deactivate
                        </Button>
                      )}
                    </div>
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
            <SheetTitle className="font-semibold text-base">{editing ? "Edit driver" : "New driver"}</SheetTitle>
            <SheetDescription>
              {editing ? "Update this driver's details." : "Add a driver to the Routely fleet."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
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

          <SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t px-5 py-3">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />}
              {editing ? "Save changes" : "Create driver"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Status change confirm */}
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
