"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ArrowLeft,
  ArrowRight,
  Box,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Download,
  ExternalLink,
  Gift,
  Loader2,
  MapPin,
  Package,
  Pill,
  Printer,
  ReceiptText,
  RotateCcw,
  Snowflake,
  Truck,
  User,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { StripePaymentElement } from "./_components/stripe-payment-element";

/* ────────────────────────────────────────────────────────────────────────────
 *  Buy a Shipping Label — carrier labels (USPS · UPS · FedEx) via Shippo.
 *
 *  3-step wizard, mobile-first:
 *    1 · Details  — sender (pickup location), recipient, parcel dims/weight
 *    2 · Service  — live Shippo rates at client price (raw × 1.5 server-side)
 *    3 · Payment  — Stripe card (charged BEFORE the label is bought; Shippo
 *                   failure auto-refunds) or Postpay for approved tenants
 *    ✓ · Confirmed — carrier tracking number + label PNG (print / download)
 *
 *  Money flow: /labels/checkout re-validates the rate server-side and creates
 *  the label_orders record → Stripe element charges → /labels/purchase
 *  verifies the PaymentIntent, buys the Shippo label, persists the result.
 * ──────────────────────────────────────────────────────────────────────────── */

type PickupLocation = {
  id: string;
  name: string;
  /** Display string for the dropdown subtitle. */
  address: string;
  /** Structured parts straight from the tenant API (no fragile string parse). */
  parts: Pick<ShippoAddress, "street1" | "city" | "state" | "zip">;
  is_default?: boolean;
};

type ShippoAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  /** Recipient email — optional but recommended; rides along in to_address. */
  email?: string;
};

/** Label package types — same taxonomy as the stops page package pills. */
/* Standard leads (it's the default selection — first option, left-most). */
const PACKAGE_TYPES: { id: "internal" | "cold" | "rx" | "standard"; label: string; icon: React.ElementType }[] = [
  { id: "standard", label: "Standard", icon: Package },
  { id: "rx", label: "RX Prescription", icon: Pill },
  { id: "cold", label: "Cold Package", icon: Snowflake },
  { id: "internal", label: "Internal", icon: Gift },
];
type PackageTypeId = (typeof PACKAGE_TYPES)[number]["id"];

type Rate = {
  rate_id: string;
  provider: string;
  service: string;
  days: number | null;
  client_price: number;
  currency: string;
};

type Step = "details" | "service" | "payment" | "confirmed";

function fmtPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** "1950 W Hillsboro Blvd Suite 103, Deerfield Beach, FL 33442" → parts */
function parseAddress(full: string): Pick<ShippoAddress, "street1" | "city" | "state" | "zip"> {
  const m = full.match(/^(.*?),\s*([^,]+),\s*([A-Za-z]{2})\.?\s+(\d{5})/);
  if (m) return { street1: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: m[4] };
  return { street1: full, city: "", state: "FL", zip: "" };
}

/* Stops-style compact controls: h-9, rounded-lg, border-border/60, primary focus ring. */
/* WHITE fields (bg-card) — bg-background inherited the page's grey tint and
 * made every input look washed inside the white cards. */
const fieldCls =
  "h-9 w-full rounded-lg border-border/60 bg-card px-2.5 text-base shadow-none placeholder:text-muted-foreground/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 sm:text-[13px]";

/* Section card — shared across all steps so spacing/borders stay identical. */
const cardCls = "rounded-2xl border border-border/60 bg-card p-4 sm:p-5";

/* Destructive treatment for invalid controls (paired with aria-invalid). */
const errCls = "border-destructive/60 focus-visible:border-destructive focus-visible:ring-destructive/15";

function FL({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block font-medium text-muted-foreground text-xs">
      {children}
    </label>
  );
}

/** Inline field error — 11px below the control, never shifts siblings around. */
function FieldErr({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-[11px] text-destructive">{msg}</p>;
}

/* ── Review row (step 3): icon + section + values + Edit → jump back ──────── */
function ReviewRow({
  icon: Icon,
  label,
  onEdit,
  children,
}: {
  icon: React.ElementType;
  label: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-primary/10">
        <Icon className="size-3 text-primary" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 text-xs leading-snug">
        <p className="mb-0.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">{label}</p>
        {children}
      </div>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${label.toLowerCase()}`}
        className="shrink-0 rounded font-medium text-primary text-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        Edit
      </button>
    </div>
  );
}

/* Radio-cards for the payment method (only rendered when Postpay exists). */
const radioCardCls =
  "flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2.5 transition-colors hover:border-border has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40";
const radioCardActive = "border-primary bg-primary/5 text-primary";

/* ── Google Places autocomplete (same pattern as the courier flow) ────────── */
type Prediction = { description: string; place_id: string; main_text: string; secondary_text: string };

function AddressSearch({
  placeholder,
  onSelect,
}: {
  placeholder: string;
  onSelect: (d: { street: string; city: string; state: string; zip: string }) => void;
}) {
  const [input, setInput] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInput(val);
    clearTimeout(debRef.current);
    if (val.length < 3) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    debRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/client/places?input=${encodeURIComponent(val)}`);
        const d = await r.json();
        const p = d.predictions ?? [];
        setPredictions(p);
        setOpen(p.length > 0);
      } catch {
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  async function handleSelect(p: Prediction) {
    setInput(p.description);
    setOpen(false);
    setPredictions([]);
    try {
      const r = await fetch(`/api/client/place-details?place_id=${encodeURIComponent(p.place_id)}`);
      const d = await r.json();
      onSelect({ street: d.street || p.description, city: d.city || "", state: d.state || "FL", zip: d.zip || "" });
      setInput(d.street || p.description);
    } catch {
      onSelect({ street: p.description, city: "", state: "FL", zip: "" });
    }
  }

  return (
    <div className="relative w-full">
      {/* Stops-toolbar-style search shell */}
      <div className="flex h-10 items-center gap-2 rounded-xl border border-border/60 bg-card px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
        <MapPin className="size-3.5 shrink-0 text-primary/60" />
        <input
          value={input}
          onChange={handleChange}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={placeholder}
          className="h-full w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground/50 sm:text-[13px]"
        />
        {loading && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      {open && predictions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
          {predictions.map((p) => (
            <button
              key={p.place_id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(p);
              }}
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent"
            >
              <MapPin className="mt-0.5 size-3 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate font-medium text-xs">{p.main_text}</p>
                <p className="truncate text-[10px] text-muted-foreground">{p.secondary_text}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Ship-From selector — stops pickup-selector pattern (closed button +
 *    dropdown panel with every tenant location + "Custom address…"). ──────── */
function PickupSelector({
  locations,
  selectedId,
  custom,
  fromName,
  fromAddress,
  onSelect,
  onCustom,
}: {
  locations: PickupLocation[];
  selectedId: string;
  custom: boolean;
  fromName: string;
  fromAddress: string;
  onSelect: (loc: PickupLocation) => void;
  onCustom: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = locations.find((l) => l.id === selectedId);
  const title = custom ? fromName || "Custom address" : (selected?.name ?? "Choose a pickup location…");
  const subtitle = custom ? fromAddress || "Enter the sender address below" : (selected?.address ?? "");
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-border/60 bg-card px-3 py-2 text-left transition-colors hover:border-border"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded bg-primary/10">
          <MapPin className="size-3 text-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-xs">{title}</span>
          <span className="block truncate text-[11px] text-muted-foreground leading-tight">{subtitle}</span>
        </span>
        <ChevronDown
          className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border/60 bg-popover shadow-lg">
          {locations.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                onSelect(l);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-accent",
                !custom && l.id === selectedId && "bg-primary/5",
              )}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded bg-primary/10">
                <MapPin className="size-3 text-primary" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-xs">{l.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground leading-tight">{l.address}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onCustom();
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2.5 border-border/60 border-t px-2.5 py-2 text-left transition-colors hover:bg-accent",
              custom && "bg-primary/5",
            )}
          >
            <span className="grid size-6 shrink-0 place-items-center rounded bg-muted">
              <Truck className="size-3 text-muted-foreground" />
            </span>
            <span className="truncate font-semibold text-xs">Custom address…</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Parcel presets ───────────────────────────────────────────────────────── */
const PARCEL_PRESETS = [
  { id: "envelope", label: "Envelope", sub: '12.5×9.5×0.8"', length: "12.5", width: "9.5", height: "0.8", weight: "8" },
  { id: "small", label: "Small Box", sub: '9×6×3"', length: "9", width: "6", height: "3", weight: "16" },
  { id: "medium", label: "Medium Box", sub: '12×10×5"', length: "12", width: "10", height: "5", weight: "32" },
  { id: "custom", label: "Custom", sub: "your dims", length: "", width: "", height: "", weight: "" },
] as const;

/* ── Carrier brand logos (public/img/carriers/) — text chip is the fallback ─ */
const CARRIER_LOGOS: Record<string, string> = {
  usps: "/img/carriers/usps.svg",
  ups: "/img/carriers/ups.svg",
  fedex: "/img/carriers/fedex.svg",
};

/* ── Carrier chip colors (fallback when a logo is missing/fails) ──────────── */
const CARRIER_STYLE: Record<string, string> = {
  USPS: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/25",
  UPS: "bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-500/25",
  FedEx: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/25",
};

/* ── Wizard bottom bar — stops-footer pattern: fixed-feel sticky bar with the
 *    step track on top and the step's primary CTA below (thumb-reachable).
 *    Safe-area padded so iOS home indicators never cover the CTA. ─────────── */
const STEPS: { id: Step; n: number; label: string }[] = [
  { id: "details", n: 1, label: "Details" },
  { id: "service", n: 2, label: "Service" },
  { id: "payment", n: 3, label: "Review & Pay" },
];

function StepTrack({ step }: { step: Step }) {
  const activeIdx = step === "confirmed" ? 3 : STEPS.findIndex((s) => s.id === step);
  return (
    <nav className="flex items-center justify-center gap-1.5 sm:gap-2" aria-label={`Step ${activeIdx + 1} of 3`}>
      {STEPS.map((s, i) => {
        const done = i < activeIdx || step === "confirmed";
        const active = s.id === step;
        return (
          <div key={s.id} className="flex items-center gap-1.5 sm:gap-2">
            {i > 0 && <div className={cn("h-px w-4 sm:w-8", done || active ? "bg-primary" : "bg-border")} />}
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-primary/30 bg-primary/5 text-primary"
                    : "border-border text-muted-foreground",
              )}
            >
              {done ? (
                <CheckCircle2 className="size-3" aria-hidden="true" />
              ) : (
                <span className="font-semibold text-[10px] tabular-nums">{s.n}</span>
              )}
              <span className="font-medium text-[11px]">{s.label}</span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function WizardBar({ children }: { step?: Step; children: React.ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-40 -mx-4 mt-6 rounded-t-2xl border-border/40 border-t border-x bg-card/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:-mx-6 sm:px-6"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function BuyLabelPage() {
  const [step, setStep] = useState<Step>("details");
  const [error, setError] = useState("");

  // Sender — prefilled from the tenant's default pickup location, editable.
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [pickupId, setPickupId] = useState("");
  const [fromCustom, setFromCustom] = useState(false);
  const [from, setFrom] = useState<ShippoAddress>({ name: "", street1: "", city: "", state: "FL", zip: "", phone: "" });

  // Recipient
  const [to, setTo] = useState<ShippoAddress>({
    name: "",
    street1: "",
    street2: "",
    city: "",
    state: "FL",
    zip: "",
    phone: "",
    email: "",
  });

  // Parcel
  const [packageType, setPackageType] = useState<PackageTypeId>("standard");
  const [preset, setPreset] = useState<string>("small");
  const [parcel, setParcel] = useState({ length: "9", width: "6", height: "3", weight: "16" });

  // Rates
  const [rates, setRates] = useState<Rate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [selectedRateId, setSelectedRateId] = useState("");
  // Carrier logos that 404'd/failed — those groups fall back to the text chip.
  const [logoFailed, setLogoFailed] = useState<Record<string, boolean>>({});
  // Expandable carrier groups — null until the user interacts; by default only
  // the carrier holding the overall-cheapest rate starts open.
  const [openCarriers, setOpenCarriers] = useState<Record<string, boolean> | null>(null);

  // Payment
  const [postpay, setPostpay] = useState<{ enabled: boolean; available: number }>({ enabled: false, available: 0 });
  const [paymentType, setPaymentType] = useState<"card" | "postpay">("card");
  const [orderId, setOrderId] = useState("");
  const [amountCents, setAmountCents] = useState(0);
  const [checkingOut, setCheckingOut] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  // Result
  const [result, setResult] = useState<{
    tracking_number: string;
    tracking_url: string;
    label_url: string;
    recipient_notified?: boolean;
  } | null>(null);

  const selectedRate = rates.find((r) => r.rate_id === selectedRateId) ?? null;

  // Error banner can land off-screen on mobile (sticky CTAs push it up) —
  // bring it into view whenever a new error is set.
  const errorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  /* ── Tenant bootstrap: pickup locations + postpay eligibility ── */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/client/tenant");
        const d = await r.json();
        const locs: PickupLocation[] = (d.pickup_locations ?? []).map((l: Record<string, unknown>) => {
          // tenant API returns address as a STRUCTURED object {street, city,
          // state, zip} — use it directly; only fall back to string parsing.
          const a = l.address as { street?: string; city?: string; state?: string; zip?: string } | string | undefined;
          const parts =
            a && typeof a === "object"
              ? {
                  street1: String(a.street ?? ""),
                  city: String(a.city ?? ""),
                  state: String(a.state ?? "FL").toUpperCase(),
                  zip: String(a.zip ?? ""),
                }
              : parseAddress(String(a ?? ""));
          return {
            id: String(l.id ?? l.location_id ?? ""),
            name: String(l.name ?? ""),
            address: [parts.street1, parts.city, `${parts.state} ${parts.zip}`.trim()].filter(Boolean).join(", "),
            parts,
            is_default: Boolean(l.is_default),
          };
        });
        setPickupLocations(locs);
        // Sender phone — USPS requires it to purchase; prefill from the
        // tenant's phone on file so the user never has to think about it.
        const senderPhone = d.sender_phone ? fmtPhone(String(d.sender_phone)) : "";
        const def = locs.find((l) => l.is_default) ?? locs[0];
        if (def) {
          setPickupId(def.id);
          setFrom((f) => ({ ...f, name: d.company_name ?? def.name, phone: f.phone || senderPhone, ...def.parts }));
        } else if (d.company_name) {
          setFrom((f) => ({ ...f, name: d.company_name, phone: f.phone || senderPhone }));
        }
        const limit = Number(d.credit_limit ?? 0);
        const outstanding = Number(d.outstanding_amount ?? 0);
        setPostpay({ enabled: Boolean(d.postpay_enabled), available: Math.max(0, limit - outstanding) });
      } catch {
        /* tenant fetch is best-effort — fields stay editable */
      }
    })();
  }, []);

  function applyPickup(loc: PickupLocation) {
    setPickupId(loc.id);
    setFromCustom(false);
    setFrom((f) => ({ ...f, ...loc.parts }));
  }

  function applyPreset(p: (typeof PARCEL_PRESETS)[number]) {
    setPreset(p.id);
    if (p.id !== "custom") setParcel({ length: p.length, width: p.width, height: p.height, weight: p.weight });
  }

  /* ── Per-field validation: errors surface on blur (touched) or when the
   *    user tries to advance (touched.__all). detailsValid gates the advance. ── */
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (k: string) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));

  const emailValid = !to.email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.email);

  const FIELD_LABELS: Record<string, string> = {
    "from.location": "pickup location",
    "from.name": "sender name",
    "from.street1": "sender street",
    "from.city": "sender city",
    "from.state": "sender state",
    "from.zip": "sender ZIP",
    "to.name": "recipient name",
    "to.email": "email",
    "to.street1": "delivery address",
    "to.city": "city",
    "to.state": "state",
    "to.zip": "ZIP",
    "parcel.length": "length",
    "parcel.width": "width",
    "parcel.height": "height",
    "parcel.weight": "weight",
  };

  const fieldErrors = useMemo(() => {
    const e: Record<string, string> = {};
    const fromComplete =
      from.name.trim().length > 1 &&
      from.street1.trim().length > 3 &&
      from.city.trim().length > 1 &&
      from.state.trim().length === 2 &&
      from.zip.length === 5;
    if (fromCustom) {
      if (from.name.trim().length < 2) e["from.name"] = "Enter the sender name.";
      if (from.street1.trim().length < 4) e["from.street1"] = "Enter the street address.";
      if (from.city.trim().length < 2) e["from.city"] = "Enter the city.";
      if (from.state.trim().length !== 2) e["from.state"] = "2-letter state.";
      if (from.zip.length !== 5) e["from.zip"] = "5-digit ZIP.";
    } else if (!fromComplete) {
      e["from.location"] = "This location's address is incomplete — pick another or use Custom address.";
    }
    if (to.name.trim().length < 2) e["to.name"] = "Enter the recipient's full name.";
    if (!emailValid) e["to.email"] = "That doesn’t look like a valid email.";
    if (to.street1.trim().length < 4) e["to.street1"] = "Search and select the delivery address.";
    if (to.city.trim().length < 2) e["to.city"] = "Enter the city.";
    if (to.state.trim().length !== 2) e["to.state"] = "2-letter state.";
    if (to.zip.length !== 5) e["to.zip"] = "5-digit ZIP.";
    if (!(Number(parcel.length) > 0)) e["parcel.length"] = "Required.";
    if (!(Number(parcel.width) > 0)) e["parcel.width"] = "Required.";
    if (!(Number(parcel.height) > 0)) e["parcel.height"] = "Required.";
    if (!(Number(parcel.weight) > 0)) e["parcel.weight"] = "Required.";
    return e;
  }, [from, to, fromCustom, emailValid, parcel]);

  const showErr = (k: string): string | undefined => (touched[k] || touched.__all ? fieldErrors[k] : undefined);
  const detailsValid = Object.keys(fieldErrors).length === 0;

  /* ── Details CTA: block advance with a summary of what's missing ── */
  function handleGetRates() {
    if (!detailsValid) {
      setTouched((t) => ({ ...t, __all: true }));
      const missing = Object.keys(fieldErrors)
        .map((k) => FIELD_LABELS[k] ?? k)
        .join(", ");
      setError(`Complete these before getting rates: ${missing}.`);
      return;
    }
    setError("");
    fetchRates();
  }

  /* ── Step 1 → 2: quote ── */
  async function fetchRates() {
    setError("");
    setRatesLoading(true);
    setOpenCarriers(null); // fresh quote → default expansion again
    setRates([]);
    setSelectedRateId("");
    setStep("service");
    try {
      const r = await fetch("/api/client/shippo/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_address: from,
          to_address: to,
          parcel: {
            length: parcel.length,
            width: parcel.width,
            height: parcel.height,
            distanceUnit: "in",
            weight: parcel.weight,
            massUnit: "oz",
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not get rates");
      setRates(d.rates ?? []);
      if ((d.rates ?? []).length === 0) setError("No rates available for this address/parcel. Check the details.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get rates");
    } finally {
      setRatesLoading(false);
    }
  }

  /* ── Step 2 → 3: create the order (server re-validates price) ── */
  async function checkout(type: "card" | "postpay") {
    if (!selectedRate) return;
    setError("");
    setCheckingOut(true);
    try {
      const r = await fetch("/api/client/labels/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_address: from,
          to_address: to,
          parcel: {
            length: parcel.length,
            width: parcel.width,
            height: parcel.height,
            distanceUnit: "in",
            weight: parcel.weight,
            massUnit: "oz",
          },
          rate_id: selectedRate.rate_id,
          payment_type: type,
          package_type: packageType,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Checkout failed");
      setOrderId(d.order_id);
      setAmountCents(d.amount_cents);
      return d.order_id as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      return null;
    } finally {
      setCheckingOut(false);
    }
  }

  /* ── Final: buy the label (after payment verified server-side) ── */
  async function purchase(oid: string, paymentIntentId?: string) {
    setError("");
    setPurchasing(true);
    try {
      const r = await fetch("/api/client/labels/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: oid, payment_intent_id: paymentIntentId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Label purchase failed");
      setResult({
        tracking_number: d.tracking_number,
        tracking_url: d.tracking_url,
        label_url: d.label_url,
        recipient_notified: Boolean(d.recipient_notified),
      });
      setStep("confirmed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Label purchase failed");
      // Reset the checkout so the user gets a clean retry path (a failed
      // purchase auto-refunds server-side; the old PaymentIntent is spent —
      // leaving the Stripe element mounted froze the button on "Processing…").
      setOrderId("");
      setAmountCents(0);
    } finally {
      setPurchasing(false);
    }
  }

  async function handlePostpayConfirm() {
    const oid = orderId || (await checkout("postpay"));
    if (oid) await purchase(oid);
  }

  // ── Unified pay flow: checkout fires automatically on entering Review & Pay
  // (and again after a payment-type switch or a failed purchase, both of which
  // reset orderId) — no extra "Continue to payment" click. Money order is
  // untouched: checkout → charge → purchase.
  // `error` in the guard stops an infinite retry loop when checkout itself
  // fails (rate expired etc.) — the payment area then offers a manual retry
  // that clears the error, which re-arms this effect.
  // biome-ignore lint/correctness/useExhaustiveDependencies: checkout is a stable page-level fn; deps are the actual triggers
  useEffect(() => {
    if (step !== "payment" || orderId || checkingOut || purchasing || error || !selectedRate) return;
    checkout(paymentType);
  }, [step, orderId, paymentType, checkingOut, purchasing, error, selectedRate]);

  function printLabel() {
    if (!result?.label_url) return;
    const w = window.open("", "_blank", "width=480,height=720");
    if (!w) return;
    w.document.write(
      `<!DOCTYPE html><html><head><title>Label ${result.tracking_number}</title><style>@page{margin:0}body{margin:0;display:flex;justify-content:center}img{width:4in}</style></head><body><img src="${result.label_url}" onload="window.print()" /></body></html>`,
    );
    w.document.close();
  }

  function resetAll() {
    setStep("details");
    setError("");
    setRates([]);
    setSelectedRateId("");
    setOrderId("");
    setAmountCents(0);
    setResult(null);
    setPaymentType("card");
    setTo({ name: "", street1: "", street2: "", city: "", state: "FL", zip: "", phone: "" });
  }

  const postpayUsable = postpay.enabled && selectedRate != null && postpay.available >= selectedRate.client_price;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-4 sm:px-6 sm:pt-6">
      {/* ── Header ── */}
      <div className="mb-4 text-center sm:mb-5">
        <h1 className="type-page-title">Buy a Shipping Label</h1>
        <p className="type-desc mt-0.5">USPS · UPS · FedEx — shipped through Routely</p>
      </div>

      {/* Steps live at the TOP (progress reads before content); the bottom bar
          keeps only the step's primary CTA. */}
      {step !== "confirmed" && (
        <div className="mb-5">
          <StepTrack step={step} />
        </div>
      )}

      {error && (
        <div
          ref={errorRef}
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-destructive text-sm"
        >
          <X className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0">{error}</span>
        </div>
      )}

      {/* ══ STEP 1 · DETAILS — one fluid "shipment journey" card ══════════
          FROM ●──(dashed connector)──● TO, then Recipient, then Package —
          the same top-to-bottom story a tracking timeline tells. ─────────── */}
      {step === "details" && (
        <div className="space-y-5">
          <Card className="gap-0 overflow-hidden border-border/60 p-0 shadow-sm">
            {/* ── Route: From → To journey ── */}
            <div className="p-4 sm:p-5">
              {/* FROM node — the rail lives INSIDE this row (top-8 → bottom-0),
                  so it always spans exactly the gap down to the TO avatar, no
                  matter how tall the custom-address fields make the row. */}
              <div className="flex gap-3 pb-5">
                <div className="relative shrink-0">
                  <span className="relative z-10 grid size-7 place-items-center rounded-full bg-primary/10 ring-4 ring-card">
                    <Truck className="size-3.5 text-primary" />
                  </span>
                  <div
                    className="absolute top-8 bottom-0 left-1/2 -translate-x-1/2 border-primary/40 border-l border-dashed"
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
                    Ship From
                  </p>
                  <PickupSelector
                    locations={pickupLocations}
                    selectedId={pickupId}
                    custom={fromCustom}
                    fromName={from.name}
                    fromAddress={[from.street1, from.city, from.state, from.zip].filter(Boolean).join(", ")}
                    onSelect={applyPickup}
                    onCustom={() => setFromCustom(true)}
                  />
                  <FieldErr msg={showErr("from.location")} />
                  {fromCustom && (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <FL htmlFor="lf-from-name">Sender Name *</FL>
                        <Input
                          id="lf-from-name"
                          name="sender_name"
                          autoComplete="organization"
                          value={from.name}
                          onChange={(e) => setFrom({ ...from, name: e.target.value })}
                          onBlur={() => touch("from.name")}
                          aria-invalid={!!showErr("from.name")}
                          placeholder="Business or person"
                          className={cn(fieldCls, showErr("from.name") && errCls)}
                        />
                        <FieldErr msg={showErr("from.name")} />
                      </div>
                      <div>
                        <FL htmlFor="lf-from-phone">Phone</FL>
                        <Input
                          id="lf-from-phone"
                          name="sender_phone"
                          type="tel"
                          autoComplete="tel"
                          value={from.phone}
                          onChange={(e) => setFrom({ ...from, phone: fmtPhone(e.target.value) })}
                          placeholder="(555) 555-5555"
                          inputMode="tel"
                          className={fieldCls}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <FL htmlFor="lf-from-street">Street *</FL>
                        <Input
                          id="lf-from-street"
                          name="sender_street"
                          autoComplete="street-address"
                          value={from.street1}
                          onChange={(e) => setFrom({ ...from, street1: e.target.value })}
                          onBlur={() => touch("from.street1")}
                          aria-invalid={!!showErr("from.street1")}
                          placeholder="Street address"
                          className={cn(fieldCls, showErr("from.street1") && errCls)}
                        />
                        <FieldErr msg={showErr("from.street1")} />
                      </div>
                      <div>
                        <FL htmlFor="lf-from-city">City *</FL>
                        <Input
                          id="lf-from-city"
                          name="sender_city"
                          autoComplete="address-level2"
                          value={from.city}
                          onChange={(e) => setFrom({ ...from, city: e.target.value })}
                          onBlur={() => touch("from.city")}
                          aria-invalid={!!showErr("from.city")}
                          className={cn(fieldCls, showErr("from.city") && errCls)}
                        />
                        <FieldErr msg={showErr("from.city")} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <FL htmlFor="lf-from-state">State *</FL>
                          <Input
                            id="lf-from-state"
                            name="sender_state"
                            autoComplete="address-level1"
                            value={from.state}
                            onChange={(e) => setFrom({ ...from, state: e.target.value.toUpperCase().slice(0, 2) })}
                            onBlur={() => touch("from.state")}
                            aria-invalid={!!showErr("from.state")}
                            className={cn(fieldCls, showErr("from.state") && errCls)}
                          />
                          <FieldErr msg={showErr("from.state")} />
                        </div>
                        <div>
                          <FL htmlFor="lf-from-zip">ZIP *</FL>
                          <Input
                            id="lf-from-zip"
                            name="sender_zip"
                            autoComplete="postal-code"
                            value={from.zip}
                            onChange={(e) => setFrom({ ...from, zip: e.target.value.replace(/\D/g, "").slice(0, 5) })}
                            onBlur={() => touch("from.zip")}
                            aria-invalid={!!showErr("from.zip")}
                            inputMode="numeric"
                            className={cn(fieldCls, showErr("from.zip") && errCls)}
                          />
                          <FieldErr msg={showErr("from.zip")} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* TO node */}
              <div className="flex gap-3">
                <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-emerald-500/10 ring-4 ring-card">
                  <MapPin className="size-3.5 text-emerald-600" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="mb-1.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
                    Ship To
                  </p>
                  {/* SAME design language as Ship From: once an address is
                      selected it renders as the identical selector-row card;
                      the search input only shows while empty. */}
                  {to.street1 ? (
                    <div className="flex w-full items-center gap-2.5 rounded-xl border border-border/60 bg-card px-3 py-2">
                      <div className="flex size-6 shrink-0 items-center justify-center rounded bg-emerald-500/10">
                        <MapPin className="size-3 text-emerald-600" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-xs text-foreground">{to.street1}</p>
                        <p className="truncate text-[11px] text-muted-foreground leading-tight">
                          {[to.city, `${to.state} ${to.zip}`.trim()].filter(Boolean).join(", ")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTo((t) => ({ ...t, street1: "", street2: "", city: "", zip: "" }))}
                        className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-[11px] text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <AddressSearch
                      placeholder="Search delivery address…"
                      onSelect={(d) =>
                        setTo((t) => ({ ...t, street1: d.street, city: d.city, state: d.state, zip: d.zip }))
                      }
                    />
                  )}
                  <FieldErr msg={showErr("to.street1")} />
                  {/* Proportional widths: Apt is a SHORT code field; City gets
                      the room; State is 2 chars; ZIP is 5 digits. */}
                  {to.street1 && (
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[110px_minmax(0,1fr)_70px_100px]">
                      <div>
                        <FL htmlFor="lf-to-street2">Apt / Unit</FL>
                        <Input
                          id="lf-to-street2"
                          name="to_street2"
                          autoComplete="address-line2"
                          value={to.street2}
                          onChange={(e) => setTo({ ...to, street2: e.target.value })}
                          placeholder="Optional"
                          className={fieldCls}
                        />
                      </div>
                      <div>
                        <FL htmlFor="lf-to-city">City *</FL>
                        <Input
                          id="lf-to-city"
                          name="to_city"
                          autoComplete="address-level2"
                          value={to.city}
                          onChange={(e) => setTo({ ...to, city: e.target.value })}
                          onBlur={() => touch("to.city")}
                          aria-invalid={!!showErr("to.city")}
                          className={cn(fieldCls, showErr("to.city") && errCls)}
                        />
                        <FieldErr msg={showErr("to.city")} />
                      </div>
                      <div>
                        <FL htmlFor="lf-to-state">State *</FL>
                        <Input
                          id="lf-to-state"
                          name="to_state"
                          autoComplete="address-level1"
                          value={to.state}
                          onChange={(e) => setTo({ ...to, state: e.target.value.toUpperCase().slice(0, 2) })}
                          onBlur={() => touch("to.state")}
                          aria-invalid={!!showErr("to.state")}
                          className={cn(fieldCls, "text-center uppercase", showErr("to.state") && errCls)}
                        />
                        <FieldErr msg={showErr("to.state")} />
                      </div>
                      <div>
                        <FL htmlFor="lf-to-zip">ZIP *</FL>
                        <Input
                          id="lf-to-zip"
                          name="to_zip"
                          autoComplete="postal-code"
                          value={to.zip}
                          onChange={(e) => setTo({ ...to, zip: e.target.value.replace(/\D/g, "").slice(0, 5) })}
                          onBlur={() => touch("to.zip")}
                          aria-invalid={!!showErr("to.zip")}
                          inputMode="numeric"
                          className={cn(fieldCls, "tabular-nums", showErr("to.zip") && errCls)}
                        />
                        <FieldErr msg={showErr("to.zip")} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator className="bg-border/60" />

            {/* ── Recipient ── */}
            <div className="p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-primary/10">
                  <User className="size-3 text-primary" />
                </span>
                <h2 className="font-semibold text-sm">Recipient</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <FL htmlFor="lf-to-name">Name *</FL>
                  <Input
                    id="lf-to-name"
                    name="to_name"
                    autoComplete="name"
                    value={to.name}
                    onChange={(e) => setTo({ ...to, name: e.target.value })}
                    onBlur={() => touch("to.name")}
                    aria-invalid={!!showErr("to.name")}
                    placeholder="Full name"
                    className={cn(fieldCls, showErr("to.name") && errCls)}
                  />
                  <FieldErr msg={showErr("to.name")} />
                </div>
                <div>
                  <FL htmlFor="lf-to-phone">Phone</FL>
                  <Input
                    id="lf-to-phone"
                    name="to_phone"
                    type="tel"
                    autoComplete="tel"
                    value={to.phone}
                    onChange={(e) => setTo({ ...to, phone: fmtPhone(e.target.value) })}
                    placeholder="(555) 555-5555"
                    inputMode="tel"
                    className={fieldCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FL htmlFor="lf-to-email">Email (recommended — tracking updates)</FL>
                  <Input
                    id="lf-to-email"
                    name="to_email"
                    autoComplete="email"
                    spellCheck={false}
                    value={to.email}
                    onChange={(e) => setTo({ ...to, email: e.target.value.trim() })}
                    onBlur={() => touch("to.email")}
                    aria-invalid={!!showErr("to.email")}
                    placeholder="recipient@example.com"
                    inputMode="email"
                    type="email"
                    className={cn(fieldCls, showErr("to.email") && errCls)}
                  />
                  <FieldErr msg={showErr("to.email")} />
                </div>
              </div>
            </div>

            <Separator className="bg-border/60" />

            {/* ── Package ── */}
            <div className="p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-primary/10">
                  <Box className="size-3 text-primary" />
                </span>
                <h2 className="font-semibold text-sm">Package</h2>
              </div>

              <div className="mb-3">
                <FL>Package Type</FL>
                <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
                  {PACKAGE_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setPackageType(t.id)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-medium text-xs transition-colors sm:justify-start",
                        packageType === t.id
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/20",
                      )}
                    >
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/10">
                        <t.icon className="size-3 text-primary" />
                      </span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Size presets — proper option CARDS (same design language as the
                  Package Type chips): breathing room, icon plate, clear selected
                  state. The cramped segmented control read as one solid blob. */}
              <div className="mb-4">
                <FL>Size Preset</FL>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PARCEL_PRESETS.map((p) => {
                    const active = preset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p)}
                        aria-pressed={active}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                          active
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border/60 hover:border-border hover:bg-muted/20",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-7 shrink-0 place-items-center rounded-lg",
                            active ? "bg-primary/10" : "bg-muted/60",
                          )}
                        >
                          <Box className={cn("size-3.5", active ? "text-primary" : "text-muted-foreground/70")} />
                        </span>
                        <span className="min-w-0">
                          <span
                            className={cn(
                              "block truncate font-semibold text-xs",
                              active ? "text-primary" : "text-foreground",
                            )}
                          >
                            {p.label}
                          </span>
                          <span className="block truncate text-[10px] text-muted-foreground tabular-nums">{p.sub}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    ["length", "Length (in) *"],
                    ["width", "Width (in) *"],
                    ["height", "Height (in) *"],
                    ["weight", "Weight (oz) *"],
                  ] as const
                ).map(([k, label]) => (
                  <div key={k}>
                    <FL htmlFor={`lf-parcel-${k}`}>{label}</FL>
                    <Input
                      id={`lf-parcel-${k}`}
                      name={`parcel_${k}`}
                      autoComplete="off"
                      value={parcel[k]}
                      onChange={(e) => {
                        setPreset("custom");
                        setParcel({ ...parcel, [k]: e.target.value.replace(/[^\d.]/g, "") });
                      }}
                      onBlur={() => touch(`parcel.${k}`)}
                      aria-invalid={!!showErr(`parcel.${k}`)}
                      inputMode="decimal"
                      className={cn(fieldCls, "tabular-nums", showErr(`parcel.${k}`) && errCls)}
                    />
                    <FieldErr msg={showErr(`parcel.${k}`)} />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ══ STEP 2 · SERVICE ══════════════════════════════════════════════ */}
      {step === "service" && (
        <div className="space-y-4">
          <section className={cardCls}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-primary/10">
                  <Package className="size-3.5 text-primary" />
                </span>
                <h2 className="type-card-title">Choose a Service</h2>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {to.city}, {to.state} {to.zip}
              </span>
            </div>

            {ratesLoading ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-primary" />
                <p className="text-sm">Getting live rates…</p>
              </div>
            ) : rates.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No rates — go back and check the details.
              </div>
            ) : (
              (() => {
                // Badges are computed across ALL rates, then rows render grouped by carrier.
                const cheapestId = rates.reduce((a, b) => (b.client_price < a.client_price ? b : a), rates[0]).rate_id;
                const daysList = rates.filter((x) => x.days != null).map((x) => x.days as number);
                const fastestDays = daysList.length ? Math.min(...daysList) : null;
                // ONE "Fastest" badge: among the fastest-days rates, the cheapest one.
                const fastestId =
                  fastestDays == null
                    ? null
                    : rates
                        .filter((x) => x.days === fastestDays)
                        .reduce((a, b) => (b.client_price < a.client_price ? b : a)).rate_id;
                const groups = new Map<string, Rate[]>();
                for (const r of rates) {
                  const g = groups.get(r.provider) ?? [];
                  g.push(r);
                  groups.set(r.provider, g);
                }
                const cheapestProvider = rates.find((r) => r.rate_id === cheapestId)?.provider;
                return (
                  <div className="space-y-3">
                    {[...groups.entries()].map(([provider, group]) => {
                      const logo = CARRIER_LOGOS[provider.toLowerCase()];
                      const fromPrice = Math.min(...group.map((g) => g.client_price));
                      // Explicit user choice wins; otherwise the cheapest carrier
                      // (or one holding the current selection) starts open.
                      const open =
                        openCarriers?.[provider] ??
                        (provider === cheapestProvider || group.some((r) => r.rate_id === selectedRateId));
                      return (
                        <div key={provider} className="overflow-hidden rounded-xl border border-border/60">
                          {/* Carrier group header — expandable */}
                          <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => setOpenCarriers((m) => ({ ...(m ?? {}), [provider]: !open }))}
                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
                          >
                            {logo && !logoFailed[provider] ? (
                              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/95 ring-1 ring-border">
                                {/* bg-white/95 (not solid): deliberate light plate so brand SVGs stay
                                  legible in dark mode — the gate's intentional-overlay exemption */}
                                {/* biome-ignore lint/performance/noImgElement: 32px local brand SVG — next/image adds nothing here */}
                                <img
                                  src={logo}
                                  alt={provider}
                                  className="size-full object-contain p-1"
                                  onError={() => setLogoFailed((m) => ({ ...m, [provider]: true }))}
                                />
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  "flex h-8 w-14 shrink-0 items-center justify-center rounded-lg border font-bold text-[11px]",
                                  CARRIER_STYLE[provider] ?? "border-border bg-muted text-foreground",
                                )}
                              >
                                {provider}
                              </span>
                            )}
                            <span className="font-semibold text-sm">{provider}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {group.length} service{group.length === 1 ? "" : "s"}
                            </span>
                            <span className="ml-auto flex shrink-0 items-center gap-2">
                              {!open && (
                                <span className="font-semibold text-[11px] text-muted-foreground tabular-nums">
                                  from ${fromPrice.toFixed(2)}
                                </span>
                              )}
                              <ChevronDown
                                className={cn(
                                  "size-4 text-muted-foreground transition-transform",
                                  open && "rotate-180",
                                )}
                                aria-hidden="true"
                              />
                            </span>
                          </button>
                          {/* Rate rows — visible when the group is expanded */}
                          {open && (
                            <div className="space-y-1.5 border-border/60 border-t p-2">
                            {group.map((r) => {
                              const selected = selectedRateId === r.rate_id;
                              const fastest = r.rate_id === fastestId;
                              return (
                                <button
                                  key={r.rate_id}
                                  type="button"
                                  onClick={() => setSelectedRateId(r.rate_id)}
                                  className={cn(
                                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                                    selected
                                      ? "border-primary bg-primary/5"
                                      : "border-border/60 hover:border-border hover:bg-muted/30",
                                  )}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-semibold text-[13px]">{r.service}</span>
                                      {r.rate_id === cheapestId && (
                                        <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-[10px] text-emerald-600">
                                          Cheapest
                                        </span>
                                      )}
                                      {fastest && (
                                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-semibold text-[10px] text-amber-700 dark:text-amber-400">
                                          Fastest
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                      {r.days != null
                                        ? `${r.days} business day${r.days === 1 ? "" : "s"}`
                                        : "Transit time varies"}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <p className="font-bold text-sm tabular-nums">${r.client_price.toFixed(2)}</p>
                                    <div
                                      className={cn(
                                        "flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                                        selected ? "border-primary bg-primary" : "border-muted-foreground/30",
                                      )}
                                    >
                                      {selected && <div className="size-2 rounded-full bg-primary-foreground" />}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </section>
        </div>
      )}

      {/* ══ STEP 3 · REVIEW & PAY ═════════════════════════════════════════ */}
      {step === "payment" && selectedRate && (
        <div className="space-y-4">
          {/* Review — every section verifiable + editable without losing state */}
          <section className={cardCls}>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-primary/10">
                <ReceiptText className="size-3.5 text-primary" />
              </span>
              <h2 className="type-card-title">Review Your Order</h2>
            </div>
            <div className="divide-y divide-border/60">
              <ReviewRow icon={Truck} label="Pickup" onEdit={() => setStep("details")}>
                <span className="block truncate font-medium">{from.name}</span>
                <span className="block truncate text-muted-foreground">
                  {from.street1}, {from.city}, {from.state} {from.zip}
                </span>
              </ReviewRow>
              <ReviewRow icon={MapPin} label="Drop-off" onEdit={() => setStep("details")}>
                <span className="block truncate font-medium">{to.name}</span>
                <span className="block truncate text-muted-foreground">
                  {to.street1}
                  {to.street2 ? `, ${to.street2}` : ""}, {to.city}, {to.state} {to.zip}
                </span>
                {to.email && <span className="block truncate text-muted-foreground">{to.email}</span>}
              </ReviewRow>
              <ReviewRow icon={Box} label="Package" onEdit={() => setStep("details")}>
                <span className="block truncate font-medium">
                  {PACKAGE_TYPES.find((t) => t.id === packageType)?.label}
                </span>
                <span className="block truncate text-muted-foreground tabular-nums">
                  {parcel.length}×{parcel.width}×{parcel.height}" · {parcel.weight} oz
                </span>
              </ReviewRow>
              <ReviewRow icon={Package} label="Service" onEdit={() => setStep("service")}>
                <span className="block truncate font-medium">
                  {selectedRate.provider} {selectedRate.service}
                </span>
                <span className="block truncate text-muted-foreground">
                  {selectedRate.days != null
                    ? `${selectedRate.days} business day${selectedRate.days === 1 ? "" : "s"}`
                    : "Transit time varies"}
                </span>
              </ReviewRow>
            </div>
            <div className="mt-3 flex items-center justify-between border-border/60 border-t pt-3">
              <span className="font-semibold text-sm">Total</span>
              <span className="font-bold text-base tabular-nums">${selectedRate.client_price.toFixed(2)}</span>
            </div>
          </section>

          {/* Payment — checkout fires automatically on entry; ONE final button */}
          <section className={cardCls}>
            {postpay.enabled && (
              <RadioGroup
                value={paymentType}
                onValueChange={(v) => {
                  setPaymentType(v as "card" | "postpay");
                  setOrderId("");
                  setAmountCents(0);
                }}
                className="mb-4 grid grid-cols-2 gap-2"
              >
                <label htmlFor="lf-pay-card" className={cn(radioCardCls, paymentType === "card" && radioCardActive)}>
                  <RadioGroupItem id="lf-pay-card" value="card" className="sr-only" />
                  <CreditCard className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-xs">Card</span>
                    <span className="block text-[11px] text-muted-foreground">Pay now</span>
                  </span>
                </label>
                <label
                  htmlFor="lf-pay-postpay"
                  className={cn(
                    radioCardCls,
                    paymentType === "postpay" && radioCardActive,
                    !postpayUsable && "cursor-not-allowed opacity-40",
                  )}
                >
                  <RadioGroupItem id="lf-pay-postpay" value="postpay" disabled={!postpayUsable} className="sr-only" />
                  <ReceiptText className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-xs">Invoice</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {postpayUsable ? `$${postpay.available.toFixed(2)} available` : "Over credit limit"}
                    </span>
                  </span>
                </label>
              </RadioGroup>
            )}

            {checkingOut || (!orderId && !error) ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground" aria-live="polite">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span className="text-sm">Preparing secure checkout…</span>
              </div>
            ) : !orderId && error ? (
              /* checkout failed (e.g. rate expired) — clearing the error re-arms
                 the auto-checkout effect for a clean retry */
              <Button variant="outline" onClick={() => setError("")} className="h-11 w-full gap-1.5 rounded-xl">
                <RotateCcw className="size-4" />
                Try Again
              </Button>
            ) : paymentType === "card" ? (
              <StripePaymentElement
                stopId={orderId}
                amountCents={amountCents}
                carrier={`${selectedRate.provider} ${selectedRate.service}`}
                recipientName={to.name}
                deliveryAddress={`${to.street1}, ${to.city} ${to.state} ${to.zip}`}
                onBack={() => setStep("service")}
                onSuccess={(paymentIntentId) => purchase(orderId, paymentIntentId)}
              />
            ) : (
              <div className="space-y-3">
                <p className="text-muted-foreground text-xs">
                  This label will be added to your account balance and invoiced later.
                </p>
                <Button
                  onClick={handlePostpayConfirm}
                  disabled={checkingOut || purchasing}
                  className="h-12 w-full gap-1.5 rounded-xl bg-primary font-semibold text-white shadow-lg shadow-primary/30 hover:bg-primary/90 disabled:opacity-50"
                >
                  {purchasing ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  Confirm & Pay ${selectedRate.client_price.toFixed(2)}
                </Button>
              </div>
            )}

            {purchasing && paymentType === "card" && (
              <div
                className="mt-3 flex items-center justify-center gap-2 text-muted-foreground text-sm"
                aria-live="polite"
              >
                <Loader2 className="size-4 animate-spin text-primary" />
                Payment confirmed — purchasing your label…
              </div>
            )}
          </section>
        </div>
      )}

      {/* ══ CONFIRMED ═════════════════════════════════════════════════════ */}
      {step === "confirmed" && result && (
        <div className="flex min-h-[60dvh] items-center justify-center">
          <section className={cn(cardCls, "w-full text-center")}>
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="size-6 text-emerald-600" />
            </div>
            <h2 className="type-section-title">Label Purchased!</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {selectedRate?.provider} {selectedRate?.service} → {to.name}
            </p>

            <div className="mx-auto mt-4 max-w-sm rounded-xl border bg-muted/30 px-4 py-3">
              <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">Tracking Number</p>
              <p className="mt-1 break-all font-mono font-semibold text-sm tabular-nums">{result.tracking_number}</p>
              <a
                href={result.tracking_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-primary text-xs hover:underline"
              >
                Track on carrier site
                <ExternalLink className="size-3" />
              </a>
            </div>

            {result.recipient_notified && to.email && (
              <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-[11px] text-emerald-700">
                <CheckCircle2 className="size-3" />
                Tracking sent to {to.email}
              </p>
            )}

            {/* Label preview — click opens the full-size label */}
            {result.label_url && (
              <a
                href={result.label_url}
                target="_blank"
                rel="noreferrer"
                className="mx-auto mt-4 block max-w-[260px] overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.label_url} alt="Shipping label — open full size" className="w-full" />
              </a>
            )}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                onClick={printLabel}
                className="h-11 gap-1.5 bg-primary font-semibold text-white hover:bg-primary/90"
              >
                <Printer className="size-4" />
                Print Label
              </Button>
              <Button asChild variant="outline" className="h-11 gap-1.5">
                <a href={result.label_url} target="_blank" rel="noreferrer" download>
                  <Download className="size-4" />
                  Download PNG
                </a>
              </Button>
              <Button variant="ghost" onClick={resetAll} className="h-11 gap-1.5 text-muted-foreground">
                <RotateCcw className="size-4" />
                Buy Another
              </Button>
            </div>
          </section>
        </div>
      )}

      {/* ══ BOTTOM BAR — steps + the step's primary CTA (stops footer pattern) ══ */}
      {step !== "confirmed" && (
        <WizardBar step={step}>
          {step === "details" && (
            <Button
              onClick={handleGetRates}
              className="h-12 w-full gap-1.5 rounded-xl bg-primary font-semibold text-white shadow-lg shadow-primary/30 hover:bg-primary/90 disabled:opacity-50"
            >
              Get Rates
              <ArrowRight className="size-4" />
            </Button>
          )}
          {step === "service" && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("details")} className="h-12 gap-1.5 bg-background">
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button
                onClick={() => {
                  setOrderId("");
                  setAmountCents(0);
                  setError("");
                  setStep("payment");
                }}
                disabled={!selectedRate}
                className="h-12 flex-1 gap-1.5 rounded-xl bg-primary font-semibold text-white shadow-lg shadow-primary/30 hover:bg-primary/90 disabled:opacity-50"
              >
                Review{selectedRate ? ` · $${selectedRate.client_price.toFixed(2)}` : ""}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          )}
          {step === "payment" && (
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setStep("service")}
                disabled={purchasing}
                className="h-10 gap-1.5 text-muted-foreground"
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
              {selectedRate && (
                <span className="text-muted-foreground text-sm">
                  Total{" "}
                  <span className="font-bold text-foreground tabular-nums">
                    ${selectedRate.client_price.toFixed(2)}
                  </span>
                </span>
              )}
            </div>
          )}
        </WizardBar>
      )}
    </div>
  );
}
