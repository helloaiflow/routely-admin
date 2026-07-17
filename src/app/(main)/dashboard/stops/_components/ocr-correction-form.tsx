"use client";

/**
 * OcrCorrectionForm — the ONE manual-correction form, shared by:
 *   • the batch end-of-run correction phase, and
 *   • the failed-scan tray "Resolve" flow.
 *
 * It is pre-filled from already-known data (extracted partials or a saved
 * failed_scans record) and shows the label image as a REFERENCE PREVIEW ONLY.
 * It NEVER calls the OCR/AI extract endpoint — correction is purely manual +
 * Google Places address validation. Submit builds an OCRSubmitData and hands it
 * to the host via onSubmit; the host posts the draft.
 */

import { useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Loader2,
  Maximize2,
  PenLine,
  SkipForward,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { normalizeAndValidateName, validatePhone } from "@/lib/ocr/ai-extract-client";
import { cn } from "@/lib/utils";

import type { AddressResult, OCRSubmitData } from "./ocr-scan-modal";

interface AddressSuggestion {
  description: string;
  place_id: string;
}

export interface CorrectionInitial {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  resolvedAddress?: AddressResult | null;
  dob?: string | null;
  orderIds?: string[];
  gateCode?: string | null;
}

interface OcrCorrectionFormProps {
  /** Reference-only label image (object URL or stored data URL). */
  imageUrl: string | null;
  initial: CorrectionInitial;
  /** Small pill in the header, e.g. "1 / 3 failed". Optional. */
  counterLabel?: string;
  /** Failure reasons to show as context. Optional. */
  reasons?: string[];
  submitLabel?: string;
  skipLabel?: string;
  /** Host posts the draft and reports success; the form shows the error if not ok. */
  onSubmit: (data: OCRSubmitData) => Promise<{ ok: boolean; error?: string }>;
  onSkip: () => void;
}

async function resolvePlaceId(placeId: string): Promise<AddressResult | null> {
  try {
    const dr = await fetch(`/api/client/place-details?place_id=${encodeURIComponent(placeId)}`);
    const d = await dr.json();
    if (!d.street) return null;
    return { street: d.street, city: d.city ?? "", state: d.state ?? "FL", zip: d.zip ?? "", lat: d.lat, lng: d.lng };
  } catch {
    return null;
  }
}

export default function OcrCorrectionForm({
  imageUrl,
  initial,
  counterLabel,
  reasons,
  submitLabel = "Submit",
  skipLabel = "Skip this label",
  onSubmit,
  onSkip,
}: OcrCorrectionFormProps) {
  const [name, setName] = useState(initial.name ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [dob, setDob] = useState(initial.dob ?? "");
  const [orderIds, setOrderIds] = useState((initial.orderIds ?? []).join(", "));
  const [gateCode, setGateCode] = useState(initial.gateCode ?? "");
  // Apt / Suite / Unit — SEPARATE from the street so Google validates the base
  // address cleanly (an apt in the line breaks Places validation). Combined back
  // into the delivery address on save so the driver sees it.
  const [apt, setApt] = useState("");
  const [packageType, setPackageType] = useState<"rx" | "standard" | "internal" | "cold">("rx");
  const [signature, setSignature] = useState(false);
  const [sameDay, setSameDay] = useState(false);
  const [cod, setCod] = useState(false);
  const [codAmount, setCodAmount] = useState("");

  const [validating, setValidating] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [picked, setPicked] = useState<AddressSuggestion | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<AddressResult | null>(initial.resolvedAddress ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState(false);
  // Guarded submit: shown when name/phone are valid but the address isn't
  // Google-verified. The user can override (post flagged not-verified).
  const [showWarn, setShowWarn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-validate the address we were given (if not already resolved) — same
  // behaviour as the batch correction. No OCR is ever called here.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount per item
  useEffect(() => {
    if (!initial.resolvedAddress && (initial.address ?? "").trim().length >= 5) {
      runAddressValidation(initial.address ?? "");
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function runAddressValidation(raw: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!raw.trim() || raw.length < 5) return;
      setValidating(true);
      setSuggestions([]);
      setPicked(null);
      setResolvedAddress(null);
      try {
        const res = await fetch(`/api/client/places?input=${encodeURIComponent(raw)}`);
        const data: { predictions?: AddressSuggestion[] } = await res.json();
        const preds = data.predictions ?? [];
        setSuggestions(preds);
        if (preds.length > 0) {
          setPicked(preds[0]);
          setResolvedAddress(await resolvePlaceId(preds[0].place_id));
        }
      } catch {
        /* best-effort */
      } finally {
        setValidating(false);
      }
    }, 400);
  }

  /** Best-effort structured address from the raw typed string when Google
   *  couldn't verify it (override path). "123 Main St, Miami, FL 33101". */
  function fallbackAddress(raw: string): AddressResult {
    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const street = parts[0] ?? raw.trim();
    const city = parts[1] ?? "";
    const tail = parts[2] ?? ""; // "FL 33101"
    const m = tail.match(/([A-Za-z]{2})\s*(\d{5})?/);
    return { street, city, state: (m?.[1] ?? "FL").toUpperCase(), zip: m?.[2] ?? "" };
  }

  async function doSubmit(addressVerified: boolean) {
    setShowWarn(false);
    setErrors([]);
    setSubmitting(true);
    const nameVal = normalizeAndValidateName(name);
    const ids = orderIds
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{6,7}-\d{2}$/.test(s));
    const submitAddr = addressVerified && resolvedAddress ? resolvedAddress : fallbackAddress(address);
    // Complete-address guard: zip is required (a stop with no zip fails downstream
    // and the driver can't be routed). Block here with a clear reason — even on an
    // unverified-address override, the zip must be present.
    if (!String(submitAddr.zip ?? "").trim()) {
      setErrors(["Zip code is required — complete the address (include the ZIP)."]);
      setSubmitting(false);
      return;
    }
    const res = await onSubmit({
      address: submitAddr,
      addressLine2: apt.trim() || undefined,
      name: nameVal.normalized ?? name.trim(),
      phone,
      packageType,
      requiresSignature: signature,
      isSameDay: sameDay,
      collectCod: cod,
      codAmount,
      dob: /^\d{2}\/\d{2}\/\d{4}$/.test(dob.trim()) ? dob.trim() : undefined,
      orderIds: ids.length > 0 ? ids : undefined,
      gateCode: gateCode.trim() || undefined,
      addressVerified,
    });
    if (!res.ok) {
      setErrors([res.error ?? "Couldn't create the stop — try again"]);
      setSubmitting(false);
    }
    // On success the host advances/closes (this form unmounts).
  }

  function handleSubmit() {
    if (submitting) return;
    // Phone + name are objective format gates — must be valid (no override).
    const phoneVal = validatePhone(phone);
    const nameVal = normalizeAndValidateName(name);
    const errs: string[] = [];
    if (!phoneVal.valid) errs.push(phoneVal.reason ?? "Invalid phone");
    if (!nameVal.valid) errs.push(nameVal.reason ?? "Invalid name");
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    // Address is the "system might be wrong" case: if Google didn't verify it,
    // warn + let the user override rather than hard-blocking.
    if (!resolvedAddress) {
      setShowWarn(true);
      return;
    }
    void doSubmit(true);
  }

  return (
    <>
      <div className="custom-scroll flex-1 overflow-y-auto">
        <div className="px-4 pb-6 pt-1">
          {/* Header: counter + reference preview (NOT re-scanned) */}
          <div className="mb-4 rounded-xl bg-muted/30 p-3 ring-1 ring-border/40">
            {(counterLabel || (reasons && reasons.length > 0)) && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {counterLabel && (
                  <span className="rounded-full bg-rose-500/10 px-3 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    {counterLabel}
                  </span>
                )}
                {reasons && reasons.length > 0 && (
                  <span className="truncate text-[11px] text-muted-foreground/60">{reasons.join(" · ")}</span>
                )}
              </div>
            )}
            {imageUrl && (
              <button
                type="button"
                onClick={() => setLightbox(true)}
                className="group relative block w-full overflow-hidden rounded-lg bg-black/5 ring-1 ring-border/50 transition-transform active:scale-[0.99]"
                aria-label="Expand label image"
              >
                {/* Large, centered label preview — read it while editing below. */}
                {/* biome-ignore lint/a11y/useAltText: reference label image */}
                {/* biome-ignore lint/performance/noImgElement: ephemeral object / data URL */}
                <img src={imageUrl} className="mx-auto max-h-[42svh] w-full object-contain" />
                <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white">
                  <Maximize2 className="size-3" />
                  Tap to zoom
                </span>
              </button>
            )}
          </div>

          {/* Address */}
          <div className="mb-3">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Delivery Address <span className="text-destructive">*</span>
            </label>
            <input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setResolvedAddress(null);
                setErrors([]);
                runAddressValidation(e.target.value);
              }}
              placeholder="123 Main St, Miami, FL 33101"
              className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            {validating && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                <Loader2 className="size-3 animate-spin" />
                Validating…
              </p>
            )}
            {resolvedAddress && !validating && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3 shrink-0" />
                {[resolvedAddress.street, resolvedAddress.city, resolvedAddress.state, resolvedAddress.zip]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
            {suggestions.length > 1 && !validating && (
              <div className="mt-2 space-y-1.5">
                {suggestions.slice(1, 3).map((s) => (
                  <button
                    key={s.place_id}
                    type="button"
                    onClick={async () => {
                      setPicked(s);
                      setAddress(s.description);
                      setErrors([]);
                      setResolvedAddress(await resolvePlaceId(s.place_id));
                    }}
                    className={cn(
                      "w-full rounded-xl border px-3.5 py-2.5 text-left text-xs transition-colors",
                      picked?.place_id === s.place_id
                        ? "border-primary/40 bg-primary/5 text-foreground"
                        : "border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    {s.description}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Apt / Suite / Unit (optional) — kept out of the Google-validated line */}
          <div className="mb-3">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Apt / Suite / Unit{" "}
              <span className="font-normal normal-case tracking-normal text-muted-foreground/40">(optional)</span>
            </label>
            <input
              value={apt}
              onChange={(e) => setApt(e.target.value)}
              placeholder="Apt 5, Suite 200, Unit B…"
              className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>

          {/* Name */}
          <div className="mb-3">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Recipient Name <span className="text-destructive">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors([]);
              }}
              placeholder="Full name"
              className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>

          {/* Phone */}
          <div className="mb-3">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Phone Number <span className="text-destructive">*</span>
            </label>
            <input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setErrors([]);
              }}
              placeholder="(555) 123-4567"
              inputMode="tel"
              className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>

          {/* DOB + Order IDs */}
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                Date of Birth
              </label>
              <input
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                placeholder="MM/DD/YYYY"
                inputMode="numeric"
                className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                Order IDs
              </label>
              <input
                value={orderIds}
                onChange={(e) => setOrderIds(e.target.value)}
                placeholder="123456-01"
                className="h-11 w-full rounded-xl border border-input bg-background px-3.5 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </div>
          </div>

          {/* Gate code (optional) — captured + stored like other stop fields */}
          <div className="mb-3">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Gate Code <span className="font-normal text-muted-foreground/40">(optional)</span>
            </label>
            <input
              value={gateCode}
              onChange={(e) => setGateCode(e.target.value)}
              placeholder="e.g. #1234"
              className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>

          {/* Package type */}
          <div className="mb-4">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Package Options
            </p>
            <div className="mb-2.5 grid grid-cols-4 gap-1 rounded-xl bg-muted/40 p-1">
              {(["rx", "standard", "internal", "cold"] as const).map((pt) => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setPackageType(pt)}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-lg text-xs font-semibold transition-all",
                    packageType === pt
                      ? "bg-card text-primary shadow-sm ring-1 ring-border/40"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {pt === "rx" ? "Rx" : pt === "internal" ? "Intl" : pt === "cold" ? "Cold" : "Std"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  {
                    key: "sig",
                    label: "Signature",
                    Icon: PenLine,
                    active: signature,
                    toggle: () => setSignature((v) => !v),
                  },
                  {
                    key: "sameday",
                    label: "Same Day",
                    Icon: Zap,
                    active: sameDay,
                    toggle: () => setSameDay((v) => !v),
                  },
                  {
                    key: "cod",
                    label: "COD",
                    Icon: DollarSign,
                    active: cod,
                    toggle: () => {
                      setCod((v) => {
                        if (v) setCodAmount("");
                        return !v;
                      });
                    },
                  },
                ] as const
              ).map(({ key, label, Icon, active, toggle }) => (
                <button
                  key={key}
                  type="button"
                  onClick={toggle}
                  className={cn(
                    "flex h-9 flex-col items-center justify-center gap-0.5 rounded-xl border px-2 text-[11px] font-medium transition-all",
                    active
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/50 bg-background text-muted-foreground hover:border-border hover:bg-muted/30 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-3.5", active ? "text-primary" : "text-muted-foreground/60")} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            {cod && (
              <div className="mt-2 flex h-10 items-center gap-2 rounded-xl border border-primary/30 bg-background px-3.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
                <DollarSign className="size-3.5 shrink-0 text-primary/60" />
                <input
                  value={codAmount}
                  onChange={(e) => setCodAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                  onBlur={(e) => {
                    const num = parseFloat(e.target.value.replace(/,/g, ""));
                    setCodAmount(
                      !Number.isNaN(num) && num > 0
                        ? num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : "",
                    );
                  }}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40"
                />
              </div>
            )}
          </div>

          {/* Validation / submit errors */}
          {errors.length > 0 && (
            <div className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3">
              <p className="mb-1 text-[11px] font-semibold text-destructive">Fix before submitting:</p>
              {errors.map((e, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static error list per render
                <p key={i} className="text-[11px] text-destructive/80">
                  • {e}
                </p>
              ))}
            </div>
          )}

          {/* CTAs */}
          <div className="space-y-2.5">
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="h-12 w-full rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Creating stop…
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 size-4" />
                  {submitLabel}
                </>
              )}
            </Button>
            <Button
              onClick={onSkip}
              disabled={submitting}
              variant="outline"
              className="h-11 w-full gap-2 rounded-xl border-border/60 font-medium text-[13px]"
            >
              <SkipForward className="size-4" />
              {skipLabel}
            </Button>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && imageUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-card/10 text-white transition-colors hover:bg-card/20"
            aria-label="Close preview"
          >
            <X className="size-5" />
          </button>
          {/* biome-ignore lint/a11y/useAltText: expanded reference label */}
          {/* biome-ignore lint/performance/noImgElement: ephemeral object / data URL */}
          <img
            src={imageUrl}
            className="max-h-[88svh] max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </motion.div>
      )}

      {/* Guarded-submit warning — unverified address (or other unresolved flag) */}
      {showWarn && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
          onClick={() => setShowWarn(false)}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-[340px] rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-border/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-amber-500/10">
              <AlertTriangle className="size-5.5 text-amber-500" />
            </div>
            <p className="font-semibold text-sm text-foreground">Address not verified</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground/70 leading-relaxed">
              We couldn&apos;t confirm this address with Google. You can submit it anyway — it&apos;ll be flagged as
              unverified for review.
            </p>
            <div className="mt-4 space-y-2">
              <Button
                onClick={() => void doSubmit(false)}
                disabled={submitting}
                className="h-11 w-full rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Continue anyway
              </Button>
              <Button
                onClick={() => setShowWarn(false)}
                disabled={submitting}
                variant="outline"
                className="h-10 w-full rounded-xl border-border/60 font-medium text-[13px]"
              >
                Cancel
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
