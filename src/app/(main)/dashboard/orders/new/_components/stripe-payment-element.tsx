"use client";

import { brandAlpha, resolvedPrimary } from "@/lib/brand";

import { useCallback, useEffect, useRef, useState } from "react";

import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import { CheckCircle2, CreditCard, Loader2, Lock, Plus, ShieldCheck } from "lucide-react";

interface StripePaymentProps {
  stopId: string;
  amountCents: number;
  carrier: string;
  recipientName: string;
  deliveryAddress: string;
  /** Optional — the wizard bar owns Back now; kept for compat. */
  onBack?: () => void;
  onSuccess: (paymentIntentId?: string) => void;
}

type SavedMethod = {
  id: string;
  brand: string;
  last4: string;
  exp_month?: number;
  exp_year?: number;
  funding?: string;
  name?: string | null;
};

// Brand logos as SVG inline (no external deps)
function CardBrandIcon({ brand }: { brand: string }) {
  const b = brand.toLowerCase();
  if (b === "visa")
    return (
      <svg viewBox="0 0 38 24" className="h-5 w-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="38" height="24" rx="4" fill="#1A1F71" />
        <path
          d="M15.7 16.7H13.3L14.8 7.3H17.2L15.7 16.7ZM11.2 7.3L9 13.6L8.7 12.1L7.8 8.1C7.6 7.6 7.2 7.3 6.7 7.3H3.1L3 7.5C3.8 7.7 4.8 8 5.6 8.4L7.7 16.7H10.2L14 7.3H11.2ZM33.5 16.7H35.7L33.8 7.3H31.8C31.3 7.3 30.9 7.6 30.7 8L27.2 16.7H29.8L30.3 15.3H33.4L33.5 16.7ZM31.1 13.2L32.4 9.7L33.1 13.2H31.1ZM25.5 9.8C25.5 9.3 25.9 8.9 26.8 8.9C27.5 8.8 28.1 9 28.6 9.3L29 7.5C28.5 7.3 27.7 7.1 26.7 7.1C24.3 7.1 22.7 8.4 22.7 10.2C22.7 11.6 23.9 12.3 24.8 12.8C25.8 13.3 26.1 13.6 26.1 14C26.1 14.7 25.3 15 24.5 15C23.6 15 22.9 14.8 22.2 14.5L21.8 16.3C22.5 16.6 23.5 16.9 24.5 16.9C27.1 16.9 28.6 15.6 28.6 13.7C28.7 11.4 25.5 11.3 25.5 9.8Z"
          fill="white"
        />
      </svg>
    );
  if (b === "mastercard")
    return (
      <svg viewBox="0 0 38 24" className="h-5 w-auto" xmlns="http://www.w3.org/2000/svg">
        <rect width="38" height="24" rx="4" fill="#252525" />
        <circle cx="15" cy="12" r="7" fill="#EB001B" />
        <circle cx="23" cy="12" r="7" fill="#F79E1B" />
        <path
          d="M19 7.2C20.4 8.2 21.3 9.8 21.3 12C21.3 14.2 20.4 15.8 19 16.8C17.6 15.8 16.7 14.2 16.7 12C16.7 9.8 17.6 8.2 19 7.2Z"
          fill="#FF5F00"
        />
      </svg>
    );
  if (b === "amex")
    return (
      <svg viewBox="0 0 38 24" className="h-5 w-auto" xmlns="http://www.w3.org/2000/svg">
        <rect width="38" height="24" rx="4" fill="#2557D6" />
        <text x="7" y="16" fontSize="9" fontWeight="bold" fill="white" fontFamily="Arial">
          AMEX
        </text>
      </svg>
    );
  // Generic
  return (
    <div className="flex h-5 w-8 items-center justify-center rounded bg-muted">
      <CreditCard className="size-3 text-muted-foreground" />
    </div>
  );
}

let stripePromise: ReturnType<typeof loadStripe> | null = null;
function getStripe(publishableKey: string) {
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

export function StripePaymentElement({
  stopId,
  amountCents,
  carrier,
  recipientName,
  deliveryAddress,
  onSuccess,
}: StripePaymentProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [elements, setElements] = useState<StripeElements | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  // Saved methods state
  const [savedMethods, setSavedMethods] = useState<SavedMethod[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [selectedSaved, setSelectedSaved] = useState<string | null>(null); // pm_xxx or "new"
  const [showNewForm, setShowNewForm] = useState(false);

  // 1. Load saved methods on mount
  useEffect(() => {
    fetch("/api/client/stripe/saved-methods")
      .then((r) => r.json())
      .then((d) => {
        const methods: SavedMethod[] = d.methods ?? [];
        setSavedMethods(methods);
        // Auto-select first saved method if any
        if (methods.length > 0) setSelectedSaved(methods[0].id);
        else setShowNewForm(true);
      })
      .catch(() => setShowNewForm(true))
      .finally(() => setSavedLoading(false));
  }, []);

  // 2. Create PaymentIntent + initialize Stripe
  const initStripe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/client/stripe/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stop_id: stopId,
          amount_cents: amountCents,
          carrier,
          recipient_name: recipientName,
          delivery_address: deliveryAddress,
        }),
      });
      const data = await res.json();
      if (!data.client_secret) throw new Error(data.error ?? "Failed to create payment");

      setClientSecret(data.client_secret);

      // Brand color resolved from CSS --primary (Stripe may not accept oklch strings)
      const brand = resolvedPrimary();
      const publishableKey = data.publishable_key ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
      const stripeInstance = await getStripe(publishableKey);
      if (!stripeInstance) throw new Error("Stripe failed to load");
      setStripe(stripeInstance);

      // Only mount PaymentElement if showing new card form
      const elementsInstance = stripeInstance.elements({
        clientSecret: data.client_secret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: brand,
            colorBackground: "#ffffff",
            colorText: "#1a1a1a",
            colorDanger: "#ef4444",
            fontFamily: "'Helvetica Neue', Arial, sans-serif",
            borderRadius: "8px",
            fontSizeBase: "14px",
          },
          rules: {
            ".Input": { border: "1px solid #e5e7eb", boxShadow: "none", padding: "10px 12px" },
            ".Input:focus": { border: `1px solid ${brand}`, boxShadow: `0 0 0 3px ${brandAlpha(0.12)}` },
            ".Label": { fontWeight: "500", color: "#6b7280", marginBottom: "4px" },
            ".Tab": { border: "1px solid #e5e7eb", borderRadius: "8px" },
            ".Tab--selected": { border: `1px solid ${brand}`, backgroundColor: brandAlpha(0.04) },
          },
        },
      });

      setElements(elementsInstance);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment setup failed");
    } finally {
      setLoading(false);
    }
  }, [stopId, amountCents, carrier, recipientName, deliveryAddress]);

  useEffect(() => {
    initStripe();
  }, [initStripe]);

  // Mount PaymentElement when switching to new card form
  useEffect(() => {
    if (!showNewForm || !elements || !mountRef.current || ready) return;
    const paymentEl = elements.create("payment", { layout: "tabs" });
    paymentEl.on("ready", () => setReady(true));
    paymentEl.on("loaderror", (e) => setError(e.error?.message ?? "Failed to load payment form"));
    paymentEl.mount(mountRef.current);
  }, [showNewForm, elements, ready]);

  const handleSubmit = async () => {
    if (!stripe) return;
    setSubmitting(true);
    setError(null);

    try {
      // Pay with saved card (one-click)
      if (selectedSaved && selectedSaved !== "new" && clientSecret) {
        const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: selectedSaved,
        });
        if (confirmError) {
          setError(confirmError.message ?? "Payment failed");
          setSubmitting(false);
        } else {
          onSuccess(paymentIntent?.id);
        }
        return;
      }

      // Pay with new card via PaymentElement
      if (!elements) return;
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/dashboard/orders/confirmed?stop_id=${stopId}`,
        },
        redirect: "if_required",
      });

      if (confirmError) {
        setError(confirmError.message ?? "Payment failed");
        setSubmitting(false);
      } else {
        onSuccess(paymentIntent?.id);
      }
    } catch {
      setError("An unexpected error occurred");
      setSubmitting(false);
    }
  };

  const displayAmount = (amountCents / 100).toFixed(2);
  const canPay = !submitting && !loading && ((selectedSaved && selectedSaved !== "new") || (showNewForm && ready));

  return (
    <div>
      {/* The page's Review card above provides all order context — this
          component is now ONLY: method pick → pay. No duplicate chrome. */}
      <div>
        {/* ── SAVED PAYMENT METHODS (Vercel-style) ── */}
        {savedLoading ? (
          <div className="mb-5 flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading saved cards…
          </div>
        ) : (
          savedMethods.length > 0 && (
            <div className="mb-5">
              <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                Saved payment methods
              </p>
              <div className="space-y-2 overflow-hidden rounded-xl border">
                {savedMethods.map((pm) => {
                  const isSelected = selectedSaved === pm.id;
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => {
                        setSelectedSaved(pm.id);
                        setShowNewForm(false);
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-all ${
                        isSelected ? "bg-primary/5" : "hover:bg-muted/30"
                      } ${pm === savedMethods[0] ? "" : "border-t"}`}
                    >
                      {/* Brand icon */}
                      <CardBrandIcon brand={pm.brand} />

                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm capitalize">
                          {pm.brand} ···· {pm.last4}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Expires {String(pm.exp_month).padStart(2, "0")}/{pm.exp_year}
                          {pm.name ? ` · ${pm.name}` : ""}
                        </p>
                      </div>

                      {/* Selected indicator */}
                      <div
                        className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                          isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                        }`}
                      >
                        {isSelected && <div className="size-2.5 rounded-full bg-primary-foreground" />}
                      </div>
                    </button>
                  );
                })}

                {/* Add new card option */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSaved("new");
                    setShowNewForm(true);
                  }}
                  className={`flex w-full items-center gap-3 border-t px-4 py-3 text-left transition-all ${
                    showNewForm && selectedSaved === "new" ? "bg-primary/5" : "hover:bg-muted/30"
                  }`}
                >
                  <div className="flex size-8 items-center justify-center rounded-lg border-2 border-muted-foreground/30 border-dashed">
                    <Plus className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">Use a new payment method</p>
                    <p className="text-muted-foreground text-xs">Card, Apple Pay, Google Pay</p>
                  </div>
                  <div
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                      showNewForm && selectedSaved === "new"
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/30"
                    }`}
                  >
                    {showNewForm && selectedSaved === "new" && (
                      <div className="size-2.5 rounded-full bg-primary-foreground" />
                    )}
                  </div>
                </button>
              </div>
            </div>
          )
        )}

        {/* ── NEW CARD FORM (Stripe PaymentElement) ── */}
        {showNewForm && (
          <div className="mb-5 overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, #635bff 0%, var(--primary) 100%)" }} />
            <div className="p-5">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                  <span className="text-sm">Loading payment form…</span>
                </div>
              )}
              {error && !loading && (
                <div className="mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-rose-700 dark:text-rose-400 text-sm">
                  {error}
                </div>
              )}
              <div ref={mountRef} style={{ display: loading ? "none" : "block" }} />
              <p className="mt-3 flex items-center gap-1 text-muted-foreground text-xs">
                <CheckCircle2 className="size-3 text-emerald-500" />
                Your card will be saved for future orders
              </p>
            </div>
          </div>
        )}

        {/* Error for saved card pay */}
        {error && !showNewForm && (
          <div className="mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-rose-700 dark:text-rose-400 text-sm">{error}</div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canPay}
          className="flex h-13 w-full items-center justify-center gap-2.5 rounded-xl bg-primary font-bold text-sm text-white shadow-lg shadow-primary/30 transition-[opacity,transform] hover:bg-primary/90 active:scale-[0.99] disabled:opacity-40"
        >
          {submitting ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              Processing…
            </>
          ) : selectedSaved && selectedSaved !== "new" ? (
            <>
              <CheckCircle2 className="size-5" />
              Pay ${displayAmount} · {savedMethods.find((m) => m.id === selectedSaved)?.brand} ····{" "}
              {savedMethods.find((m) => m.id === selectedSaved)?.last4}
            </>
          ) : (
            <>
              <Lock className="size-5" />
              Pay ${displayAmount}
            </>
          )}
        </button>

        {/* Trust badges */}
        <div className="mt-4 flex items-center justify-center gap-4 text-muted-foreground text-xs">
          <span className="flex items-center gap-1">
            <ShieldCheck className="size-3.5" />
            SSL Secured
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Lock className="size-3.5" />
            Powered by Stripe
          </span>
          <span>•</span>
          <span>PCI Compliant</span>
        </div>
      </div>
    </div>
  );
}
