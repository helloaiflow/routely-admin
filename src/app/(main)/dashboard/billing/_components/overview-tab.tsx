"use client";

import { useEffect, useState } from "react";

import { AlertCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { DateRange } from "@/components/ui/date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyCents as centsToUsd } from "@/lib/ui/format";

import { AmountDueCard, type Overview } from "./amount-due-card";
import { computeCyclePeriod } from "./billing-cycle";
import type { Fund } from "./billing-radial";
import { CreditSummaryCard } from "./credit-summary-card";
import { RecentActivityTable } from "./recent-activity-table";

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
  const [summaryErrored, setSummaryErrored] = useState(false);
  const [loading, setLoading] = useState(true);
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
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setSummary)
      .catch(() => setSummaryErrored(true));
  }

  useEffect(load, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Skeleton className="h-96 rounded-2xl lg:col-span-5" />
        <Skeleton className="h-96 rounded-2xl lg:col-span-7" />
      </div>
    );
  }
  if (!data || data.error) {
    return <p className="text-muted-foreground text-sm">Couldn't load billing overview.</p>;
  }

  const period = computeCyclePeriod(data.cycle);
  const defaultRange: DateRange | null = period
    ? { from: period.start, to: new Date(period.end.getTime() - 86400_000), label: "Custom" }
    : null;

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

      {summaryErrored && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="py-2.5 text-11 text-warning">
            Usage trend (current usage / monthly average / projected end of cycle) couldn't load — the rest of this page
            is unaffected.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <AmountDueCard overview={data} fund={fund} onNavigateTab={onNavigateTab} onChanged={load} />
        </div>
        <div className="lg:col-span-7">
          <CreditSummaryCard fund={fund} stats={radialStats(summary)} />
        </div>
      </div>

      <RecentActivityTable defaultRange={defaultRange} onViewAll={() => onNavigateTab("charges")} />
    </div>
  );
}
