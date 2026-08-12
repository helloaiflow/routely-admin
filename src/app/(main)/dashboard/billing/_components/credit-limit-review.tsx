"use client";

import { useState } from "react";

import { ArrowRight, Gauge, Info } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyCents as usd } from "@/lib/ui/format";

export type Suggestion = {
  id: number;
  suggested_limit_cents: number;
  current_limit_cents: number;
  inputs: {
    payment_punctuality_pct: number | null;
    invoices_considered: number;
    tenure_days: number;
    growth_pct_90d: number;
    multiplier_applied: number;
    current_limit_cents: number;
  };
};

const NOTE_MAX = 250;

/* Section 2 (2026-08-12 redesign) — the credit-limit suggestion, moved out
 * of the old full-width strip into a compact card inside Credit & controls,
 * right beneath the Billing-intelligence callout. Card-only view here;
 * ReviewCreditLimitModal (below) is the actual decision surface. */
export function CreditLimitReviewCard({
  suggestion,
  onComputeSuggestion,
  computing,
  onDecided,
}: {
  suggestion: Suggestion | null;
  onComputeSuggestion: () => void;
  computing: boolean;
  onDecided: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!suggestion) {
    return (
      <div className="flex items-center justify-between gap-3 border-border/60 border-t pt-3">
        <p className="flex items-center gap-1.5 text-11 text-muted-foreground">
          <Gauge className="size-3.5" /> No pending credit-limit suggestion — an admin always approves before it
          applies.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={onComputeSuggestion}
          disabled={computing}
          className="h-7 shrink-0 text-11"
        >
          Compute
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Gauge className="size-3.5 text-warning" />
          <span className="font-medium text-12">Credit limit review</span>
          <Badge variant="outline" className="border-warning/40 text-10 text-warning">
            Pending
          </Badge>
        </div>
        <p className="text-11 text-muted-foreground">A new limit recommendation is ready for review.</p>
        <p className="mt-1.5 text-12">
          <span className="font-medium tabular-nums">{usd(suggestion.current_limit_cents)}</span>
          <span className="mx-1.5 text-muted-foreground">→</span>
          <span className="font-medium tabular-nums">{usd(suggestion.suggested_limit_cents)}</span>
        </p>
        <Button size="sm" variant="outline" className="mt-2 h-7 w-full text-11" onClick={() => setOpen(true)}>
          Review recommendation
        </Button>
      </div>

      <ReviewCreditLimitModal suggestion={suggestion} open={open} onOpenChange={setOpen} onDecided={onDecided} />
    </>
  );
}

function FactorCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function ReviewCreditLimitModal({
  suggestion,
  open,
  onOpenChange,
  onDecided,
}: {
  suggestion: Suggestion;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecided: () => void;
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setSubmitting(approve ? "approve" : "reject");
    setError(null);
    try {
      const r = await fetch(`/api/client/billing/credit-suggestions/${suggestion.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, note: note.trim() || undefined }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? d.detail ?? "Request failed — nothing was changed.");
        return;
      }
      setNote("");
      onOpenChange(false);
      onDecided();
    } catch {
      setError("Network error — nothing was changed.");
    } finally {
      setSubmitting(null);
    }
  }

  const factors: Array<[string, string]> = [
    ["Tenure", `${suggestion.inputs.tenure_days} days`],
    ["Growth (90d)", `${suggestion.inputs.growth_pct_90d}%`],
    ["Multiplier", suggestion.inputs.multiplier_applied.toFixed(2)],
    ["Invoices considered", String(suggestion.inputs.invoices_considered)],
    [
      "Payment punctuality",
      suggestion.inputs.payment_punctuality_pct == null
        ? "No history"
        : `${suggestion.inputs.payment_punctuality_pct}%`,
    ],
    ["Current limit cents", String(suggestion.inputs.current_limit_cents)],
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setError(null);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="size-4" /> Review credit limit
          </DialogTitle>
          <DialogDescription>
            Review the system recommendation and supporting account signals before making a decision.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-10 text-muted-foreground">Current limit</p>
                <p className="font-semibold text-14 tabular-nums">{usd(suggestion.current_limit_cents)}</p>
              </div>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-10 text-muted-foreground">Recommended limit</p>
                <p className="font-semibold text-14 tabular-nums">{usd(suggestion.suggested_limit_cents)}</p>
              </div>
            </div>
            <Badge variant="outline" className="border-warning/40 text-10 text-warning">
              Pending review
            </Badge>
          </div>

          <div>
            <p className="mb-2 text-11 text-muted-foreground">Why this recommendation</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-border/60 border-t pt-2 text-11 sm:grid-cols-3">
              {factors.map(([label, value]) => (
                <FactorCell key={label} label={label} value={value} />
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <p className="text-11 text-muted-foreground">
              Approving updates the tenant credit policy immediately. Rejecting keeps the current limit unchanged.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="review-note" className="text-12">
                Internal note
              </label>
              <span className="text-10 text-muted-foreground">
                {note.length} / {NOTE_MAX}
              </span>
            </div>
            <Textarea
              id="review-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder="Add a reason for this decision (optional)"
              className="min-h-16 text-13"
            />
          </div>

          {error && <p className="text-12 text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={submitting !== null}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 sm:w-auto"
            onClick={() => decide(false)}
            disabled={submitting !== null}
          >
            {submitting === "reject" ? "Rejecting…" : "Reject"}
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => decide(true)} disabled={submitting !== null}>
            {submitting === "approve" ? "Approving…" : "Approve limit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
