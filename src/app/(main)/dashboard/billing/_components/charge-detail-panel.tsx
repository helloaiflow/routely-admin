"use client";

import { useEffect, useState } from "react";

import { ChevronDown, ChevronUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatCurrencyCents as centsToUsd } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

export type ChargeRow = {
  id: number;
  stop_id: string;
  resolved_type: string;
  resolved_via: string;
  outcome: string;
  disposition: string | null;
  attempt_seq: number | null;
  /** "RTL-1785789728 — Attempt 2 — Failed: no one home" — computed once by
   * routely-api's attempt_label() and reused verbatim everywhere a charge is
   * shown (drawer, inline expansion, Charges grid, Recent Activity, the
   * invoice/PDF) so the wording can never drift between surfaces. */
  charge_label: string;
  units: number | null;
  amount_cents: number | null;
  routely_cents: number | null;
  driver_cents: number | null;
  flag: string | null;
  flag_reason: string | null;
  /** The tenant's full rate card AT THE MOMENT this charge was computed —
   * frozen, never re-derived from the tenant's CURRENT rates. Added
   * 2026-08-13 to the /v1/billing/charges select list specifically to back
   * this detail view's "rate snapshot" and "unit rate" fields. */
  rate_snapshot?: Record<string, unknown> | null;
  attempted_at: string;
  documented_at: string | null;
  document_id: number | null;
  document_number: string | null;
  document_status: string | null;
  /** D40/D41 (2026-08-20): the courtesy credit appended to THIS charge, if
   * tenant.credit_rules configured one for this stop's package_type — its
   * own ledger row, own reason, referencing this charge via
   * correction_of_id. null when no credit applies. Never edits amount_cents
   * above; the charge is always the real, un-suppressed rate. */
  credit: { id: number; amount_cents: number; correction_reason: string | null } | null;
  net_amount_cents: number;
};

export const TYPE_LABEL: Record<string, string> = {
  package: "Package",
  miles: "Mileage",
  on_demand: "On-Demand",
  prepaid_label: "Label",
};
export const OUTCOME_DOT: Record<string, string> = { delivered: "bg-success", failed: "bg-destructive" };

type DocumentPayment = {
  status: string;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
};

function unitRate(charge: ChargeRow): string | null {
  const rs = charge.rate_snapshot;
  if (!rs) return null;
  const cents =
    charge.resolved_type === "package"
      ? (rs.package as number | undefined)
      : charge.resolved_type === "miles"
        ? (rs.per_mile as number | undefined)
        : charge.resolved_type === "on_demand"
          ? (rs.on_demand_per_mile as number | undefined)
          : null;
  if (cents == null) return null;
  const perUnit = charge.resolved_type === "package" ? "/ package" : "/ mile";
  return `${centsToUsd(cents)} ${perUnit}`;
}

/* Shared detail content — the SAME markup renders inside the Sheet
 * (ChargeDetailDrawer, desktop click target and the mobile fallback for
 * inline expansion), the Charges grid's inline row expansion (desktop), and
 * Recent Activity's drawer. One component, three call sites, per the
 * mission's explicit "one shared charge-detail component" ask. */
export function ChargeDetailPanel({ charge, className }: { charge: ChargeRow; className?: string }) {
  const [payment, setPayment] = useState<DocumentPayment | null>(null);
  const [showRateSnapshot, setShowRateSnapshot] = useState(false);

  useEffect(() => {
    setPayment(null);
    if (!charge.document_id) return;
    let cancelled = false;
    fetch(`/api/client/billing/documents/${charge.document_id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) {
          setPayment({
            status: d.status,
            stripe_invoice_id: d.stripe_invoice_id ?? null,
            stripe_payment_intent_id: d.stripe_payment_intent_id ?? null,
            paid_at: d.paid_at ?? null,
          });
        }
      })
      .catch(() => {
        /* best-effort — payment reference just doesn't render */
      });
    return () => {
      cancelled = true;
    };
  }, [charge.document_id]);

  const rate = unitRate(charge);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2">
        <span className={cn("size-2 shrink-0 rounded-full", OUTCOME_DOT[charge.outcome] ?? "bg-muted-foreground")} />
        <p className="min-w-0 flex-1 font-medium text-13">{charge.charge_label}</p>
        <span className="shrink-0 font-bold text-lg tabular-nums">{centsToUsd(charge.amount_cents)}</span>
      </div>
      {charge.credit && (
        <div className="space-y-1 rounded-lg border border-success/30 bg-success/5 p-2.5 text-13">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Charge</span>
            <span className="tabular-nums">{centsToUsd(charge.amount_cents)}</span>
          </div>
          <div className="flex items-center justify-between text-success">
            <span>{charge.credit.correction_reason ?? "Courtesy credit"}</span>
            <span className="tabular-nums">−{centsToUsd(Math.abs(charge.credit.amount_cents))}</span>
          </div>
          <div className="flex items-center justify-between border-border/60 border-t pt-1 font-semibold">
            <span>Net</span>
            <span className="tabular-nums">{centsToUsd(charge.net_amount_cents)}</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <Badge variant="outline">{TYPE_LABEL[charge.resolved_type] ?? charge.resolved_type}</Badge>
        {charge.attempt_seq != null && (
          <Badge variant="secondary" className="text-10">
            Attempt {charge.attempt_seq}
          </Badge>
        )}
      </div>

      <Row label="Tracking / stop ID" value={<span className="font-mono text-12">{charge.stop_id}</span>} />
      <Row
        label="Outcome"
        value={
          <span>
            {charge.outcome === "delivered" ? "Delivered" : "Failed"}
            {charge.disposition && ` — ${charge.disposition.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}`}
          </span>
        }
      />
      <Row label="Billing type" value={TYPE_LABEL[charge.resolved_type] ?? charge.resolved_type} />
      {charge.units != null && (
        <Row
          label="Units / miles"
          value={charge.resolved_type === "miles" ? `${charge.units} mi` : `${charge.units}`}
        />
      )}
      {rate && <Row label="Unit rate" value={<span className="tabular-nums">{rate}</span>} />}
      <Row label="Computed total" value={<span className="tabular-nums">{centsToUsd(charge.amount_cents)}</span>} />
      {charge.rate_snapshot && (
        <div className="border-border/60 border-b pb-2">
          <button
            type="button"
            onClick={() => setShowRateSnapshot((v) => !v)}
            className="flex w-full items-center justify-between text-13"
          >
            <span className="text-muted-foreground">Rate snapshot (frozen at charge time)</span>
            {showRateSnapshot ? (
              <ChevronUp className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            )}
          </button>
          {showRateSnapshot && (
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 font-mono text-10 text-muted-foreground">
              {JSON.stringify(charge.rate_snapshot, null, 2)}
            </pre>
          )}
        </div>
      )}
      {charge.routely_cents != null && <Row label="Routely share" value={centsToUsd(charge.routely_cents)} />}
      {charge.driver_cents != null && <Row label="Driver share" value={centsToUsd(charge.driver_cents)} />}
      {charge.flag && (
        <Row
          label="Flag"
          value={
            <span className="text-destructive">
              {charge.flag} — {charge.flag_reason}
            </span>
          }
        />
      )}

      <Row
        label="Related document"
        value={
          charge.document_number ? (
            <span>
              {charge.document_number}{" "}
              <Badge variant="secondary" className="ml-1 text-10">
                {charge.document_status}
              </Badge>
            </span>
          ) : (
            <span className="text-muted-foreground">Unbilled — not yet in a cycle close</span>
          )
        }
      />
      {charge.document_id != null && (
        <Row
          label="Payment"
          value={
            payment ? (
              <span className="text-right">
                {payment.paid_at ? `Paid ${new Date(payment.paid_at).toLocaleDateString()}` : payment.status}
                {payment.stripe_payment_intent_id && (
                  <span className="block font-mono text-10 text-muted-foreground">
                    {payment.stripe_payment_intent_id}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">Loading…</span>
            )
          }
        />
      )}
      {/* "Event source" — the only stored provenance signal on a ledger line is
       * resolved_via (how the billing type was determined: stop override,
       * tenant default rule, etc.); there's no separate ingestion-channel
       * column, so this is that field, labeled honestly rather than implying
       * a webhook/API distinction that isn't tracked. */}
      <Row label="Event source" value={charge.resolved_via.replace(/_/g, " ")} />
      <Row label="Attempted at" value={new Date(charge.attempted_at).toLocaleString()} />
      {charge.documented_at && <Row label="Documented at" value={new Date(charge.documented_at).toLocaleString()} />}
      {/* "Internal support ID" — the ledger row's own primary key; there's no
       * separate support-ticket-style identifier stored, so this is the
       * stable internal reference support can search by. */}
      <Row label="Support reference" value={<span className="font-mono text-11">#{charge.id}</span>} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-border/60 border-b pb-2 text-13">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 font-medium">{value}</span>
    </div>
  );
}
