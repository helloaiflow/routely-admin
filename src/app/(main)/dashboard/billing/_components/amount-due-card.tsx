"use client";

import { CreditCard, FileText, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrencyCents as usd } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

import { computeCyclePeriod, fmtDay } from "./billing-cycle";
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

const sod = (d: Date) => {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
};
const sameDay = (a: Date, b: Date) => sod(a).getTime() === sod(b).getTime();

/* LEFT card — everything about payment and debt (Section 2). Amount due is
 * the TOTAL currently owed (uninvoiced-this-cycle + already-invoiced-but-
 * unpaid combined, via fund.unpaid_ledger_cents), not just the uninvoiced
 * slice — "amount due" that quietly excludes an open invoice would be the
 * exact kind of unstated-relationship figure Section 1 is about. The
 * segmented bar + legend states the split explicitly so nobody derives it. */
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

  const payNow = {
    label: isPrepaid ? "Add funds" : "Pay now",
    disabled: isPrepaid ? !overview.has_payment_method : !hasPayable,
    tooltip: isPrepaid
      ? "No payment method on file yet"
      : "Nothing invoiced yet — this is still accumulating for your next invoice",
    onClick: () => window.open("/api/stripe/billing-portal", "_blank"),
  };

  // Segmented-bar percentages: whole-number, always summing to exactly 100
  // (round the first segment, derive the second from the remainder) so the
  // two labels never visually overshoot/undershoot a full bar.
  const uninvoicedPct = unpaidLedgerCents > 0 ? Math.round((uninvoicedCents / unpaidLedgerCents) * 100) : 0;
  const invoicedPct = 100 - uninvoicedPct;

  return (
    <Card className="ring-1 ring-primary/15">
      <CardHeader className="pb-1.5">
        <CardTitle className="flex items-center gap-1.5 text-13 text-muted-foreground">
          <Wallet className="size-3.5" /> Account balance
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
        </div>

        {!isPrepaid &&
          (unpaidLedgerCents > 0 ? (
            <div className="space-y-2">
              <div className="flex h-6 w-full overflow-hidden rounded-md text-10 font-medium">
                <div
                  className="flex items-center justify-center bg-primary text-primary-foreground"
                  style={{ width: `${uninvoicedPct}%` }}
                >
                  {uninvoicedPct >= 18 && `${usd(uninvoicedCents)} (${uninvoicedPct}%)`}
                </div>
                {invoicedPct > 0 && (
                  <div
                    className="flex items-center justify-center bg-muted text-muted-foreground"
                    style={{ width: `${invoicedPct}%` }}
                  >
                    {invoicedPct >= 18 && `${usd(invoicedUnpaidCents)} (${invoicedPct}%)`}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-11">
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Uninvoiced this cycle</span>
                  <span className="font-medium tabular-nums">{usd(uninvoicedCents)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  <span className="text-muted-foreground">Open invoices</span>
                  <span className="font-medium tabular-nums">{usd(invoicedUnpaidCents)}</span>
                </span>
              </div>
            </div>
          ) : (
            <p className="text-11 text-success">You're all caught up — no outstanding balance.</p>
          ))}

        <div className="flex gap-2">
          {payNow.disabled ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex-1">
                  <Button size="sm" className="w-full gap-1.5" disabled>
                    <CreditCard className="size-3.5" /> {payNow.label}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{payNow.tooltip}</TooltipContent>
            </Tooltip>
          ) : (
            <Button size="sm" className="flex-1 gap-1.5" onClick={payNow.onClick}>
              <CreditCard className="size-3.5" /> {payNow.label}
            </Button>
          )}
          <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => onNavigateTab("invoices")}>
            <FileText className="size-3.5" /> View {isPrepaid ? "statements" : "invoices"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-border/60 border-t pt-3 text-11 sm:grid-cols-3">
          <StatCell label="Billing method">
            <div className="flex items-center gap-1">
              <BillingMethodEditor
                postpayEnabled={overview.billing_method === "postpaid"}
                creditLimitCents={overview.credit_limit_cents}
                fund={fund}
                onChanged={onChanged}
              />
            </div>
          </StatCell>
          <StatCell label="Current cycle" value={overview.cycle?.cadence ?? "monthly"} capitalize />
          <StatCell
            label="Last invoice"
            value={overview.last_document ? usd(overview.last_document.amount_cents) : "—"}
          />
          <StatCell
            label="Billing period ends"
            value={overview.cycle?.next_close_at ? new Date(overview.cycle.next_close_at).toLocaleDateString() : "—"}
          />
          <StatCell
            label="Due date"
            value={
              overview.last_document?.due_date ? new Date(overview.last_document.due_date).toLocaleDateString() : "—"
            }
          />
          <StatCell
            label="Pending approvals"
            valueClassName={overview.pending_approvals > 0 ? "text-destructive" : undefined}
            value={String(overview.pending_approvals)}
          />
        </div>

        <BillingCycleTimeline cycle={overview.cycle} dueDate={overview.last_document?.due_date ?? null} />
      </CardContent>
    </Card>
  );
}

function StatCell({
  label,
  value,
  children,
  capitalize,
  valueClassName,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  capitalize?: boolean;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <div className={cn("mt-0.5 font-medium", capitalize && "capitalize", valueClassName)}>{children ?? value}</div>
    </div>
  );
}

type TimelineNode = { date: Date; label: string; kind: "started" | "due" | "ends" };

/* Compact horizontal cycle timeline (Section 4). Every date is computed from
 * the real period (billing-cycle.ts, itself derived from routely-api's
 * cycle.next_close_at) — never hard-coded. "Today" is always its own node,
 * inserted in chronological order among the real ones so the line's
 * completed/upcoming split lines up with where today actually falls. */
function BillingCycleTimeline({ cycle, dueDate }: { cycle: Overview["cycle"]; dueDate: string | null }) {
  const period = computeCyclePeriod(cycle);
  if (!period) return null;

  const today = new Date();
  const nodes: TimelineNode[] = [{ date: period.start, label: "Cycle started", kind: "started" }];
  if (dueDate) nodes.push({ date: new Date(dueDate), label: "Payment due", kind: "due" });
  nodes.push({ date: period.end, label: "Cycle ends", kind: "ends" });
  nodes.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Insert "Today" in its chronological slot (own node if it doesn't
  // coincide with an existing one).
  let todayIndex = nodes.findIndex((n) => sameDay(n.date, today));
  if (todayIndex === -1) {
    const insertAt = nodes.findIndex((n) => n.date > today);
    const at = insertAt === -1 ? nodes.length : insertAt;
    nodes.splice(at, 0, { date: today, label: "Today", kind: "started" });
    todayIndex = at;
  }

  const lineFillPct = nodes.length > 1 ? (todayIndex / (nodes.length - 1)) * 100 : 0;

  return (
    <div className="border-border/60 border-t pt-3">
      <p className="mb-3 text-11 text-muted-foreground">Billing cycle</p>
      <div className="relative">
        <div className="absolute top-[7px] right-0 left-0 h-px bg-border" />
        <div
          className="absolute top-[7px] left-0 h-px bg-primary transition-all"
          style={{ width: `${lineFillPct}%` }}
        />
        <div className="relative flex justify-between gap-1">
          {nodes.map((n, i) => {
            const isToday = i === todayIndex;
            const isDue = n.kind === "due" && !isToday;
            const isCompleted = !isToday && i < todayIndex;
            return (
              <div
                key={`${n.kind}-${n.date.toISOString()}`}
                className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
              >
                <span
                  className={cn(
                    "size-3.5 shrink-0 rounded-full",
                    isToday && "border-2 border-primary bg-background",
                    isDue && "bg-warning",
                    isCompleted && "bg-primary",
                    !isToday && !isDue && !isCompleted && "bg-muted-foreground/40",
                  )}
                />
                <span className="font-medium text-11 tabular-nums">{fmtDay(n.date)}</span>
                <span className="text-center text-10 text-muted-foreground leading-tight">{n.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
