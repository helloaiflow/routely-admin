"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Image from "next/image";

import JsBarcode from "jsbarcode";
import { CheckCircle2, ChevronRight, ExternalLink, Loader2, MapPin, Package, RefreshCw, User, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { CARRIER_LABELS, type Carrier, type DraftOrder, fmtPhone, tomorrowISO } from "../_lib/helpers";
import { AddressSearch } from "./address-search";

type PickupLocation = { id: string; name: string; address: string; is_default?: boolean; lat?: number; lng?: number };

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (draft: DraftOrder) => void;
  pickupLocations: PickupLocation[];
};

type ShippoRate = {
  rate_id: string;
  provider: string;
  service: string;
  days: number | null;
  raw_price: number;    // what Shippo charges us
  client_price: number; // what we charge client (raw × 1.5)
  currency?: string;
};

type LabelResult = {
  tracking_number: string;
  tracking_url: string;
  label_url: string;
};

// Mobile steps
type MobileStep = "left" | "right";

function buildForm(pickupLocations: PickupLocation[]) {
  const def = pickupLocations.find((l) => l.is_default) ?? pickupLocations[0];
  return {
    pickup_address: def?.address ?? "",
    pickup_location_id: def?.id ?? "",
    pickup_name: def?.name ?? "",
    delivery_address: "",
    delivery_city: "",
    delivery_state: "FL",
    delivery_zip: "",
    delivery_lat: undefined as number | undefined,
    delivery_lng: undefined as number | undefined,
    recipient_name: "",
    recipient_phone: "",
    recipient_email: "",
    package_type: "rx" as "rx" | "cold" | "regular",
    is_same_day: false,
    carrier: "routely" as Carrier,
    selected_rate_id: "" as string,
    notes: "",
  };
}

function generateDraftId() {
  return `DRF-${String(Math.floor(Math.random() * 900) + 100).padStart(3, "0")}`;
}

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: "CODE128",
      width: 2,
      height: 48,
      displayValue: true,
      fontSize: 11,
      margin: 6,
      background: "transparent",
      lineColor: "currentColor",
    });
  }, [value]);
  return <svg ref={ref} className="text-foreground" />;
}

export function CreateStopModal({ open, onClose, onCreated, pickupLocations }: Props) {
  const [form, setForm] = useState(() => buildForm(pickupLocations));
  const [step, setStep] = useState<"form" | "success">("form");
  const [mobileStep, setMobileStep] = useState<MobileStep>("left");
  const [created, setCreated] = useState<DraftOrder | null>(null);
  const [label, setLabel] = useState<LabelResult | null>(null);
  // Start all carrier prices at 0, update when Shippo responds
  const [shippoRates, setShippoRates] = useState<ShippoRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const rateDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setForm(buildForm(pickupLocations));
      setStep("form");
      setMobileStep("left");
      setCreated(null);
      setLabel(null);
      setShippoRates([]);
    }
  }, [open, pickupLocations]);

  function set<K extends keyof ReturnType<typeof buildForm>>(k: K, v: ReturnType<typeof buildForm>[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const fetchRates = useCallback(
    async (fromAddr: string, toAddr: string, toCity: string, toState: string, toZip: string) => {
      if (!fromAddr || !toAddr || !toCity || !toZip) return;
      clearTimeout(rateDebounce.current);
      rateDebounce.current = setTimeout(async () => {
        setRatesLoading(true);
        try {
          const fromParts = fromAddr.split(",");
          const res = await fetch("/api/client/shippo/rates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              from_address: {
                name: "Routely",
                street1: fromParts[0]?.trim() ?? fromAddr,
                city: fromParts[1]?.trim() ?? "Deerfield Beach",
                state: fromParts[2]?.trim() ?? "FL",
                zip: fromParts[3]?.trim() ?? "33442",
              },
              to_address: { name: "Recipient", street1: toAddr, city: toCity, state: toState || "FL", zip: toZip },
            }),
          });
          const data = await res.json();
          if (data.rates) setShippoRates(data.rates);
        } catch {
          /* ignore */
        } finally {
          setRatesLoading(false);
        }
      }, 800);
    },
    [],
  );

  useEffect(() => {
    if (form.delivery_address && form.delivery_city && form.delivery_zip && form.pickup_address) {
      fetchRates(
        form.pickup_address,
        form.delivery_address,
        form.delivery_city,
        form.delivery_state,
        form.delivery_zip,
      );
    }
  }, [
    form.pickup_address,
    form.delivery_address,
    form.delivery_city,
    form.delivery_zip,
    form.delivery_state,
    fetchRates,
  ]);

  function handleClose() {
    setStep("form");
    setMobileStep("left");
    setCreated(null);
    setLabel(null);
    onClose();
  }

  async function handleCreate() {
    setCreating(true);
    const now = new Date().toISOString();
    let labelResult: LabelResult | null = null;

    if (form.carrier !== "routely" && form.selected_rate_id) {
      try {
        const res = await fetch("/api/client/shippo/label", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rate_id: form.selected_rate_id }),
        });
        const data = await res.json();
        if (data.tracking_number) labelResult = data;
      } catch {
        /* continue */
      }
    }

    const carrierRate = shippoRates.find((r) => r.rate_id === form.selected_rate_id);
    const price = getSelectedClientPrice(form.carrier) ?? carrierRate?.client_price ?? 0;

    const draft: DraftOrder = {
      id: generateDraftId(),
      status: "draft",
      pickup_address: form.pickup_address,
      pickup_location_id: form.pickup_location_id,
      delivery_address: form.delivery_address,
      delivery_city: form.delivery_city,
      delivery_state: form.delivery_state,
      delivery_zip: form.delivery_zip,
      delivery_lat: form.delivery_lat,
      delivery_lng: form.delivery_lng,
      recipient_name: form.recipient_name,
      recipient_phone: form.recipient_phone,
      recipient_email: form.recipient_email || undefined,
      package_type: form.package_type,
      is_same_day: form.is_same_day,
      delivery_date: form.is_same_day ? now.slice(0, 10) : tomorrowISO(),
      carrier: form.carrier,
      carrier_price: price,
      estimated_cost: price,
      notes: form.notes || undefined,
      created_at: now,
      updated_at: now,
    };

    setCreated(draft);
    setLabel(labelResult);
    setStep("success");
    onCreated(draft);
    setCreating(false);
  }

  // Left col valid = pickup + delivery address
  const leftValid = form.pickup_address.length > 3 && form.delivery_address.length > 3;
  // Full form valid
  const isValid = leftValid && form.recipient_name.length > 1 && form.recipient_phone.length > 9;

  const inputCls =
    "h-9 w-full border-0 border-b rounded-none bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 focus-visible:border-primary placeholder:text-muted-foreground/40";

  function getBestRateForCarrier(carrier: Carrier): ShippoRate | null {
    const provider = carrier === "fedex" ? "FedEx" : carrier === "usps" ? "USPS" : carrier === "ups" ? "UPS" : null;
    if (!provider) return null;
    const rates = shippoRates.filter((r) => r.provider === provider);
    if (rates.length === 0) return null;
    // Default: prefer 1-day rate; fallback to most expensive (highest client_price)
    const oneDay = rates.filter((r) => r.days === 1);
    if (oneDay.length > 0) return oneDay.sort((a, b) => a.client_price - b.client_price)[0];
    return rates.sort((a, b) => b.client_price - a.client_price)[0]; // most expensive as fallback
  }

  // Routely = min(all carrier client_prices) × 0.85
  function getRoutelyPrice(): number | null {
    if (shippoRates.length === 0) return null;
    const allClientPrices = (["fedex", "usps", "ups"] as Carrier[])
      .map((c) => getBestRateForCarrier(c)?.client_price)
      .filter((p): p is number => p !== undefined);
    if (allClientPrices.length === 0) return null;
    const minPrice = Math.min(...allClientPrices);
    return Math.round(minPrice * 0.85 * 100) / 100;
  }

  // Get client_price for selected rate or best default
  function getSelectedClientPrice(carrier: Carrier): number | null {
    if (carrier === "routely") return getRoutelyPrice();
    if (shippoRates.length === 0) return null;
    // If a specific sub-rate is selected for this carrier, use it
    if (form.selected_rate_id) {
      const selected = shippoRates.find((r) => r.rate_id === form.selected_rate_id);
      if (selected) return selected.client_price;
    }
    return getBestRateForCarrier(carrier)?.client_price ?? null;
  }

  function getBestRate(carrier: Carrier): { amount: number; rate_id: string; service: string } | null {
    const rate = getBestRateForCarrier(carrier);
    if (!rate) return null;
    return { amount: rate.client_price, rate_id: rate.rate_id, service: rate.service };
  }

  // ─── Shared: Package Type (left col) ───────────────────────────────────────
  const PackageTypePicker = () => (
    <div className="space-y-1.5">
      <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">Package Type</p>
      <div className="flex gap-2">
        {(
          [
            { id: "rx", e: "💊", l: "Rx" },
            { id: "cold", e: "🧊", l: "Cold Chain" },
            { id: "regular", e: "📦", l: "Standard" },
          ] as const
        ).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => set("package_type", p.id)}
            className={cn(
              "flex-1 rounded-lg border py-2 font-medium text-xs transition-colors",
              form.package_type === p.id
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30",
            )}
          >
            {p.e} {p.l}
          </button>
        ))}
      </div>
    </div>
  );

  // ─── Carrier picker ─────────────────────────────────────────────────────────
  const CarrierPicker = () => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">Carrier</p>
        {ratesLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        {!ratesLoading && shippoRates.length > 0 && <span className="text-[10px] text-emerald-600">● Live rates</span>}
      </div>
      <div className="flex gap-1.5">
        {(["routely", "fedex", "usps", "ups"] as Carrier[]).map((c) => {
          const isRoutely = c === "routely";
          const price = getSelectedClientPrice(c) ?? 0;
          const selected = form.carrier === c;
          const hasLiveRate = !isRoutely && shippoRates.length > 0;
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                set("carrier", c);
                if (c !== "routely") {
                  const best = getBestRateForCarrier(c);
                  set("selected_rate_id", best?.rate_id ?? "");
                } else {
                  set("selected_rate_id", "");
                }
              }}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-lg border py-1.5 transition-all",
                selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30",
              )}
              >
              <div className="flex h-4 items-center justify-center">
                {isRoutely ? (
                  <Image
                    src="/img/routely.svg"
                    alt="Routely"
                    width={12}
                    height={12}
                    className={cn(selected ? "opacity-80" : "opacity-40")}
                  />
                ) : c === "ups" ? (
                  <span
                    className={cn("font-black text-[7.5px]", selected ? "text-amber-600" : "text-muted-foreground/40")}
                  >
                    UPS
                  </span>
                ) : (
                  <Image
                    src={`/img/${c}.svg`}
                    alt={c}
                    width={18}
                    height={10}
                    className={cn("object-contain", !selected && "opacity-40")}
                  />
                )}
              </div>
              <span
                className={cn(
                  "font-semibold text-[10px] tabular-nums",
                  isRoutely && selected ? "text-emerald-600" : selected ? "text-primary" : "text-muted-foreground/60",
                )}
              >
              {price > 0 ? `${price.toFixed(2)}` : ratesLoading ? "..." : isRoutely ? "—" : "—"}
              </span>
              {hasLiveRate && <span className="text-[7.5px] text-emerald-500/70">live</span>}
            </button>
          );
        })}
      </div>
      {form.carrier !== "routely" && shippoRates.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {shippoRates
            .filter(
              (r) => r.provider === (form.carrier === "fedex" ? "FedEx" : form.carrier === "usps" ? "USPS" : "UPS"),
            )
            .slice(0, 3)
            .map((r) => (
              <button
                key={r.rate_id}
                type="button"
                onClick={() => set("selected_rate_id", r.rate_id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-all",
                  form.selected_rate_id === r.rate_id
                    ? "border-primary bg-primary/5"
                    : "border-border/60 hover:border-primary/30",
                )}
              >
                <div>
                  <span className="font-medium text-xs">{r.service}</span>
                  {r.days && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                      {r.days} day{r.days > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <span className="font-bold text-xs">${r.client_price.toFixed(2)}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );

  // ─── Summary bar ────────────────────────────────────────────────────────────
  const SummaryBar = () => (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground/70 text-xs">
            {form.is_same_day ? "⚡ Same Day" : "📅 Tomorrow"}
            {" · "}
            {form.package_type === "rx" ? "💊 Rx" : form.package_type === "cold" ? "🧊 Cold Chain" : "📦 Standard"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {CARRIER_LABELS[form.carrier]}
            {form.carrier !== "routely" && shippoRates.length > 0 ? " · Live" : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold text-base text-foreground">
            {(() => { const p = getSelectedClientPrice(form.carrier); return p !== null ? `${p.toFixed(2)}` : "—"; })()}
          </p>
          <p className="text-[10px] text-muted-foreground">Est. total</p>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[800px]" style={{ borderRadius: "12px" }}>
        {/* ── FORM STEP ──────────────────────────────────────────────────── */}
        {step === "form" && (
          <div className="flex h-full flex-col">
            {/* Header — close button properly positioned */}
            <div className="flex shrink-0 items-center border-b px-5 py-3.5">
              {/* Mobile: back arrow on step 2 */}
              <div className="flex items-center gap-2 flex-1">
                {mobileStep === "right" && (
                  <button
                    type="button"
                    onClick={() => setMobileStep("left")}
                    className="sm:hidden -ml-1 mr-1 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronRight className="size-4 rotate-180" />
                  </button>
                )}
                <DialogTitle className="font-semibold text-base">New Delivery Stop</DialogTitle>
                {/* Mobile step indicator */}
                <span className="sm:hidden ml-auto text-[10px] text-muted-foreground">
                  {mobileStep === "left" ? "Step 1 of 2" : "Step 2 of 2"}
                </span>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="ml-3 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* ── DESKTOP: 2-col grid ─────────────────────────────────── */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_1px_1fr] sm:min-h-0 sm:overflow-hidden">
              {/* COL LEFT */}
              <div className="flex flex-col gap-0 overflow-y-auto px-5 py-4">
                <div className="mb-3 flex items-center gap-2">
                  <MapPin className="size-4 text-primary" />
                  <span className="font-semibold text-sm">Pickup & Delivery</span>
                </div>

                <div className="mb-4 space-y-0.5">
                  <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                    Pickup Location
                  </p>
                  <select
                    value={form.pickup_address}
                    onChange={(e) => {
                      const loc = pickupLocations.find((l) => l.address === e.target.value);
                      set("pickup_address", e.target.value);
                      if (loc?.id) set("pickup_location_id", loc.id);
                      if (loc?.name) set("pickup_name", loc.name);
                    }}
                    className="h-9 w-full rounded-none border-0 border-b bg-transparent text-sm outline-none focus:border-primary"
                  >
                    <option value="">Select pickup location...</option>
                    {pickupLocations.length === 0 && (
                      <option value="1950 W Hillsboro Blvd, Deerfield Beach, FL 33442">
                        WALDRUG — Deerfield Beach
                      </option>
                    )}
                    {pickupLocations.map((l) => (
                      <option key={l.id} value={l.address}>
                        {l.name}
                        {l.is_default ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                  {form.pickup_address && (
                    <span className="flex items-center gap-1 pt-1 text-[10px] text-emerald-600">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {form.pickup_address.split(",")[0]}
                    </span>
                  )}
                </div>

                <div className="mb-3 space-y-0.5">
                  <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                    Delivery Address
                  </p>
                  <AddressSearch
                    placeholder="Search address..."
                    onSelect={(d) => {
                      set("delivery_address", d.street);
                      set("delivery_city", d.city);
                      set("delivery_state", d.state || "FL");
                      set("delivery_zip", d.zip);
                      if (typeof d.lat === "number") set("delivery_lat", d.lat);
                      if (typeof d.lng === "number") set("delivery_lng", d.lng);
                    }}
                  />
                  {form.delivery_address && (
                    <span className="flex items-center gap-1 pt-1 text-[10px] text-emerald-600">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {form.delivery_address}
                    </span>
                  )}
                </div>

                <div className="mb-4 space-y-0.5">
                  <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                    City / State / ZIP
                  </p>
                  <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 48px 64px" }}>
                    <Input
                      value={form.delivery_city}
                      onChange={(e) => set("delivery_city", e.target.value)}
                      placeholder="City"
                      className={inputCls}
                    />
                    <Input
                      value={form.delivery_state}
                      onChange={(e) => set("delivery_state", e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="FL"
                      maxLength={2}
                      className={cn(inputCls, "text-center uppercase")}
                    />
                    <Input
                      value={form.delivery_zip}
                      onChange={(e) => set("delivery_zip", e.target.value.replace(/\D/g, "").slice(0, 5))}
                      placeholder="ZIP"
                      inputMode="numeric"
                      className={inputCls}
                    />
                  </div>
                </div>

                <div className="mb-4 space-y-1.5">
                  <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">Schedule</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => set("is_same_day", false)}
                      className={cn(
                        "flex-1 rounded-lg border py-2 font-medium text-xs transition-colors",
                        !form.is_same_day
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      📅 Tomorrow
                    </button>
                    <button
                      type="button"
                      onClick={() => set("is_same_day", true)}
                      className={cn(
                        "flex-1 rounded-lg border py-2 font-medium text-xs transition-colors",
                        form.is_same_day
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      ⚡ Same Day
                    </button>
                  </div>
                </div>

                {/* Package Type in LEFT col */}
                <div className="mb-4">
                  <PackageTypePicker />
                </div>

                <CarrierPicker />
              </div>

              {/* Divider */}
              <div className="bg-border" />

              {/* COL RIGHT */}
              <div className="flex flex-col gap-0 overflow-y-auto px-5 py-4">
                <div className="mb-3 flex items-center gap-2">
                  <User className="size-4 text-primary" />
                  <span className="font-semibold text-sm">Recipient</span>
                </div>

                <div className="mb-4 space-y-3">
                  <div className="space-y-0.5">
                    <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">Full Name</p>
                    <Input
                      value={form.recipient_name}
                      onChange={(e) => set("recipient_name", e.target.value.toUpperCase())}
                      placeholder="LAST, FIRST"
                      className={inputCls}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                      Phone Number
                    </p>
                    <Input
                      value={form.recipient_phone}
                      onChange={(e) => set("recipient_phone", fmtPhone(e.target.value))}
                      placeholder="(555) 123-4567"
                      inputMode="tel"
                      className={inputCls}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                      Email Address
                    </p>
                    <Input
                      value={form.recipient_email}
                      onChange={(e) => set("recipient_email", e.target.value)}
                      type="email"
                      placeholder="Optional"
                      className={inputCls}
                    />
                  </div>
                </div>

                <div className="mb-4 flex-1 space-y-0.5">
                  <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">Notes</p>
                  <textarea
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    placeholder="Special instructions for the driver..."
                    rows={3}
                    className="w-full resize-none rounded-none border-0 border-b bg-transparent pt-1 text-sm outline-none placeholder:text-muted-foreground/40 focus:border-primary"
                  />
                </div>

                <div className="mt-auto">
                  <SummaryBar />
                </div>
              </div>
            </div>

            {/* ── MOBILE: single col, full page per step ──────────────── */}
            <div className="flex flex-1 flex-col sm:hidden overflow-hidden">
              {mobileStep === "left" ? (
                /* Step 1: Pickup & Delivery */
                <div className="flex-1 overflow-y-auto px-5 py-4 pb-24">
                  <div className="mb-3 flex items-center gap-2">
                    <MapPin className="size-4 text-primary" />
                    <span className="font-semibold text-sm">Pickup & Delivery</span>
                  </div>

                  <div className="mb-4 space-y-0.5">
                    <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                      Pickup Location
                    </p>
                    <select
                      value={form.pickup_address}
                      onChange={(e) => {
                        const loc = pickupLocations.find((l) => l.address === e.target.value);
                        set("pickup_address", e.target.value);
                        if (loc?.id) set("pickup_location_id", loc.id);
                        if (loc?.name) set("pickup_name", loc.name);
                      }}
                      className="h-9 w-full rounded-none border-0 border-b bg-transparent text-sm outline-none focus:border-primary"
                    >
                      <option value="">Select pickup location...</option>
                      {pickupLocations.length === 0 && (
                        <option value="1950 W Hillsboro Blvd, Deerfield Beach, FL 33442">
                          WALDRUG — Deerfield Beach
                        </option>
                      )}
                      {pickupLocations.map((l) => (
                        <option key={l.id} value={l.address}>
                          {l.name}
                          {l.is_default ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                    {form.pickup_address && (
                      <span className="flex items-center gap-1 pt-1 text-[10px] text-emerald-600">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        {form.pickup_address.split(",")[0]}
                      </span>
                    )}
                  </div>

                  <div className="mb-3 space-y-0.5">
                    <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                      Delivery Address
                    </p>
                    <AddressSearch
                      placeholder="Search address..."
                      onSelect={(d) => {
                        set("delivery_address", d.street);
                        set("delivery_city", d.city);
                        set("delivery_state", d.state || "FL");
                        set("delivery_zip", d.zip);
                        if (typeof d.lat === "number") set("delivery_lat", d.lat);
                        if (typeof d.lng === "number") set("delivery_lng", d.lng);
                      }}
                    />
                    {form.delivery_address && (
                      <span className="flex items-center gap-1 pt-1 text-[10px] text-emerald-600">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        {form.delivery_address}
                      </span>
                    )}
                  </div>

                  <div className="mb-4 space-y-0.5">
                    <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                      City / State / ZIP
                    </p>
                    <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 48px 64px" }}>
                      <Input
                        value={form.delivery_city}
                        onChange={(e) => set("delivery_city", e.target.value)}
                        placeholder="City"
                        className={inputCls}
                      />
                      <Input
                        value={form.delivery_state}
                        onChange={(e) => set("delivery_state", e.target.value.toUpperCase().slice(0, 2))}
                        placeholder="FL"
                        maxLength={2}
                        className={cn(inputCls, "text-center uppercase")}
                      />
                      <Input
                        value={form.delivery_zip}
                        onChange={(e) => set("delivery_zip", e.target.value.replace(/\D/g, "").slice(0, 5))}
                        placeholder="ZIP"
                        inputMode="numeric"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div className="mb-4 space-y-1.5">
                    <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">Schedule</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => set("is_same_day", false)}
                        className={cn(
                          "flex-1 rounded-lg border py-2 font-medium text-xs transition-colors",
                          !form.is_same_day
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        📅 Tomorrow
                      </button>
                      <button
                        type="button"
                        onClick={() => set("is_same_day", true)}
                        className={cn(
                          "flex-1 rounded-lg border py-2 font-medium text-xs transition-colors",
                          form.is_same_day
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        ⚡ Same Day
                      </button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <PackageTypePicker />
                  </div>

                  <CarrierPicker />
                </div>
              ) : (
                /* Step 2: Recipient */
                <div className="flex-1 overflow-y-auto px-5 py-4 pb-24">
                  <div className="mb-3 flex items-center gap-2">
                    <User className="size-4 text-primary" />
                    <span className="font-semibold text-sm">Recipient</span>
                  </div>

                  <div className="mb-4 space-y-3">
                    <div className="space-y-0.5">
                      <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">Full Name</p>
                      <Input
                        value={form.recipient_name}
                        onChange={(e) => set("recipient_name", e.target.value.toUpperCase())}
                        placeholder="LAST, FIRST"
                        className={inputCls}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                        Phone Number
                      </p>
                      <Input
                        value={form.recipient_phone}
                        onChange={(e) => set("recipient_phone", fmtPhone(e.target.value))}
                        placeholder="(555) 123-4567"
                        inputMode="tel"
                        className={inputCls}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                        Email Address
                      </p>
                      <Input
                        value={form.recipient_email}
                        onChange={(e) => set("recipient_email", e.target.value)}
                        type="email"
                        placeholder="Optional"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div className="mb-4 space-y-0.5">
                    <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">Notes</p>
                    <textarea
                      value={form.notes}
                      onChange={(e) => set("notes", e.target.value)}
                      placeholder="Special instructions for the driver..."
                      rows={4}
                      className="w-full resize-none rounded-none border-0 border-b bg-transparent pt-1 text-sm outline-none placeholder:text-muted-foreground/40 focus:border-primary"
                    />
                  </div>

                  <SummaryBar />
                </div>
              )}

              {/* Mobile sticky footer */}
              <div className="shrink-0 border-t bg-background px-5 py-3">
                {mobileStep === "left" ? (
                  <Button className="w-full gap-1.5" disabled={!leftValid} onClick={() => setMobileStep("right")}>
                    Continue
                    <ChevronRight className="size-4" />
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setMobileStep("left")}>
                      Back
                    </Button>
                    <Button className="flex-1 gap-1.5" disabled={!isValid || creating} onClick={handleCreate}>
                      {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Package className="size-3.5" />}
                      {creating ? "Creating..." : "Create Stop"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Desktop footer */}
            <div className="hidden sm:flex shrink-0 items-center justify-between border-t px-5 py-3">
              <p className="text-[11px] text-muted-foreground">
                {!isValid ? "Fill in required fields to continue" : "✓ Ready to create"}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button size="sm" disabled={!isValid || creating} onClick={handleCreate} className="gap-1.5 px-4">
                  {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Package className="size-3.5" />}
                  {creating ? "Creating..." : "Create Draft Stop"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── SUCCESS STEP ───────────────────────────────────────────────── */}
        {step === "success" && created && (
          <div className="flex flex-col">
            <div className="flex shrink-0 items-center border-b px-5 py-3.5">
              <div className="flex flex-1 items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span className="font-semibold text-base">Draft Stop Created</span>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="ml-3 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-[80svh] overflow-y-auto sm:max-h-none">
              <div className="grid sm:grid-cols-2">
                <div className="flex flex-col items-center gap-4 px-6 py-6 sm:border-r">
                  {label?.label_url ? (
                    <div className="flex w-full flex-col items-center gap-3">
                      <div className="w-full overflow-hidden rounded-xl border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={label.label_url} alt="Shipping label" className="w-full" />
                      </div>
                      <div className="flex w-full gap-2">
                        <a
                          href={label.label_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 font-medium text-xs transition-colors hover:bg-muted/40"
                        >
                          <ExternalLink className="size-3.5" /> View Label
                        </a>
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 font-medium text-xs transition-colors hover:bg-muted/40"
                        >
                          🖨️ Print
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex w-full flex-col items-center rounded-xl border bg-muted/20 px-4 py-5">
                      <Barcode value={created.id} />
                      <p className="mt-1 font-bold font-mono text-foreground text-lg tracking-widest">{created.id}</p>
                      <p className="text-[10px] text-muted-foreground">Scan to access this stop</p>
                    </div>
                  )}

                  {label?.tracking_number && (
                    <div className="w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                      <p className="mb-0.5 text-[10px] text-muted-foreground">Tracking Number</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono font-semibold text-foreground text-sm">{label.tracking_number}</p>
                        {label.tracking_url && (
                          <a
                            href={label.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex shrink-0 items-center gap-0.5 text-[10px] text-primary hover:underline"
                          >
                            Track <ExternalLink className="size-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="w-full space-y-2">
                    {[
                      { label: "Recipient", value: created.recipient_name },
                      { label: "Address", value: created.delivery_address },
                      {
                        label: "City",
                        value: `${created.delivery_city}, ${created.delivery_state} ${created.delivery_zip}`,
                      },
                      { label: "Phone", value: created.recipient_phone },
                    ].map((r) => (
                      <div key={r.label}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{r.label}</span>
                          <span className="max-w-[180px] truncate text-right font-medium text-xs">{r.value}</span>
                        </div>
                        <Separator className="mt-2" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-4 border-t px-6 py-6 sm:border-t-0">
                  <div className="space-y-2">
                    <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                      Delivery Details
                    </p>
                    <div className="divide-y overflow-hidden rounded-xl border">
                      {[
                        {
                          label: "Package",
                          value:
                            created.package_type === "rx"
                              ? "💊 Rx"
                              : created.package_type === "cold"
                                ? "🧊 Cold Chain"
                                : "📦 Standard",
                        },
                        { label: "Schedule", value: created.is_same_day ? "⚡ Same Day" : "📅 Tomorrow" },
                        { label: "Status", value: "🟡 Draft" },
                        { label: "Stop ID", value: created.id },
                      ].map((r) => (
                        <div key={r.label} className="flex items-center justify-between px-3 py-2">
                          <span className="text-[11px] text-muted-foreground">{r.label}</span>
                          <span className="font-medium font-mono text-xs">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {created.carrier === "routely" ? (
                          <div className="flex items-center gap-1.5">
                            <Image src="/img/routely.svg" alt="Routely" width={18} height={18} className="opacity-60" />
                            <span className="font-semibold text-sm">Routely Local</span>
                          </div>
                        ) : created.carrier === "ups" ? (
                          <span className="font-black text-amber-600 text-sm">UPS Ground</span>
                        ) : (
                          <Image
                            src={`/img/${created.carrier}.svg`}
                            alt={created.carrier ?? ""}
                            width={44}
                            height={22}
                            className="object-contain"
                          />
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-foreground text-xl">${(created.carrier_price ?? 0).toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground">{label ? "Charged" : "Estimated"} total</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-muted/30 px-3 py-2.5">
                    <p className="mb-0.5 text-[10px] text-muted-foreground">Pickup from</p>
                    <p className="font-medium text-sm">{created.pickup_address.split(",")[0]}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {created.pickup_address.split(",").slice(1).join(",").trim()}
                    </p>
                  </div>

                  <div className="mt-auto flex flex-col gap-2">
                    <Button className="w-full gap-1.5" onClick={handleClose}>
                      <CheckCircle2 className="size-3.5" />
                      View in Stops
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setForm(buildForm(pickupLocations));
                          setStep("form");
                          setMobileStep("left");
                          setCreated(null);
                          setLabel(null);
                          setShippoRates([]);
                        }}
                      >
                        <RefreshCw className="mr-1.5 size-3.5" /> Another Stop
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleClose}>
                        Close
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
