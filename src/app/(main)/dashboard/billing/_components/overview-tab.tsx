"use client";

import { useEffect, useState } from "react";

import { AlertCircle, ArrowRight, CreditCard, ExternalLink, FileText, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { ChargeDetailDrawer, type ChargeRow } from "./charge-detail-drawer";
import { FundPanel } from "./fund-panel";

type Overview = {
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

type DebitFailure = {
  id: number;
  stop_id: string;
  occurred_at: string;
  payload: { ledger_id: number; amount_cents: number; error: string };
};

const centsToUsd = (c: number) => `$${(c / 100).toFixed(2)}`;
const TYPE_LABEL: Record<string, string> = {
  package: "Package",
  miles: "Miles",
  on_demand: "On-Demand",
  prepaid_label: "Label",
};

export function OverviewTab({ onNavigateTab }: { onNavigateTab: (tab: "overview" | "charges" | "invoices") => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<ChargeRow[]>([]);
  const [selected, setSelected] = useState<ChargeRow | null>(null);
  const [debitFailures, setDebitFailures] = useState<DebitFailure[]>([]);
  const [showFailures, setShowFailures] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/client/billing/overview")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (d?.wallet_debit_failures > 0) {
          fetch("/api/client/billing/wallet-debit-failures")
            .then((r) => r.json())
            .then((f) => setDebitFailures(f.rows ?? []))
            .catch(() => {
              /* best-effort — count still shows even if detail fetch fails */
            });
        }
      })
      .catch(() => {
        /* best-effort — the !data check below renders the error state */
      })
      .finally(() => setLoading(false));
    fetch("/api/client/billing/ledger?limit=15")
      .then((r) => r.json())
      .then((d) => setRecent(d.rows ?? []))
      .catch(() => {
        /* best-effort — empty activity feed is an acceptable degrade */
      });
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={`sk-${i}`} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (!data || data.error) {
    return <p className="text-muted-foreground text-sm">Couldn't load billing overview.</p>;
  }

  const isPrepaid = data.billing_method === "prepaid";
  const availableCredit = Math.max(0, data.credit_limit_cents - data.outstanding_cents);

  // Contextual CTA — never "Pay now" without collectible debt.
  let cta: { label: string; icon: React.ElementType; onClick: () => void; disabled?: boolean } | null = null;
  if (!data.has_payment_method) {
    cta = {
      label: "Update payment method",
      icon: CreditCard,
      onClick: () => window.open("/api/stripe/billing-portal", "_blank"),
    };
  } else if (!isPrepaid && data.last_document?.status === "open") {
    cta = { label: "View invoice", icon: FileText, onClick: () => onNavigateTab("invoices") };
  } else if (isPrepaid) {
    cta = { label: "Add funds", icon: Wallet, onClick: () => window.open("/api/stripe/billing-portal", "_blank") };
  } else {
    cta = {
      label: "View invoice",
      icon: FileText,
      onClick: () => onNavigateTab("invoices"),
      disabled: !data.last_document,
    };
  }

  return (
    <div className="space-y-4">
      {data.wallet_debit_failures > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="space-y-2 py-3">
            <button
              type="button"
              onClick={() => setShowFailures((v) => !v)}
              className="flex w-full items-center gap-1.5 text-13 text-destructive"
            >
              <AlertCircle className="size-3.5 shrink-0" />
              {data.wallet_debit_failures} wallet debit{data.wallet_debit_failures === 1 ? "" : "s"} failed — charge
              {data.wallet_debit_failures === 1 ? " was" : "s were"} recorded but the balance was never adjusted.
            </button>
            {showFailures && (
              <div className="space-y-1 border-destructive/20 border-t pt-2">
                {debitFailures.map((f) => (
                  <div key={f.id} className="text-11 text-muted-foreground">
                    <span className="font-mono">{f.stop_id}</span> — {centsToUsd(f.payload?.amount_cents ?? 0)} —{" "}
                    {new Date(f.occurred_at).toLocaleString()} — {f.payload?.error}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <FundPanel />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card className="ring-1 ring-primary/15">
          <CardHeader className="pb-1.5">
            <CardTitle className="flex items-center gap-1.5 text-13 text-muted-foreground">
              <Wallet className="size-3.5" /> {isPrepaid ? "Prepaid balance" : "Amount due"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <span className="font-bold text-2xl tabular-nums">{centsToUsd(data.outstanding_cents)}</span>
            <p className="text-11 text-muted-foreground">
              {isPrepaid ? "Covered by prepaid balance — no payment demand" : "Uninvoiced delivery charges this cycle"}
            </p>
            {cta && (
              <Button size="sm" className="mt-auto gap-1.5" disabled={cta.disabled} onClick={cta.onClick}>
                <cta.icon className="size-3.5" /> {cta.label}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-13 text-muted-foreground">Billing method</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={isPrepaid ? "secondary" : "outline"} className="capitalize">
              {data.billing_method}
            </Badge>
            {!isPrepaid && (
              <p className="mt-2 text-11 text-muted-foreground">Credit limit {centsToUsd(data.credit_limit_cents)}</p>
            )}
            {isPrepaid && (
              <p className="mt-2 text-11 text-muted-foreground">Available credit {centsToUsd(availableCredit)}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1.5">
            <CardTitle className="text-13 text-muted-foreground">Current cycle</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-semibold capitalize">{data.cycle?.cadence ?? "monthly"}</span>
            <p className="mt-1 text-11 text-muted-foreground">
              {data.cycle?.next_close_at
                ? `Next close ${new Date(data.cycle.next_close_at).toLocaleDateString()}`
                : "Closes at period end"}
            </p>
          </CardContent>
        </Card>

        <Card className={data.pending_approvals > 0 ? "ring-1 ring-destructive/30" : ""}>
          <CardHeader className="pb-1.5">
            <CardTitle className="flex items-center gap-1.5 text-13 text-muted-foreground">
              <AlertCircle className="size-3.5" /> Pending approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-bold text-2xl tabular-nums">{data.pending_approvals}</span>
            <p className="mt-1 text-11 text-muted-foreground">Staff actions awaiting a second approver</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Recent activity</CardTitle>
          <Button variant="ghost" size="sm" className="gap-1 text-12" onClick={() => onNavigateTab("charges")}>
            View all charges <ArrowRight className="size-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="divide-y divide-border/60 p-0">
          {recent.length === 0 && <p className="p-4 text-muted-foreground text-13">No charges yet.</p>}
          {recent.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c)}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`size-1.5 shrink-0 rounded-full ${c.outcome === "delivered" ? "bg-success" : "bg-destructive"}`}
                />
                <span className="truncate font-mono text-12">{c.stop_id}</span>
                <Badge variant="outline" className="shrink-0 text-10">
                  {TYPE_LABEL[c.resolved_type] ?? c.resolved_type}
                </Badge>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={c.document_id ? "secondary" : "outline"} className="text-10">
                  {c.document_id ? "Invoiced" : "Unbilled"}
                </Badge>
                <span className="w-16 text-right font-medium tabular-nums">{centsToUsd(c.amount_cents ?? 0)}</span>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <ChargeDetailDrawer charge={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
