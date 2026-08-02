"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import {
  AlertCircle,
  Check,
  CircleCheck,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  Package,
  Receipt,
  Settings2,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { type BillingCharges, type BillingData, money, PAYMENT_TERMS, shortDate } from "./settings-types";

/* GET /api/client/billing/summary (2026-08-02) — see route for the full
 * data-source rationale. Two distinct money flows, kept distinct: delivery
 * charges (billing_ledger) vs shipping label spend (label_orders). */
type BillingSummary = {
  amount_due_cents: number;
  delivery_this_month_cents: number;
  delivery_last_month_cents: number;
  labels_this_month_cents: number;
  labels_last_month_cents: number;
  outstanding_old_uninvoiced_cents: number;
  outstanding_old_uninvoiced_count: number;
  charges_by_type: Record<string, { lines: number; amount_cents: number; qty: number }>;
  failed_attempts: { failed: number; total: number };
  delivery_series_30d: { date: string; amount_cents: number }[];
  recent_charges: {
    id: number;
    stop_id: string;
    recipient_name: string;
    date: string;
    resolved_type: string;
    outcome: string;
    amount_cents: number | null;
    invoiced_at: string | null;
    flagged: boolean;
  }[];
};
const centsToUsd = (c: number | null | undefined) => money(typeof c === "number" ? c / 100 : null);
const TYPE_LABEL: Record<string, string> = { package: "Packages", miles: "Miles", on_demand: "On-Demand" };
const TYPE_COLOR: Record<string, string> = {
  package: "bg-primary",
  miles: "bg-[var(--chart-2)]",
  on_demand: "bg-[var(--chart-3)]",
};
/* Delta vs last period — same up/down/flat convention throughout the KPI
 * row. Flat (both zero, or unchanged) shows neither arrow nor color. */
function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return <span className="text-11 text-muted-foreground">new this month</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="text-11 text-muted-foreground">flat vs last month</span>;
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-11", up ? "text-success" : "text-destructive")}>
      <Icon className="size-3" aria-hidden="true" />
      {Math.abs(pct)}% vs last month
    </span>
  );
}

/* Interactive bar chart — same pattern as the Shipping Labels overview. */
const barConfig = {
  spend: { label: "Spent", color: "var(--primary)" },
  count: { label: "Labels", color: "var(--chart-2)" },
} satisfies ChartConfig;
type BarMetric = keyof typeof barConfig;

const deliveryBarConfig = {
  amount_cents: { label: "Delivery charges", color: "var(--chart-2)" },
} satisfies ChartConfig;

type UsageGroup = { lines: number; units: number; amount_cents: number; routely_cents: number; driver_cents: number };
type OutcomeGroup = { lines: number; amount_cents: number };
type UsageView = {
  by_type: Record<string, UsageGroup>;
  by_outcome: Record<string, OutcomeGroup>;
  // 2026-07-31 collapse: outcome is just delivered|failed now — by_disposition
  // is the granular breakdown ("38 failed: 20 no one home · 12 bad address...").
  by_disposition: Record<string, Record<string, OutcomeGroup>>;
  total_cents: number;
  flagged_needs_miles: number;
};
// 2026-07-31 collapse — single source of truth: routely-api
// app/routers/stops.py::DISPOSITIONS_BY_STATUS. Keep in sync.
const DISPOSITION_LABEL: Record<string, string> = {
  delivered_ok: "delivered",
  left_with_neighbor: "left with neighbor",
  left_at_door: "left at door",
  signed_by_third_party: "signed by third party",
  no_one_home: "no one home",
  bad_address: "bad address",
  refused_by_recipient: "refused by recipient",
  business_closed: "business closed",
  returned_to_hub: "returned",
  canceled_by_client: "canceled by client",
  canceled_by_dispatch: "canceled by dispatch",
  weather_or_access: "weather/access issue",
  other: "other",
};

type Rates = {
  billing_rates: {
    package: number;
    per_mile: number;
    on_demand_per_mile: number;
    on_demand_split: { routely: number; driver: number };
  };
  default_billing_type: "package" | "miles" | "on_demand";
  billing_rules: { if: Record<string, string>; then: string }[];
  postpay_enabled: boolean;
  credit_limit: number;
};

export function BillingTab({
  billing,
  billingLoading,
  plan,
}: {
  billing: BillingData | null;
  billingLoading: boolean;
  plan: string;
}) {
  const router = useRouter();
  const isPro = ["professional", "enterprise"].includes(plan);
  const [data, setData] = useState<BillingCharges | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<BarMetric>("spend");

  const [paymentTerm, setPaymentTerm] = useState(billing?.paymentTerm ?? "on_demand");
  const [paymentType, setPaymentType] = useState(billing?.paymentType ?? "card");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Metered usage (revenue engine) — read-only display.
  const [usage, setUsage] = useState<UsageView | null>(null);
  useEffect(() => {
    fetch("/api/client/billing/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUsage(d))
      .catch(() => {
        /* best-effort — fire-and-forget, failure does not block the UI */
      });
  }, []);

  // KPI/chart/table data for the redesign (2026-08-02) — see BillingSummary.
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  useEffect(() => {
    fetch("/api/client/billing/summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSummary(d))
      .catch(() => {
        /* best-effort — fire-and-forget, failure does not block the UI */
      });
  }, []);

  useEffect(() => {
    if (billing) {
      setPaymentTerm(billing.paymentTerm);
      setPaymentType(billing.paymentType);
    }
  }, [billing]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/client/billing/charges")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => !cancelled && !d.error && setData(d as BillingCharges))
      .catch(() => {
        /* best-effort — fire-and-forget, failure does not block the UI */
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function savePref(key: "paymentTerm" | "paymentType", value: string) {
    setSaving(`${key}-${value}`);
    if (key === "paymentTerm") setPaymentTerm(value);
    else setPaymentType(value);
    await fetch("/api/billing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => {
      /* best-effort — fire-and-forget, failure does not block the UI */
    });
    setSaving(null);
    setSaved(`${key}-${value}`);
    setTimeout(() => setSaved(null), 1800);
  }

  async function openBillingPortal() {
    setSaving("portal");
    if (!billing?.stripeCustomerId)
      await fetch("/api/stripe/create-customer", { method: "POST" }).catch(() => {
        /* best-effort — fire-and-forget, failure does not block the UI */
      });
    const res = await fetch("/api/stripe/billing-portal", { method: "POST" }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setSaving(null);
    if (j.url) window.location.href = j.url;
  }

  const chartData = useMemo(
    () => (data?.series ?? []).map((s) => ({ ...s, label: shortDate(s.date) })),
    [data?.series],
  );
  const totals = useMemo(() => {
    const s = data?.series ?? [];
    return { spend: s.reduce((a, b) => a + b.spend, 0), count: s.reduce((a, b) => a + b.count, 0) };
  }, [data?.series]);

  const deliveryChartData = useMemo(
    () => (summary?.delivery_series_30d ?? []).map((s) => ({ ...s, label: shortDate(s.date) })),
    [summary?.delivery_series_30d],
  );
  const typeEntries = Object.entries(summary?.charges_by_type ?? {});
  const typeTotalCents = typeEntries.reduce((s, [, g]) => s + g.amount_cents, 0);

  return (
    <div className="space-y-4">
      {/* ── Billing rates — moved into a right-side Sheet (2026-08-02): rarely
          touched config, doesn't need to occupy the top third of the page. ── */}
      <div className="flex items-center justify-between">
        <p className="text-13 text-muted-foreground">Delivery charges, label spend, and your account balance.</p>
        <Sheet>
          <SheetTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 gap-1.5">
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              Edit billing rates
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle className="text-13">Billing rates</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">
              <BillingRatesEditor />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* ── KPI row — the two money flows, explicitly labeled so they never
          read as one contradicting number (see BillingSummary route docstring):
          #1/#4 are delivery charges (billing_ledger, what's owed to Routely),
          #2 is also delivery charges (this month, any invoice status), #3 is
          the OTHER flow — shipping label spend (label_orders). ── */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {/* 2026-08-02 (item 2): the page's primary card — dynamic amount +
            two full-width actions anchored at the bottom, own design
            language (our radii/tokens/density), not a copy of the
            reference. Ring + stronger tint set it apart from the 3
            secondary KPI cards beside it. */}
        <Card className="relative overflow-hidden ring-1 ring-primary/15">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 -right-8 size-28 rounded-full bg-primary/15 blur-2xl"
          />
          <CardContent className="relative flex h-full flex-col gap-3 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="type-label truncate text-muted-foreground">Amount due this period</span>
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Receipt className="size-3.5" aria-hidden="true" />
              </span>
            </div>
            <div className="space-y-1">
              {!summary ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="font-semibold text-2xl tabular-nums tracking-tight">
                  {centsToUsd(summary.amount_due_cents)}
                </p>
              )}
              <p className="truncate text-muted-foreground text-xs">Delivery charges, not yet invoiced</p>
            </div>
            <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="min-w-0">
                      <Button
                        size="sm"
                        className="h-8 w-full gap-1.5 border border-success/30 bg-success/10 text-11 text-success hover:bg-success/15 disabled:opacity-50"
                        variant="ghost"
                        disabled
                      >
                        <Wallet className="size-3.5 shrink-0" aria-hidden="true" />
                        Pay now
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-56 text-11">
                    Invoice-specific payment isn't wired up yet — only a general Stripe billing-portal redirect exists
                    today (see Payment method below). Building this requires an invoice-scoped Checkout session.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-full gap-1.5 text-11"
                onClick={() => router.push("/dashboard/settings?tab=invoices")}
              >
                <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                Invoices
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 -right-8 size-24 rounded-full bg-primary/10 blur-2xl"
          />
          <CardContent className="relative space-y-1.5 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="type-label truncate text-muted-foreground">Delivery charges this month</span>
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Truck className="size-3.5" aria-hidden="true" />
              </span>
            </div>
            {!summary ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <p className="font-semibold text-xl tabular-nums tracking-tight sm:text-2xl">
                {centsToUsd(summary.delivery_this_month_cents)}
              </p>
            )}
            {summary && (
              <Delta current={summary.delivery_this_month_cents} previous={summary.delivery_last_month_cents} />
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 -right-8 size-24 rounded-full bg-primary/10 blur-2xl"
          />
          <CardContent className="relative space-y-1.5 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="type-label truncate text-muted-foreground">Shipping labels spend</span>
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Package className="size-3.5" aria-hidden="true" />
              </span>
            </div>
            {!summary ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <p className="font-semibold text-xl tabular-nums tracking-tight sm:text-2xl">
                {centsToUsd(summary.labels_this_month_cents)}
              </p>
            )}
            {summary && <Delta current={summary.labels_this_month_cents} previous={summary.labels_last_month_cents} />}
            <p className="truncate text-muted-foreground text-xs">A separate spend from delivery charges above</p>
          </CardContent>
        </Card>

        <Card
          className={cn(
            "relative overflow-hidden",
            (summary?.outstanding_old_uninvoiced_count ?? 0) > 0 && "ring-1 ring-destructive/40",
          )}
        >
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute -top-10 -right-8 size-24 rounded-full blur-2xl",
              (summary?.outstanding_old_uninvoiced_count ?? 0) > 0 ? "bg-destructive/15" : "bg-primary/10",
            )}
          />
          <CardContent className="relative space-y-1.5 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="type-label truncate text-muted-foreground">Outstanding</span>
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-lg",
                  (summary?.outstanding_old_uninvoiced_count ?? 0) > 0
                    ? "bg-destructive/15 text-destructive"
                    : "bg-primary/10 text-primary",
                )}
              >
                <AlertCircle className="size-3.5" aria-hidden="true" />
              </span>
            </div>
            {!summary ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-xl tabular-nums tracking-tight sm:text-2xl">
                  {centsToUsd(summary.outstanding_old_uninvoiced_cents)}
                </p>
                {summary.outstanding_old_uninvoiced_count > 0 && (
                  <Badge variant="outline" className="border-destructive/40 text-10 text-destructive">
                    {summary.outstanding_old_uninvoiced_count} overdue
                  </Badge>
                )}
              </div>
            )}
            <p className="truncate text-muted-foreground text-xs">Uninvoiced 30+ days — should be invoiced by now</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Reorganized 2026-08-02 (item 3): "frequent" tier — Recent
          charges + Payment method/term — moved up to right after the
          at-a-glance KPI row. Measured live before this change: at
          1920×1080 this section needed ~70% more scroll to reach
          (1745px content vs 1028px visible); at 390px it was 2792px vs
          809px. It's what a tenant needs OFTEN (their card, their
          latest charges), not an occasional deep-dive — it doesn't
          belong below the charts. ── */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-13">Recent charges</CardTitle>
            <p className="text-muted-foreground text-sm">Latest delivery-ledger lines (not shipping labels).</p>
          </CardHeader>
          <CardContent className="pt-0">
            {!summary ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={`ch-${i}`} className="h-12 w-full" />
                ))}
              </div>
            ) : summary.recent_charges.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground text-sm">
                No delivery charges yet — they&apos;ll appear after your first attempt.
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {summary.recent_charges.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        c.outcome === "delivered" ? "bg-success" : "bg-destructive",
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">{c.recipient_name || c.stop_id}</p>
                      <p className="truncate font-mono text-10 text-muted-foreground">{c.stop_id}</p>
                    </div>
                    <Badge variant="outline" className="hidden shrink-0 capitalize sm:inline-flex">
                      {TYPE_LABEL[c.resolved_type] ?? c.resolved_type}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "hidden shrink-0 sm:inline-flex",
                        c.invoiced_at ? "text-muted-foreground" : "border-primary/40 text-primary",
                      )}
                    >
                      {c.invoiced_at ? "Invoiced" : "Pending"}
                    </Badge>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-sm tabular-nums">{centsToUsd(c.amount_cents)}</p>
                      <p className="text-muted-foreground text-xs">{shortDate(c.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-13">Payment method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {billingLoading ? (
                <Skeleton className="aspect-[1.586] w-full rounded-2xl" />
              ) : (
                <CreditCardVisual
                  brand={billing?.paymentMethod?.brand}
                  last4={billing?.paymentMethod?.last4}
                  expMonth={billing?.paymentMethod?.expMonth}
                  expYear={billing?.paymentMethod?.expYear}
                />
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1"
                  onClick={openBillingPortal}
                  disabled={saving === "portal"}
                >
                  {saving === "portal" && <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" />}
                  {billing?.paymentMethod ? "Change card" : "Add card"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-muted-foreground"
                  onClick={openBillingPortal}
                  disabled={saving === "portal"}
                  aria-label="Manage billing in Stripe"
                >
                  <Settings2 className="size-3.5" aria-hidden="true" />
                  <ExternalLink className="size-3" aria-hidden="true" />
                </Button>
              </div>
              <div className="space-y-2">
                <Label className="font-medium text-sm">Payment type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "card", label: "Card", icon: CreditCard, disabled: false },
                      { id: "ach", label: "ACH", icon: Receipt, disabled: true },
                      { id: "cash", label: "Cash", icon: Wallet, disabled: false },
                    ] as const
                  ).map((t) => {
                    const selected = paymentType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={t.disabled || saving !== null}
                        onClick={() => savePref("paymentType", t.id)}
                        className={cn(
                          "relative flex flex-col items-center gap-1 rounded-lg border px-2 py-2 transition-all",
                          selected
                            ? "border-primary bg-primary/[0.04] shadow-sm"
                            : "hover:border-muted-foreground/25 hover:bg-muted/40",
                          t.disabled && "cursor-not-allowed opacity-40",
                        )}
                      >
                        <t.icon
                          className={cn("size-4", selected ? "text-primary" : "text-muted-foreground")}
                          aria-hidden="true"
                        />
                        <span className="font-medium text-xs">{t.label}</span>
                        {t.disabled && (
                          <Badge variant="outline" className="absolute -top-2 right-1 h-4 text-10">
                            Soon
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-13">Payment term</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {PAYMENT_TERMS.map((t) => {
                const eligible = t.tier === "all" || isPro;
                const selected = paymentTerm === t.id;
                const isSaving = saving === `paymentTerm-${t.id}`;
                const isSaved = saved === `paymentTerm-${t.id}`;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={!eligible || saving !== null}
                    onClick={() => savePref("paymentTerm", t.id)}
                    className={cn(
                      "group relative flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                      selected
                        ? "border-primary bg-primary/[0.04] shadow-sm"
                        : "hover:border-muted-foreground/25 hover:bg-muted/40",
                      !eligible && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                        selected ? "border-primary bg-primary" : "border-muted-foreground/30",
                      )}
                    >
                      {selected && <Check className="size-2.5 text-primary-foreground" aria-hidden="true" />}
                    </span>
                    <span className="flex-1">
                      <span className="block font-medium text-sm leading-tight">{t.label}</span>
                      <span className="mt-0.5 block text-muted-foreground text-xs leading-relaxed">{t.desc}</span>
                    </span>
                    {isSaving && (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                    )}
                    {isSaved && <CircleCheck className="size-3.5 shrink-0 text-success" aria-hidden="true" />}
                    {!eligible && (
                      <Badge variant="outline" className="h-5 shrink-0 text-10">
                        Pro+
                      </Badge>
                    )}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── "Occasional" tier — deep charts. Swapped 2026-08-02 (item 1):
          "Spend — last 30 days" now takes the full-width slot "Charges by
          type" used to occupy; "Charges by type" moved into the 2-col grid
          below, alongside "Delivery charges". ── */}
      <Card>
        <CardHeader className="!pb-0 flex flex-col gap-3 border-b sm:flex-row sm:items-stretch sm:gap-0 sm:space-y-0">
          <div className="flex-1 pb-3 sm:pb-4">
            <CardTitle className="text-13">Spend — last 30 days</CardTitle>
            <p className="text-muted-foreground text-sm">Shipping-label purchases over time.</p>
          </div>
          <div className="flex gap-0 border-t sm:border-t-0 sm:border-l">
            {(Object.keys(barConfig) as BarMetric[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setMetric(k)}
                data-active={metric === k}
                className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-2.5 text-left transition-colors data-[active=true]:bg-muted/50 sm:px-5"
              >
                <span className="type-label text-muted-foreground">{barConfig[k].label}</span>
                <span className="font-semibold text-13 tabular-nums sm:text-13">
                  {loading ? "—" : k === "spend" ? money(totals.spend) : totals.count}
                </span>
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-4">
          {loading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <ChartContainer config={barConfig} className="aspect-auto h-[240px] w-full">
              <BarChart data={chartData} margin={{ left: 4, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  className="text-xs"
                />
                <ChartTooltip
                  cursor={{ fill: "var(--primary)", fillOpacity: 0.06, radius: 4 }}
                  content={<ChartTooltipContent className="w-36" />}
                />
                <Bar dataKey={metric} fill={`var(--color-${metric})`} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {typeEntries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-13">Charges by type</CardTitle>
              <p className="text-muted-foreground text-sm">Uninvoiced this period, by billing type.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                {typeEntries.map(([type, g]) => (
                  <div
                    key={type}
                    className={TYPE_COLOR[type] ?? "bg-muted-foreground"}
                    style={{ width: `${typeTotalCents > 0 ? (g.amount_cents / typeTotalCents) * 100 : 0}%` }}
                    title={`${TYPE_LABEL[type] ?? type}: ${centsToUsd(g.amount_cents)}`}
                  />
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {typeEntries.map(([type, g]) => (
                  <div key={type} className="flex items-center gap-2">
                    <span className={cn("size-2 shrink-0 rounded-full", TYPE_COLOR[type] ?? "bg-muted-foreground")} />
                    <span className="min-w-0 flex-1 truncate text-13">{TYPE_LABEL[type] ?? type}</span>
                    <span className="shrink-0 text-11 text-muted-foreground tabular-nums">{g.lines} lines</span>
                    <span className="shrink-0 font-semibold text-13 tabular-nums">{centsToUsd(g.amount_cents)}</span>
                  </div>
                ))}
              </div>
              {/* Billing v2.1 + 2026-07-31 disposition collapse: bills per
                  ATTEMPT, not per successful delivery, so a tenant's charges
                  include failed attempts too. Only shown once something
                  other than a clean delivery exists. */}
              {usage &&
                (() => {
                  const entries = Object.entries(usage.by_outcome ?? {});
                  const total = entries.reduce((s, [, o]) => s + o.lines, 0);
                  const nonDelivered = entries.filter(([o]) => o !== "delivered");
                  if (!total || !nonDelivered.length) return null;
                  return (
                    <div className="flex flex-col gap-1 border-t pt-3 text-11 text-muted-foreground">
                      {nonDelivered.map(([outcome, o]) => {
                        const dispositions = Object.entries(usage.by_disposition?.[outcome] ?? {}).sort(
                          (a, b) => b[1].lines - a[1].lines,
                        );
                        return (
                          <div key={outcome} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                            <span>
                              <b className="text-foreground">{o.lines}</b> of {total} charges were {outcome} attempts (
                              ${(o.amount_cents / 100).toFixed(2)}){dispositions.length > 0 && ":"}
                            </span>
                            {dispositions.map(([disposition, d], i) => (
                              <span key={disposition}>
                                {i > 0 && <span className="mx-1 text-muted-foreground/40">·</span>}
                                {d.lines} {DISPOSITION_LABEL[disposition] ?? disposition.replace(/_/g, " ")}
                              </span>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="!pb-0 border-b pb-3 sm:pb-4">
            <CardTitle className="text-13">Delivery charges — last 30 days</CardTitle>
            <p className="text-muted-foreground text-sm">Ledger amount per attempt, by day.</p>
          </CardHeader>
          <CardContent className="px-2 pt-4 sm:px-4">
            {!summary ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <ChartContainer config={deliveryBarConfig} className="aspect-auto h-[240px] w-full">
                <BarChart data={deliveryChartData} margin={{ left: 4, right: 4, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={28}
                    className="text-xs"
                  />
                  <ChartTooltip
                    cursor={{ fill: "var(--primary)", fillOpacity: 0.06, radius: 4 }}
                    content={<ChartTooltipContent className="w-36" />}
                  />
                  <Bar dataKey="amount_cents" fill="var(--color-amount_cents)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* Visual credit/debit card — brand gradient, chip, masked number. */
function CreditCardVisual({
  brand,
  last4,
  expMonth,
  expYear,
}: {
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
}) {
  const hasCard = Boolean(last4);
  return (
    <div className="relative aspect-[1.586] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/70 p-4 text-white shadow-lg ring-1 ring-primary/20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 -right-6 size-28 rounded-full bg-white/15 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 -left-6 size-28 rounded-full bg-white/10 blur-2xl"
      />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/routelyLogo.svg" alt="Routely" className="h-5 w-auto sm:h-6" />
          <div
            className="h-6 w-8 rounded-md bg-gradient-to-br from-white/70 to-white/30 ring-1 ring-white/40"
            aria-hidden="true"
          />
        </div>
        <div className="font-mono text-13 tabular-nums tracking-[0.2em] sm:text-13">
          {hasCard ? `•••• •••• •••• ${last4}` : "•••• •••• •••• ••••"}
        </div>
        <div className="flex items-end justify-between text-xs">
          <div className="min-w-0">
            <p className="text-10 text-white/60 uppercase tracking-wider">Card holder</p>
            <p className="truncate font-medium">{hasCard ? "On file" : "No card yet"}</p>
          </div>
          <div className="text-right">
            <p className="text-10 text-white/60 uppercase tracking-wider">{hasCard && expMonth ? "Expires" : ""}</p>
            <p className="font-medium capitalize">
              {hasCard ? `${brand ?? "Card"}${expMonth ? ` · ${expMonth}/${String(expYear).slice(-2)}` : ""}` : "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Billing v2 — per-tenant rates/rules editor (North Star: API-writable) ── */
function BillingRatesEditor() {
  const [rates, setRates] = useState<Rates | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/api/client/billing/rates")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.billing_rates && setRates(d as Rates))
      .catch(() => {
        /* best-effort — fire-and-forget, failure does not block the UI */
      });
  }, []);
  if (!rates) return null;

  const save = async (patch: Partial<Rates>) => {
    setStatus("Saving…");
    const res = await fetch("/api/client/billing/rates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (res?.ok) {
      setStatus("Saved");
      setTimeout(() => setStatus(""), 2000);
    } else {
      const j = res ? await res.json().catch(() => ({})) : {};
      setStatus(j.error || "Save failed");
    }
  };
  const money = (k: "package" | "per_mile" | "on_demand_per_mile", label: string) => (
    <label className="flex items-center justify-between gap-2 text-11 text-muted-foreground/70">
      {label}
      <span className="flex items-center gap-1 text-13 text-foreground">
        $
        <input
          type="number"
          min={0}
          step={0.01}
          defaultValue={(rates.billing_rates[k] / 100).toFixed(2)}
          onBlur={(e) => {
            const cents = Math.round(Number(e.target.value) * 100);
            if (!Number.isNaN(cents) && cents >= 0) {
              const next = { ...rates, billing_rates: { ...rates.billing_rates, [k]: cents } };
              setRates(next);
              void save({ billing_rates: next.billing_rates });
            }
          }}
          className="h-(--spacing-control-h-sm) w-[80px] rounded-md border border-border/60 bg-transparent px-2 text-right font-mono text-13 tabular-nums outline-none focus:border-primary/50"
        />
      </span>
    </label>
  );

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-13">
          Billing rates{" "}
          <span className="font-normal text-10 text-muted-foreground">
            (negotiated · applies to NEW deliveries only — past ledger lines are frozen)
          </span>
        </p>
        {status && (
          <span
            className={cn(
              "text-11",
              status === "Saved" ? "text-success" : status === "Saving…" ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {status}
          </span>
        )}
      </div>
      {/* 2026-08-02: was `lg:grid-cols-4`, a VIEWPORT-width breakpoint — wrong
          now that this editor lives inside a fixed ~448px Sheet rather than
          the full page, so it kept trying to lay out 4 columns in a
          container far narrower than the viewport and overflowed. Fixed at
          2 columns, which fits the Sheet at any window size. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {money("package", "Per package")}
        {money("per_mile", "Per mile")}
        {money("on_demand_per_mile", "On-demand / mile")}
        <label className="flex items-center justify-between gap-2 text-11 text-muted-foreground/70">
          Routely split %
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            defaultValue={rates.billing_rates.on_demand_split.routely}
            onBlur={(e) => {
              const r = Math.round(Number(e.target.value));
              if (!Number.isNaN(r) && r >= 0 && r <= 100) {
                const next = {
                  ...rates,
                  billing_rates: { ...rates.billing_rates, on_demand_split: { routely: r, driver: 100 - r } },
                };
                setRates(next);
                void save({ billing_rates: next.billing_rates });
              }
            }}
            className="h-(--spacing-control-h-sm) w-[64px] rounded-md border border-border/60 bg-transparent px-2 text-right font-mono text-13 tabular-nums outline-none focus:border-primary/50"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-11 text-muted-foreground/70">Default type</span>
        <div className="flex overflow-hidden rounded-lg border border-border/60">
          {(["package", "miles", "on_demand"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                const next = { ...rates, default_billing_type: v };
                setRates(next);
                void save({ default_billing_type: v });
              }}
              className={cn(
                "px-2.5 py-1 font-semibold text-10 transition-colors",
                rates.default_billing_type === v
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:bg-muted",
              )}
            >
              {v === "on_demand" ? "On-Demand" : v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {/* Postpay/prepay (2026-08-01) — was DB-only, no UI. Same segmented-
          control pattern as Default type above. */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-11 text-muted-foreground/70">Payment terms</span>
        <div className="flex overflow-hidden rounded-lg border border-border/60">
          {(
            [
              { v: false, l: "Prepay" },
              { v: true, l: "Postpay" },
            ] as const
          ).map((opt) => (
            <button
              key={String(opt.v)}
              type="button"
              onClick={() => {
                const next = { ...rates, postpay_enabled: opt.v };
                setRates(next);
                void save({ postpay_enabled: opt.v });
              }}
              className={cn(
                "px-2.5 py-1 font-semibold text-10 transition-colors",
                rates.postpay_enabled === opt.v
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:bg-muted",
              )}
            >
              {opt.l}
            </button>
          ))}
        </div>
        {rates.postpay_enabled && (
          <label className="flex items-center gap-1.5 text-11 text-muted-foreground/70">
            Credit limit
            <span className="text-muted-foreground/50">$</span>
            <input
              type="number"
              min={0}
              step={1}
              defaultValue={rates.credit_limit}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v) && v >= 0) {
                  const next = { ...rates, credit_limit: v };
                  setRates(next);
                  void save({ credit_limit: v });
                }
              }}
              className="h-(--spacing-control-h-sm) w-[84px] rounded-md border border-border/60 bg-transparent px-2 text-right font-mono text-13 tabular-nums outline-none focus:border-primary/50"
            />
          </label>
        )}
      </div>
      <p className="max-w-md text-10 text-muted-foreground/60 leading-snug">
        {rates.postpay_enabled
          ? "Postpay: charges accumulate on the ledger and are invoiced on the tenant's billing cycle."
          : "Prepay: the card on file is charged per purchase (label, delivery attempt) as it happens."}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-11 text-muted-foreground/70">Rules (first match wins)</span>
          <button
            type="button"
            onClick={() => {
              const next = {
                ...rates,
                // biome-ignore lint/suspicious/noThenProperty: `then` is the billing_rules wire-format key (app/services/billing.py::resolve_type), not a thenable.
                billing_rules: [...rates.billing_rules, { if: { service_type: "on_demand" }, then: "on_demand" }],
              };
              setRates(next);
              void save({ billing_rules: next.billing_rules });
            }}
            className="text-11 text-primary hover:underline"
          >
            + Add rule
          </button>
        </div>
        {rates.billing_rules.length === 0 && (
          <p className="text-11 text-muted-foreground/50">No rules — default type applies.</p>
        )}
        {rates.billing_rules.map((rule, i) => {
          const [condKey, condVal] = Object.entries(rule.if)[0] ?? ["stop_type", ""];
          const upd = (next: Rates["billing_rules"]) => {
            const n = { ...rates, billing_rules: next };
            setRates(n);
            void save({ billing_rules: next });
          };
          return (
            <div key={i} className="flex flex-wrap items-center gap-1.5 text-11">
              <span className="text-muted-foreground/60">if</span>
              <select
                value={condKey}
                onChange={(e) =>
                  upd(rates.billing_rules.map((r, j) => (j === i ? { ...r, if: { [e.target.value]: condVal } } : r)))
                }
                className="h-6 rounded-md border border-border/60 bg-transparent px-1 text-11"
              >
                <option value="stop_type">stop_type</option>
                <option value="service_type">service_type</option>
                <option value="package_type">package_type</option>
              </select>
              <span>=</span>
              <input
                value={condVal}
                onChange={(e) =>
                  upd(rates.billing_rules.map((r, j) => (j === i ? { ...r, if: { [condKey]: e.target.value } } : r)))
                }
                className="h-6 w-[110px] rounded-md border border-border/60 bg-transparent px-1.5 font-mono text-11"
              />
              <span className="text-muted-foreground/60">→</span>
              <select
                value={rule.then}
                // biome-ignore lint/suspicious/noThenProperty: same wire-format key as above.
                onChange={(e) => upd(rates.billing_rules.map((r, j) => (j === i ? { ...r, then: e.target.value } : r)))}
                className="h-6 rounded-md border border-border/60 bg-transparent px-1 text-11"
              >
                <option value="package">package</option>
                <option value="miles">miles</option>
                <option value="on_demand">on_demand</option>
              </select>
              <button
                type="button"
                onClick={() => upd(rates.billing_rules.filter((_, j) => j !== i))}
                className="text-muted-foreground/50 hover:text-destructive"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
