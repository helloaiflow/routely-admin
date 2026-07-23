"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Ban,
  Building2,
  Car,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Contact,
  Loader2,
  Mail,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Search,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const PAGE_SIZE = 25;

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

// ── Per-row actions menu (Edit + Deactivate/Reactivate) ──────────────────────
function RowMenu({
  driver,
  onEdit,
  onStatus,
}: {
  driver: Driver;
  onEdit: () => void;
  onStatus: () => void;
}) {
  const inactive = driver.status !== "active";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${driver.name}`}>
          <MoreVertical className="size-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit
        </DropdownMenuItem>
        {inactive ? (
          <DropdownMenuItem onClick={onStatus}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reactivate
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={onStatus}
            className="text-destructive focus:text-destructive"
          >
            <Ban className="size-3.5" aria-hidden="true" />
            Deactivate
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const [page, setPage] = useState(0);

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

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const resetPage = () => setPage(0);

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
    });
    setError("");
    setAttempted(false);
    setFormOpen(true);
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

  // ── List view ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {formDialog}
      {/* Header + add */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg tracking-tight">Drivers</h3>
          <p className="text-muted-foreground text-sm">The people who run Routely deliveries.</p>
        </div>
        <Button size="sm" className="h-9" onClick={openAdd}>
          <Plus className="mr-1.5 size-4" aria-hidden="true" /> New driver
        </Button>
      </div>

      {error && !statusTarget && <p className="text-destructive text-sm">{error}</p>}

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
                placeholder="Search drivers by name, phone, or email…"
                aria-label="Search drivers"
                className="h-full w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground/50 sm:text-[13px]"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as "active" | "inactive" | "all");
                resetPage();
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-9 w-[140px] border-border/60 text-[13px]"
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

          {/* ── Desktop table ── */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Driver</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Hubs</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((driver) => {
                  const inactive = driver.status !== "active";
                  const ids = Array.isArray(driver.hub_ids)
                    ? driver.hub_ids
                    : driver.hub_id
                      ? [driver.hub_id]
                      : [];
                  return (
                    <TableRow
                      key={driver.id}
                      className={cn("cursor-pointer", inactive && "opacity-55")}
                      onClick={() => openEdit(driver)}
                    >
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
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          driver={driver}
                          onEdit={() => openEdit(driver)}
                          onStatus={() => setStatusTarget(driver)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* ── Mobile rows (same card, divided) ── */}
          <div className="divide-y divide-border/40 sm:hidden">
            {rows.map((driver) => {
              const inactive = driver.status !== "active";
              const ids = Array.isArray(driver.hub_ids)
                ? driver.hub_ids
                : driver.hub_id
                  ? [driver.hub_id]
                  : [];
              return (
                <div
                  key={driver.id}
                  className={cn("flex items-center gap-3 p-3", inactive && "opacity-55")}
                >
                  <button
                    type="button"
                    onClick={() => openEdit(driver)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
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
                      <span className="flex items-center gap-2">
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
                      </span>
                      <span className="mt-0.5 block font-mono text-[13px] text-muted-foreground tabular-nums">
                        {formatPhone(driver.phone)}
                      </span>
                      {driver.email && (
                        <span className="mt-0.5 inline-flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Mail className="size-3.5" aria-hidden="true" /> {driver.email}
                        </span>
                      )}
                      <span className="mt-0.5 block truncate text-muted-foreground text-xs">
                        {driver.all_hubs ? "All hubs" : hubNames(ids)}
                      </span>
                    </span>
                  </button>
                  <div onClick={(e) => e.stopPropagation()}>
                    <RowMenu
                      driver={driver}
                      onEdit={() => openEdit(driver)}
                      onStatus={() => setStatusTarget(driver)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Footer: empty-filter state + pagination inside the card ── */}
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-muted-foreground text-sm">No drivers match those filters.</p>
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

      {/* Status change confirm — rendered regardless of view */}
      <StatusConfirm
        statusTarget={statusTarget}
        setStatusTarget={setStatusTarget}
        confirmStatusChange={confirmStatusChange}
      />
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
