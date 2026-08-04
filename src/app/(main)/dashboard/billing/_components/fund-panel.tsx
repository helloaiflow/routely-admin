"use client";

import { useEffect, useState } from "react";

import { AlertTriangle, Lock, Sparkles, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

type Reservation = {
  id: number;
  stop_id: string;
  resolved_type: string;
  reserved_cents: number;
  reserved_units: number | null;
  created_at: string;
};

type Fund =
  | {
      fund_type: "prepaid";
      balance_cents: number;
      held_cents: number;
      available_cents: number;
      low_balance_threshold_cents: number;
      active_reservations: Reservation[];
    }
  | {
      fund_type: "postpaid";
      credit_limit_cents: number;
      buffer_cents: number;
      reserved_cents: number;
      unpaid_ledger_cents: number;
      available_cents: number;
      alert_threshold_pct: number;
      active_reservations: Reservation[];
    };

type Suggestion = {
  id: number;
  suggested_limit_cents: number;
  current_limit_cents: number;
  inputs: Record<string, unknown>;
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/* Balance & credit engine (billing v4) — Reserve → Charge → Release. Fund
 * card is deliberately separate from the Phase 1 KPI cards (which show
 * ledger-derived "amount due") since this shows the FORWARD-looking
 * available capacity, not the backward-looking uninvoiced total. */
export function FundPanel() {
  const [fund, setFund] = useState<Fund | null>(null);
  const [loading, setLoading] = useState(true);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [toppingUp, setToppingUp] = useState(false);
  const [topUpMsg, setTopUpMsg] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [computing, setComputing] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/client/billing/fund")
      .then((r) => r.json())
      .then(setFund)
      .catch(() => {
        /* best-effort — card shows nothing rather than a broken partial state */
      })
      .finally(() => setLoading(false));
    fetch("/api/client/billing/credit-suggestions")
      .then((r) => r.json())
      .then((d) => setSuggestions(d.rows ?? []))
      .catch(() => {
        /* best-effort */
      });
  }

  useEffect(load, []);

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
      load();
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
    load();
  }

  if (loading) return <Skeleton className="h-48 rounded-2xl" />;
  if (!fund) return null;

  const isPrepaid = fund.fund_type === "prepaid";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-1.5">
          <CardTitle className="flex items-center gap-1.5 text-13 text-muted-foreground">
            <Wallet className="size-3.5" /> {isPrepaid ? "Prepaid balance" : "Available credit"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isPrepaid ? (
            <>
              <span className="font-bold text-2xl tabular-nums">{usd(fund.balance_cents)}</span>
              {fund.held_cents > 0 && (
                <p className="flex items-center gap-1 text-11 text-muted-foreground">
                  <Lock className="size-3" /> {usd(fund.held_cents)} held in active reservations ·{" "}
                  {usd(fund.available_cents)} available
                </p>
              )}
              {fund.available_cents <= fund.low_balance_threshold_cents && (
                <p className="flex items-center gap-1 text-11 text-destructive">
                  <AlertTriangle className="size-3" /> Low balance — top up to keep deliveries running
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
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
            </>
          ) : (
            <>
              <span className="font-bold text-2xl tabular-nums">{usd(fund.available_cents)}</span>
              <Progress
                value={Math.min(
                  100,
                  ((fund.credit_limit_cents - fund.available_cents - fund.buffer_cents) / fund.credit_limit_cents) *
                    100,
                )}
                className="h-2"
              />
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-11 text-muted-foreground">
                <span>Credit limit</span>
                <span className="text-right tabular-nums">{usd(fund.credit_limit_cents)}</span>
                <span className="flex items-center gap-1">
                  <Lock className="size-3" /> Buffer (10%)
                </span>
                <span className="text-right tabular-nums">{usd(fund.buffer_cents)}</span>
                <span>Reserved (active)</span>
                <span className="text-right tabular-nums">{usd(fund.reserved_cents)}</span>
                <span>Unpaid ledger</span>
                <span className="text-right tabular-nums">{usd(fund.unpaid_ledger_cents)}</span>
              </div>
              {fund.available_cents < 0 && (
                <p className="flex items-center gap-1 text-11 text-destructive">
                  <AlertTriangle className="size-3" /> Buffer consumed — {usd(Math.abs(fund.available_cents))} over
                  limit
                </p>
              )}
            </>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-1.5">
          <CardTitle className="flex items-center gap-1.5 text-13 text-muted-foreground">
            <Sparkles className="size-3.5" /> Credit-limit suggestion
          </CardTitle>
          <Button size="sm" variant="outline" onClick={computeSuggestion} disabled={computing}>
            Compute
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {suggestions.length === 0 ? (
            <p className="text-11 text-muted-foreground">
              No pending suggestion. The system suggests based on payment punctuality, tenure, and growth — the admin
              always approves before it applies.
            </p>
          ) : (
            suggestions.map((s) => (
              <div key={s.id} className="space-y-2 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-13">
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
                  <Button size="sm" className="flex-1" onClick={() => decideSuggestion(s.id, true)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => decideSuggestion(s.id, false)}>
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
