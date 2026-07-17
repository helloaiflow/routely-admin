"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ArrowUpRight,
  Check,
  CircleCheck,
  CreditCard,
  ExternalLink,
  Loader2,
  Package,
  Receipt,
  Route as RouteIcon,
  Settings2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { type BillingCharges, type BillingData, money, PAYMENT_TERMS, shortDate } from "./settings-types";

const chargeStatusCls = (s: string) =>
  s === "purchased"
    ? "bg-success/10 text-success border-success/25"
    : s === "pending_payment"
      ? "bg-warning/15 text-warning-foreground border-warning/30 dark:text-warning"
      : "bg-destructive/10 text-destructive border-destructive/25";

/* Interactive bar chart — same pattern as the Shipping Labels overview. */
const barConfig = {
  spend: { label: "Spent", color: "var(--primary)" },
  count: { label: "Labels", color: "var(--chart-2)" },
} satisfies ChartConfig;
type BarMetric = keyof typeof barConfig;

export function BillingTab({
  billing,
  billingLoading,
  plan,
}: {
  billing: BillingData | null;
  billingLoading: boolean;
  plan: string;
}) {
  const isPro = ["professional", "enterprise"].includes(plan);
  const [data, setData] = useState<BillingCharges | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<BarMetric>("spend");

  const [paymentTerm, setPaymentTerm] = useState(billing?.paymentTerm ?? "on_demand");
  const [paymentType, setPaymentType] = useState(billing?.paymentType ?? "card");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

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
      .catch(() => {})
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
    }).catch(() => {});
    setSaving(null);
    setSaved(`${key}-${value}`);
    setTimeout(() => setSaved(null), 1800);
  }

  async function openBillingPortal() {
    setSaving("portal");
    if (!billing?.stripeCustomerId) await fetch("/api/stripe/create-customer", { method: "POST" }).catch(() => {});
    const res = await fetch("/api/stripe/billing-portal", { method: "POST" }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setSaving(null);
    if (j.url) window.location.href = j.url;
  }

  const m = data?.month;
  const chartData = useMemo(
    () => (data?.series ?? []).map((s) => ({ ...s, label: shortDate(s.date) })),
    [data?.series],
  );
  const totals = useMemo(() => {
    const s = data?.series ?? [];
    return { spend: s.reduce((a, b) => a + b.spend, 0), count: s.reduce((a, b) => a + b.count, 0) };
  }, [data?.series]);

  const kpiCards = [
    { key: "package", label: "Package Expenses", value: m?.package_expense, icon: Package, hint: "Shipping labels this month", danger: false },
    { key: "miles", label: "Miles Expense", value: m?.miles_expense, icon: RouteIcon, hint: `${m?.miles ?? 0} mi · ${m?.packages ?? 0} deliveries`, danger: false },
    { key: "total", label: "Total This Month", value: m?.total, icon: Wallet, hint: m?.label ?? "", danger: false },
    { key: "outstanding", label: "Outstanding", value: m?.outstanding, icon: Receipt, hint: (m?.outstanding ?? 0) > 0 ? "Balance due" : "All settled", danger: (m?.outstanding ?? 0) > 0 },
  ];

  return (
    <div className="space-y-4">
      {/* ── KPI cards — 2-up on mobile, 4-up on desktop ── */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpiCards.map((c) => (
          <Card key={c.key} className={cn("relative overflow-hidden", c.danger && "ring-1 ring-warning/40")}>
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute -top-10 -right-8 size-24 rounded-full blur-2xl",
                c.danger ? "bg-warning/20" : "bg-primary/10",
              )}
            />
            <CardContent className="relative space-y-1.5 py-4">
              <div className="flex items-center justify-between gap-2">
                <span className="type-label truncate text-muted-foreground">{c.label}</span>
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg",
                    c.danger ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary",
                  )}
                >
                  <c.icon className="size-3.5" aria-hidden="true" />
                </span>
              </div>
              {loading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <p className="font-semibold text-xl tracking-tight tabular-nums sm:text-2xl">{money(c.value)}</p>
              )}
              <p className="truncate text-muted-foreground text-xs">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Chart (labels-style bar) + payment card column ── */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col gap-3 border-b !pb-0 sm:flex-row sm:items-stretch sm:gap-0 sm:space-y-0">
            <div className="flex-1 pb-3 sm:pb-4">
              <CardTitle className="text-base">Spend — last 30 days</CardTitle>
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
                  <span className="font-semibold text-base tabular-nums sm:text-lg">
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
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} className="text-xs" />
                  <ChartTooltip cursor={{ fill: "var(--primary)", fillOpacity: 0.06, radius: 4 }} content={<ChartTooltipContent className="w-36" />} />
                  <Bar dataKey={metric} fill={`var(--color-${metric})`} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Payment card column */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {billingLoading ? (
              <Skeleton className="aspect-[1.586] w-full rounded-2xl" />
            ) : (
              <CreditCardVisual brand={billing?.paymentMethod?.brand} last4={billing?.paymentMethod?.last4} expMonth={billing?.paymentMethod?.expMonth} expYear={billing?.paymentMethod?.expYear} />
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 flex-1" onClick={openBillingPortal} disabled={saving === "portal"}>
                {saving === "portal" && <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" />}
                {billing?.paymentMethod ? "Change card" : "Add card"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground" onClick={openBillingPortal} disabled={saving === "portal"} aria-label="Manage billing in Stripe">
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
                        selected ? "border-primary bg-primary/[0.04] shadow-sm" : "hover:border-muted-foreground/25 hover:bg-muted/40",
                        t.disabled && "cursor-not-allowed opacity-40",
                      )}
                    >
                      <t.icon className={cn("size-4", selected ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                      <span className="font-medium text-xs">{t.label}</span>
                      {t.disabled && (
                        <Badge variant="outline" className="absolute -top-2 right-1 h-4 text-[10px]">
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
      </div>

      {/* ── Recent charges + payment term ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent charges</CardTitle>
            <p className="text-muted-foreground text-sm">Your latest shipping-label charges.</p>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={`ch-${i}`} className="h-12 w-full" />
                ))}
              </div>
            ) : (data?.charges.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground text-sm">
                No charges yet — they&apos;ll appear after your first label purchase.
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {data!.charges.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Package className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">{c.title}</p>
                      <p className="truncate text-muted-foreground text-xs">{c.subtitle}</p>
                    </div>
                    <Badge variant="outline" className={cn("hidden shrink-0 capitalize sm:inline-flex", chargeStatusCls(c.status))}>
                      {c.status.replace("_", " ")}
                    </Badge>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-sm tabular-nums">{money(c.amount)}</p>
                      <p className="text-muted-foreground text-xs">{shortDate(c.date)}</p>
                    </div>
                    {c.tracking_url ? (
                      <a
                        href={c.tracking_url}
                        target="_blank"
                        rel="noreferrer"
                        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Track"
                      >
                        <ArrowUpRight className="size-4" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="hidden w-7 shrink-0 sm:block" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment term</CardTitle>
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
                    selected ? "border-primary bg-primary/[0.04] shadow-sm" : "hover:border-muted-foreground/25 hover:bg-muted/40",
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
                  {isSaving && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
                  {isSaved && <CircleCheck className="size-3.5 shrink-0 text-success" aria-hidden="true" />}
                  {!eligible && (
                    <Badge variant="outline" className="h-5 shrink-0 text-[10px]">
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
      <div aria-hidden="true" className="pointer-events-none absolute -top-8 -right-6 size-28 rounded-full bg-white/15 blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-10 -left-6 size-28 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/routelyLogo.svg" alt="Routely" className="h-5 w-auto sm:h-6" />
          <div className="h-6 w-8 rounded-md bg-gradient-to-br from-white/70 to-white/30 ring-1 ring-white/40" aria-hidden="true" />
        </div>
        <div className="font-mono text-base tracking-[0.2em] tabular-nums sm:text-lg">
          {hasCard ? `•••• •••• •••• ${last4}` : "•••• •••• •••• ••••"}
        </div>
        <div className="flex items-end justify-between text-xs">
          <div className="min-w-0">
            <p className="text-[10px] text-white/60 uppercase tracking-wider">Card holder</p>
            <p className="truncate font-medium">{hasCard ? "On file" : "No card yet"}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-white/60 uppercase tracking-wider">
              {hasCard && expMonth ? "Expires" : ""}
            </p>
            <p className="font-medium capitalize">
              {hasCard ? `${brand ?? "Card"}${expMonth ? ` · ${expMonth}/${String(expYear).slice(-2)}` : ""}` : "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
