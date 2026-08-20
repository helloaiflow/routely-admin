"use client";

import { useEffect, useState } from "react";

import { AlertCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyCents as centsToUsd } from "@/lib/ui/format";

import { AmountDueCard, type Overview } from "./amount-due-card";
import { computeCyclePeriod } from "./billing-cycle";
import type { Fund } from "./billing-radial";
import { CreditSummaryCard, type RadialStats } from "./credit-summary-card";
import { DailyChargesChart } from "./daily-charges-chart";
import { RecentActivityTeaser } from "./recent-activity-teaser";

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
 * /summary aggregate, never a second endpoint. All figures here are
 * estimates/aggregates whose exact meaning CreditSummaryCard states
 * explicitly next to each one (2026-08-13 — terse unlabeled money figures
 * were generating the exact "is this a bug?" confusion they're meant to
 * prevent). */
function radialStats(summary: Summary | null): RadialStats | undefined {
  if (!summary) return undefined;
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthName = now.toLocaleDateString("en-US", { month: "long" });
  const currentUsageCents = summary.delivery_this_month_cents;
  // Averaging month-to-date against a genuinely-zero last month isn't a
  // trailing average, it's just half of this month's own number wearing a
  // different label — found live 2026-08-19: "Monthly average" rendered
  // exactly half of "Charged this month" for a tenant with no prior-month
  // history. Null (rendered as "—") is the honest answer when there's
  // nothing real to average against yet.
  const monthlyAverageCents =
    summary.delivery_last_month_cents > 0
      ? Math.round((summary.delivery_this_month_cents + summary.delivery_last_month_cents) / 2)
      : null;
  const projectedEndOfCycleCents = dayOfMonth < 3 ? null : Math.round((currentUsageCents / dayOfMonth) * daysInMonth);
  return {
    currentUsageCents,
    monthlyAverageCents,
    lastMonthCents: summary.delivery_last_month_cents,
    monthName,
    dayOfMonth,
    daysInMonth,
    projectedEndOfCycleCents,
  };
}

export function OverviewTab({
  onNavigateTab,
}: {
  onNavigateTab: (tab: "overview" | "charges" | "invoices" | "recent_activity") => void;
}) {
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
    loadSummary();
  }

  // "Charged this month" / "Monthly average" / "Projected end of cycle" all
  // depend on this one fetch — a single failure (a cold Vercel function
  // start, a momentary network blip) used to leave all three permanently at
  // "—" with a static banner and no way to recover short of a full page
  // reload. Retries twice with a short backoff before giving up; the banner
  // (still shown on final failure) now also offers a manual retry.
  function loadSummary(attempt = 0) {
    setSummaryErrored(false);
    fetch("/api/client/billing/summary")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setSummary)
      .catch(() => {
        if (attempt < 2) {
          setTimeout(() => loadSummary(attempt + 1), 800 * (attempt + 1));
        } else {
          setSummaryErrored(true);
        }
      });
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally run once on mount — load/loadSummary are recreated every render (not memoized), so listing loadSummary here would re-fire this effect on every render instead of just mount
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
          <CardContent className="flex items-center justify-between gap-3 py-2.5 text-11 text-warning">
            <span>
              Usage trend (current usage / monthly average / projected end of cycle) couldn't load after 3 tries — the
              rest of this page is unaffected.
            </span>
            <button
              type="button"
              onClick={() => loadSummary()}
              className="shrink-0 whitespace-nowrap underline underline-offset-2 hover:no-underline"
            >
              Try again
            </button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <AmountDueCard overview={data} fund={fund} onNavigateTab={onNavigateTab} onChanged={load} />
        </div>
        <div className="lg:col-span-7">
          <CreditSummaryCard fund={fund} stats={radialStats(summary)} outstandingCents={data.outstanding_cents} />
        </div>
      </div>

      <DailyChargesChart
        cycleStart={computeCyclePeriod(data.cycle)?.start ?? null}
        cycleEnd={computeCyclePeriod(data.cycle)?.end ?? null}
      />

      <RecentActivityTeaser onViewAll={() => onNavigateTab("recent_activity")} />
    </div>
  );
}
