"use client";

import { AlertCircle, CreditCard, FileText, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { BillingMethodEditor } from "./billing-method-editor";
import type { Fund } from "./billing-radial";

export type Overview = {
  tenant_id: number;
  billing_method: "prepaid" | "postpaid";
  outstanding_cents: number;
  credit_limit_cents: number;
  has_payment_method: boolean;
  cycle: {
    cadence: string;
    anchor_day: number;
    timezone: string;
    last_closed_at: string | null;
    next_close_at: string | null;
  } | null;
  last_document: {
    id: number;
    document_number: string;
    doc_type: string;
    status: string;
    amount_cents: number;
    due_date: string | null;
    created_at: string;
  } | null;
  pending_approvals: number;
  wallet_debit_failures: number;
  error?: string;
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/* LEFT card — everything about payment and debt (Section 2). Amount due is
 * the TOTAL currently owed (uninvoiced-this-cycle + already-invoiced-but-
 * unpaid combined, via fund.unpaid_ledger_cents), not just the uninvoiced
 * slice — "amount due" that quietly excludes an open invoice would be the
 * exact kind of unstated-relationship figure Section 1 is about. The
 * breakdown line states the split explicitly so nobody derives it. */
export function AmountDueCard({
  overview,
  fund,
  onNavigateTab,
  onChanged,
}: {
  overview: Overview;
  fund: Fund | null;
  onNavigateTab: (tab: "overview" | "charges" | "invoices") => void;
  onChanged: () => void;
}) {
  const isPrepaid = overview.billing_method === "prepaid";
  const unpaidLedgerCents = fund?.fund_type === "postpaid" ? fund.unpaid_ledger_cents : 0;
  const uninvoicedCents = overview.outstanding_cents;
  const invoicedUnpaidCents = Math.max(0, unpaidLedgerCents - uninvoicedCents);
  const hasPayable = invoicedUnpaidCents > 0;

  const primaryCents = isPrepaid ? (fund?.fund_type === "prepaid" ? fund.balance_cents : 0) : unpaidLedgerCents;
  const primaryLabel = isPrepaid ? "Prepaid balance" : "Amount due";

  const payNow = {
    label: isPrepaid ? "Add funds" : "Pay now",
    disabled: isPrepaid ? !overview.has_payment_method : !hasPayable,
    tooltip: isPrepaid
      ? "No payment method on file yet"
      : "Nothing invoiced yet — this is still accumulating for your next invoice",
    onClick: () => window.open("/api/stripe/billing-portal", "_blank"),
  };

  return (
    <Card className="ring-1 ring-primary/15">
      <CardHeader className="pb-1.5">
        <CardTitle className="flex items-center gap-1.5 text-13 text-muted-foreground">
          <Wallet className="size-3.5" /> {primaryLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <span className="font-bold text-3xl tabular-nums">{usd(primaryCents)}</span>
          <p className="mt-1 text-11 text-muted-foreground">
            {isPrepaid
              ? "Covered by prepaid balance — debited automatically as deliveries complete, no invoice involved."
              : "Everything currently owed: delivery charges not yet on an invoice, plus any open invoices."}
          </p>
          {!isPrepaid && unpaidLedgerCents > 0 && (
            <div className="mt-2 space-y-0.5 text-11 text-muted-foreground">
              <div className="flex justify-between">
                <span>Uninvoiced this cycle</span>
                <span className="tabular-nums">{usd(uninvoicedCents)}</span>
              </div>
              <div className="flex justify-between">
                <span>Already invoiced, not yet paid</span>
                <span className="tabular-nums">{usd(invoicedUnpaidCents)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {payNow.disabled ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex-1">
                  <Button size="sm" className="w-full gap-1.5" disabled>
                    {isPrepaid ? <CreditCard className="size-3.5" /> : <Wallet className="size-3.5" />} {payNow.label}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{payNow.tooltip}</TooltipContent>
            </Tooltip>
          ) : (
            <Button size="sm" className="flex-1 gap-1.5" onClick={payNow.onClick}>
              {isPrepaid ? <CreditCard className="size-3.5" /> : <Wallet className="size-3.5" />} {payNow.label}
            </Button>
          )}
          <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => onNavigateTab("invoices")}>
            <FileText className="size-3.5" /> View {isPrepaid ? "statements" : "invoices"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-border/60 border-t pt-3 text-11">
          <div>
            <p className="text-muted-foreground">Billing method</p>
            <div className="mt-0.5">
              <BillingMethodEditor
                postpayEnabled={overview.billing_method === "postpaid"}
                creditLimitCents={overview.credit_limit_cents}
                fund={fund}
                onChanged={onChanged}
              />
            </div>
          </div>
          <div>
            <p className="text-muted-foreground">Current cycle</p>
            <p className="mt-0.5 font-medium capitalize">{overview.cycle?.cadence ?? "monthly"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Pending approvals</p>
            <p
              className={`mt-0.5 flex items-center gap-1 font-medium ${overview.pending_approvals > 0 ? "text-destructive" : ""}`}
            >
              {overview.pending_approvals > 0 && <AlertCircle className="size-3" />} {overview.pending_approvals}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Billing period ends</p>
            <p className="mt-0.5 font-medium">
              {overview.cycle?.next_close_at ? new Date(overview.cycle.next_close_at).toLocaleDateString() : "—"}
            </p>
          </div>
          {overview.last_document && (
            <>
              <div>
                <p className="text-muted-foreground">Last {overview.last_document.doc_type}</p>
                <p className="mt-0.5 font-medium tabular-nums">{usd(overview.last_document.amount_cents)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Due date</p>
                <p className="mt-0.5 font-medium">
                  {overview.last_document.due_date
                    ? new Date(overview.last_document.due_date).toLocaleDateString()
                    : "—"}
                </p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
