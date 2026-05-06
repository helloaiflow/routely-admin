"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle, BadgeCheck, Building2, CreditCard,
  Package, RefreshCw, TrendingUp, Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
type Tenant = {
  tenant_id: number;
  company_name: string;
  email: string;
  plan_type: string;
  billing_method: string;
  billing_status?: string;
  postpay_enabled?: boolean;
  credit_limit?: number;
  credit_period?: string;
  credit_reset_day?: number;
  outstanding_amount?: number;
  packages_this_month?: number;
  miles_this_month?: number;
  price_per_stop?: number;
  price_per_mile?: number;
  xpress_base_fee?: number;
  xpress_per_mile?: number;
  stripe_customer_id?: string;
  stripe_default_payment_method?: string;
  status?: string;
  created_at?: string;
  trial_ends_at?: string;
};

type DraftStop = {
  draft_id: string;
  tracking_id: string;
  status: string;
  payment_type: string;
  payment_status: string;
  total_price: number;
  distance_miles: number | null;
  created_at: string;
  recipient_name: string;
  delivery_city: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function pct(used: number, limit: number) {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent?: "green" | "red" | "blue" | "amber";
}) {
  const colors = {
    green: "bg-green-50 text-green-600 border-green-200",
    red:   "bg-red-50 text-red-600 border-red-200",
    blue:  "bg-blue-50 text-blue-600 border-blue-200",
    amber: "bg-amber-50 text-amber-600 border-amber-200",
  };
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className={cn("flex size-8 items-center justify-center rounded-lg border", accent ? colors[accent] : "bg-muted text-muted-foreground")}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="font-bold text-2xl tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:          "bg-green-100 text-green-800",
    trialing:        "bg-blue-100 text-blue-800",
    invoiced:        "bg-amber-100 text-amber-800",
    paid:            "bg-green-100 text-green-800",
    pending:         "bg-muted text-muted-foreground",
    payment_pending: "bg-orange-100 text-orange-800",
    approved:        "bg-green-100 text-green-800",
    draft:           "bg-gray-100 text-gray-600",
    canceled:        "bg-red-100 text-red-700",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", map[status] ?? "bg-muted text-muted-foreground")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [stops, setStops] = useState<DraftStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/tenants");
      const d = await r.json();
      setTenants(d.list ?? []);
      if (d.list?.length) setSelected(d.list[0]);
    } finally { setLoading(false); }
  }

  async function loadStops(tenantId: number) {
    setStopsLoading(true);
    try {
      // Fetch draft_stops for this tenant from the data API
      const r = await fetch(`/api/data/draft-stops?tenant_id=${tenantId}`);
      if (r.ok) {
        const d = await r.json();
        setStops(d.stops ?? []);
      } else {
        setStops([]);
      }
    } catch { setStops([]); }
    finally { setStopsLoading(false); }
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    if (selected) await loadStops(selected.tenant_id);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selected) loadStops(selected.tenant_id); }, [selected]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <RefreshCw className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tenants.length) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Building2 className="size-8" />
        <p className="text-sm">No tenants found</p>
      </div>
    );
  }

  const t = selected;
  if (!t) return null;

  const creditLimit     = t.credit_limit ?? 0;
  const outstanding     = t.outstanding_amount ?? 0;
  const availableCredit = creditLimit > 0 ? creditLimit - outstanding : 0;
  const creditPct       = pct(outstanding, creditLimit);
  const isPostpay       = t.postpay_enabled ?? false;

  // Compute outstanding from stops accurately
  // (overrides tenant field if stops are available)
  const invoicedStops = stops.filter((s) =>
    (s.payment_status === "invoiced" || (s.status === "approved" && s.payment_type === "postpay")) &&
    s.payment_status !== "paid"
  );
  const invoicedTotal = invoicedStops.reduce((sum, s) => sum + (s.total_price ?? 0), 0);

  const totalMiles = stops.reduce((sum, s) => sum + (s.distance_miles ?? 0), 0);
  const totalStops = stops.filter((s) => s.status !== "draft" && s.status !== "canceled").length;
  const totalBilled = stops
    .filter((s) => s.status !== "draft" && s.status !== "canceled")
    .reduce((sum, s) => sum + (s.total_price ?? 0), 0);

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Tenant Billing</h1>
          <p className="text-muted-foreground text-sm">Manage billing, credit limits, and usage</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("mr-1.5 size-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tenant selector */}
      {tenants.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {tenants.map((t) => (
            <button key={t.tenant_id} type="button"
              onClick={() => setSelected(t)}
              className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                selected?.tenant_id === t.tenant_id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted/40")}>
              <Building2 className="size-3.5" />
              {t.company_name}
            </button>
          ))}
        </div>
      )}

      {/* ── SECTION 1: Billing Summary ────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 font-semibold text-sm text-muted-foreground uppercase tracking-wide">Billing Summary — {t.company_name}</h2>

        {/* Top warning banner if credit exceeded */}
        {isPostpay && outstanding > creditLimit && creditLimit > 0 && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <AlertCircle className="size-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-red-800">Credit Limit Exceeded</p>
              <p className="text-xs text-red-600 mt-0.5">
                Outstanding balance ({fmt(outstanding)}) exceeds credit limit ({fmt(creditLimit)}).
                New post-pay orders will be blocked — payment required before approval.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Billing Status" icon={BadgeCheck}
            value={t.billing_status ?? t.status ?? "active"}
            sub={`Plan: ${t.plan_type ?? "trial"}`}
            accent={t.status === "active" ? "green" : "amber"} />
          <KpiCard label="Credit Limit" icon={CreditCard}
            value={fmt(creditLimit)}
            sub={`${t.credit_period ?? "monthly"} · resets day ${t.credit_reset_day ?? 1}`}
            accent="blue" />
          <KpiCard label="Outstanding Balance" icon={Wallet}
            value={fmt(outstanding)}
            sub={stops.length ? `${fmt(invoicedTotal)} from ${invoicedStops.length} invoiced stop(s)` : "From tenant record"}
            accent={outstanding > 0 ? "amber" : "green"} />
          <KpiCard label="Available Credit" icon={TrendingUp}
            value={isPostpay ? fmt(availableCredit) : "N/A (Prepay)"}
            sub={isPostpay ? `${creditPct}% used` : "Pay-before-dispatch mode"}
            accent={availableCredit < 0 ? "red" : "green"} />
        </div>

        {/* Credit usage bar */}
        {isPostpay && creditLimit > 0 && (
          <div className="mt-4 rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">Credit Usage</span>
              <span className="tabular-nums">{fmt(outstanding)} / {fmt(creditLimit)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all",
                  creditPct >= 90 ? "bg-red-500" : creditPct >= 70 ? "bg-amber-500" : "bg-green-500")}
                style={{ width: `${creditPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>$0</span>
              <span className="font-medium text-foreground">{creditPct}% used</span>
              <span>{fmt(creditLimit)}</span>
            </div>
          </div>
        )}
      </section>

      {/* ── SECTION 2: Billing Configuration ─────────────────────────────── */}
      <section>
        <h2 className="mb-3 font-semibold text-sm text-muted-foreground uppercase tracking-wide">Billing Configuration</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <p className="font-semibold text-sm">Payment Settings</p>
            {[
              { label: "Payment Type",    value: isPostpay ? "Post-Pay (Invoice)" : "Pre-Pay (Stripe)" },
              { label: "Billing Cycle",   value: t.credit_period ?? "monthly" },
              { label: "Credit Limit",    value: fmt(creditLimit) },
              { label: "Reset Day",       value: `Day ${t.credit_reset_day ?? 1} of ${t.credit_period ?? "month"}` },
              { label: "Stripe Customer", value: t.stripe_customer_id ? `…${t.stripe_customer_id.slice(-8)}` : "Not set" },
              { label: "Payment Method",  value: t.stripe_default_payment_method ? "On file" : "None" },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                <span className="text-xs text-muted-foreground">{r.label}</span>
                <span className="font-medium text-xs">{r.value}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <p className="font-semibold text-sm">Rate Configuration</p>
            {[
              { label: "Next Day — Stop Fee",  value: fmt(t.price_per_stop ?? 0) },
              { label: "Next Day — Per Mile",  value: `${fmt(t.price_per_mile ?? 0)}/mi` },
              { label: "Xpress — Base Fee",    value: fmt(t.xpress_base_fee ?? 0) },
              { label: "Xpress — Per Mile",    value: `${fmt(t.xpress_per_mile ?? 0)}/mi` },
              { label: "Post-Pay Enabled",     value: isPostpay ? "✅ Yes" : "❌ No" },
              { label: "Approval Mode",        value: isPostpay ? "Auto-approve (within credit)" : "Pay before dispatch" },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                <span className="text-xs text-muted-foreground">{r.label}</span>
                <span className="font-medium text-xs">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 3: Usage Summary ──────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 font-semibold text-sm text-muted-foreground uppercase tracking-wide">Usage Summary</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total Stops" icon={Package}
            value={totalStops.toString()}
            sub="Approved + dispatched"
            accent="blue" />
          <KpiCard label="Packages This Month" icon={Package}
            value={(t.packages_this_month ?? 0).toString()}
            sub="From tenant counter"
            accent="blue" />
          <KpiCard label="Total Miles" icon={TrendingUp}
            value={`${totalMiles.toFixed(1)} mi`}
            sub={`${(t.miles_this_month ?? 0).toFixed(1)} mi this month`}
            accent="blue" />
          <KpiCard label="Total Billed" icon={Wallet}
            value={fmt(totalBilled)}
            sub={`${fmt(invoicedTotal)} outstanding`}
            accent={invoicedTotal > 0 ? "amber" : "green"} />
        </div>
      </section>

      {/* ── SECTION 4: Recent Activity ────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Recent Stop Activity</h2>
          {stopsLoading && <RefreshCw className="size-3.5 animate-spin text-muted-foreground" />}
        </div>

        {stops.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed text-muted-foreground text-sm">
            {stopsLoading ? "Loading activity..." : "No stop activity found"}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left">
                  {["Draft ID", "Tracking", "Recipient", "City", "Status", "Payment", "Amount", "Miles", "Date"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {stops.slice(0, 25).map((s) => (
                  <tr key={s.draft_id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs">{s.draft_id}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{s.tracking_id || "—"}</td>
                    <td className="px-3 py-2 font-medium text-xs max-w-[120px] truncate">{s.recipient_name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{s.delivery_city}</td>
                    <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                    <td className="px-3 py-2"><StatusBadge status={s.payment_status ?? s.payment_type ?? "—"} /></td>
                    <td className="px-3 py-2 font-semibold text-xs tabular-nums">{fmt(s.total_price ?? 0)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{s.distance_miles != null ? `${s.distance_miles} mi` : "—"}</td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground whitespace-nowrap">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stops.length > 25 && (
              <div className="border-t px-3 py-2.5 text-center text-xs text-muted-foreground bg-muted/10">
                Showing 25 of {stops.length} stops
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── SECTION 5: Billing Rules ──────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 font-semibold text-sm text-muted-foreground uppercase tracking-wide">Billing Validation Rules</h2>
        <div className="rounded-xl border bg-card p-4 space-y-3">
          {[
            {
              label: "Order Approval Mode",
              status: isPostpay ? "postpay" : "prepay",
              desc: isPostpay
                ? "Post-pay: orders auto-approved if outstanding + order ≤ credit_limit"
                : "Pre-pay: Stripe payment required before dispatch",
              ok: true,
            },
            {
              label: "Credit Limit Enforcement",
              status: creditLimit > 0 ? "enforced" : "none",
              desc: creditLimit > 0
                ? `Limit: ${fmt(creditLimit)} · Available: ${fmt(availableCredit)}`
                : "No credit limit set — post-pay orders will be blocked (require payment)",
              ok: creditLimit > 0,
            },
            {
              label: "Outstanding Balance",
              status: outstanding > 0 ? "balance" : "clear",
              desc: outstanding > 0
                ? `${fmt(outstanding)} unpaid · ${invoicedStops.length} invoiced stop(s)`
                : "No outstanding balance",
              ok: outstanding <= creditLimit || !isPostpay,
            },
            {
              label: "Available Credit Status",
              status: availableCredit > 0 ? "available" : "exhausted",
              desc: isPostpay
                ? availableCredit > 0
                  ? `${fmt(availableCredit)} available for new orders`
                  : "Credit exhausted — next order will require card payment"
                : "N/A (tenant uses pre-pay mode)",
              ok: !isPostpay || availableCredit > 0,
            },
          ].map((rule) => (
            <div key={rule.label} className="flex items-start gap-3 rounded-lg bg-muted/20 p-3">
              <div className={cn("mt-0.5 size-2 rounded-full shrink-0", rule.ok ? "bg-green-500" : "bg-red-500")} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{rule.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{rule.desc}</p>
              </div>
              <Badge variant="secondary" className="shrink-0 text-[10px]">{rule.status}</Badge>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
