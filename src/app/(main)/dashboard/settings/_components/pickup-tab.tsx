"use client";

import { useEffect, useMemo, useState } from "react";

import { Building2, Loader2, MapPin, Pencil, Phone, Plus, Star, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { type PickupLocation, pickupParts } from "./settings-types";

type FormState = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  contact_name: string;
  contact_phone: string;
  hours: string;
  notes: string;
  is_default: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  street: "",
  city: "",
  state: "FL",
  zip: "",
  contact_name: "",
  contact_phone: "",
  hours: "",
  notes: "",
  is_default: false,
};

export function PickupTab() {
  const [locations, setLocations] = useState<PickupLocation[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PickupLocation | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PickupLocation | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/client/pickup-locations")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setLocations((d.locations ?? []) as PickupLocation[]))
      .catch(() => setLocations([]));
  }, []);

  const stats = useMemo(() => {
    const list = locations ?? [];
    const cities = new Set(list.map((l) => l.city).filter(Boolean));
    return { total: list.length, cities: cities.size, hasDefault: list.some((l) => l.is_default) };
  }, [locations]);

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, is_default: (locations ?? []).length === 0 });
    setError("");
    setDialogOpen(true);
  }

  function openEdit(loc: PickupLocation) {
    const p = pickupParts(loc);
    setEditing(loc);
    setForm({
      name: loc.name ?? "",
      street: p.street,
      city: p.city,
      state: p.state || "FL",
      zip: p.zip,
      contact_name: loc.contact_name ?? "",
      contact_phone: loc.contact_phone ?? "",
      hours: loc.hours ?? "",
      notes: loc.notes ?? "",
      is_default: Boolean(loc.is_default),
    });
    setError("");
    setDialogOpen(true);
  }

  async function submit() {
    if (!form.name.trim() || !form.street.trim() || !form.city.trim() || !form.zip.trim()) {
      setError("Name, street, city and ZIP are required.");
      return;
    }
    setSaving(true);
    setError("");
    const method = editing ? "PATCH" : "POST";
    const body = editing ? { ...form, id: editing.id || editing.location_id } : form;
    const res = await fetch("/api/client/pickup-locations", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {};
      setError(j.error || "Could not save the location.");
      return;
    }
    const j = await res.json();
    setLocations((j.locations ?? []) as PickupLocation[]);
    setDialogOpen(false);
  }

  async function makeDefault(loc: PickupLocation) {
    const p = pickupParts(loc);
    setBusyId(loc.id || loc.location_id);
    const res = await fetch("/api/client/pickup-locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: loc.id || loc.location_id,
        name: loc.name,
        street: p.street,
        city: p.city,
        state: p.state,
        zip: p.zip,
        contact_name: loc.contact_name,
        contact_phone: loc.contact_phone,
        hours: loc.hours,
        notes: loc.notes,
        is_default: true,
      }),
    }).catch(() => null);
    setBusyId(null);
    if (res?.ok) {
      const j = await res.json();
      setLocations((j.locations ?? []) as PickupLocation[]);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id || deleteTarget.location_id;
    setBusyId(id);
    const res = await fetch(`/api/client/pickup-locations?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusyId(null);
    setDeleteTarget(null);
    if (res?.ok) {
      const j = await res.json();
      setLocations((j.locations ?? []) as PickupLocation[]);
    }
  }

  return (
    <div className="space-y-5">
      {/* Overview */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={MapPin} label="Locations" value={locations ? String(stats.total) : null} />
        <StatCard icon={Building2} label="Cities covered" value={locations ? String(stats.cities) : null} />
        <StatCard
          icon={Star}
          label="Default set"
          value={locations ? (stats.hasDefault ? "Yes" : "None") : null}
          accent={locations && !stats.hasDefault ? "warning" : "primary"}
        />
      </div>

      {/* Header + add */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="type-section-title">Pickup Locations</h3>
          <p className="text-muted-foreground text-sm">Addresses where drivers collect packages.</p>
        </div>
        <Button size="sm" className="h-9" onClick={openAdd}>
          <Plus className="mr-1.5 size-4" aria-hidden="true" /> Add location
        </Button>
      </div>

      {/* List */}
      {!locations ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={`pl-${i}`} className="h-24 w-full" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <MapPin className="size-6" aria-hidden="true" />
            </span>
            <p className="font-medium text-sm">No pickup locations yet</p>
            <p className="max-w-sm text-muted-foreground text-xs">
              Add the warehouses, pharmacies or labs where your drivers collect packages.
            </p>
            <Button size="sm" className="mt-2 h-9" onClick={openAdd}>
              <Plus className="mr-1.5 size-4" aria-hidden="true" /> Add your first location
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {/* Add tile — always first */}
          <button
            type="button"
            onClick={openAdd}
            className="group flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card/40 p-4 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.03] hover:text-primary"
          >
            <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110">
              <Plus className="size-5" aria-hidden="true" />
            </span>
            <span className="font-medium text-sm">Add location</span>
          </button>
          {locations.map((loc) => {
            const id = loc.id || loc.location_id;
            const busy = busyId === id;
            return (
              <Card
                key={id}
                className={cn(
                  "relative overflow-hidden transition-colors",
                  loc.is_default && "ring-1 ring-primary/25",
                )}
              >
                {loc.is_default && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-10 -right-8 size-24 rounded-full bg-primary/10 blur-2xl"
                  />
                )}
                <CardContent className="relative space-y-3 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-lg",
                          loc.is_default ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                        )}
                      >
                        <MapPin className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-sm">{loc.name}</p>
                        <p className="truncate text-muted-foreground text-xs">{pickupParts(loc).display}</p>
                      </div>
                    </div>
                    {loc.is_default && (
                      <Badge className="shrink-0 gap-1 bg-primary/10 text-primary" variant="outline">
                        <Star className="size-3" aria-hidden="true" /> Default
                      </Badge>
                    )}
                  </div>

                  {(loc.contact_name || loc.contact_phone || loc.hours) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
                      {loc.contact_name && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="size-3" aria-hidden="true" /> {loc.contact_name}
                        </span>
                      )}
                      {loc.contact_phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" aria-hidden="true" /> {loc.contact_phone}
                        </span>
                      )}
                      {loc.hours && <span>{loc.hours}</span>}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 pt-1">
                    {!loc.is_default && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        disabled={busy}
                        onClick={() => makeDefault(loc)}
                      >
                        {busy ? <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" /> : <Star className="mr-1 size-3" aria-hidden="true" />}
                        Set default
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(loc)}>
                      <Pencil className="mr-1 size-3" aria-hidden="true" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-destructive text-xs hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleteTarget(loc)}
                    >
                      <Trash2 className="mr-1 size-3" aria-hidden="true" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit pickup location" : "Add pickup location"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the details for this pickup point." : "Where should drivers collect packages?"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Location name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Main Warehouse"
                className="h-9"
              />
            </Field>
            <Field label="Street address" required>
              <Input
                value={form.street}
                onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
                placeholder="123 Main St"
                className="h-9"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-2">
                <Field label="City" required>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="Miami"
                    className="h-9"
                  />
                </Field>
              </div>
              <Field label="State">
                <Input
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  placeholder="FL"
                  maxLength={2}
                  className="h-9 uppercase"
                />
              </Field>
              <Field label="ZIP" required>
                <Input
                  value={form.zip}
                  onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                  placeholder="33101"
                  className="h-9"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact name">
                <Input
                  value={form.contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                  placeholder="Jane Doe"
                  className="h-9"
                />
              </Field>
              <Field label="Contact phone">
                <Input
                  value={form.contact_phone}
                  onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                  placeholder="(305) 555-0100"
                  className="h-9"
                />
              </Field>
            </div>
            <Field label="Pickup hours">
              <Input
                value={form.hours}
                onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                placeholder="Mon–Fri, 9am–5pm"
                className="h-9"
              />
            </Field>
            <Field label="Notes">
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Gate code, dock number, special instructions…"
                className="min-h-[60px]"
              />
            </Field>
            <div className="flex items-center justify-between rounded-lg border px-3.5 py-2.5">
              <div>
                <p className="font-medium text-sm">Set as default</p>
                <p className="text-muted-foreground text-xs">Used automatically for new orders.</p>
              </div>
              <Switch
                checked={form.is_default}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))}
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />}
              {editing ? "Save changes" : "Add location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this pickup location?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} will be removed. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = "primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string | null;
  accent?: "primary" | "warning";
}) {
  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -top-8 -right-6 size-24 rounded-full blur-2xl",
          accent === "warning" ? "bg-warning/15" : "bg-primary/10",
        )}
      />
      <CardContent className="relative flex items-center gap-3 py-5">
        <span
          className={cn(
            "grid size-10 place-items-center rounded-lg",
            accent === "warning" ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="type-label text-muted-foreground">{label}</p>
          {value === null ? (
            <Skeleton className="mt-1 h-6 w-12" />
          ) : (
            <p className="font-semibold text-xl tracking-tight">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
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
