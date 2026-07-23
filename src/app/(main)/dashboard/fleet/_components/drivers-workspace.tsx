"use client";

import { useEffect, useMemo, useState } from "react";

import { Ban, Building2, Car, Check, Contact, Loader2, Mail, Phone, RotateCcw, Search, Users } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { DriverInsights } from "./fleet-insights";
import { FleetHero, FleetWorkspace } from "./fleet-workspace";

type Hub = {
  id: string;
  name: string;
};

type Driver = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  hub_id: string | null;
  all_hubs?: boolean;
  hub_ids?: string[];
  vehicle: { description?: string } | Record<string, unknown> | null;
  status: "active" | "inactive";
  external_circuit_id: string | null;
};

type DriverForm = {
  name: string;
  phone: string;
  email: string;
  vehicle: string;
  allHubs: boolean;
  hubIds: string[];
};

const EMPTY_FORM: DriverForm = {
  name: "",
  phone: "",
  email: "",
  vehicle: "",
  allHubs: false,
  hubIds: [],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatPhoneInput(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (!digits) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function vehicleText(vehicle: Driver["vehicle"]) {
  if (!vehicle || typeof vehicle !== "object") return "";
  const value = (vehicle as { description?: unknown }).description;
  return typeof value === "string" ? value : "";
}

function formFromDriver(driver: Driver): DriverForm {
  return {
    name: driver.name ?? "",
    phone: formatPhoneInput(driver.phone ?? ""),
    email: driver.email ?? "",
    vehicle: vehicleText(driver.vehicle),
    allHubs: Boolean(driver.all_hubs),
    hubIds: driver.hub_ids ?? (driver.hub_id ? [driver.hub_id] : []),
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

export function DriversWorkspace() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<DriverForm>(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Driver | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const selectedDriver =
    selectedId && selectedId !== "new" ? (drivers?.find((driver) => driver.id === selectedId) ?? null) : null;

  function load(preferredId?: string) {
    setLoadError(false);
    fetch("/api/client/drivers")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        const next = (data.drivers ?? []) as Driver[];
        setDrivers(next);
        const wanted =
          (preferredId && next.find((driver) => driver.id === preferredId)) ||
          (selectedId !== "new" && next.find((driver) => driver.id === selectedId)) ||
          next.find((driver) => driver.status === "active") ||
          next[0];
        if (wanted) {
          setSelectedId(wanted.id);
          setForm(formFromDriver(wanted));
        } else if (next.length === 0) {
          setSelectedId("new");
          setForm(EMPTY_FORM);
        }
      })
      .catch(() => {
        setDrivers([]);
        setLoadError(true);
      });
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: initial data load must run once when the workspace mounts
  useEffect(() => {
    load();
    fetch("/api/client/hubs")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => setHubs((data.hubs ?? []) as Hub[]))
      .catch(() => setHubs([]));
    // The initial workspace selection is established by load().
  }, []);

  const hubNames = useMemo(() => new Map(hubs.map((hub) => [hub.id, hub.name])), [hubs]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (drivers ?? []).filter((driver) => {
      if (statusFilter !== "all" && driver.status !== statusFilter) return false;
      if (!term) return true;
      return (
        driver.name.toLowerCase().includes(term) ||
        driver.phone.replace(/\D/g, "").includes(term.replace(/\D/g, "")) ||
        driver.email?.toLowerCase().includes(term)
      );
    });
  }, [drivers, query, statusFilter]);

  function selectDriver(driver: Driver) {
    setSelectedId(driver.id);
    setForm(formFromDriver(driver));
    setAttempted(false);
    setError("");
  }

  function createDriver() {
    setSelectedId("new");
    setForm(EMPTY_FORM);
    setAttempted(false);
    setError("");
  }

  function toggleHub(id: string) {
    setForm((current) => ({
      ...current,
      hubIds: current.hubIds.includes(id) ? current.hubIds.filter((hubId) => hubId !== id) : [...current.hubIds, id],
    }));
  }

  const digits = form.phone.replace(/\D/g, "");
  const nameError = attempted && !form.name.trim();
  const phoneError = (attempted || digits.length > 0) && digits.length !== 10;
  const emailError = form.email.trim() !== "" && !EMAIL_RE.test(form.email.trim());

  async function save() {
    setAttempted(true);
    if (!form.name.trim() || digits.length !== 10 || emailError) {
      setError("Review the highlighted fields before saving.");
      return;
    }

    const editing = selectedId !== null && selectedId !== "new";
    const payload = {
      name: form.name.trim(),
      phone: digits,
      email: form.email.trim() || null,
      vehicle: form.vehicle.trim() ? { description: form.vehicle.trim() } : {},
      all_hubs: form.allHubs,
      hub_ids: form.allHubs ? [] : form.hubIds,
    };

    setSaving(true);
    setError("");
    const response = await fetch(
      editing ? `/api/client/drivers/${encodeURIComponent(selectedId)}` : "/api/client/drivers",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    ).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      const body = response ? await response.json().catch(() => ({})) : {};
      setError(body.error || "Could not save this driver. Try again shortly.");
      return;
    }

    const body = await response.json().catch(() => ({}));
    load((body.id ?? body.driver?.id ?? (editing ? selectedId : undefined)) as string | undefined);
  }

  async function changeStatus() {
    if (!statusTarget) return;
    setStatusBusy(true);
    const reactivating = statusTarget.status === "inactive";
    const response = await fetch(`/api/client/drivers/${encodeURIComponent(statusTarget.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reactivating ? { status: "active" } : { action: "deactivate" }),
    }).catch(() => null);
    setStatusBusy(false);

    if (!response?.ok) {
      const body = response ? await response.json().catch(() => ({})) : {};
      setError(body.error || "Could not update this driver's status.");
      setStatusTarget(null);
      return;
    }
    const targetId = statusTarget.id;
    setStatusTarget(null);
    load(targetId);
  }

  const activeCount = (drivers ?? []).filter((driver) => driver.status === "active").length;
  const inactiveCount = (drivers ?? []).length - activeCount;

  const list = (
    <div className="flex h-full min-h-96 flex-col">
      <div className="border-b px-3 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="type-label text-muted-foreground">Courier team</p>
            <p className="mt-0.5 font-semibold text-sm">{activeCount} active</p>
          </div>
          <span className="type-caption rounded-md bg-muted px-2 py-1 font-medium text-muted-foreground">
            {inactiveCount} inactive
          </span>
        </div>
        <div className="mt-3 flex h-8 items-center gap-2 rounded-lg border bg-background px-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
          <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search drivers"
            aria-label="Search drivers"
            className="type-body-sm h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "active" | "inactive" | "all")}>
          <SelectTrigger className="mt-2 h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active drivers</SelectItem>
            <SelectItem value="inactive">Inactive drivers</SelectItem>
            <SelectItem value="all">All drivers</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {drivers == null ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="h-20 w-full" />
            ))}
          </div>
        ) : loadError ? (
          <div className="px-3 py-12 text-center">
            <p className="font-medium text-sm">Could not load drivers</p>
            <p className="type-caption mt-1">Check the fleet service and retry.</p>
            <Button variant="outline" size="sm" className="mt-3 h-8" onClick={() => load()}>
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-12 text-center">
            <Users className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 font-medium text-sm">No drivers found</p>
            <p className="type-caption mt-1">{query ? "Try another search." : "Create the first courier profile."}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((driver) => {
              const active = selectedId === driver.id;
              const ids = driver.hub_ids ?? (driver.hub_id ? [driver.hub_id] : []);
              const assignment = driver.all_hubs
                ? "All hubs"
                : ids
                    .map((id) => hubNames.get(id))
                    .filter(Boolean)
                    .join(", ") || "No hub";
              return (
                <button
                  key={driver.id}
                  type="button"
                  onClick={() => selectDriver(driver)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg border-l-2 px-2.5 py-2.5 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-transparent hover:bg-muted/30",
                    driver.status === "inactive" && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "type-caption mt-0.5 grid size-7 shrink-0 place-items-center rounded-full font-semibold",
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {driver.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="type-body-sm truncate font-medium">{driver.name}</span>
                      <span
                        role="status"
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          driver.status === "active" ? "bg-success" : "bg-muted-foreground",
                        )}
                        aria-label={driver.status}
                      />
                    </span>
                    <span className="type-caption mt-0.5 block truncate">
                      {vehicleText(driver.vehicle) || formatPhoneInput(driver.phone)}
                    </span>
                    <span className="type-caption mt-1 block truncate">{assignment}</span>
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
          <p className="font-semibold text-sm">{selectedId === "new" ? "New driver" : "Driver profile"}</p>
          <p className="type-caption">Contact, vehicle, and hub access</p>
        </div>
        {selectedDriver ? (
          <span
            className={cn(
              "type-label rounded-md px-2 py-1",
              selectedDriver.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {selectedDriver.status}
          </span>
        ) : (
          <span className="type-label rounded-md bg-primary/10 px-2 py-1 text-primary">New</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-6 px-4 py-4">
          <FleetHero
            variant="driver"
            selectedLabel={selectedId === "new" ? "New driver" : (selectedDriver?.name ?? null)}
          />

          <section>
            <SectionHeading icon={Contact} title="Driver details" description="Primary contact and assigned vehicle" />
            <div className="mt-4 space-y-3.5">
              <Field label="Full name" required error={nameError ? "Enter the driver's name." : undefined}>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Jane Doe"
                  className="h-9"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone" required error={phoneError ? "Enter a 10-digit phone." : undefined}>
                  <div className="relative">
                    <Phone
                      className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      value={form.phone}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          phone: formatPhoneInput(event.target.value),
                        }))
                      }
                      placeholder="(305) 555-0100"
                      className="h-9 pl-9 font-mono"
                    />
                  </div>
                </Field>
                <Field label="Email" error={emailError ? "Enter a valid email." : undefined}>
                  <div className="relative">
                    <Mail
                      className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="jane@routely.com"
                      className="h-9 pl-9"
                    />
                  </div>
                </Field>
              </div>
              <Field label="Vehicle">
                <div className="relative">
                  <Car
                    className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={form.vehicle}
                    onChange={(event) => setForm((current) => ({ ...current, vehicle: event.target.value }))}
                    placeholder="White Ford Transit"
                    className="h-9 pl-9"
                  />
                </div>
              </Field>
            </div>
          </section>

          <section className="border-t pt-5">
            <SectionHeading
              icon={Building2}
              title="Hub availability"
              description="Where this driver can be dispatched"
            />
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5">
                <div>
                  <p className="type-body-sm font-medium">All hubs</p>
                  <p className="type-caption">Available across the entire network</p>
                </div>
                <Switch
                  checked={form.allHubs}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, allHubs: checked }))}
                />
              </div>
              {!form.allHubs && (
                <div className="divide-y divide-border/60 overflow-hidden rounded-lg border">
                  {hubs.length ? (
                    hubs.map((hub) => {
                      const checked = form.hubIds.includes(hub.id);
                      return (
                        <label
                          key={hub.id}
                          htmlFor={`driver-hub-${hub.id}`}
                          className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 hover:bg-muted/50"
                        >
                          <Checkbox
                            id={`driver-hub-${hub.id}`}
                            checked={checked}
                            onCheckedChange={() => toggleHub(hub.id)}
                          />
                          <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                          <span className="type-body-sm min-w-0 flex-1 truncate">{hub.name}</span>
                        </label>
                      );
                    })
                  ) : (
                    <p className="type-caption px-3 py-4 text-center">No hubs available yet.</p>
                  )}
                </div>
              )}
            </div>
          </section>

          {selectedDriver && (
            <section className="border-t pt-5">
              <SectionHeading
                icon={selectedDriver.status === "active" ? Ban : RotateCcw}
                title="Driver status"
                description={
                  selectedDriver.status === "active"
                    ? "Deactivate to remove this driver from assignment"
                    : "Reactivate to make this driver assignable again"
                }
              />
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "mt-4 h-9",
                  selectedDriver.status === "active" &&
                    "border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive",
                )}
                onClick={() => setStatusTarget(selectedDriver)}
              >
                {selectedDriver.status === "active" ? (
                  <Ban className="size-3.5" aria-hidden="true" />
                ) : (
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                )}
                {selectedDriver.status === "active" ? "Deactivate driver" : "Reactivate driver"}
              </Button>
            </section>
          )}

          {error && <p className="type-body-sm rounded-lg bg-destructive/10 px-3 py-2 text-destructive">{error}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3">
        <p className="type-caption">{selectedId === "new" ? "Unsaved driver" : "Profile updates sync with dispatch"}</p>
        <Button size="sm" className="h-9" onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {selectedId === "new" ? "Create driver" : "Save changes"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <FleetWorkspace
        title="Drivers"
        description="Courier profiles, availability, and delivery performance"
        entityLabel="driver"
        onCreate={createDriver}
        list={list}
        editor={editor}
        insights={<DriverInsights driver={selectedDriver} />}
      />
      <AlertDialog open={Boolean(statusTarget)} onOpenChange={(open) => !open && setStatusTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.status === "active" ? "Deactivate this driver?" : "Reactivate this driver?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.status === "active"
                ? `${statusTarget.name} will no longer be assignable to routes.`
                : `${statusTarget?.name} will be available for route assignment again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={changeStatus}
              disabled={statusBusy}
              className={cn(
                statusTarget?.status === "active" &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
            >
              {statusBusy && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {statusTarget?.status === "active" ? "Deactivate" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
