"use client";

import { useEffect, useState } from "react";

import { AlertCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { AmountDueCard, type Overview } from "./amount-due-card";
import type { Fund } from "./billing-radial";
import { ChargeDetailDrawer, type ChargeRow } from "./charge-detail-drawer";
import { CreditSummaryCard } from "./credit-summary-card";

type DebitFailure = {
  id: number;
  stop_id: string;
  occurred_at: string;
  payload: { ledger_id: number; amount_cents: number; error: string };
};

type Summary = {
  delivery_this_month_cents: number;
  delivery_last_month_cents: number;
};

const centsToUsd = (c: number) => `$${(c / 100).toFixed(2)}`;
const TYPE_LABEL: Record<string, string> = {
  package: "Package",
  miles: "Miles",
  on_demand: "On-Demand",
  prepaid_label: "Label",
};

/* Radial's complementary stats (Section 5) — derived from the EXISTING
 * /summary aggregate, never a second endpoint. currentUsage = this
 * calendar month to date; monthlyAverage = simple 2-point average of this
 * and last month; projectedEndOfCycle = a plain linear projection off the
 * elapsed fraction of the month. All three are estimates stated as such,
 * not exact — good enough for a "how am I trending" glance. */
function radialStats(summary: Summary | null) {
  if (!summary) return undefined;
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentUsageCents = summary.delivery_this_month_cents;
  const monthlyAverageCents = Math.round((summary.delivery_this_month_cents + summary.delivery_last_month_cents) / 2);
  const projectedEndOfCycleCents =
    dayOfMonth > 0 ? Math.round((currentUsageCents / dayOfMonth) * daysInMonth) : currentUsageCents;
  return { currentUsageCents, monthlyAverageCents, projectedEndOfCycleCents };
}

export function OverviewTab({ onNavigateTab }: { onNavigateTab: (tab: "overview" | "charges" | "invoices") => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [fund, setFund] = useState<Fund | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<ChargeRow[]>([]);
  const [selected, setSelected] = useState<ChargeRow | null>(null);
  const [debitFailures, setDebitFailures] = useState<DebitFailure[]>([]);
  const [showFailures, setShowFailures] = useState(false);

  function load() {
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
    fetch("/api/client/billing/fund")
      .then((r) => r.json())
      .then(setFund)
      .catch(() => {
        /* best-effort — cards below degrade to their own skeleton/empty state */
      });
    fetch("/api/client/billing/summary")
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => {
        /* best-effort — radial renders without the complementary stat row */
      });
    fetch("/api/client/billing/ledger?limit=15")
      .then((r) => r.json())
      .then((d) => setRecent(d.rows ?? []))
      .catch(() => {
        /* best-effort — empty activity feed is an acceptable degrade */
      });
  }

  useEffect(load, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }
  if (!data || data.error) {
    return <p className="text-muted-foreground text-sm">Couldn't load billing overview.</p>;
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

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <AmountDueCard overview={data} fund={fund} onNavigateTab={onNavigateTab} onChanged={load} />
        <CreditSummaryCard fund={fund} stats={radialStats(summary)} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Recent activity</CardTitle>
          <button
            type="button"
            onClick={() => onNavigateTab("charges")}
            className="flex items-center gap-1 text-12 text-muted-foreground hover:text-foreground"
          >
            View all charges
          </button>
        </CardHeader>
        <CardContent className="divide-y divide-border/60 p-0">
          {recent.length === 0 && <p className="p-4 text-13 text-muted-foreground">No charges yet.</p>}
          {recent.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c)}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 items-center gap-2" title={c.charge_label}>
                <span
                  className={`size-1.5 shrink-0 rounded-full ${c.outcome === "delivered" ? "bg-success" : "bg-destructive"}`}
                />
                <span className="truncate font-mono text-12">{c.stop_id}</span>
                {c.attempt_seq != null && (
                  <Badge variant="secondary" className="shrink-0 text-10">
                    Attempt {c.attempt_seq}
                  </Badge>
                )}
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
