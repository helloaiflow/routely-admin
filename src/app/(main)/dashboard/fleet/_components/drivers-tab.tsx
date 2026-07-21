"use client";

import { useEffect, useMemo, useState } from "react";

import { Ban, Check, Loader2, Mail, Pencil, Plus, RotateCcw, Users } from "lucide-react";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function DriversTab() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    setDialogOpen(true);
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
      phone: driver.phone ?? "",
      email: driver.email ?? "",
      allHubs: Boolean(driver.all_hubs),
      hubIds: ids,
      vehicle: vehicleText(driver.vehicle),
    });
    setError("");
    setDialogOpen(true);
  }

  async function submit() {
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (!form.name.trim()) {
      setError("Driver name is required.");
      return;
    }
    if (phoneDigits.length !== 10) {
      setError("Phone must be 10 digits.");
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
    setDialogOpen(false);
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

      {error && !dialogOpen && !statusTarget && (
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
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Driver</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Hub</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((driver) => {
                const inactive = driver.status !== "active";
                const busy = busyId === driver.id;
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
                      {driver.email ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="size-3.5" aria-hidden="true" /> {driver.email}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {driver.all_hubs ? (
                        <Badge variant="outline" className="bg-primary/10 text-primary">
                          All hubs
                        </Badge>
                      ) : (
                        hubNames(
                          Array.isArray(driver.hub_ids)
                            ? driver.hub_ids
                            : driver.hub_id
                              ? [driver.hub_id]
                              : [],
                        )
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
      )}

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit driver" : "New driver"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update this driver's details." : "Add a driver to the Routely fleet."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Full name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Jane Doe"
                className="h-9"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" required>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="(305) 555-0100"
                  inputMode="tel"
                  className="h-9 font-mono tabular-nums"
                />
              </Field>
              <Field label="Email">
                <Input
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jane@example.com"
                  type="email"
                  className="h-9"
                />
              </Field>
            </div>
            <div className="space-y-2.5">
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
                <Field label="Hubs">
                  {hubs.length === 0 ? (
                    <p className="rounded-lg border px-3.5 py-2.5 text-muted-foreground text-sm">
                      No hubs available yet.
                    </p>
                  ) : (
                    <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border p-1">
                      {hubs.map((h) => {
                        const selected = form.hubIds.includes(h.id);
                        return (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                hubIds: selected
                                  ? f.hubIds.filter((id) => id !== h.id)
                                  : [...f.hubIds, h.id],
                              }))
                            }
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                              selected && "bg-primary/5",
                            )}
                          >
                            <span
                              className={cn(
                                "grid size-4 shrink-0 place-items-center rounded border",
                                selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
                              )}
                            >
                              {selected && <Check className="size-3" aria-hidden="true" />}
                            </span>
                            {h.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Field>
              )}
            </div>
            <Field label="Vehicle">
              <Input
                value={form.vehicle}
                onChange={(e) => setForm((f) => ({ ...f, vehicle: e.target.value }))}
                placeholder="White Ford Transit"
                className="h-9"
              />
            </Field>

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />}
              {editing ? "Save changes" : "Create driver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
