"use client";

import { useEffect, useRef, useState } from "react";

import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  MapPin,
  Package,
  ScanLine,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type Step = "form" | "price" | "payment" | "success";

type FormData = {
  pickup_address: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  package_type: string;
  rx_number: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_email: string;
  gate_code: string;
  collect_cod: boolean;
  collect_amount: string;
  notes: string;
  estimated_miles: string;
  delivery_type: string;
  delivery_date: string;
};

type PriceBreakdown = {
  stops: number;
  miles: number;
  price_per_stop: number;
  price_per_mile: number;
  stops_cost: number;
  miles_cost: number;
  same_day_fee: number;
  total: number;
  is_trial: boolean;
};

type OrderResult = {
  rtscan_id?: number;
  tracking_number?: string;
  dispatch_status?: string;
};

const PACKAGE_TYPES = [
  { id: "rx", label: "\u{1F48A} Prescription" },
  { id: "specimen", label: "\u{1F9EA} Lab Specimen" },
  { id: "medical", label: "\u{1F3E5} Medical Supply" },
  { id: "cold", label: "\u2744\uFE0F Cold Package" },
  { id: "urgent", label: "\u26A1 Urgent" },
  { id: "document", label: "\u{1F4CB} Document" },
];

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function nextBusinessDay(from: Date): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d;
}

function fmtDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

const EMPTY_FORM: FormData = {
  pickup_address: "",
  delivery_address: "",
  delivery_city: "",
  delivery_state: "FL",
  delivery_zip: "",
  package_type: "",
  rx_number: "",
  recipient_name: "",
  recipient_phone: "",
  recipient_email: "",
  gate_code: "",
  collect_cod: false,
  collect_amount: "",
  notes: "",
  estimated_miles: "",
  delivery_type: "next_day",
  delivery_date: "",
};

function BarcodeStrip({ seed }: { seed: string }) {
  const bars: number[] = [];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash << 5) - hash + seed.charCodeAt(i);
  for (let i = 0; i < 80; i++) {
    hash = (hash * 9301 + 49297) % 233280;
    bars.push(hash / 233280 < 0.2 ? 3 : hash / 233280 < 0.45 ? 2 : 1);
  }
  return (
    <div className="flex h-10 items-stretch gap-[1px] overflow-hidden px-1">
      {bars.map((w, i) => (
        <div key={`b${i}`} className="bg-foreground" style={{ width: `${w}px`, flexShrink: 0 }} />
      ))}
    </div>
  );
}

export function NewPickupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [price, setPrice] = useState<PriceBreakdown | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [hasCard, setHasCard] = useState(false);
  const [distanceInfo, setDistanceInfo] = useState<{ miles: number; duration: string } | null>(null);
  const [orderResult, setOrderResult] = useState<OrderResult>({});
  const scanInputRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof FormData, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const n = { ...e };
      delete n[key];
      return n;
    });
  };

  const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hourET = nowET.getHours();
  const isSunday = nowET.getDay() === 0;
  const sameDayAvailable = !isSunday && hourET < 14;

  useEffect(() => {
    if (open) {
      const nbd = nextBusinessDay(new Date());
      setStep("form");
      setForm({ ...EMPTY_FORM, delivery_type: "next_day", delivery_date: fmtDate(nbd) });
      setPrice(null);
      setCheckoutUrl(null);
      setErrors({});
      setDistanceInfo(null);
      setOrderResult({});
      fetch("/api/client/stripe/payment-methods")
        .then((r) => r.json())
        .then((d) => setHasCard(d.payment_methods?.length > 0))
        .catch(() => setHasCard(false));
    }
  }, [open]);

  useEffect(() => {
    if (form.pickup_address.length > 5 && form.delivery_address.length > 5) {
      const t = setTimeout(async () => {
        try {
          const res = await fetch("/api/client/distance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ origin: form.pickup_address, destination: form.delivery_address }),
          });
          const data = await res.json();
          if (data.miles) {
            setForm((f) => ({ ...f, estimated_miles: String(data.miles) }));
            setDistanceInfo({ miles: data.miles, duration: data.duration });
          }
        } catch {
          /* silent */
        }
      }, 800);
      return () => clearTimeout(t);
    }
    setDistanceInfo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.pickup_address, form.delivery_address]);

  const validateForm = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.pickup_address) e.pickup_address = "Required";
    if (!form.delivery_address) e.delivery_address = "Required";
    if (!form.delivery_city) e.delivery_city = "Required";
    if (!form.delivery_zip) e.delivery_zip = "Required";
    if (!form.package_type) e.package_type = "Required";
    if (!form.rx_number) e.rx_number = "Required";
    if (!form.recipient_name) e.recipient_name = "Required";
    if (!form.recipient_phone) e.recipient_phone = "Required";
    if (!form.recipient_email) e.recipient_email = "Required";
    if (!form.delivery_type) e.delivery_type = "Select delivery speed";
    if (!form.delivery_date) e.delivery_date = "Select a delivery date";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCalculate = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      // Never bill an invented distance (CEO 2026-06-10): block checkout until
      // a real Google distance is available instead of defaulting to 8 mi.
      const miles = Number.parseFloat(form.estimated_miles);
      if (!Number.isFinite(miles) || miles <= 0) {
        toast.error("Distance unavailable — check the addresses or try again in a moment");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/client/billing/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stops: 2, miles, delivery_type: form.delivery_type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Calculation failed");
      setPrice(data);
      setStep("price");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to calculate price");
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (!price) return;
    setLoading(true);
    try {
      const res = await fetch("/api/client/billing/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stops: price.stops,
          miles: price.miles,
          pickup_address: form.pickup_address,
          delivery_address: form.delivery_address,
          delivery_city: form.delivery_city,
          delivery_state: form.delivery_state,
          delivery_zip: form.delivery_zip,
          recipient_name: form.recipient_name,
          recipient_phone: form.recipient_phone.replace(/\D/g, ""),
          recipient_email: form.recipient_email,
          package_type: form.package_type,
          rx_number: form.rx_number,
          gate_code: form.gate_code,
          notes: form.notes,
          delivery_date: form.delivery_date,
          delivery_type: form.delivery_type,
          same_day_fee: price.same_day_fee,
          estimated_miles: form.estimated_miles,
          collect_cod: form.collect_cod,
          collect_amount: form.collect_amount,
          description: `${form.package_type} \u2192 ${form.delivery_address}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed");

      if (data.method === "trial" || !data.requires_payment) {
        setOrderResult({
          rtscan_id: data.rtscan_id,
          tracking_number: data.tracking_number,
          dispatch_status: data.dispatch_status,
        });
        setStep("success");
        toast.success("Order created!");
      } else if (data.checkout_url) {
        setCheckoutUrl(data.checkout_url);
        setStep("payment");
      } else {
        setOrderResult({
          rtscan_id: data.rtscan_id,
          tracking_number: data.tracking_number,
          dispatch_status: data.dispatch_status,
        });
        setStep("success");
        toast.success("Payment processed!");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setLoading(false);
    }
  };

  const parseDeliveryAddress = (addr: string) => {
    const clean = addr
      .replace(/, USA$/, "")
      .replace(/, United States$/, "")
      .trim();
    const zipMatch = clean.match(/\b(\d{5})\b/);
    const parsedZip = zipMatch ? zipMatch[1] : "";
    const stateMatch = clean.match(/,\s*([A-Z]{2})\s+\d{5}/) || clean.match(/,\s*([A-Z]{2})\s*$/);
    const parsedState = stateMatch ? stateMatch[1] : "FL";
    const withoutZipState = clean
      .replace(/,?\s*[A-Z]{2}\s+\d{5}/, "")
      .replace(/,?\s*[A-Z]{2}\s*$/, "")
      .trim();
    const mainParts = withoutZipState
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const street = mainParts[0] ?? clean;
    const city = mainParts.length > 1 ? mainParts[mainParts.length - 1] : "";
    set("delivery_address", street);
    if (city) set("delivery_city", city);
    set("delivery_state", parsedState);
    if (parsedZip) set("delivery_zip", parsedZip);
  };

  const pkgLabel = PACKAGE_TYPES.find((t) => t.id === form.package_type)?.label ?? form.package_type;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {/* STEP 1 — FORM */}
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle>New Pickup</DialogTitle>
              <DialogDescription>
                Fill in the details below. We&apos;ll calculate the cost before charging.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <div className="space-y-3 rounded-xl border border-border bg-card/50 p-3">
                <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                  {"\u{1F4E6}"} Package &amp; Recipient
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">
                      Recipient name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="John Smith"
                      value={form.recipient_name}
                      onChange={(e) => set("recipient_name", e.target.value)}
                    />
                    {errors.recipient_name && <p className="text-[10px] text-destructive">{errors.recipient_name}</p>}
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">
                      Phone <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="(305) 555-0100"
                      value={form.recipient_phone}
                      inputMode="numeric"
                      maxLength={14}
                      onChange={(e) => set("recipient_phone", formatPhone(e.target.value))}
                    />
                    {errors.recipient_phone && <p className="text-[10px] text-destructive">{errors.recipient_phone}</p>}
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="email"
                    placeholder="patient@email.com"
                    value={form.recipient_email}
                    onChange={(e) => set("recipient_email", e.target.value)}
                  />
                  {errors.recipient_email && <p className="text-[10px] text-destructive">{errors.recipient_email}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">
                      Rx / Order # <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        ref={scanInputRef}
                        placeholder="RX-12345"
                        value={form.rx_number}
                        onChange={(e) => set("rx_number", e.target.value)}
                        className="pr-8"
                      />
                      <button
                        type="button"
                        title="Scan barcode"
                        onClick={() => scanInputRef.current?.focus()}
                        className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ScanLine className="size-3.5" />
                      </button>
                    </div>
                    {errors.rx_number && <p className="text-[10px] text-destructive">{errors.rx_number}</p>}
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">
                      Package type <span className="text-destructive">*</span>
                    </Label>
                    <Select value={form.package_type} onValueChange={(v) => set("package_type", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {PACKAGE_TYPES.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.package_type && <p className="text-[10px] text-destructive">{errors.package_type}</p>}
                  </div>
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-border bg-card/50 p-3">
                <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                  {"\u{1F4CD}"} Addresses
                </p>
                <div className="grid gap-1">
                  <Label className="text-xs">
                    Pickup address <span className="text-destructive">*</span>
                  </Label>
                  <AddressAutocomplete
                    value={form.pickup_address}
                    onChange={(v) => set("pickup_address", v)}
                    onSelect={(addr) => set("pickup_address", addr.replace(/, USA$/, ""))}
                    placeholder="1950 W Hillsboro Blvd, Deerfield Beach, FL"
                    error={errors.pickup_address}
                  />
                </div>
                {distanceInfo && (
                  <div className="flex items-center gap-2 px-1">
                    <div className="h-px flex-1 border-muted-foreground/25 border-t border-dashed" />
                    <span className="flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                      <ArrowRight className="size-3" />
                      {distanceInfo.miles} mi &middot; {distanceInfo.duration}
                    </span>
                    <div className="h-px flex-1 border-muted-foreground/25 border-t border-dashed" />
                  </div>
                )}
                <div className="grid gap-1">
                  <Label className="text-xs">
                    Delivery address <span className="text-destructive">*</span>
                  </Label>
                  <AddressAutocomplete
                    value={form.delivery_address}
                    onChange={(v) => set("delivery_address", v)}
                    onSelect={parseDeliveryAddress}
                    placeholder="123 Main St, Miami, FL"
                    error={errors.delivery_address}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">
                      City <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="Miami"
                      value={form.delivery_city}
                      onChange={(e) => set("delivery_city", e.target.value)}
                    />
                    {errors.delivery_city && <p className="text-[10px] text-destructive">{errors.delivery_city}</p>}
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">State</Label>
                    <Input
                      placeholder="FL"
                      value={form.delivery_state}
                      onChange={(e) => set("delivery_state", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">
                      ZIP <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="33101"
                      value={form.delivery_zip}
                      onChange={(e) => set("delivery_zip", e.target.value)}
                    />
                    {errors.delivery_zip && <p className="text-[10px] text-destructive">{errors.delivery_zip}</p>}
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Gate code</Label>
                  <Input
                    placeholder="#1234"
                    value={form.gate_code}
                    onChange={(e) => set("gate_code", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card p-2.5 transition-colors hover:bg-muted/40">
                    <input
                      type="checkbox"
                      checked={form.collect_cod as unknown as boolean}
                      onChange={(e) => setForm((f) => ({ ...f, collect_cod: e.target.checked as unknown as boolean }))}
                      className="size-4 rounded border-border accent-primary"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-xs">Collect on delivery (COD)</p>
                      <p className="text-[10px] text-muted-foreground">Driver will collect payment at drop-off</p>
                    </div>
                  </label>
                  {(form.collect_cod as unknown as boolean) && (
                    <div className="grid gap-1">
                      <Label className="text-xs">
                        Amount to collect <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground text-sm">
                          $
                        </span>
                        <Input
                          placeholder="0.00"
                          value={form.collect_amount}
                          onChange={(e) => set("collect_amount", e.target.value.replace(/[^0-9.]/g, ""))}
                          className="pl-7"
                          inputMode="decimal"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-border bg-card/50 p-3">
                <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                  {"\u{1F5D3}"} Delivery Schedule
                </p>
                <div className="grid gap-1.5">
                  <Label className="text-xs">
                    Delivery date <span className="text-destructive">*</span>
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={!sameDayAvailable}
                      onClick={() => {
                        set("delivery_type", "same_day");
                        set("delivery_date", fmtDate(nowET));
                      }}
                      className={`flex flex-col items-center gap-0.5 rounded-lg border p-2.5 text-center transition-all disabled:cursor-not-allowed disabled:opacity-40 ${form.delivery_type === "same_day" ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500 dark:bg-blue-950/40" : "hover:border-muted-foreground/40 hover:bg-accent"}`}
                    >
                      <span className="text-base">{"\u26A1"}</span>
                      <span className="font-semibold text-xs">Same Day</span>
                      <span className="font-medium text-[10px] text-amber-600">+$49.99</span>
                      {!sameDayAvailable && <span className="text-[10px] text-muted-foreground">After 2 PM</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        set("delivery_type", "next_day");
                        set("delivery_date", fmtDate(nextBusinessDay(nowET)));
                      }}
                      className={`flex flex-col items-center gap-0.5 rounded-lg border p-2.5 text-center transition-all ${form.delivery_type === "next_day" ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500 dark:bg-blue-950/40" : "hover:border-muted-foreground/40 hover:bg-accent"}`}
                    >
                      <span className="text-base">{"\u{1F4C5}"}</span>
                      <span className="font-semibold text-xs">Next Day</span>
                      <span className="text-[10px] text-muted-foreground">Standard</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => set("delivery_type", "custom")}
                      className={`flex flex-col items-center gap-0.5 rounded-lg border p-2.5 text-center transition-all ${form.delivery_type === "custom" ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500 dark:bg-blue-950/40" : "hover:border-muted-foreground/40 hover:bg-accent"}`}
                    >
                      <span className="text-base">{"\u{1F5D3}"}</span>
                      <span className="font-semibold text-xs">Custom</span>
                      <span className="text-[10px] text-muted-foreground">Pick a date</span>
                    </button>
                  </div>
                  {form.delivery_type === "custom" && (
                    <Input
                      type="date"
                      className="mt-1"
                      value={
                        form.delivery_date
                          ? `${form.delivery_date.split("/")[2]}-${form.delivery_date.split("/")[0]}-${form.delivery_date.split("/")[1]}`
                          : ""
                      }
                      onChange={(e) => {
                        const [y, m, d] = e.target.value.split("-");
                        set("delivery_date", `${m}/${d}/${y}`);
                      }}
                    />
                  )}
                  {form.delivery_date && form.delivery_type !== "custom" && (
                    <p className="pl-1 text-[11px] text-muted-foreground">
                      {"\u{1F4C6}"} {form.delivery_type === "same_day" ? "Today" : "Tomorrow"} &middot;{" "}
                      {form.delivery_date}
                    </p>
                  )}
                  {form.delivery_type !== "same_day" && sameDayAvailable && (
                    <p className="pl-1 text-[10px] text-amber-600">{"\u23F0"} Same day available until 2:00 PM ET</p>
                  )}
                  {errors.delivery_date && <p className="text-[10px] text-destructive">{errors.delivery_date}</p>}
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea
                    placeholder="Special instructions, access info, preferred drop-off location..."
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    className="min-h-[72px] resize-none text-sm"
                    rows={3}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleCalculate} disabled={loading}>
                {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Package className="mr-2 size-4" />}
                Calculate price
              </Button>
            </DialogFooter>
          </>
        )}

        {/* STEP 2 — PRICE */}
        {step === "price" && price && (
          <>
            <DialogHeader>
              <DialogTitle>Review your order</DialogTitle>
              <DialogDescription>Confirm details before we dispatch.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-0.5 pt-1">
                    <div className="size-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                    <div className="my-1 h-7 w-px border-border border-l-2 border-dashed" />
                    <div className="size-2.5 rounded-full bg-blue-500 ring-4 ring-blue-500/20" />
                  </div>
                  <div className="flex-1 space-y-2 text-xs">
                    <div>
                      <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">Pickup</p>
                      <p className="font-medium text-foreground leading-snug">{form.pickup_address}</p>
                    </div>
                    {distanceInfo && (
                      <div className="flex items-center gap-3 rounded-lg bg-blue-50 px-2.5 py-1.5 dark:bg-blue-950/30">
                        <span className="flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-400">
                          <MapPin className="size-3" />
                          {distanceInfo.miles} mi
                        </span>
                        <span className="text-blue-300">&middot;</span>
                        <span className="font-semibold text-blue-700 dark:text-blue-400">
                          {"\u23F1"} {distanceInfo.duration}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">Delivery</p>
                      <p className="font-medium text-foreground leading-snug">
                        {form.delivery_address}
                        {form.delivery_city ? `, ${form.delivery_city}` : ""}
                        {form.delivery_state ? `, ${form.delivery_state}` : ""}
                        {form.delivery_zip ? ` ${form.delivery_zip}` : ""}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-1 rounded-lg border bg-muted/20 p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recipient</span>
                  <span className="font-medium">{form.recipient_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{form.recipient_phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Package</span>
                  <span>{pkgLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rx / Order #</span>
                  <span className="font-mono">{form.rx_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span>
                    {form.delivery_type === "same_day"
                      ? "Same Day"
                      : form.delivery_type === "next_day"
                        ? "Next Day"
                        : "Custom"}{" "}
                    &middot; {form.delivery_date}
                  </span>
                </div>
              </div>
              <div className="space-y-2 rounded-lg border p-3">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Cost breakdown</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {price.stops} {price.stops === 1 ? "stop" : "stops"} &times; ${price.price_per_stop.toFixed(2)}
                    </span>
                    <span className="font-mono">${price.stops_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {price.miles} mi &times; ${price.price_per_mile.toFixed(2)}
                    </span>
                    <span className="font-mono">${price.miles_cost.toFixed(2)}</span>
                  </div>
                  {price.same_day_fee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-amber-600">{"\u26A1"} Same Day fee</span>
                      <span className="font-mono text-amber-600">+${price.same_day_fee.toFixed(2)}</span>
                    </div>
                  )}
                  {price.is_trial && (
                    <>
                      <div className="my-1 border-border border-t border-dashed" />
                      <div className="flex justify-between font-medium text-emerald-600">
                        <span>{"\u{1F381}"} Trial credit</span>
                        <span className="font-mono">
                          &minus;${(price.stops_cost + price.miles_cost + price.same_day_fee).toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <Separator />
                <div className="-mx-3 flex items-baseline justify-between rounded-lg bg-muted/60 px-3 py-2">
                  <span className="font-bold text-sm">Total due today</span>
                  <span className={`font-bold text-2xl tabular-nums ${price.is_trial ? "text-emerald-600" : ""}`}>
                    {price.is_trial ? "$0.00" : `$${price.total.toFixed(2)}`}
                  </span>
                </div>
                {price.is_trial && (
                  <p className="pt-0.5 text-center text-[10px] text-emerald-600">
                    {"\u2713"} Free trial &mdash; no charge today
                  </p>
                )}
                {!price.is_trial && (
                  <p className="pt-1 text-center text-muted-foreground text-xs">
                    {hasCard ? (
                      <>
                        <CreditCard className="mr-1 inline size-3" />
                        Charged to your saved card
                      </>
                    ) : (
                      "You\u2019ll be redirected to Stripe to complete payment."
                    )}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("form")}>
                Back
              </Button>
              <Button onClick={handlePay} disabled={loading}>
                {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CreditCard className="mr-2 size-4" />}
                {price.is_trial ? "Confirm \u2014 free" : `Pay $${price.total.toFixed(2)}`}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* STEP 3 — PAYMENT LINK */}
        {step === "payment" && checkoutUrl && (
          <>
            <DialogHeader>
              <DialogTitle>Complete payment</DialogTitle>
              <DialogDescription>Finish in Stripe, then come back.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-6 text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                <CreditCard className="size-8 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Ready to pay</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  After payment your order will be dispatched automatically.
                </p>
              </div>
              <Button className="w-full" onClick={() => window.open(checkoutUrl, "_blank")}>
                <ExternalLink className="mr-2 size-4" />
                Open payment page
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}

        {/* STEP 4 — SUCCESS RECEIPT */}
        {step === "success" && (
          <>
            <DialogHeader>
              <DialogTitle>Order confirmed</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex flex-col items-center gap-2 py-3">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950">
                  <CheckCircle2 className="size-7 text-emerald-500" />
                </div>
                <p className="font-medium text-sm">Your pickup is being dispatched</p>
                <p className="text-center text-muted-foreground text-xs">
                  A driver will be assigned shortly. You&apos;ll receive updates as the order progresses.
                </p>
              </div>
              <div className="divide-y rounded-lg border text-xs">
                {orderResult.tracking_number && (
                  <div className="flex flex-col items-center gap-2 border-b px-3 py-3">
                    <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
                      Tracking Number
                    </p>
                    <p className="font-bold font-mono text-foreground text-xl tabular-nums tracking-widest">
                      {orderResult.tracking_number}
                    </p>
                    <BarcodeStrip seed={orderResult.tracking_number} />
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-muted-foreground">Recipient</span>
                  <span className="font-medium">{form.recipient_name}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{form.recipient_phone}</span>
                </div>
                <div className="flex items-start justify-between gap-4 px-3 py-2.5">
                  <span className="shrink-0 text-muted-foreground">Deliver to</span>
                  <span className="text-right text-foreground">
                    {form.delivery_address}
                    {form.delivery_city ? `, ${form.delivery_city}` : ""}
                    {form.delivery_state ? `, ${form.delivery_state}` : ""}
                    {form.delivery_zip ? ` ${form.delivery_zip}` : ""}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4 px-3 py-2.5">
                  <span className="shrink-0 text-muted-foreground">Pickup from</span>
                  <span className="text-right">{form.pickup_address}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-muted-foreground">Package</span>
                  <span>
                    {pkgLabel} &middot; {form.rx_number}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-muted-foreground">Delivery</span>
                  <span>
                    {form.delivery_type === "same_day"
                      ? "Today"
                      : form.delivery_type === "next_day"
                        ? "Tomorrow"
                        : form.delivery_date}{" "}
                    &middot; {form.delivery_date}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Truck className="size-3" />
                    Status
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      orderResult.dispatch_status === "dispatched"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    }
                  >
                    {orderResult.dispatch_status === "dispatched" ? "Dispatched" : "Processing"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between bg-muted/30 px-3 py-2.5">
                  <span className="font-medium">Total charged</span>
                  <span className="font-semibold">
                    {price?.is_trial ? (
                      <span className="text-emerald-600">$0.00 (trial)</span>
                    ) : (
                      `$${price?.total.toFixed(2) ?? "0.00"}`
                    )}
                  </span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} className="w-full">
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
