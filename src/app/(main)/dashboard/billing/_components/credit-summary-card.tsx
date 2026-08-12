"use client";

import { useEffect, useState } from "react";

import { AlertTriangle, Lock, Sparkles, Wallet } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { BillingRadial, classifyFund, type Fund, type FundState } from "./billing-radial";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/* RIGHT card — everything about credit (Section 5). Two internal columns:
 * LEFT = the radial + its active reservations (both keyed off the same
 * ring/fund math); RIGHT = the 3x2 breakdown grid + the buffer-exceeded
 * alert + the billing-intelligence callout. The credit-limit suggestion
 * used to live inline here — it's now its own full-width strip below both
 * panels (Section 8), so it doesn't compete for space with the numbers a
 * staff member needs first. Buffer math corrected 2026-08-11 — see
 * billing-radial.tsx and app/services/fund.py: the buffer is headroom
 * BEYOND the limit, not a carve-out of it. */
export function CreditSummaryCard({
  fund,
  stats,
}: {
  fund: Fund | null;
  stats?: { currentUsageCents?: number; monthlyAverageCents?: number; projectedEndOfCycleCents?: number };
}) {
  const [topUpAmount, setTopUpAmount] = useState("");
  const [toppingUp, setToppingUp] = useState(false);
  const [topUpMsg, setTopUpMsg] = useState<string | null>(null);

  async function submitTopUp() {
    const cents = Math.round(Number.parseFloat(topUpAmount || "0") * 100);
    if (!cents || cents <= 0) return;
    setToppingUp(true);
    setTopUpMsg(null);
    try {
      const r = await fetch("/api/client/billing/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: cents }),
      });
      const d = await r.json();
      if (!r.ok) {
        setTopUpMsg(d.error ?? "Top-up failed");
      } else {
        setTopUpMsg(`Charging card on file — balance updates once Stripe confirms (status: ${d.status}).`);
        setTopUpAmount("");
      }
    } finally {
      setToppingUp(false);
    }
  }

  if (!fund) return <Skeleton className="h-96 rounded-2xl" />;
  const isPrepaid = fund.fund_type === "prepaid";
  const c = classifyFund(fund);
  const alertCopy = alertText(c.state, c.overCents, isPrepaid);
  const intelCopy = intelligenceText(c.state, c.overCents, isPrepaid);

  return (
    <Card>
      <CardHeader className="pb-1.5">
        <CardTitle className="flex items-center gap-1.5 text-13 text-muted-foreground">
          <Wallet className="size-3.5" /> Credit & controls
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[220px_1fr]">
          {/* LEFT column: radial + active reservations */}
          <div className="space-y-3">
            <BillingRadial fund={fund} />
            <div className="space-y-1 border-border/60 border-t pt-2.5">
              <p className="text-11 text-muted-foreground">Active reservations ({fund.active_reservations.length})</p>
              {fund.active_reservations.length === 0 ? (
                <p className="text-10 text-muted-foreground">No reservations held right now.</p>
              ) : (
                fund.active_reservations.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between border-border/40 border-b py-1 text-11 last:border-0"
                  >
                    <span className="font-mono text-muted-foreground">{r.stop_id}</span>
                    <span className="tabular-nums">{usd(r.reserved_cents)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RIGHT column: stat grid + alert + intelligence */}
          <div className="space-y-4">
            {isPrepaid ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-11">
                <StatCell label="Prepaid balance" value={usd(fund.balance_cents)} />
                <StatCell label="Held (reservations)" value={usd(fund.held_cents)} />
                <StatCell
                  label="Current usage"
                  value={stats?.currentUsageCents != null ? usd(stats.currentUsageCents) : "—"}
                />
                <StatCell
                  label="Monthly average"
                  value={stats?.monthlyAverageCents != null ? usd(stats.monthlyAverageCents) : "—"}
                />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-x-3 gap-y-2.5 text-11">
                <StatCell label="Credit limit" value={usd(fund.credit_limit_cents)} />
                <StatCell label="Reserved (active)" value={usd(fund.reserved_cents)} />
                <StatCell label="Unpaid ledger" value={usd(fund.unpaid_ledger_cents)} />
                <StatCell
                  label="Current usage"
                  value={stats?.currentUsageCents != null ? usd(stats.currentUsageCents) : "—"}
                />
                <StatCell
                  label="Monthly average"
                  value={stats?.monthlyAverageCents != null ? usd(stats.monthlyAverageCents) : "—"}
                />
                <StatCell
                  label="Projected end of cycle"
                  value={stats?.projectedEndOfCycleCents != null ? usd(stats.projectedEndOfCycleCents) : "—"}
                />
              </div>
            )}

            {isPrepaid && (
              <div className="flex items-center gap-2 border-border/60 border-t pt-3">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount (USD)"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className="h-8 w-32 text-13"
                />
                <Button size="sm" onClick={submitTopUp} disabled={toppingUp} className="gap-1.5">
                  <Wallet className="size-3.5" /> Top up
                </Button>
                {topUpMsg && <p className="text-11 text-muted-foreground">{topUpMsg}</p>}
              </div>
            )}

            {alertCopy && (
              <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
                <AlertTriangle className="size-4" />
                <AlertTitle className="text-13">{alertCopy}</AlertTitle>
              </Alert>
            )}

            {intelCopy && (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="space-y-0.5">
                  <p className="flex items-center gap-1.5 font-medium text-12 text-primary">
                    <Sparkles className="size-3.5 shrink-0" /> Billing intelligence
                  </p>
                  <p className="text-11 text-muted-foreground">{intelCopy}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-11"
                  onClick={() => window.open("/api/stripe/billing-portal", "_blank")}
                >
                  Review payment
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function alertText(state: FundState, overCents: number, isPrepaid: boolean): string | null {
  if (isPrepaid) {
    return state === "overdrawn" ? `Wallet overdrawn by ${usd(overCents)}` : null;
  }
  if (state === "over_limit") return `Credit buffer exceeded by ${usd(overCents)}`;
  if (state === "in_buffer") return `Past your credit limit — ${usd(overCents)} of your buffer used`;
  return null;
}

function intelligenceText(state: FundState, overCents: number, isPrepaid: boolean): string | null {
  if (isPrepaid) {
    return state === "overdrawn" ? `Add ${usd(overCents)} to bring your wallet balance back to zero.` : null;
  }
  if (state === "over_limit") {
    return `Pay ${usd(overCents)} to restore available credit and prevent new reservations from being blocked.`;
  }
  if (state === "in_buffer") {
    return `Pay ${usd(overCents)} to get back under your credit limit before the buffer runs out.`;
  }
  return null;
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/60 border-b pb-1.5">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium tabular-nums">{value}</p>
    </div>
  );
}
