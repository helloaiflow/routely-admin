"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

/* R26a Part B — Admin A09 "Drivers → Payouts". Calls routely-api's Payouts P1
 * prod-sandbox module (feat/r37-payouts-prod) through this app's own
 * /api/client/payouts/* server routes (X-API-Key+X-Actor stays server-side,
 * never shipped to the browser — see src/lib/payouts-api.ts). Sandbox Stripe
 * mode only; GO_LIVE stays false on the backend. */

type Driver = { id: string; name: string | null; status: string | null };

type PayoutStatus = {
  status?: "not_started" | "pending" | "restricted" | "enabled";
  payouts_held?: boolean;
  requirements?: Record<string, unknown>;
};

type LedgerEntry = {
  id: number;
  amount_cents: number;
  kind: string;
  job_ref: string | null;
  reason: string | null;
  created_at: string;
};
type Ledger = { balance_cents: number; available_cents: number; entries: LedgerEntry[] };

type DriverRow = {
  driver: Driver;
  status: PayoutStatus | null;
  ledger: Ledger | null;
  loading: boolean;
};

type RunResult = { driver_id: string; amount_cents: number; status: string; transfer_id: string | null };

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

function apiErrorMessage(data: Record<string, unknown>, fallback: string): string {
  const detail = data.detail as { message?: string } | undefined;
  return (detail?.message as string) ?? (data.error as string) ?? fallback;
}

function money(cents: number | undefined | null): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

function statusBadgeVariant(status?: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "enabled":
      return "default";
    case "restricted":
      return "destructive";
    case "pending":
      return "secondary";
    default:
      return "outline";
  }
}

export function PayoutsShell() {
  const [rows, setRows] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [runBusy, setRunBusy] = useState<"dry" | "live" | null>(null);
  const [runResults, setRunResults] = useState<{ week: string; dryRun: boolean; results: RunResult[] } | null>(null);

  const [earningOpen, setEarningOpen] = useState<string | null>(null);
  const [earningRouteRef, setEarningRouteRef] = useState("");
  const [earningAmount, setEarningAmount] = useState("");
  const [earningNote, setEarningNote] = useState("");

  const [adjustOpen, setAdjustOpen] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const [holdReasonOpen, setHoldReasonOpen] = useState<string | null>(null);
  const [holdReason, setHoldReason] = useState("");

  const [busy, setBusy] = useState(false);

  const loadDriverPayouts = useCallback(async (driver: Driver): Promise<DriverRow> => {
    const [statusRes, ledgerRes] = await Promise.all([
      fetch(`/api/client/payouts/${driver.id}/status`).then((r) => r.json().catch(() => null)),
      fetch(`/api/client/payouts/${driver.id}/ledger`).then((r) => r.json().catch(() => null)),
    ]);
    return { driver, status: statusRes, ledger: ledgerRes, loading: false };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/client/drivers");
      const data = await res.json();
      const drivers: Driver[] = Array.isArray(data?.drivers)
        ? data.drivers.map((d: { id: string; name: string | null; status: string | null }) => ({
            id: d.id,
            name: d.name,
            status: d.status,
          }))
        : [];
      const loaded = await Promise.all(drivers.map((d) => loadDriverPayouts(d)));
      setRows(loaded);
    } catch {
      toast.error("Could not load drivers");
    } finally {
      setLoading(false);
    }
  }, [loadDriverPayouts]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const kpis = useMemo(() => {
    let totalAvailable = 0;
    let totalBalance = 0;
    let enabled = 0;
    let pending = 0;
    let restricted = 0;
    let notStarted = 0;
    for (const row of rows) {
      totalAvailable += row.ledger?.available_cents ?? 0;
      totalBalance += row.ledger?.balance_cents ?? 0;
      switch (row.status?.status) {
        case "enabled":
          enabled++;
          break;
        case "restricted":
          restricted++;
          break;
        case "pending":
          pending++;
          break;
        default:
          notStarted++;
      }
    }
    return { totalAvailable, totalBalance, enabled, pending, restricted, notStarted };
  }, [rows]);

  async function submitRouteEarning() {
    if (!earningOpen) return;
    const amountCents = Math.round(Number.parseFloat(earningAmount || "0") * 100);
    if (!earningRouteRef.trim() || !Number.isFinite(amountCents) || amountCents <= 0) {
      toast.error("Route reference and a positive amount are required");
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await postJson(`/api/client/payouts/${earningOpen}/route-earning`, {
        route_ref: earningRouteRef.trim(),
        amount_cents: amountCents,
        note: earningNote.trim() || null,
      });
      if (!ok) throw new Error(apiErrorMessage(data, "Add route earning failed"));
      toast.success(`${money(amountCents)} route earning recorded`);
      setEarningOpen(null);
      setEarningRouteRef("");
      setEarningAmount("");
      setEarningNote("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add route earning failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitAdjustment() {
    if (!adjustOpen) return;
    const amountCents = Math.round(Number.parseFloat(adjustAmount || "0") * 100);
    if (!Number.isFinite(amountCents) || amountCents === 0 || !adjustReason.trim()) {
      toast.error("A non-zero amount and a reason are required");
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await postJson(`/api/client/payouts/${adjustOpen}/adjustment`, {
        amount_cents: amountCents,
        reason: adjustReason.trim(),
      });
      if (!ok) throw new Error(apiErrorMessage(data, "Adjustment failed"));
      toast.success("Adjustment recorded");
      setAdjustOpen(null);
      setAdjustAmount("");
      setAdjustReason("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Adjustment failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleHold(driverId: string, held: boolean, reason?: string) {
    setBusy(true);
    try {
      const { ok, data } = await postJson(`/api/client/payouts/${driverId}/hold`, { held, reason: reason ?? null });
      if (!ok) throw new Error(apiErrorMessage(data, "Hold update failed"));
      toast.success(held ? "Payouts held" : "Hold released");
      setHoldReasonOpen(null);
      setHoldReason("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hold update failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPayouts(dryRun: boolean) {
    setRunBusy(dryRun ? "dry" : "live");
    try {
      const { ok, data } = await postJson("/api/client/payouts/run", { dry_run: dryRun });
      if (!ok) throw new Error(apiErrorMessage(data, "Run failed"));
      setRunResults({
        week: data.week as string,
        dryRun: data.dry_run as boolean,
        results: (data.results as RunResult[]) ?? [],
      });
      toast.success(dryRun ? "Dry run complete" : "Monday payouts run complete");
      if (!dryRun) await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Drivers → Payouts</h1>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={runBusy !== null} onClick={() => runPayouts(true)}>
            {runBusy === "dry" ? "Running…" : "Dry run"}
          </Button>
          <Button type="button" variant="destructive" disabled={runBusy !== null} onClick={() => runPayouts(false)}>
            {runBusy === "live" ? "Running…" : "Run Monday payouts"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Available now</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{money(kpis.totalAvailable)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total ledger balance</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{money(kpis.totalBalance)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Enabled</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{kpis.enabled}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pending / restricted</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {kpis.pending} / {kpis.restricted}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Not started</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{kpis.notStarted}</CardContent>
        </Card>
      </div>

      {runResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {runResults.dryRun ? "Dry run" : "Live run"} — week {runResults.week}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Transfer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runResults.results.map((r) => (
                  <TableRow key={r.driver_id}>
                    <TableCell className="font-mono text-xs">{r.driver_id}</TableCell>
                    <TableCell>{money(r.amount_cents)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.transfer_id ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Earned</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Stripe status</TableHead>
                <TableHead>Hold</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No drivers yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.driver.id}>
                  <TableCell>
                    <div className="font-medium">{row.driver.name ?? "—"}</div>
                    <div className="font-mono text-xs text-muted-foreground">{row.driver.id}</div>
                  </TableCell>
                  <TableCell>{money(row.ledger?.balance_cents)}</TableCell>
                  <TableCell>{money(row.ledger?.available_cents)}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(row.status?.status)}>{row.status?.status ?? "unknown"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.status?.payouts_held ?? false}
                      disabled={busy}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setHoldReasonOpen(row.driver.id);
                        } else {
                          toggleHold(row.driver.id, false);
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setEarningOpen(row.driver.id)}>
                      Add route earning
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setAdjustOpen(row.driver.id)}>
                      Adjustment
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add route earning dialog (B5) */}
      <Dialog open={earningOpen !== null} onOpenChange={(open) => !busy && !open && setEarningOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add route earning</DialogTitle>
            <DialogDescription>
              Interim path while the Spoke route-completion webhook doesn&apos;t exist yet (see TASKS.md — R26b).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="route-ref">Route reference</Label>
              <Input
                id="route-ref"
                value={earningRouteRef}
                onChange={(e) => setEarningRouteRef(e.target.value)}
                placeholder="RTE-..."
              />
            </div>
            <div>
              <Label htmlFor="route-amount">Amount (USD)</Label>
              <Input
                id="route-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={earningAmount}
                onChange={(e) => setEarningAmount(e.target.value)}
                placeholder="20.00"
              />
            </div>
            <div>
              <Label htmlFor="route-note">Note (optional)</Label>
              <Textarea id="route-note" value={earningNote} onChange={(e) => setEarningNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEarningOpen(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={submitRouteEarning} disabled={busy}>
              Add earning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjustment dialog (B7) — amount can be negative (deduction) or positive (bonus); reason always required */}
      <Dialog open={adjustOpen !== null} onOpenChange={(open) => !busy && !open && setAdjustOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjustment</DialogTitle>
            <DialogDescription>
              Writes a reason-required, staff-attributed ledger adjustment. There is no way to fake a route earning from
              here — use &quot;Add route earning&quot; for that.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="adjust-amount">Amount (USD, negative to deduct)</Label>
              <Input
                id="adjust-amount"
                type="number"
                step="0.01"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="-10.00"
              />
            </div>
            <div>
              <Label htmlFor="adjust-reason">Reason (required)</Label>
              <Textarea id="adjust-reason" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAdjustOpen(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={submitAdjustment} disabled={busy}>
              Save adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hold reason dialog — only shown when turning hold ON */}
      <Dialog open={holdReasonOpen !== null} onOpenChange={(open) => !busy && !open && setHoldReasonOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hold payouts</DialogTitle>
            <DialogDescription>
              Pauses this driver&apos;s Monday automatic sweep. Balance is untouched.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="hold-reason">Reason (required)</Label>
            <Textarea id="hold-reason" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setHoldReasonOpen(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !holdReason.trim()}
              onClick={() => holdReasonOpen && toggleHold(holdReasonOpen, true, holdReason.trim())}
            >
              Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
