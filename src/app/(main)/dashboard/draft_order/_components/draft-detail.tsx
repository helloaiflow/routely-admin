"use client";

import { useState } from "react";

import Image from "next/image";

import {
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Link2,
  Mail,
  MessageCircle,
  MoreVertical,
  MousePointerClick,
  Package,
  Phone,
  Printer,
  Settings2,
  Trash2,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  CARRIER_LABELS,
  CARRIER_PRICES,
  type Carrier,
  DELIVERY_TAGS,
  type DeliveryTagId,
  type DraftOrder,
  fmtPhone,
  formatDate,
  todayISO,
  tomorrowISO,
} from "../_lib/helpers";
import { AddressSearch } from "./address-search";

type PickupLocation = { id: string; name: string; address: string; lat?: number; lng?: number };

type Props = {
  draft: DraftOrder | null;
  pickupLocations: PickupLocation[];
  onChange: <K extends keyof DraftOrder>(field: K, value: DraftOrder[K]) => void;
  onDelete: () => void;
  onApprove: () => void;
};

// ─── 2-col row: 130px fixed label ────────────────────────────────────────────
function FormRow({ label, children, subtle }: { label: string; children: React.ReactNode; subtle?: boolean }) {
  return (
    <div className="grid border-b last:border-b-0" style={{ gridTemplateColumns: "130px 1fr" }}>
      <div className={cn("flex items-center border-r px-3 py-2", subtle ? "bg-muted/15" : "bg-muted/30")}>
        <span className="font-medium text-[11px] leading-tight text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center px-2.5 py-1.5">{children}</div>
    </div>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function Section({
  icon: Icon,
  label,
  open,
  onToggle,
  children,
}: {
  icon: typeof Package;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex w-full items-center justify-between border-b bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/50">
        <span className="flex items-center gap-2 font-semibold text-xs text-foreground/80">
          <Icon className="size-3.5 text-muted-foreground" />
          {label}
        </span>
        <ChevronRight
          className={cn("size-3.5 text-muted-foreground/60 transition-transform duration-150", open && "rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-b">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Toolbar icon button ──────────────────────────────────────────────────────
function ToolBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Trash2;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" disabled={disabled} onClick={onClick}>
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[10px]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

const inputCls =
  "h-8 w-full border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/40";

export function DraftDetail({ draft, pickupLocations, onChange, onDelete, onApprove }: Props) {
  const [sections, setSections] = useState({
    notes: true,
    delivery: true,
    recipient: true,
    package: false,
    cod: false,
    options: false,
    billing: false,
  });
  const toggle = (k: keyof typeof sections) => setSections((s) => ({ ...s, [k]: !s[k] }));

  if (!draft) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <MousePointerClick className="size-7 opacity-30" />
        <p className="text-sm">Select a stop to view details</p>
      </div>
    );
  }

  const currentCarrier = draft.carrier ?? "routely";
  const statusDot = { draft: "bg-muted-foreground", pending: "bg-primary", approved: "bg-emerald-500" }[draft.status];
  const statusColor = { draft: "text-muted-foreground", pending: "text-primary", approved: "text-emerald-600" }[
    draft.status
  ];

  const TAG_DESCRIPTIONS: Record<string, string> = {
    dog: "Dog on premises — approach slowly, keep gate closed",
    ring: "Ring doorbell and wait before leaving package",
    leave: "Leave at door if no answer — do not wait",
    call: "Call recipient before or upon arrival",
    text_only: "Text only — do not call recipient",
    lobby: "Leave with lobby attendant or front desk",
    side: "Use side or rear entrance for delivery",
    silent: "Silent delivery — do not knock or ring bell",
    elderly: "Elderly patient — wait for acknowledgment at door",
    access: "Accessibility needed — allow extra time",
    no_call: "Do not call recipient under any circumstance",
  };

  const activeTags: DeliveryTagId[] = draft.delivery_tags ?? [];

  function buildNoteFromTags(tags: DeliveryTagId[]): string {
    if (tags.length === 0) return "";
    const lines = tags
      .map((id) => DELIVERY_TAGS.find((t) => t.id === id))
      .filter(Boolean)
      .map((tag) => `${tag!.emoji} ${TAG_DESCRIPTIONS[tag!.id] ?? tag!.label}`);
    return `📋 Delivery Instructions:\n${lines.join("\n")}`;
  }

  function toggleTag(id: DeliveryTagId) {
    const next = activeTags.includes(id) ? activeTags.filter((t) => t !== id) : [...activeTags, id];
    onChange("delivery_tags", next);
    onChange("notes", buildNoteFromTags(next));
  }

  const statusPills = [
    draft.is_same_day && { emoji: "⚡", label: "Same Day" },
    draft.requires_signature && { emoji: "✍️", label: "Signature" },
    draft.collect_cod && { emoji: "💵", label: `COD $${draft.collect_amount || "0"}` },
    draft.package_type === "rx" && { emoji: "💊", label: "Rx" },
    draft.package_type === "cold" && { emoji: "🧊", label: "Cold Chain" },
    draft.package_type === "regular" && { emoji: "📦", label: "Standard" },
  ].filter(Boolean) as { emoji: string; label: string }[];

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col overflow-hidden">
        {/* ── TOOLBAR ──────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
          <div className="flex items-center gap-0.5">
            <ToolBtn icon={Trash2} label="Delete" onClick={onDelete} />
            <ToolBtn
              icon={Phone}
              label="Call"
              disabled={!draft.recipient_phone}
              onClick={() => draft.recipient_phone && window.open(`tel:${draft.recipient_phone.replace(/\D/g, "")}`)}
            />
            <ToolBtn icon={MessageCircle} label="SMS" disabled={!draft.recipient_phone} />
            <ToolBtn icon={Mail} label="Email" disabled={!draft.recipient_email} />
            <ToolBtn icon={Link2} label="Copy link" />
            <ToolBtn icon={Printer} label="Print label" />
          </div>
          <Separator orientation="vertical" className="mx-1.5 h-4" />
          <Badge variant="outline" className={cn("h-5 gap-1 rounded-full px-2 text-[10px] capitalize", statusColor)}>
            <span className={cn("size-1.5 rounded-full", statusDot)} />
            {draft.status}
          </Badge>
          <div className="ml-auto flex items-center gap-1.5">
            {draft.status !== "approved" && (
              <Button size="sm" className="h-8 gap-1.5 px-4 font-semibold text-xs" onClick={onApprove}>
                <CheckCircle2 className="size-3.5" />
                {draft.collect_cod ? "Collect & Pay" : "Approve Stop"}
              </Button>
            )}
            <Button variant="ghost" size="icon" className="size-7">
              <MoreVertical className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* ── RECIPIENT HEADER ─────────────────────────────── */}
        <div className="flex shrink-0 flex-col border-b">
          {/* Row 1: name + address + pills | carrier logo + price */}
          <div className="flex items-start justify-between px-3 pb-1.5 pt-2.5">
            {/* Left: name + address + status pills + carrier switcher */}
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-sm leading-tight">
                {draft.recipient_name || <span className="text-muted-foreground italic">No recipient</span>}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {[draft.delivery_address, draft.apt_unit, draft.delivery_city, draft.delivery_state, draft.delivery_zip]
                  .filter(Boolean)
                  .join(", ")}
              </p>

              {/* Status pills */}
              {statusPills.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {statusPills.map((pill) => (
                    <span
                      key={pill.label}
                      className="inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] text-foreground/70"
                    >
                      <span className="leading-none">{pill.emoji}</span>
                      <span>{pill.label}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Right: carrier logo (bigger) + price + id + date */}
            <div className="ml-3 shrink-0 text-right">
              <div className="mb-1 flex items-center justify-end gap-2">
                {currentCarrier !== "routely" && (
                  <Image
                    src={`/img/${currentCarrier}.svg`}
                    alt={CARRIER_LABELS[currentCarrier as Carrier]}
                    width={52}
                    height={26}
                    className="object-contain"
                  />
                )}
                {currentCarrier === "routely" && (
                  <div className="flex items-center gap-1.5">
                    <Image src="/img/routely.svg" alt="Routely" width={22} height={22} className="opacity-60" />
                    <span className="font-semibold text-sm text-muted-foreground">Routely</span>
                  </div>
                )}
                {draft.carrier_price != null && (
                  <span className="font-bold text-base text-foreground">${draft.carrier_price.toFixed(2)}</span>
                )}
              </div>
              <p className="font-mono text-[10px] text-muted-foreground">{draft.id}</p>
              <p className="text-[10px] text-muted-foreground/60">{formatDate(draft.created_at)}</p>
            </div>
          </div>

          {/* Row 2: carrier switcher — full width, 4 equal flex-1 badges */}
          <div className="flex gap-1 px-3 pb-2.5">
            {(["routely", "fedex", "usps", "ups"] as Carrier[]).map((c) => {
              const isSelected = currentCarrier === c;
              const isRoutely = c === "routely";
              const price = isRoutely ? (draft.estimated_cost ?? 0) : CARRIER_PRICES[c];
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onChange("carrier", c);
                    onChange("carrier_price", price);
                  }}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md border py-1.5 transition-all",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/60 bg-muted/20 hover:border-primary/30 hover:bg-muted/40",
                  )}
                >
                  <div className="flex size-4 shrink-0 items-center justify-center">
                    {isRoutely ? (
                      <Image
                        src="/img/routely.svg"
                        alt="Routely"
                        width={14}
                        height={14}
                        className={cn(isSelected ? "opacity-80" : "opacity-35")}
                      />
                    ) : c === "ups" ? (
                      <span
                        className={cn(
                          "font-black text-[10px]",
                          isSelected ? "text-amber-600" : "text-muted-foreground/50",
                        )}
                      >
                        UPS
                      </span>
                    ) : (
                      <Image
                        src={`/img/${c}.svg`}
                        alt={c}
                        width={20}
                        height={11}
                        className={cn("object-contain", !isSelected && "opacity-40")}
                      />
                    )}
                  </div>
                  <span
                    className={cn(
                      "font-semibold tabular-nums text-[10px]",
                      isRoutely && isSelected
                        ? "text-emerald-600"
                        : isSelected
                          ? "text-primary"
                          : "text-muted-foreground",
                    )}
                  >
                    ${price.toFixed(2)}
                  </span>
                  {isSelected && <span className="size-1 rounded-full bg-primary" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── SCROLLABLE FORM ───────────────────────────────── */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="divide-y divide-border/50">
            {/* NOTES */}
            <Section icon={MessageCircle} label="Notes" open={sections.notes} onToggle={() => toggle("notes")}>
              <div className="p-3">
                <Textarea
                  value={draft.notes ?? ""}
                  onChange={(e) => onChange("notes", e.target.value)}
                  placeholder="Driver notes, special instructions..."
                  rows={2}
                  className="resize-none text-xs"
                />
              </div>
            </Section>

            {/* PICKUP & DELIVERY */}
            <Section
              icon={Package}
              label="Pickup & Delivery"
              open={sections.delivery}
              onToggle={() => toggle("delivery")}
            >
              <div className="divide-y divide-border/40">
                <FormRow label="Pickup">
                  <div className="flex w-full flex-col gap-1">
                    <select
                      value={draft.pickup_address}
                      onChange={(e) => {
                        const loc = pickupLocations.find((l) => l.address === e.target.value);
                        onChange("pickup_address", e.target.value);
                        if (loc?.lat) onChange("pickup_lat", loc.lat);
                        if (loc?.lng) onChange("pickup_lng", loc.lng);
                        if (loc?.id) onChange("pickup_location_id", loc.id);
                      }}
                      className="h-8 w-full border-0 bg-transparent text-xs outline-none focus:ring-0"
                    >
                      {pickupLocations.length === 0 && (
                        <option value={draft.pickup_address}>{draft.pickup_address.split(",")[0]}</option>
                      )}
                      {pickupLocations.map((l) => (
                        <option key={l.id} value={l.address}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                    {draft.pickup_address && (
                      <span className="flex items-center gap-1 pb-0.5 text-[10px] text-emerald-600">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        {draft.pickup_address.split(",")[0]}
                      </span>
                    )}
                  </div>
                </FormRow>

                <FormRow label="Address">
                  <AddressSearch
                    placeholder="Search delivery address..."
                    defaultValue={draft.delivery_address}
                    onSelect={(d) => {
                      onChange("delivery_address", d.street);
                      onChange("delivery_city", d.city);
                      onChange("delivery_state", d.state || "FL");
                      onChange("delivery_zip", d.zip);
                      if (typeof d.lat === "number") onChange("delivery_lat", d.lat);
                      if (typeof d.lng === "number") onChange("delivery_lng", d.lng);
                    }}
                  />
                </FormRow>

                <FormRow label="Apt / Unit" subtle>
                  <Input
                    value={draft.apt_unit ?? ""}
                    onChange={(e) => onChange("apt_unit", e.target.value)}
                    placeholder="Suite, Apt, Unit..."
                    className={inputCls}
                  />
                </FormRow>

                <FormRow label="City / St / ZIP">
                  <div className="grid w-full gap-1.5" style={{ gridTemplateColumns: "1fr 42px 60px" }}>
                    <Input
                      value={draft.delivery_city}
                      onChange={(e) => onChange("delivery_city", e.target.value)}
                      placeholder="City"
                      className={inputCls}
                    />
                    <Input
                      value={draft.delivery_state}
                      onChange={(e) => onChange("delivery_state", e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="FL"
                      maxLength={2}
                      className={cn(inputCls, "text-center uppercase")}
                    />
                    <Input
                      value={draft.delivery_zip}
                      onChange={(e) => onChange("delivery_zip", e.target.value.replace(/\D/g, "").slice(0, 5))}
                      placeholder="ZIP"
                      inputMode="numeric"
                      maxLength={5}
                      className={inputCls}
                    />
                  </div>
                </FormRow>

                <FormRow label="Delivery Date">
                  <div className="flex w-full gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onChange("is_same_day", false);
                        onChange("delivery_type", "next_day");
                        onChange("delivery_date", tomorrowISO());
                      }}
                      className={cn(
                        "flex-1 rounded-md border py-1.5 font-medium text-xs transition-colors",
                        !draft.is_same_day
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/30",
                      )}
                    >
                      📅 Tomorrow
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChange("is_same_day", true);
                        onChange("delivery_type", "same_day");
                        onChange("delivery_date", todayISO());
                      }}
                      className={cn(
                        "flex-1 rounded-md border py-1.5 font-medium text-xs transition-colors",
                        draft.is_same_day
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/30",
                      )}
                    >
                      ⚡ Same Day
                    </button>
                  </div>
                </FormRow>

                <FormRow label="Gate Code" subtle>
                  <Input
                    value={draft.gate_code ?? ""}
                    onChange={(e) => onChange("gate_code", e.target.value)}
                    placeholder="Gate / access code"
                    className={inputCls}
                  />
                </FormRow>

                <FormRow label="Package Type">
                  <div className="flex w-full justify-start gap-1.5">
                    {(
                      [
                        { id: "rx", e: "💊", l: "Rx" },
                        { id: "cold", e: "🧊", l: "Cold" },
                        { id: "regular", e: "📦", l: "Std" },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onChange("package_type", p.id)}
                        className={cn(
                          "rounded-md border px-2.5 py-1 font-medium text-xs transition-colors",
                          draft.package_type === p.id
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30",
                        )}
                      >
                        {p.e} {p.l}
                      </button>
                    ))}
                  </div>
                </FormRow>
              </div>
            </Section>

            {/* RECIPIENT */}
            <Section icon={User} label="Recipient" open={sections.recipient} onToggle={() => toggle("recipient")}>
              <div className="divide-y divide-border/40">
                <FormRow label="Full Name" subtle>
                  <Input
                    value={draft.recipient_name}
                    onChange={(e) => onChange("recipient_name", e.target.value)}
                    placeholder="LAST, FIRST"
                    className={inputCls}
                  />
                </FormRow>
                <FormRow label="Phone Number">
                  <Input
                    value={draft.recipient_phone}
                    onChange={(e) => onChange("recipient_phone", fmtPhone(e.target.value))}
                    placeholder="(555) 123-4567"
                    inputMode="tel"
                    className={inputCls}
                  />
                </FormRow>
                <FormRow label="Email Address" subtle>
                  <Input
                    value={draft.recipient_email ?? ""}
                    onChange={(e) => onChange("recipient_email", e.target.value)}
                    type="email"
                    placeholder="Optional"
                    className={inputCls}
                  />
                </FormRow>
              </div>
            </Section>

            {/* PACKAGE DETAILS */}
            <Section icon={Package} label="Package Details" open={sections.package} onToggle={() => toggle("package")}>
              <div className="divide-y divide-border/40">
                <FormRow label="Rx Number">
                  <Input
                    value={draft.rx_number ?? ""}
                    onChange={(e) => onChange("rx_number", e.target.value)}
                    placeholder="Optional"
                    className={inputCls}
                  />
                </FormRow>
                <FormRow label="Weight (oz)" subtle>
                  <div className="flex w-full items-center gap-2">
                    <Input
                      value={draft.weight_oz ?? ""}
                      onChange={(e) => onChange("weight_oz", Number(e.target.value))}
                      placeholder="0"
                      inputMode="numeric"
                      className={inputCls}
                    />
                    <span className="shrink-0 text-xs text-muted-foreground">oz</span>
                  </div>
                </FormRow>
                <FormRow label="Dimensions (in)">
                  <div className="grid w-full gap-1.5" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                    <Input
                      value={draft.length_in ?? ""}
                      onChange={(e) => onChange("length_in", Number(e.target.value))}
                      placeholder="L"
                      inputMode="numeric"
                      className={cn(inputCls, "text-center")}
                    />
                    <Input
                      value={draft.width_in ?? ""}
                      onChange={(e) => onChange("width_in", Number(e.target.value))}
                      placeholder="W"
                      inputMode="numeric"
                      className={cn(inputCls, "text-center")}
                    />
                    <Input
                      value={draft.height_in ?? ""}
                      onChange={(e) => onChange("height_in", Number(e.target.value))}
                      placeholder="H"
                      inputMode="numeric"
                      className={cn(inputCls, "text-center")}
                    />
                  </div>
                </FormRow>
              </div>
            </Section>

            {/* CASH ON DELIVERY */}
            <Section icon={DollarSign} label="Cash on Delivery" open={sections.cod} onToggle={() => toggle("cod")}>
              <div className="divide-y divide-border/40">
                <FormRow label="Collect COD">
                  <div className="flex w-full items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {draft.collect_cod ? (
                        <span className="font-medium text-foreground">Active — driver collects cash</span>
                      ) : (
                        "Driver collects payment at door"
                      )}
                    </span>
                    <Switch
                      checked={!!draft.collect_cod}
                      onCheckedChange={(v) => {
                        onChange("collect_cod", v);
                        if (!v) onChange("collect_amount", "");
                      }}
                      className="scale-75"
                    />
                  </div>
                </FormRow>
                {draft.collect_cod && (
                  <FormRow label="COD Amount" subtle>
                    <div className="relative w-full">
                      <span className="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 font-medium text-xs text-muted-foreground">
                        $
                      </span>
                      <Input
                        value={draft.collect_amount ?? ""}
                        onChange={(e) => onChange("collect_amount", e.target.value)}
                        placeholder="0.00"
                        inputMode="decimal"
                        className={cn(inputCls, "pl-3")}
                      />
                    </div>
                  </FormRow>
                )}
                {draft.collect_cod && (
                  <div className="flex items-center gap-2 bg-amber-500/5 px-3 py-2.5">
                    <span className="text-base leading-none">💵</span>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Driver must collect <span className="font-semibold">${draft.collect_amount || "0.00"}</span>{" "}
                      before handoff
                    </p>
                  </div>
                )}
              </div>
            </Section>

            {/* OPTIONS */}
            <Section icon={Settings2} label="Options" open={sections.options} onToggle={() => toggle("options")}>
              <div className="divide-y divide-border/40">
                <FormRow label="Signature">
                  <div className="flex w-full items-center justify-between">
                    <span className="text-xs text-muted-foreground">✍️ Required on delivery</span>
                    <Switch
                      checked={!!draft.requires_signature}
                      onCheckedChange={(v) => onChange("requires_signature", v)}
                      className="scale-75"
                    />
                  </div>
                </FormRow>
                <div className="space-y-2.5 p-3">
                  <p className="font-medium text-[11px] text-muted-foreground">Delivery instructions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DELIVERY_TAGS.map((tag) => {
                      const active = activeTags.includes(tag.id as DeliveryTagId);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id as DeliveryTagId)}
                          className={cn(
                            "flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-medium text-xs transition-all",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/30 hover:bg-muted/40",
                          )}
                        >
                          <span>{tag.emoji}</span>
                          <span>{tag.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {activeTags.length > 0 && (
                    <p className="text-[10px] text-muted-foreground/60">↑ Text auto-generated in Notes</p>
                  )}
                </div>
              </div>
            </Section>

            {/* BILLING & CARRIER */}
            <Section
              icon={DollarSign}
              label="Billing & Cost"
              open={sections.billing}
              onToggle={() => toggle("billing")}
            >
              <div className="divide-y divide-border/40">
                <div className="space-y-2 p-3">
                  <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                    Select Carrier
                  </p>
                  {(["routely", "fedex", "usps", "ups"] as Carrier[]).map((c) => {
                    const isSelected = currentCarrier === c;
                    const isRoutely = c === "routely";
                    const price = isRoutely ? (draft.estimated_cost ?? 0) : CARRIER_PRICES[c];
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          onChange("carrier", c);
                          onChange("carrier_price", price);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/30 hover:bg-muted/30",
                        )}
                      >
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted p-1.5">
                          {isRoutely ? (
                            <Image src="/img/routely.svg" alt="Routely" width={18} height={18} className="opacity-60" />
                          ) : c === "ups" ? (
                            <span className="font-black text-[10px] text-amber-600">UPS</span>
                          ) : (
                            <Image
                              src={`/img/${c}.svg`}
                              alt={CARRIER_LABELS[c]}
                              width={22}
                              height={14}
                              className="object-contain"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm">{CARRIER_LABELS[c]}</span>
                            {isRoutely && (
                              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-[10px] text-emerald-600">
                                Best Value
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {isRoutely
                              ? "Medical courier · Florida"
                              : c === "fedex"
                                ? "1–2 business days"
                                : c === "usps"
                                  ? "2–3 business days"
                                  : "1–5 business days"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p
                            className={cn(
                              "font-bold tabular-nums text-sm",
                              isRoutely ? "text-emerald-600" : "text-foreground",
                            )}
                          >
                            ${price.toFixed(2)}
                          </p>
                          <div
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                              isSelected ? "border-primary bg-primary" : "border-muted-foreground/30",
                            )}
                          >
                            {isSelected && <div className="size-2 rounded-full bg-primary-foreground" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {[
                  {
                    label: "Package Type",
                    value:
                      draft.package_type === "rx"
                        ? "💊 Rx"
                        : draft.package_type === "cold"
                          ? "🧊 Cold Chain"
                          : draft.package_type === "regular"
                            ? "📦 Standard"
                            : "—",
                  },
                  { label: "Distance", value: draft.estimated_miles ? `${draft.estimated_miles.toFixed(1)} mi` : "—" },
                  { label: "Delivery Date", value: draft.is_same_day ? "⚡ Same Day" : (draft.delivery_date ?? "—") },
                  {
                    label: "Cash on Delivery",
                    value: draft.collect_cod ? `$${draft.collect_amount ?? "0.00"}` : "None",
                  },
                  {
                    label: "Estimated Total",
                    value: `$${(draft.carrier_price ?? draft.estimated_cost ?? 0).toFixed(2)}`,
                  },
                ].map((row) => (
                  <div key={row.label} className="grid" style={{ gridTemplateColumns: "130px 1fr" }}>
                    <div className="flex items-center border-r bg-muted/30 px-3 py-2">
                      <span className="font-medium text-[11px] leading-tight text-muted-foreground">{row.label}</span>
                    </div>
                    <div className="flex items-center px-3 py-2">
                      <span
                        className={cn(
                          "font-medium text-xs",
                          row.label === "Estimated Total" ? "font-bold text-foreground" : "text-foreground/80",
                        )}
                      >
                        {row.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
