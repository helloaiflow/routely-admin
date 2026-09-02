"use client";

/* The five wizard steps. Pure display + local edits — all state lives in the
 * shell (new-internal-package-dialog.tsx); nothing here talks to the API
 * except the office quick-add inside OfficeSelect. */

import { useEffect, useState } from "react";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Eye,
  FileText,
  Loader2,
  MapPin,
  Package as PackageIcon,
  Pencil,
  Printer,
  RotateCcw,
  Megaphone,
  Snowflake,
  Syringe,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { BorderBeam } from "@/components/ui/border-beam";
import { generateQrSvg, trackingUrl } from "@/lib/labels/label-codes";
import { cn } from "@/lib/utils";

import { FieldError, SummaryCard } from "./chrome";
import { OfficeSelect } from "./office-select";
import { RouteMap } from "./route-map";
import { ShippingLabelPreview, type ShippingLabelData } from "./shipping-label-4x6";
import {
  formatPhone,
  fullAddress,
  HANDLING_OPTIONS,
  handlingLabels,
  PACKAGE_TILES,
  PRIORITY_OPTIONS,
  type PickupLocation,
  type RouteEstimate,
  type WizardState,
  type WizardStep,
} from "./types";

const TILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  document: FileText,
  rx: Syringe,
  cold: Snowflake,
  flyers: Megaphone,
  toners: Printer,
  other: PackageIcon,
};

export type AdminTenant = { tenant_id: number; name: string };

export type StepProps = {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  errors: Record<string, string>;
  /** ADMIN: the tenant this package belongs to — drives offices + creation. */
  tenants: AdminTenant[];
  tenantId: string;
  onTenantChange: (id: string) => void;
  locations: PickupLocation[];
  addLocation: (loc: PickupLocation) => void;
  fromLoc?: PickupLocation;
  toLoc?: PickupLocation;
  estimate: RouteEstimate;
  retryEstimate: () => void;
  senderName: string;
  senderEmail: string;
  senderPhone: string;
  goTo: (s: WizardStep) => void;
  addFromOpen: boolean;
  setAddFromOpen: (v: boolean) => void;
  addToOpen: boolean;
  setAddToOpen: (v: boolean) => void;
};

function RouteFacts({ estimate }: { estimate: RouteEstimate }) {
  if (estimate.pending)
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
        <Loader2 className="size-3 animate-spin" /> Estimating…
      </span>
    );
  if (estimate.miles == null) return <span className="text-muted-foreground text-xs">Distance unavailable</span>;
  return (
    <span className="text-xs">
      <span className="font-semibold">{estimate.miles} mi</span>
      {estimate.duration ? <span className="text-muted-foreground"> · {estimate.duration}</span> : null}
    </span>
  );
}

/* ── Step 1 · Route ──────────────────────────────────────────────────────── */
export function RouteStep(p: StepProps) {
  const { state, patch, errors, fromLoc, toLoc } = p;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-base">Choose the route</h3>
          <p className="text-muted-foreground text-xs">Select the sending and receiving offices.</p>
        </div>
        <div className="space-y-1 rounded-xl border border-border bg-card p-3">
          <Label className="text-xs font-medium">
            Tenant <span className="text-destructive">*</span>
          </Label>
          <Select value={p.tenantId} onValueChange={p.onTenantChange}>
            <SelectTrigger className="w-full [&>span]:truncate">
              <SelectValue placeholder={p.tenants.length ? "Select the tenant this package belongs to" : "Loading tenants…"} />
            </SelectTrigger>
            <SelectContent>
              {p.tenants.map((t) => (
                <SelectItem key={t.tenant_id} value={String(t.tenant_id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError msg={errors.tenant} />
          <p className="text-[11px] text-muted-foreground">
            The package is created ON BEHALF of this tenant — its offices, billing and tracking.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="grid grid-cols-[18px_1fr] gap-x-2.5">
            <div className="flex flex-col items-center pt-6">
              <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                A
              </span>
              <div className="w-px flex-1 bg-border" />
              <span className="flex size-4.5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                B
              </span>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <OfficeSelect
                  label="From office"
                  locations={p.locations}
                  valueId={state.fromId}
                  onSelect={(loc) => patch({ fromId: loc.id })}
                  onAdd={(loc) => {
                    p.addLocation(loc);
                    patch({ fromId: loc.id });
                  }}
                  addOpen={p.addFromOpen}
                  onAddOpenChange={p.setAddFromOpen}
                />
                {fromLoc && <p className="text-muted-foreground text-[11px]">{fullAddress(fromLoc.address)}</p>}
                <FieldError msg={errors.from} />
                <p className="text-[11px] text-muted-foreground">
                  Sending as <span className="font-medium text-foreground">{p.senderName}</span>
                  {p.senderEmail ? ` · ${p.senderEmail}` : ""}
                </p>
              </div>
              <div className="space-y-1">
                <OfficeSelect
                  label="To office"
                  locations={p.locations}
                  valueId={state.toId}
                  onSelect={(loc) => patch({ toId: loc.id })}
                  onAdd={(loc) => {
                    p.addLocation(loc);
                    patch({ toId: loc.id });
                  }}
                  addOpen={p.addToOpen}
                  onAddOpenChange={p.setAddToOpen}
                />
                {toLoc && <p className="text-muted-foreground text-[11px]">{fullAddress(toLoc.address)}</p>}
                <FieldError msg={errors.to} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <SummaryCard title="Route preview" beam>
        <div className="space-y-2 text-xs">
          {fromLoc && toLoc && <RouteMap from={fullAddress(fromLoc.address)} to={fullAddress(toLoc.address)} />}
          {fromLoc && toLoc ? (
            <>
              <div className="flex items-center gap-1.5 font-medium">
                <span className="truncate">{fromLoc.name}</span>
                <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{toLoc.name}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                <RouteFacts estimate={p.estimate} />
                {!p.estimate.pending && p.estimate.miles == null && (
                  <button type="button" onClick={p.retryEstimate} className="inline-flex items-center gap-1 text-primary hover:underline">
                    <RotateCcw className="size-3" /> Retry
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Pick both offices to preview the route.</p>
          )}
          <dl className="space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sender</dt>
              <dd className="font-medium">{p.senderName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Service</dt>
              <dd className="font-medium">Office-to-office</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Pickup</dt>
              <dd className="font-medium">Ready Now</dd>
            </div>
          </dl>
        </div>
      </SummaryCard>
    </div>
  );
}

/* ── Step 2 · Recipient ──────────────────────────────────────────────────── */
export function RecipientStep(p: StepProps) {
  const { state, patch, errors, fromLoc, toLoc } = p;
  const initials = state.recipientName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-base">Who is receiving this package?</h3>
          <p className="text-muted-foreground text-xs">Contact details are used for delivery coordination and notifications.</p>
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-card p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs">
                Full name <span className="text-destructive">*</span>
              </Label>
              <Input value={state.recipientName} onChange={(e) => patch({ recipientName: e.target.value })} />
              <FieldError msg={errors.recipientName} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">
                Phone <span className="text-destructive">*</span>
              </Label>
              <Input
                value={state.recipientPhone}
                inputMode="numeric"
                onChange={(e) => patch({ recipientPhone: formatPhone(e.target.value) })}
                placeholder="(305) 555-0100"
              />
              <FieldError msg={errors.recipientPhone} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Email (optional)</Label>
            <Input
              type="email"
              value={state.recipientEmail}
              onChange={(e) => patch({ recipientEmail: e.target.value })}
              placeholder="recipient@company.com"
            />
            <FieldError msg={errors.recipientEmail} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">
              Delivery address <span className="text-destructive">*</span>
            </Label>
            <AddressAutocomplete
              value={state.deliveryFormatted}
              onChange={(v) => patch({ deliveryFormatted: v, addressVerified: false })}
              onSelect={(addr) => patch({ deliveryFormatted: addr.replace(/, USA$/, "") })}
              onPlaceDetails={(d) =>
                patch({
                  deliveryFormatted: [d.street, d.city, [d.state, d.zip].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(", "),
                  deliveryStreet: d.street,
                  deliveryCity: d.city,
                  deliveryState: d.state || "FL",
                  deliveryZip: d.zip,
                  lat: d.lat,
                  lng: d.lng,
                  addressVerified: true,
                })
              }
              placeholder="Start typing the delivery address…"
            />
            <FieldError msg={errors.deliveryAddress} />
          </div>
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-1.5 pb-2">
              {state.addressVerified ? (
                <>
                  <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Address verified</span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Pick a suggestion to verify the address</span>
              )}
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Suite / unit (optional)</Label>
              <Input
                value={state.deliverySuite}
                onChange={(e) => patch({ deliverySuite: e.target.value })}
                placeholder="e.g. Suite 102, Floor 3"
              />
            </div>
          </div>
        </div>
      </div>

      <SummaryCard title="Delivery summary" beam>
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-[11px]">
              {initials || "—"}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{state.recipientName || "Recipient"}</p>
              <p className="truncate text-muted-foreground">
                {state.recipientPhone || "Phone pending"}
                {state.recipientEmail ? ` · ${state.recipientEmail}` : ""}
              </p>
            </div>
          </div>
          {state.deliveryFormatted && (
            <p className="flex items-start gap-1.5 text-muted-foreground">
              <MapPin className="mt-0.5 size-3 shrink-0" />
              <span>
                {state.deliveryFormatted}
                {state.deliverySuite ? `, ${state.deliverySuite}` : ""}
              </span>
            </p>
          )}
          {fromLoc && toLoc && (
            <div className="border-t border-border/60 pt-2">
              <p className="mb-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">Route</p>
              <div className="mb-1.5">
                <RouteMap from={fullAddress(fromLoc.address)} to={fullAddress(toLoc.address)} heightClass="h-[160px]" />
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                <span className="truncate">{fromLoc.name}</span>
                <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{toLoc.name}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <RouteFacts estimate={p.estimate} />
                <button type="button" onClick={() => p.goTo(1)} className="inline-flex items-center gap-1 text-primary hover:underline">
                  <Pencil className="size-3" /> Change route
                </button>
              </div>
            </div>
          )}
        </div>
      </SummaryCard>
    </div>
  );
}

/* ── Step 3 · Package ────────────────────────────────────────────────────── */
export function PackageStep(p: StepProps & { labelData: ShippingLabelData }) {
  const { state, patch, errors } = p;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-base">What are you sending?</h3>
          <p className="text-muted-foreground text-xs">Select the package type and add handling instructions.</p>
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-card p-3">
          <div>
            <p className="mb-1.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">Package details</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PACKAGE_TILES.map((t) => {
                const Icon = TILE_ICONS[t.id] ?? PackageIcon;
                const selected = state.packageType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => patch({ packageType: t.id })}
                    aria-pressed={selected}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors",
                      selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40",
                    )}
                  >
                    <Icon className={cn("size-4", selected ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-xs font-medium leading-tight">{t.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{t.hint}</span>
                  </button>
                );
              })}
            </div>
            <FieldError msg={errors.packageType} />
          </div>
          <div>
            <p className="mb-1.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">Handling requirements</p>
            <div className="flex flex-wrap gap-1.5">
              {HANDLING_OPTIONS.map((h) => {
                const on = state.handling.includes(h.id);
                return (
                  <button
                    key={h.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      patch({ handling: on ? state.handling.filter((x) => x !== h.id) : [...state.handling, h.id] })
                    }
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      on ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground/80 hover:bg-muted/40",
                    )}
                  >
                    {h.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs">Ready time</Label>
              {/* Internal packages are ALWAYS ready now (CEO refinement pass,
                  2026-09-02) — fixed display, no alternate options. */}
              <div className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 text-sm">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                Ready Now
              </div>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Delivery priority</Label>
              <Select value={state.priority} onValueChange={(v) => patch({ priority: v as WizardState["priority"] })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={state.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Contact recipient on arrival. Internal documents."
              className="min-h-[56px] resize-none text-sm"
              rows={2}
            />
          </div>
        </div>
      </div>

      <SummaryCard title="Shipment summary" beam>
        <div className="space-y-2 text-xs">
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Route</dt>
              <dd className="truncate font-medium">
                {p.fromLoc?.name} → {p.toLoc?.name}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Recipient</dt>
              <dd className="truncate font-medium">{state.recipientName}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Package</dt>
              <dd className="font-medium">{PACKAGE_TILES.find((t) => t.id === state.packageType)?.label}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Handling</dt>
              <dd className="text-right font-medium">{handlingLabels(state.handling).join(", ") || "None"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Est. distance</dt>
              <dd>
                <RouteFacts estimate={p.estimate} />
              </dd>
            </div>
          </dl>
          <div className="border-t border-border/60 pt-2">
            <p className="mb-1.5 text-center font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
              Label preview (not final)
            </p>
            <div className="flex justify-center">
              <ShippingLabelPreview data={p.labelData} widthPx={232} />
            </div>
          </div>
        </div>
      </SummaryCard>
    </div>
  );
}

/* ── Step 4 · Review ─────────────────────────────────────────────────────── */
export function ReviewStep(p: StepProps & { labelData: ShippingLabelData; submitError: string }) {
  const { state, errors } = p;
  const edit = (s: WizardStep) => (
    <button type="button" onClick={() => p.goTo(s)} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
      <Pencil className="size-3" /> Edit
    </button>
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-base">Review and dispatch</h3>
          <p className="text-muted-foreground text-xs">Confirm the details before creating this internal package.</p>
        </div>
        <SummaryCard title="Route" action={edit(1)}>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <span>{p.fromLoc?.name}</span>
            <ArrowRight className="size-3.5 text-muted-foreground" />
            <span>{p.toLoc?.name}</span>
          </div>
          <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <span className="flex items-start gap-1"><MapPin className="mt-0.5 size-3 shrink-0" />{p.fromLoc ? fullAddress(p.fromLoc.address) : ""}</span>
            <span className="flex items-start gap-1"><MapPin className="mt-0.5 size-3 shrink-0" />{p.toLoc ? fullAddress(p.toLoc.address) : ""}</span>
          </div>
          <RouteFacts estimate={p.estimate} />
        </SummaryCard>
        <SummaryCard title="Recipient" action={edit(2)}>
          <p className="text-sm font-medium">{state.recipientName}</p>
          <p className="text-xs text-muted-foreground">
            {state.recipientPhone}
            {state.recipientEmail ? ` · ${state.recipientEmail}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {state.deliveryFormatted}
            {state.deliverySuite ? `, ${state.deliverySuite}` : ""}
            {state.addressVerified && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3" /> verified
              </span>
            )}
          </p>
        </SummaryCard>
        <SummaryCard title="Package" action={edit(3)}>
          <p className="text-xs">
            <span className="font-medium">{PACKAGE_TILES.find((t) => t.id === state.packageType)?.label}</span>
            {" · Internal Package · "}
            {PRIORITY_OPTIONS.find((x) => x.id === state.priority)?.label}
            {" · Ready Now"}
          </p>
          {handlingLabels(state.handling).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {handlingLabels(state.handling).map((h) => (
                <Badge key={h} variant="outline" className="text-[10px]">
                  {h}
                </Badge>
              ))}
            </div>
          )}
        </SummaryCard>
        {state.notes.trim() && (
          <SummaryCard title="Notes" action={edit(3)}>
            <p className="text-xs text-muted-foreground">{state.notes.trim()}</p>
          </SummaryCard>
        )}

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-card p-3">
          <Checkbox
            checked={state.confirmChecked}
            onCheckedChange={(v) => p.patch({ confirmChecked: v === true })}
            className="mt-0.5"
          />
          <span className="text-xs">I confirm the package details are correct.</span>
        </label>
        <FieldError msg={errors.confirm} />
        <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>This creates a live stop and dispatches it to the driver network immediately.</span>
        </div>
        {p.submitError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-xs">
            {p.submitError}
          </div>
        )}
      </div>

      <SummaryCard title="Live label preview" className="h-fit" beam>
        <div className="flex justify-center">
          <ShippingLabelPreview data={p.labelData} widthPx={296} />
        </div>
        <p className="text-center text-[10px] text-muted-foreground">4 × 6 in · Thermal · Portrait</p>
      </SummaryCard>
    </div>
  );
}

/* ── Step 5 · Created ────────────────────────────────────────────────────── */
export function CreatedStep(
  p: StepProps & {
    trackingId: string;
    createdAt: string;
    onPrint: () => void;
    onViewStop: () => void;
    onCreateAnother: () => void;
  },
) {
  const { state } = p;
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-base">Package created and dispatched</h3>
        <p className="text-muted-foreground text-xs">The stop is live and available to the driver network.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[176px_1fr]">
        <TrackingQrCard trackingId={p.trackingId} />
        <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-border bg-card p-4 text-center">
          <BorderBeam size={72} duration={7} />
          <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">Tracking number</p>
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight">{p.trackingId}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Copy tracking number"
              onClick={() => {
                void navigator.clipboard.writeText(p.trackingId);
                toast.success("Tracking number copied");
              }}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          <Badge variant="outline" className="mt-1.5 border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
            Ready to deliver
          </Badge>
          <p className="mt-2 max-w-full truncate text-[10px] text-muted-foreground">{trackingUrl(p.trackingId)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_190px]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-3 text-xs">
          <div>
            <p className="text-muted-foreground">Route</p>
            <p className="font-medium">
              {p.fromLoc?.name} → {p.toLoc?.name}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Handling</p>
            <p className="font-medium">{handlingLabels(state.handling).join(", ") || "None"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Recipient</p>
            <p className="font-medium">{state.recipientName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Created</p>
            <p className="font-medium">{p.createdAt}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Package</p>
            <p className="font-medium">{PACKAGE_TILES.find((t) => t.id === state.packageType)?.label}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Driver</p>
            <p className="flex items-center gap-1.5 font-medium">
              <span className="size-2 rounded-full bg-amber-500" aria-hidden />
              Unassigned
            </p>
          </div>
        </div>
        <div className="space-y-2 rounded-xl border border-border bg-card p-3">
          <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">Next actions</p>
          <Button size="sm" className="w-full" onClick={p.onPrint}>
            <Printer className="mr-1.5 size-3.5" /> Print 4×6 label
          </Button>
          <Button size="sm" variant="outline" className="w-full" onClick={p.onViewStop}>
            <Eye className="mr-1.5 size-3.5" /> View stop
          </Button>
          <button type="button" onClick={p.onCreateAnother} className="w-full text-center text-xs font-medium text-primary hover:underline">
            Create another package
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
        Tracking page and QR are active.
      </div>
    </div>
  );
}


/* Live QR for the public tracking page — same generator the 4×6 label uses,
 * so what the recipient scans here is EXACTLY what prints. */
function TrackingQrCard({ trackingId }: { trackingId: string }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    let alive = true;
    void generateQrSvg(trackingId).then((svg) => {
      if (alive) setQr(svg);
    });
    return () => {
      alive = false;
    };
  }, [trackingId]);
  return (
    <a
      href={trackingUrl(trackingId)}
      target="_blank"
      rel="noreferrer"
      title="Open public tracking"
      className="flex items-center justify-center rounded-xl border border-border bg-card p-3 transition-transform hover:scale-[1.02]"
    >
      {qr ? (
        <div
          style={{ background: "#ffffff" }}
          className="size-[140px] overflow-hidden rounded-sm p-1.5 [&_svg]:size-full"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      ) : (
        <div className="flex size-[140px] items-center justify-center rounded-sm border border-dashed border-border text-[10px] text-muted-foreground">
          QR
        </div>
      )}
    </a>
  );
}
