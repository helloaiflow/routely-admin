"use client";

/* Overview v2 — internal-package numbers ONLY (never medical stats).
 * CEO redesign 2026-09-01: animated KPI cards with icons + border beams,
 * a 14-day volume chart in the dashboard's chart language, delivery-
 * progress ring, and a livelier activity feed. All numbers stay REAL and
 * un-animated (the HyperText lesson: ops numbers must never lie). */

import { useMemo } from "react";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Inbox,
  PackageOpen,
  Send,
  Truck,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DateRange } from "@/components/ui/date-range-picker";
import { BorderBeam } from "@/components/ui/border-beam";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { isDelivered, isInMotion } from "@/lib/status";
import { cn } from "@/lib/utils";

import type { InternalPackage, InternalPackagesResponse } from "./_types";
import { directionOf } from "./_types";
import { statusBadgeCls, statusLabelOf } from "./internal-status";

const chartConfig = {
  packages: { label: "Packages", color: "var(--chart-1)" },
  delivered: { label: "Delivered", color: "var(--chart-2)" },
} satisfies ChartConfig;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function InternalOverview({
  data,
  allPackages,
  loading,
  myEmail,
  range,
  onGoToPackages,
}: {
  data?: InternalPackagesResponse;
  /** UNFILTERED set — feeds the chart's context days only. */
  allPackages?: InternalPackage[];
  loading: boolean;
  myEmail: string | null;
  range: DateRange;
  onGoToPackages: () => void;
}) {
  const reduced = useReducedMotion();
  const m = useMemo(() => {
    const pkgs = data?.packages ?? [];
    const uid = data?.caller_user_id ?? "";
    const sent = pkgs.filter((p) => directionOf(p, uid, myEmail) === "outgoing");
    const incoming = pkgs.filter((p) => directionOf(p, uid, myEmail) === "incoming");

    // Volume buckets follow the SELECTED range — one bucket per calendar day,
    // every day ticked (the Operations Dashboard rule: no skipped days). A
    // single-day selection charts the last 14 days for context, same pattern
    // as the dashboard's 30-day single-day trend. Capped at 92 buckets.
    const from = new Date(range.from);
    from.setHours(0, 0, 0, 0);
    const to = new Date(range.to);
    to.setHours(0, 0, 0, 0);
    let start = from;
    let end = to;
    const singleDay = dayKey(from) === dayKey(to);
    if (singleDay) {
      start = new Date(to);
      start.setDate(start.getDate() - 13);
    }
    const spanDays = Math.min(92, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    start = new Date(end);
    start.setDate(start.getDate() - (spanDays - 1));
    const manyDays = spanDays > 14;
    const days: { day: string; label: string; packages: number; delivered: number }[] = [];
    const byDay = new Map<string, { packages: number; delivered: number }>();
    for (let i = 0; i < spanDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const k = dayKey(d);
      byDay.set(k, { packages: 0, delivered: 0 });
      days.push({
        day: k,
        label: manyDays
          ? String(d.getDate())
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        packages: 0,
        delivered: 0,
      });
    }
    for (const p of allPackages ?? pkgs) {
      const k = dayKey(new Date(p.created_at));
      const b = byDay.get(k);
      if (b) {
        b.packages += 1;
        if (isDelivered(p)) b.delivered += 1;
      }
    }
    for (const row of days) {
      const b = byDay.get(row.day);
      if (b) {
        row.packages = b.packages;
        row.delivered = b.delivered;
      }
    }

    const delivered = pkgs.filter((p) => isDelivered(p)).length;
    return {
      singleDay,
      spanDays,
      total: pkgs.length,
      sent: sent.length,
      incoming: incoming.filter((p) => !isDelivered(p)).length,
      inTransit: pkgs.filter((p) => isInMotion(p)).length,
      delivered,
      unassigned: pkgs.filter((p) => p.status === "unassigned").length,
      successPct: pkgs.length ? Math.round((delivered / pkgs.length) * 100) : 0,
      days,
      recent: [...pkgs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 8),
    };
  }, [data, allPackages, myEmail, range]);

  const cells = [
    { key: "sent", label: "Sent", value: m.sent, icon: Send, title: "Packages you (or your office) sent" },
    { key: "incoming", label: "Incoming", value: m.incoming, icon: Inbox, title: "Packages on their way to you" },
    { key: "in_transit", label: "In transit", value: m.inTransit, icon: Truck, title: "Currently moving" },
    { key: "delivered", label: "Delivered", value: m.delivered, icon: CheckCircle2, title: "Completed deliveries" },
    {
      key: "unassigned",
      label: "Unassigned",
      value: m.unassigned,
      icon: Clock,
      tone: "warning" as const,
      title: "Waiting for a driver or route",
    },
  ];

  const enter = (i: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.22, delay: i * 0.04, ease: "easeOut" as const },
        };

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      {/* KPI cards — icons, beams on the cards that matter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cells.map((c, i) => {
          const Icon = c.icon;
          const warn = c.tone === "warning" && c.value > 0;
          return (
            <motion.div key={c.key} {...enter(i)}>
              <Card
                size="sm"
                className={cn(
                  "relative gap-1 overflow-hidden border-border/60 px-4 py-3.5 shadow-sm",
                  warn && "border-amber-300/60 dark:border-amber-700/50",
                )}
                title={c.title}
              >
                {(c.key === "in_transit" && c.value > 0) || warn ? (
                  <BorderBeam size={48} duration={warn ? 5 : 9} />
                ) : null}
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-[11px] uppercase tracking-wide",
                      warn ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                    )}
                  >
                    {c.label}
                  </span>
                  <Icon
                    className={cn(
                      "size-3.5",
                      warn ? "text-amber-500" : "text-muted-foreground/60",
                    )}
                    aria-hidden="true"
                  />
                </div>
                {loading && !data ? (
                  <div className="h-8 w-14 animate-pulse rounded bg-muted" />
                ) : (
                  <span className="font-bold text-3xl tracking-tight tabular-nums">{c.value}</span>
                )}
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Volume chart + success ring */}
      <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-[1fr_240px]">
        <motion.div {...enter(2)}>
          <Card size="sm" className="border-border/60 shadow-sm">
            <CardHeader className="pb-0">
              <CardTitle className="font-semibold text-sm tracking-tight">Package volume</CardTitle>
              <p className="text-muted-foreground text-xs">
                Created and delivered —{" "}
                {m.singleDay ? `${range.label ?? "selected day"} (14-day context)` : `${m.spanDays} days`}
              </p>
            </CardHeader>
            <CardContent className="pt-2 pb-2">
              {loading && !data ? (
                <Skeleton className="h-[140px] w-full rounded-lg" />
              ) : (
                <ChartContainer config={chartConfig} className="h-[140px] w-full">
                  <BarChart data={m.days} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={6}
                      interval={0}
                      tick={{ fontSize: m.spanDays > 14 ? 9 : 10 }}
                    />
                    <ChartTooltip cursor={{ fillOpacity: 0.06 }} content={<ChartTooltipContent />} />
                    <Bar dataKey="packages" fill="var(--color-packages)" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                    <Bar dataKey="delivered" fill="var(--color-delivered)" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...enter(3)}>
          <Card size="sm" className="relative h-full overflow-hidden border-border/60 shadow-sm">
            <BorderBeam size={56} duration={10} />
            <CardHeader className="pb-0">
              <CardTitle className="font-semibold text-sm tracking-tight">Delivery progress</CardTitle>
              <p className="text-muted-foreground text-xs">Delivered ÷ all packages</p>
            </CardHeader>
            <CardContent className="flex items-center justify-center pt-1 pb-3">
              <div className="relative size-[104px]">
                <svg viewBox="0 0 100 100" className="size-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" strokeWidth="9" className="stroke-muted" />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    strokeWidth="9"
                    strokeLinecap="round"
                    className="stroke-primary"
                    strokeDasharray={2 * Math.PI * 42}
                    initial={reduced ? false : { strokeDashoffset: 2 * Math.PI * 42 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - m.successPct / 100) }}
                    transition={{ duration: reduced ? 0 : 0.8, ease: "easeOut" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-bold text-xl tabular-nums">{m.successPct}%</span>
                  <span className="text-[10px] text-muted-foreground">
                    {m.delivered}/{m.total}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent activity */}
      <motion.div {...enter(4)}>
        <Card size="sm" className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="font-semibold text-sm tracking-tight">Recent activity</CardTitle>
              <button
                type="button"
                onClick={onGoToPackages}
                className="flex items-center gap-0.5 font-medium text-primary text-xs hover:underline"
              >
                View all packages
                <ChevronRight className="size-3" aria-hidden="true" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="pb-3">
            {loading && !data ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ) : m.recent.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                <PackageOpen className="size-6 text-muted-foreground/50" aria-hidden="true" />
                <p className="font-medium text-muted-foreground text-sm">No internal packages yet</p>
                <p className="text-muted-foreground/60 text-xs">
                  Create the first one with the New Internal Package button.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {m.recent.map((p, i) => (
                  <motion.div key={p.id} {...enter(5 + i)}>
                    <ActivityRow p={p} uid={data?.caller_user_id ?? ""} myEmail={myEmail} />
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function ActivityRow({ p, uid, myEmail }: { p: InternalPackage; uid: string; myEmail: string | null }) {
  const dir = directionOf(p, uid, myEmail);
  const icon = isDelivered(p) ? (
    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
  ) : isInMotion(p) ? (
    <Truck className="size-4 text-blue-500" />
  ) : (
    <Clock className="size-4 text-muted-foreground" />
  );
  return (
    <div className="flex items-center gap-3 py-2">
      <span aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-[13px] text-foreground leading-tight">
          {p.pickup_name ?? "—"} → {p.recipient_name}
        </p>
        <p className="truncate font-mono text-[11px] text-primary/70 leading-tight">{p.stop_id ?? p.id.slice(-10)}</p>
      </div>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]",
          dir === "outgoing"
            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
            : "bg-violet-500/10 text-violet-600 dark:text-violet-400",
        )}
      >
        {dir === "outgoing" ? <ArrowUpRight className="size-2.5" /> : <ArrowDownLeft className="size-2.5" />}
        {dir === "outgoing" ? "Outgoing" : "Incoming"}
      </span>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 font-semibold text-[10px]", statusBadgeCls(p))}>
        {statusLabelOf(p)}
      </span>
    </div>
  );
}
