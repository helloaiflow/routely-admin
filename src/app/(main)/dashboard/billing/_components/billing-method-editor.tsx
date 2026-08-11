"use client";

import { useEffect, useState } from "react";

import { AlertTriangle, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import type { Fund } from "./billing-radial";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

type Suggestion = { suggested_limit_cents: number };

/* The ONLY write path for postpay_enabled/credit_limit (2026-08-11) — PATCH
 * /rates used to do this directly with no audit trail and no approval gate;
 * that's retired. This calls POST /api/client/billing/billing-method, which
 * proxies to routely-api's dual-approval-aware endpoint and enforces the
 * debt rules already built: Postpaid->Prepaid is refused outright while
 * unpaid ledger > 0 unless explicitly overridden (which then ALWAYS needs a
 * second approver, independent of amount); Prepaid->Postpaid is hard-blocked
 * on a negative wallet balance with no override at all — a negative wallet
 * has no home once postpaid billing stops reading it, so there's no safe way
 * to carry it forward yet. Both are enforced server-side regardless of what
 * this component does; the checks here are just so the consequence is
 * stated PLAINLY before the request is even sent, not discovered from a
 * rejected API call. */
export function BillingMethodEditor({
  postpayEnabled,
  creditLimitCents,
  fund,
  onChanged,
}: {
  postpayEnabled: boolean;
  creditLimitCents: number;
  fund: Fund | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftPostpay, setDraftPostpay] = useState(postpayEnabled);
  const [draftLimit, setDraftLimit] = useState((creditLimitCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: "error" | "blocked" | "pending" | "ok"; message: string } | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftPostpay(postpayEnabled);
    setReason("");
    setAcknowledged(false);
    setResult(null);
    fetch("/api/client/billing/credit-suggestions")
      .then((r) => r.json())
      .then((d) => {
        const sug = (d.rows ?? [])[0] as Suggestion | undefined;
        setSuggestion(sug ?? null);
        const prefillCents = sug?.suggested_limit_cents ?? creditLimitCents;
        setDraftLimit((prefillCents / 100).toFixed(2));
      })
      .catch(() => setDraftLimit((creditLimitCents / 100).toFixed(2)));
  }, [open, postpayEnabled, creditLimitCents]);

  const switchingToPrepaid = postpayEnabled && !draftPostpay;
  const switchingToPostpaid = !postpayEnabled && draftPostpay;
  const unpaidLedgerCents = fund?.fund_type === "postpaid" ? fund.unpaid_ledger_cents : 0;
  const walletBalanceCents = fund?.fund_type === "prepaid" ? fund.balance_cents : 0;
  const hasDebtBlock = switchingToPrepaid && unpaidLedgerCents > 0;
  const hasWalletBlock = switchingToPostpaid && walletBalanceCents < 0;
  const noChange = draftPostpay === postpayEnabled && (!draftPostpay || Number(draftLimit) * 100 === creditLimitCents);

  async function submit() {
    setSubmitting(true);
    setResult(null);
    try {
      const r = await fetch("/api/client/billing/billing-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postpay_enabled: draftPostpay,
          credit_limit: draftPostpay ? Number(draftLimit) : undefined,
          override_existing_debt: hasDebtBlock && acknowledged,
          reason,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        if (d.status === "pending_approval") {
          setResult({
            kind: "pending",
            message: "Submitted for approval — a second approver must sign off before this takes effect.",
          });
        } else {
          setResult({ kind: "ok", message: "Updated." });
          onChanged();
        }
      } else {
        const detail = d?.detail?.detail ?? d?.detail ?? d?.error ?? "Request failed.";
        setResult({
          kind: d?.detail?.error === "negative_wallet_balance_blocks_switch" ? "blocked" : "error",
          message: String(detail),
        });
      }
    } catch {
      setResult({ kind: "error", message: "Network error — nothing was changed." });
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !noChange && reason.trim().length > 0 && !hasWalletBlock && (!hasDebtBlock || acknowledged) && !submitting;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setResult(null);
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="flex items-center gap-1 text-left hover:underline">
          <Badge variant={postpayEnabled ? "outline" : "secondary"} className="capitalize">
            {postpayEnabled ? "postpaid" : "prepaid"}
          </Badge>
          <Pencil className="size-3 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Billing method</DialogTitle>
          <DialogDescription>
            Changes are audited and, above a configured amount or when carrying debt forward, require a second approver.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div>
              <p className="font-medium text-13">{draftPostpay ? "Postpaid" : "Prepaid"}</p>
              <p className="text-11 text-muted-foreground">
                {draftPostpay ? "Billed on a credit line, invoiced per cycle" : "Draws down a pre-funded balance"}
              </p>
            </div>
            <Switch checked={draftPostpay} onCheckedChange={setDraftPostpay} />
          </div>

          {draftPostpay && (
            <div className="space-y-1.5">
              <Label htmlFor="credit-limit" className="text-12">
                Credit limit
              </Label>
              <Input
                id="credit-limit"
                type="number"
                min="0"
                step="1"
                value={draftLimit}
                onChange={(e) => setDraftLimit(e.target.value)}
                className="h-9"
              />
              {suggestion && (
                <p className="text-10 text-muted-foreground">
                  Prefilled with the system's current suggestion — overridable.
                </p>
              )}
            </div>
          )}

          {hasDebtBlock && (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="flex items-center gap-1.5 text-13 text-destructive">
                <AlertTriangle className="size-3.5 shrink-0" /> {usd(unpaidLedgerCents)} in unpaid ledger charges and/or
                open invoices
              </p>
              <p className="text-11 text-muted-foreground">
                Switching to prepaid does not clear this debt — it stays due on its original terms and keeps showing on
                Charges/Overview regardless of method. Settle it first, or acknowledge and proceed anyway (this will
                require a second approver, regardless of amount).
              </p>
              <div className="flex items-center gap-2">
                <Checkbox id="ack" checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} />
                <Label htmlFor="ack" className="text-11 leading-snug">
                  I understand the {usd(unpaidLedgerCents)} debt is not cleared and will carry forward.
                </Label>
              </div>
            </div>
          )}

          {hasWalletBlock && (
            <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="flex items-center gap-1.5 text-13 text-destructive">
                <AlertTriangle className="size-3.5 shrink-0" /> Wallet is {usd(-walletBalanceCents)} overdrawn
              </p>
              <p className="text-11 text-muted-foreground">
                No override here — postpaid billing never reads the wallet balance, so that debt would stop being
                visible anywhere. Top up to $0 or more first.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-12">
              Reason
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this changing?"
              className="min-h-16 text-13"
            />
          </div>

          {result && (
            <p
              className={`text-12 ${result.kind === "ok" ? "text-success" : result.kind === "pending" ? "text-warning" : "text-destructive"}`}
            >
              {result.message}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting ? "Submitting…" : "Confirm change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
