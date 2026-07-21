"use client";

import { useEffect, useState } from "react";

import { Building2, Loader2, Pencil, Plus, Star } from "lucide-react";

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

type Hub = {
  id: string;
  tenant_id: number;
  name: string;
  address: { line1?: string; city?: string; state?: string; zip?: string } | null;
  geo: { lat?: number; lng?: number } | null;
  timezone: string;
  is_default: boolean;
  external_circuit_id: string | null;
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
};

function addressLine(hub: Hub): string {
  const a = hub.address ?? {};
  const cityLine = [a.city, a.state, a.zip].filter(Boolean).join(", ").replace(/, (\d)/, " $1");
  return [a.line1, cityLine].filter(Boolean).join(" · ");
}

export function HubsTab() {
  const [hubs, setHubs] = useState<Hub[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
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
    setDialogOpen(true);
  }

  function openEdit(hub: Hub) {
    setEditing(hub);
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
    });
    setError("");
    setDialogOpen(true);
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
    setDialogOpen(false);
    load();
  }

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
                <TableHead>Timezone</TableHead>
                <TableHead>Circuit ID</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hubs.map((hub) => (
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
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[280px] whitespace-normal text-muted-foreground text-sm">
                    {addressLine(hub) || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{hub.timezone || "—"}</TableCell>
                  <TableCell>
                    {hub.external_circuit_id ? (
                      <span className="font-mono text-xs tabular-nums">{hub.external_circuit_id}</span>
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
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit hub" : "New hub"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update this dispatch origin." : "Add a depot where routes start and end."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-2">
                <Field label="City">
                  <Input
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="Orlando"
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
              <Field label="ZIP">
                <Input
                  value={form.zip}
                  onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                  placeholder="32801"
                  className="h-9"
                />
              </Field>
            </div>
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

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />}
              {editing ? "Save changes" : "Create hub"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
