"use client";

import { useEffect, useState } from "react";

import { ChevronDown, ChevronUp, Download, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrencyCents as usd } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

import { TYPE_LABEL } from "./charge-detail-panel";

type LedgerLine = {
  id: number;
  stop_id: string;
  resolved_type: string;
  outcome: string;
  disposition: string | null;
  attempt_seq: number | null;
  units: number | null;
  amount_cents: number;
  rate_snapshot?: Record<string, unknown> | null;
  attempted_at: string;
  charge_label: string;
};

type ReceiptItem = {
  order_id: string;
  tracking_number: string | null;
  carrier: string | null;
  service: string | null;
  amount_cents: number;
};

type Adjustment = {
  id: number;
  adjustment_type: string;
  amount_cents: number;
  reason: string;
  actor_id: string | null;
  created_at: string;
};

export type DocDetail = {
  id: number;
  document_number: string;
  doc_type: "receipt" | "statement" | "invoice";
  status: string;
  cycle_start: string | null;
  cycle_end: string | null;
  charges_through: string | null;
  amount_cents: number;
  amount_paid_cents: number;
  due_date: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  paid_at: string | null;
  voided_at: string | null;
  snapshot: {
    items?: ReceiptItem[] | Array<{ description?: string; type?: string; units?: number; amount_cents: number }>;
    statement_note?: string;
    period_note?: string | null;
    generated_at?: string;
  };
  ledger_lines: LedgerLine[];
  adjustments: Adjustment[];
};

type TenantInfo = { company_name: string; sender_address: string };

const DOC_LABEL: Record<string, string> = { receipt: "Receipt", statement: "Statement", invoice: "Invoice" };
const STATUS_TONE: Record<string, string> = {
  paid: "bg-success/10 text-success",
  open: "bg-primary/10 text-primary",
  past_due: "bg-destructive/10 text-destructive",
  voided: "bg-muted text-muted-foreground",
  refunded: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
  pending: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
};
const dayKey = (iso: string) => iso.slice(0, 10);
const fmtDay = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/* Phone-bill-style statement (Section 2, right column). Day-grouped
 * per-stop appendix is built from `ledger_lines` — the document's OWN
 * immutable billing_ledger rows, not the flat snapshot.items aggregate
 * (see 2026-08-13 investigation: snapshot.items is grouped by
 * type+disposition across the whole cycle, never by day or by individual
 * stop) — so day subtotals reconcile to the total by construction (same
 * rows, same amount_cents, just re-bucketed for display). Receipts have no
 * ledger_lines (labels aren't billed through billing_ledger) and render
 * their real per-label snapshot items instead — never day-grouped, since a
 * receipt is inherently a single checkout moment. */
export function InvoiceDetail({ documentId, onPay }: { documentId: number; onPay?: () => void }) {
  const [detail, setDetail] = useState<DocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [appendixCollapsed, setAppendixCollapsed] = useState(false);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    fetch(`/api/client/billing/documents/${documentId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setDetail)
      .catch(() => {
        /* best-effort — the !detail check below renders the error state */
      })
      .finally(() => setLoading(false));
  }, [documentId]);

  useEffect(() => {
    fetch("/api/client/tenant")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setTenant({ company_name: d.company_name, sender_address: d.sender_address }))
      .catch(() => {
        /* best-effort — header just omits the billing-to block */
      });
  }, []);

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!detail) {
    return <p className="p-6 text-center text-13 text-muted-foreground">Couldn't load this document.</p>;
  }

  const isReceipt = detail.doc_type === "receipt";
  const receiptItems = isReceipt ? ((detail.snapshot.items ?? []) as ReceiptItem[]) : [];
  const receiptTotal = receiptItems.reduce((s, i) => s + (i.amount_cents ?? 0), 0);

  // Day-grouping (invoices/statements only — real ledger rows, real dates).
  const byDay = new Map<string, LedgerLine[]>();
  for (const line of detail.ledger_lines) {
    const k = dayKey(line.attempted_at);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)?.push(line);
  }
  const dayKeys = [...byDay.keys()].sort();

  // Totals by type — real aggregate over the same ledger_lines, computed
  // here for display, not stored separately.
  const byType = new Map<string, { count: number; cents: number }>();
  for (const line of detail.ledger_lines) {
    const t = byType.get(line.resolved_type) ?? { count: 0, cents: 0 };
    t.count += 1;
    t.cents += line.amount_cents;
    byType.set(line.resolved_type, t);
  }

  // Summary math — subtotal is the document's OWN stored total (never
  // recomputed); credit/debit_adjustment rows are a SEPARATE audit-trail
  // record that never mutates amount_cents (confirmed in
  // _execute_billing_action), so they're folded in here for display only.
  const creditAdjustments = detail.adjustments.filter((a) => a.adjustment_type === "credit");
  const debitAdjustments = detail.adjustments.filter((a) => a.adjustment_type === "debit_adjustment");
  const creditsCents = creditAdjustments.reduce((s, a) => s + a.amount_cents, 0);
  const debitsCents = debitAdjustments.reduce((s, a) => s + a.amount_cents, 0);
  const subtotalCents = detail.amount_cents;
  const totalCents = subtotalCents - creditsCents + debitsCents;
  const balanceDueCents = Math.max(0, totalCents - detail.amount_paid_cents);
  const hasPayableBalance = balanceDueCents > 0 && detail.status !== "voided" && detail.status !== "paid";

  function toggleDay(key: string) {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* Header block */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-border/60 border-b pb-4">
        <div>
          <p className="font-bold text-lg text-primary">Routely</p>
          {tenant && (
            <div className="mt-1 text-11 text-muted-foreground">
              <p className="font-medium text-foreground">{tenant.company_name}</p>
              {tenant.sender_address && <p>{tenant.sender_address}</p>}
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="font-semibold text-13">
            {DOC_LABEL[detail.doc_type]} {detail.document_number}
          </p>
          <p className="text-11 text-muted-foreground">Issued {new Date(detail.created_at).toLocaleDateString()}</p>
          {detail.cycle_end && (
            <p className="text-11 text-muted-foreground">
              Closed {new Date(detail.cycle_end).toLocaleDateString()}
              {detail.charges_through &&
                ` · covering charges through ${new Date(detail.charges_through).toLocaleDateString()}`}
            </p>
          )}
          {detail.due_date && (
            <p className="text-11 text-muted-foreground">Due {new Date(detail.due_date).toLocaleDateString()}</p>
          )}
          {detail.doc_type === "invoice" && <p className="text-11 text-muted-foreground">Terms: Net 15</p>}
          <span
            className={cn(
              "mt-1 inline-block rounded-full px-2 py-0.5 text-10",
              STATUS_TONE[detail.status] ?? "bg-muted",
            )}
          >
            {detail.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {detail.snapshot.statement_note && (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-13 text-success">{detail.snapshot.statement_note}</p>
      )}
      {detail.snapshot.period_note && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-13 text-warning">{detail.snapshot.period_note}</p>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border/60 p-3 text-13 sm:grid-cols-4">
        <SummaryCell
          label="Subtotal"
          value={usd(subtotalCents)}
          tooltip="The document's charged total at cycle close, before any adjustments."
        />
        {(creditsCents > 0 || debitsCents > 0) && (
          <SummaryCell
            label="Credits / adjustments"
            value={`${debitsCents - creditsCents >= 0 ? "+" : "−"}${usd(Math.abs(debitsCents - creditsCents))}`}
            tooltip="Staff-applied credits and debit adjustments, audited separately — never edits a billed charge."
          />
        )}
        <SummaryCell label="Total" value={usd(totalCents)} tooltip="Subtotal adjusted for any credits/debits above." />
        <SummaryCell
          label="Paid"
          value={usd(detail.amount_paid_cents)}
          tooltip="Confirmed by Stripe webhook — never a frontend success response."
        />
        <SummaryCell
          label="Balance due"
          value={usd(balanceDueCents)}
          tooltip="Total minus paid. $0.00 once fully paid, voided, or refunded."
          emphasize
        />
      </div>

      {/* Day-grouped appendix (invoices/statements) or per-label list (receipts) */}
      {isReceipt ? (
        <div>
          <p className="mb-2 font-medium text-13">Labels purchased ({receiptItems.length})</p>
          <div className="divide-y divide-border/60 rounded-lg border border-border/60">
            {receiptItems.map((item) => (
              <div key={item.order_id} className="flex items-center justify-between gap-3 px-3 py-2 text-12">
                <div className="min-w-0">
                  <p className="truncate font-mono text-11">{item.tracking_number ?? item.order_id}</p>
                  <p className="text-10 text-muted-foreground">
                    {item.carrier ?? "—"} {item.service ? `· ${item.service}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-medium tabular-nums">{usd(item.amount_cents)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 font-semibold text-12">
              <span>Checkout total</span>
              <span className="tabular-nums">{usd(receiptTotal)}</span>
            </div>
          </div>
        </div>
      ) : dayKeys.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setAppendixCollapsed((v) => !v)}
            className="mb-2 flex w-full items-center justify-between text-13"
          >
            <span className="font-medium">Charges by day</span>
            {appendixCollapsed ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronUp className="size-3.5 text-muted-foreground" />
            )}
          </button>
          {!appendixCollapsed && (
            <div className="space-y-3">
              {dayKeys.map((day) => {
                const lines = byDay.get(day) ?? [];
                const dayTotal = lines.reduce((s, l) => s + l.amount_cents, 0);
                const isCollapsed = collapsedDays.has(day);
                return (
                  <div key={day} className="overflow-hidden rounded-lg border border-border/60">
                    <button
                      type="button"
                      onClick={() => toggleDay(day)}
                      className="flex w-full items-center justify-between bg-muted/40 px-3 py-2 text-12"
                    >
                      <span className="font-medium">
                        {fmtDay(day)} · {lines.length} stop{lines.length !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-2 tabular-nums">
                        {usd(dayTotal)}
                        {isCollapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="divide-y divide-border/40">
                        {lines.map((line) => (
                          <div key={line.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-11">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="font-mono">{line.stop_id}</span>
                              <Badge variant="outline" className="text-10">
                                {TYPE_LABEL[line.resolved_type] ?? line.resolved_type}
                              </Badge>
                              {line.attempt_seq != null && (
                                <Badge variant="secondary" className="text-10">
                                  #{line.attempt_seq}
                                </Badge>
                              )}
                              <span className="truncate text-muted-foreground">
                                {line.outcome === "delivered" ? "Delivered" : "Failed"}
                                {line.disposition && ` — ${line.disposition.replace(/_/g, " ")}`}
                              </span>
                            </div>
                            <span className="shrink-0 font-medium tabular-nums">{usd(line.amount_cents)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Totals by type */}
          <div className="mt-3 grid grid-cols-2 gap-2 border-border/60 border-t pt-3 text-11 sm:grid-cols-4">
            {[...byType.entries()].map(([type, agg]) => (
              <div key={type}>
                <p className="text-muted-foreground">{TYPE_LABEL[type] ?? type}</p>
                <p className="font-medium tabular-nums">
                  {agg.count} · {usd(agg.cents)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-13 text-muted-foreground">No per-stop detail available for this document.</p>
      )}

      {/* Payment history */}
      {(detail.paid_at || detail.stripe_invoice_id || detail.stripe_payment_intent_id) && (
        <div className="border-border/60 border-t pt-3 text-11">
          <p className="mb-1 font-medium text-13">Payment</p>
          {detail.paid_at && <p className="text-muted-foreground">Paid {new Date(detail.paid_at).toLocaleString()}</p>}
          {detail.stripe_invoice_id && (
            <p className="font-mono text-10 text-muted-foreground">Stripe invoice: {detail.stripe_invoice_id}</p>
          )}
          {detail.stripe_payment_intent_id && (
            <p className="font-mono text-10 text-muted-foreground">Stripe payment: {detail.stripe_payment_intent_id}</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-border/60 border-t pt-4">
        <Button size="sm" variant="outline" className="gap-1.5" asChild>
          <a href={`/api/client/billing/documents/${detail.id}/pdf`} target="_blank" rel="noreferrer">
            <Download className="size-3.5" /> Download PDF
          </a>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => window.open(`/api/client/billing/documents/${detail.id}/pdf`, "_blank")?.print()}
        >
          <Printer className="size-3.5" /> Print
        </Button>
        {hasPayableBalance ? (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={onPay ?? (() => window.open("/api/stripe/billing-portal", "_blank"))}
          >
            Pay {usd(balanceDueCents)}
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button size="sm" disabled>
                  Pay
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>No balance is due on this document.</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  tooltip,
  emphasize,
}: {
  label: string;
  value: string;
  tooltip: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <Tooltip>
        <TooltipTrigger asChild>
          <p className="w-fit text-10 text-muted-foreground decoration-dotted hover:underline">{label}</p>
        </TooltipTrigger>
        <TooltipContent className="max-w-56">{tooltip}</TooltipContent>
      </Tooltip>
      <p className={cn("mt-0.5 tabular-nums", emphasize ? "font-bold text-15" : "font-medium")}>{value}</p>
    </div>
  );
}
