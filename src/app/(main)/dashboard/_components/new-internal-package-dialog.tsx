"use client";

/* New Internal Package — five-step wizard (Route · Recipient · Package ·
 * Review · Created). CEO premium spec, 2026-09-01. One stateful shell; the
 * real stop is created ONLY at Review→Confirm through the same
 * orders/create path as any order (D38/D48/D49). Steps live in
 * ./internal-package-wizard/. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useUser } from "@clerk/nextjs";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Loader2, Package } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiErrorText } from "@/lib/api-error";
import { queueInternalPackageNotifications } from "@/lib/internal-packages/notifications";

import { PrintLabelDialog } from "../stops/_components/print-label-dialog";
import { WizardStepper } from "./internal-package-wizard/chrome";
import { CreatedStep, PackageStep, RecipientStep, ReviewStep, RouteStep, type AdminTenant } from "./internal-package-wizard/steps";
import type { ShippingLabelData } from "./internal-package-wizard/shipping-label-4x6";
import {
  digits10,
  EMPTY_WIZARD,
  fullAddress,
  handlingLabels,
  labelDate,
  PACKAGE_TILES,
  PRIORITY_OPTIONS,
  READY_OPTIONS,
  todayISO,
  type PickupLocation,
  type RouteEstimate,
  type WizardState,
  type WizardStep,
} from "./internal-package-wizard/types";

const PRIMARY_LABEL: Record<WizardStep, string> = {
  1: "Continue to recipient",
  2: "Continue to package",
  3: "Review package",
  4: "Confirm & dispatch",
  5: "Done",
};

export function NewInternalPackageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const { user } = useUser();
  const reducedMotion = useReducedMotion();
  const senderName = user?.fullName ?? "You";
  const senderEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const senderPhone = user?.primaryPhoneNumber?.phoneNumber ?? "";

  const [step, setStep] = useState<WizardStep>(1);
  const [maxReached, setMaxReached] = useState<WizardStep>(1);
  const [state, setState] = useState<WizardState>({ ...EMPTY_WIZARD });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [locations, setLocations] = useState<PickupLocation[]>([]);
  // ADMIN: the tenant this package belongs to (CEO, 2026-09-02).
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [addFromOpen, setAddFromOpen] = useState(false);
  const [addToOpen, setAddToOpen] = useState(false);
  const [estimate, setEstimate] = useState<RouteEstimate>({ miles: null, duration: null, pending: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<{ trackingId: string; createdAt: string } | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // Re-entrancy + duplicate guard: one wizard session = at most one create.
  const submittedRef = useRef(false);

  const patch = useCallback((p: Partial<WizardState>) => setState((s) => ({ ...s, ...p })), []);
  const fromLoc = useMemo(
    () => locations.find((l) => l.id === state.fromId || l.location_id === state.fromId),
    [locations, state.fromId],
  );
  const toLoc = useMemo(
    () => locations.find((l) => l.id === state.toId || l.location_id === state.toId),
    [locations, state.toId],
  );

  const dirty = useMemo(() => JSON.stringify(state) !== JSON.stringify(EMPTY_WIZARD), [state]);

  /* Offices load on open; wizard resets fresh. */
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setMaxReached(1);
    setState({ ...EMPTY_WIZARD });
    setErrors({});
    setSubmitError("");
    setResult(null);
    setConfirmClose(false);
    submittedRef.current = false;
    setTenantId("");
    setLocations([]);
    setLoading(true);
    setLoadError("");
    fetch("/api/admin/tenants", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setTenants((d.tenants ?? []) as AdminTenant[]))
      .catch(() => setLoadError("Couldn't load tenants. Close and try again."))
      .finally(() => setLoading(false));
  }, [open]);

  /* Offices belong to the SELECTED tenant — switching tenant reloads them
   * and clears any office-derived state. */
  const handleTenantChange = useCallback(
    (id: string) => {
      setTenantId(id);
      setState((s) => ({
        ...s,
        fromId: "",
        toId: "",
        deliveryFormatted: "",
        deliveryStreet: "",
        deliveryCity: "",
        deliveryZip: "",
        addressVerified: false,
      }));
      setLocations([]);
      if (!id) return;
      fetch(`/api/client/pickup-locations?tenant_id=${id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => {
          const locs = (d.locations ?? []) as PickupLocation[];
          setLocations(locs.filter((l) => l.active !== false));
        })
        .catch(() => setLoadError("Couldn't load that tenant's offices."));
    },
    [],
  );

  /* To office quick-fills the recipient DELIVERY ADDRESS (never the name —
   * the recipient is the person, CEO 2026-09-01). Office addresses are
   * saved/verified, so mark verified. */
  useEffect(() => {
    if (!toLoc) return;
    patch({
      deliveryFormatted: fullAddress(toLoc.address),
      deliveryStreet: toLoc.address.street,
      deliveryCity: toLoc.address.city,
      deliveryState: toLoc.address.state || "FL",
      deliveryZip: toLoc.address.zip,
      addressVerified: true,
      recipientPhone: state.recipientPhone || (toLoc.contact_phone ?? ""),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toLoc?.id]);

  /* Route estimate — never blocks the wizard (distance_pending is fine). */
  const fetchEstimate = useCallback(() => {
    if (!fromLoc || !toLoc) return;
    setEstimate({ miles: null, duration: null, pending: true });
    fetch("/api/client/distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: fullAddress(fromLoc.address), destination: fullAddress(toLoc.address) }),
    })
      .then((r) => r.json())
      .then((d) => setEstimate({ miles: d.miles ?? null, duration: d.duration ?? null, pending: false }))
      .catch(() => setEstimate({ miles: null, duration: null, pending: false }));
  }, [fromLoc, toLoc]);
  useEffect(() => {
    if (fromLoc && toLoc) fetchEstimate();
  }, [fromLoc, toLoc, fetchEstimate]);

  /* Per-step validation. */
  function validateStep(s: WizardStep): boolean {
    const e: Record<string, string> = {};
    if (s >= 1) {
      if (!tenantId) e.tenant = "Select the tenant first";
      if (!fromLoc) e.from = "Select the sending office";
      if (!toLoc) e.to = "Select the receiving office";
      if (fromLoc && toLoc && fromLoc.id === toLoc.id) e.to = "From and To can't be the same office";
    }
    if (s >= 2) {
      if (!state.recipientName.trim()) e.recipientName = "Required";
      if (digits10(state.recipientPhone).length !== 10) e.recipientPhone = "10-digit phone required";
      if (state.recipientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.recipientEmail.trim()))
        e.recipientEmail = "Enter a valid email";
      if (!state.deliveryStreet.trim() || !state.addressVerified) e.deliveryAddress = "Pick a verified address";
    }
    if (s >= 3 && !state.packageType) e.packageType = "Select a package type";
    if (s >= 4 && !state.confirmChecked) e.confirm = "Confirm the details to dispatch";
    // Only surface errors for fields the step being validated owns.
    const own: Record<WizardStep, string[]> = {
      1: ["tenant", "from", "to"],
      2: ["from", "to", "recipientName", "recipientPhone", "recipientEmail", "deliveryAddress"],
      3: ["from", "to", "recipientName", "recipientPhone", "recipientEmail", "deliveryAddress", "packageType"],
      4: Object.keys(e).length ? Object.keys(e) : [],
      5: [],
    };
    const scoped = Object.fromEntries(Object.entries(e).filter(([k]) => own[s].includes(k) || s === 4));
    setErrors(scoped);
    return Object.keys(scoped).length === 0;
  }

  const goTo = useCallback(
    (s: WizardStep) => {
      setErrors({});
      setStep(s);
    },
    [],
  );

  function goNext() {
    if (step === 5) {
      onOpenChange(false);
      return;
    }
    if (step === 4) {
      void confirmAndDispatch();
      return;
    }
    if (!validateStep(step)) return;
    const next = (step + 1) as WizardStep;
    setStep(next);
    setMaxReached((m) => (next > m ? next : m));
  }

  /* Label data — single source for preview, review and print. */
  const labelData: ShippingLabelData = useMemo(() => {
    const tags = [
      PACKAGE_TILES.find((t) => t.id === state.packageType)?.label.split(" /")[0] ?? state.packageType,
      ...handlingLabels(state.handling),
      PRIORITY_OPTIONS.find((x) => x.id === state.priority)?.label ?? "Standard",
    ];
    return {
      trackingId: result?.trackingId ?? "",
      date: labelDate(),
      routeFrom: fromLoc?.name ?? "Origin",
      routeTo: toLoc?.name ?? "Destination",
      senderName,
      senderCompany: fromLoc
        ? `${tenants.find((t) => String(t.tenant_id) === tenantId)?.name ?? "Routely"} · ${fromLoc.name}`
        : "",
      senderAddress1: fromLoc?.address.street ?? "",
      senderAddress2: fromLoc ? `${fromLoc.address.city}, ${fromLoc.address.state} ${fromLoc.address.zip}` : "",
      recipientName: state.recipientName || "Recipient",
      recipientAddress1: [state.deliveryStreet, state.deliverySuite].filter(Boolean).join(" "),
      recipientAddress2: [state.deliveryCity, `${state.deliveryState} ${state.deliveryZip}`].filter(Boolean).join(", "),
      recipientPhone: state.recipientPhone,
      tags,
    };
  }, [state, fromLoc, toLoc, senderName, result]);

  async function confirmAndDispatch() {
    if (submitting || submittedRef.current) return;
    if (!validateStep(4) || !fromLoc || !toLoc || !tenantId) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const extraNotes: string[] = [];
      // package_type is ALWAYS "internal" — the canonical Stops-console type
      // (rx | cold | regular | internal), so every surface reads it as an
      // internal package (CEO, 2026-09-01: the detail select rendered empty
      // with a content type). What's being SENT rides as Contents in the
      // driver notes and on the label tags.
      const contents = PACKAGE_TILES.find((t) => t.id === state.packageType)?.label ?? state.packageType;
      extraNotes.push(`Contents: ${contents}`);
      const handlingExtra = handlingLabels(state.handling.filter((h) => h !== "signature"));
      if (handlingExtra.length) extraNotes.push(`Handling: ${handlingExtra.join(", ")}`);
      const ready = READY_OPTIONS.find((r) => r.id === state.readyTime);
      if (ready && ready.id !== "now") extraNotes.push(ready.label);
      const notes = [state.notes.trim(), ...extraNotes].filter(Boolean).join(" · ");

      const res = await fetch("/api/client/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          internal_package: true,
          tenant_id: Number(tenantId),
          pickup_location_id: fromLoc.location_id,
          pickup_name: fromLoc.name,
          pickup_address: fromLoc.address.street,
          pickup_city: fromLoc.address.city,
          pickup_state: fromLoc.address.state,
          pickup_zip: fromLoc.address.zip,
          recipient_name: state.recipientName,
          recipient_phone: digits10(state.recipientPhone),
          recipient_email: state.recipientEmail.trim() || undefined,
          delivery_address: [state.deliveryStreet, state.deliverySuite].filter(Boolean).join(", "),
          delivery_city: state.deliveryCity,
          delivery_state: state.deliveryState,
          delivery_zip: state.deliveryZip,
          package_type: "internal",
          requires_signature: state.handling.includes("signature"),
          delivery_type: state.priority,
          notes,
          delivery_date: todayISO(),
          payment_status: "paid",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402)
          throw new Error(apiErrorText(data, "Insufficient funds — add balance before creating more internal packages."));
        throw new Error(apiErrorText(data, "Couldn't create the internal package"));
      }
      submittedRef.current = true;
      const trackingId = String(data.tracking_number || data.stop_id || "");
      setResult({
        trackingId,
        createdAt: new Date().toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
      });
      setStep(5);
      setMaxReached(5);
      toast.success("Internal package created");
      queueInternalPackageNotifications({
        trackingId,
        recipientName: state.recipientName,
        recipientEmail: state.recipientEmail.trim() || null,
        recipientPhone: digits10(state.recipientPhone) || null,
        senderName,
        senderEmail: senderEmail || null,
        fromOffice: fromLoc.name,
        deliveryAddress: [state.deliveryStreet, state.deliverySuite, state.deliveryCity, `${state.deliveryState} ${state.deliveryZip}`]
          .filter(Boolean)
          .join(", "),
        contents: PACKAGE_TILES.find((t) => t.id === state.packageType)?.label ?? state.packageType,
      });
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't create the internal package");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCreateAnother() {
    const keepFrom = state.fromId;
    setState({ ...EMPTY_WIZARD, fromId: keepFrom });
    setResult(null);
    setSubmitError("");
    setErrors({});
    submittedRef.current = false;
    setStep(1);
    setMaxReached(1);
  }

  function requestClose(next: boolean) {
    if (next) return; // never opened from here
    if (dirty && !result && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    setConfirmClose(false);
    onOpenChange(false);
  }

  const stepProps = {
    state,
    patch,
    errors,
    tenants,
    tenantId,
    onTenantChange: handleTenantChange,
    locations,
    addLocation: (loc: PickupLocation) => setLocations((ls) => [...ls, loc]),
    fromLoc,
    toLoc,
    estimate,
    retryEstimate: fetchEstimate,
    senderName,
    senderEmail,
    senderPhone,
    goTo,
    addFromOpen,
    setAddFromOpen,
    addToOpen,
    setAddToOpen,
  };

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent
          className="flex h-auto max-h-[calc(100dvh-2.5rem)] w-[calc(100vw-1rem)] max-w-[760px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[760px]"
          onInteractOutside={(e) => {
            if (dirty && !result) e.preventDefault();
          }}
        >
          <DialogHeader className="shrink-0 space-y-2.5 border-b border-border px-4 pt-4 pb-3 sm:px-6">
            <div className="flex items-center gap-2">
              <Package className="size-4 text-primary" />
              <div>
                <DialogTitle className="text-base">New internal package</DialogTitle>
                <DialogDescription className="text-xs">Create and dispatch an office-to-office delivery.</DialogDescription>
              </div>
            </div>
            <WizardStepper current={step} maxReached={maxReached} onJump={goTo} />
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:min-h-[430px] sm:px-6 sm:py-5">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-14 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading offices…
              </div>
            ) : loadError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-xs">
                {loadError}
              </div>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  {step === 1 && <RouteStep {...stepProps} />}
                  {step === 2 && <RecipientStep {...stepProps} />}
                  {step === 3 && <PackageStep {...stepProps} labelData={labelData} />}
                  {step === 4 && <ReviewStep {...stepProps} labelData={labelData} submitError={submitError} />}
                  {step === 5 && result && (
                    <CreatedStep
                      {...stepProps}
                      trackingId={result.trackingId}
                      createdAt={result.createdAt}
                      onPrint={() => setPrintOpen(true)}
                      onViewStop={() => {
                        onOpenChange(false);
                        router.push("/dashboard/internal-packages");
                      }}
                      onCreateAnother={handleCreateAnother}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          <div className="shrink-0 border-t border-border px-4 py-3 sm:px-6">
            {confirmClose ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs">Discard this package? Your progress will be lost.</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setConfirmClose(false)}>
                    Keep editing
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setConfirmClose(false);
                      onOpenChange(false);
                    }}
                  >
                    Discard
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => requestClose(false)} disabled={submitting}>
                    Cancel
                  </Button>
                  {step > 1 && step < 5 && (
                    <Button variant="ghost" size="sm" onClick={() => goTo((step - 1) as WizardStep)} disabled={submitting}>
                      Back
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
                    <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" /> Saved automatically
                  </span>
                  <Button
                    size="sm"
                    onClick={goNext}
                    disabled={loading || submitting || !!loadError || (step === 4 && !state.confirmChecked)}
                  >
                    {submitting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                    {PRIMARY_LABEL[step]}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {result && fromLoc && (
        <PrintLabelDialog
          open={printOpen}
          onOpenChange={setPrintOpen}
          trackingId={result.trackingId}
          recipientName={state.recipientName}
          recipientAddress={[
            [state.deliveryStreet, state.deliverySuite].filter(Boolean).join(" "),
            state.deliveryCity,
            `${state.deliveryState} ${state.deliveryZip}`,
          ]
            .filter(Boolean)
            .join(", ")}
          recipientPhone={state.recipientPhone}
          fromName={fromLoc.name}
          fromAddress={fullAddress(fromLoc.address)}
          serviceType="delivery"
          serviceDate={todayISO()}
          packageType={state.packageType}
          requiresSignature={state.handling.includes("signature")}
          coldChain={state.handling.includes("cold") || state.packageType === "cold"}
          collectCod={false}
          codAmount="0"
          notes={state.notes}
          initialMode="shipping4x6"
          premiumShipping={labelData}
        />
      )}
    </>
  );
}
