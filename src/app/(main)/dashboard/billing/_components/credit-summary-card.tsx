"use client";

import { useEffect, useState } from "react";

import { AlertTriangle, Lock, Sparkles, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { BillingRadial, classifyFund, type Fund } from "./billing-radial";

type Suggestion = {
  id: number;
  suggested_limit_cents: number;
  current_limit_cents: number;
  inputs: Record<string, unknown>;
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/* RIGHT card — everything about credit (Section 2). Replaces the old
 * FundPanel two-card pair: the breakdown table lives here alongside the
 * radial (Section 5) instead of duplicated across two separate cards, and
 * the credit-limit suggestion folds in as a compact inline action instead
 * of occupying half a viewport for one line of placeholder text most of
 * the time. Buffer math corrected 2026-08-11 — see billing-radial.tsx and
 * app/services/fund.py: the buffer is headroom BEYOND the limit, not a
 * carve-out of it, so available_cents is relative to the plain limit and
 * "over limit" is stated relative to limit+buffer (the hard ceiling). */
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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [computing, setComputing] = useState(false);

  function loadSuggestions() {
    fetch("/api/client/billing/credit-suggestions")
      .then((r) => r.json())
      .then((d) => setSuggestions(d.rows ?? []))
      .catch(() => {
        /* best-effort */
      });
  }

  useEffect(loadSuggestions, []);

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

  async function computeSuggestion() {
    setComputing(true);
    try {
      await fetch("/api/client/billing/credit-suggestions", { method: "POST" });
      loadSuggestions();
    } finally {
      setComputing(false);
    }
  }

  async function decideSuggestion(id: number, approve: boolean) {
    await fetch(`/api/client/billing/credit-suggestions/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    loadSuggestions();
  }

  if (!fund) return <Skeleton className="h-96 rounded-2xl" />;
  const isPrepaid = fund.fund_type === "prepaid";
  const c = classifyFund(fund);

  return (
    <Card>
      <CardHeader className="pb-1.5">
        <CardTitle className="flex items-center gap-1.5 text-13 text-muted-foreground">
          <Wallet className="size-3.5" /> {isPrepaid ? "Prepaid balance" : "Available credit"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <BillingRadial fund={fund} stats={stats} />

        {(c.state === "in_buffer" || c.state === "over_limit" || c.state === "overdrawn") && (
          <p className="flex items-center gap-1.5 text-11 text-destructive">
            <AlertTriangle className="size-3.5 shrink-0" />
            {c.state === "over_limit" && `Buffer consumed — ${usd(c.overCents)} past the hard ceiling`}
            {c.state === "in_buffer" && `Past your credit limit — ${usd(c.overCents)} of your buffer used`}
            {c.state === "overdrawn" && `Wallet overdrawn by ${usd(c.overCents)} — add funds`}
          </p>
        )}

        {isPrepaid ? (
          <div className="space-y-2 border-border/60 border-t pt-3">
            {fund.held_cents > 0 && (
              <p className="flex items-center gap-1 text-11 text-muted-foreground">
                <Lock className="size-3" /> {usd(fund.held_cents)} held in active reservations
              </p>
            )}
            <div className="flex items-center gap-2">
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
            </div>
            {topUpMsg && <p className="text-11 text-muted-foreground">{topUpMsg}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-border/60 border-t pt-3 text-11 text-muted-foreground">
            <span>Credit limit</span>
            <span className="text-right tabular-nums">{usd(fund.credit_limit_cents)}</span>
            <span className="flex items-center gap-1">
              <Lock className="size-3" /> Buffer beyond limit (10%)
            </span>
            <span className="text-right tabular-nums">{usd(fund.buffer_cents)}</span>
            <span>Reserved (active)</span>
            <span className="text-right tabular-nums">{usd(fund.reserved_cents)}</span>
            <span>Unpaid ledger</span>
            <span className="text-right tabular-nums">{usd(fund.unpaid_ledger_cents)}</span>
          </div>
        )}

        {fund.active_reservations.length > 0 && (
          <div className="space-y-1 border-border/60 border-t pt-2">
            <p className="flex items-center gap-1 text-10 text-muted-foreground uppercase tracking-wide">
              <Lock className="size-3" /> Active reservations ({fund.active_reservations.length})
            </p>
            {fund.active_reservations.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-11">
                <span className="font-mono text-muted-foreground">{r.stop_id}</span>
                <span className="tabular-nums">{usd(r.reserved_cents)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="border-border/60 border-t pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-11 text-muted-foreground">
              <Sparkles className="size-3.5" /> Credit-limit suggestion
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={computeSuggestion}
              disabled={computing}
              className="h-7 text-11"
            >
              Compute
            </Button>
          </div>
          {suggestions.length === 0 ? (
            <p className="text-10 text-muted-foreground">
              No pending suggestion — based on payment punctuality, tenure, and growth; an admin always approves before
              it applies.
            </p>
          ) : (
            suggestions.map((s) => (
              <div key={s.id} className="space-y-2 rounded-lg border border-border/60 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-12">
                    {usd(s.current_limit_cents)} <span className="text-muted-foreground">→</span>{" "}
                    <span className="font-semibold">{usd(s.suggested_limit_cents)}</span>
                  </span>
                  <Badge variant="outline" className="text-10">
                    pending
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-10 text-muted-foreground">
                  {Object.entries(s.inputs).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span>{k.replace(/_/g, " ")}</span>
                      <span className="tabular-nums">{String(v)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 flex-1 text-11" onClick={() => decideSuggestion(s.id, true)}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 flex-1 text-11"
                    onClick={() => decideSuggestion(s.id, false)}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
