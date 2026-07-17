"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowDownToLine, CheckCircle2, Clock3, Package, Truck } from "lucide-react";

import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { DashboardPipeline } from "./_types";

const STAGES = [
  { key: "pending" as const, label: "Pending", icon: Package, color: "var(--primary)" },
  { key: "in_transit" as const, label: "In Transit", icon: Clock3, color: "#d97706" },
  { key: "delivered" as const, label: "Delivered", icon: CheckCircle2, color: "#059669" },
  { key: "failed" as const, label: "Failed", icon: AlertTriangle, color: "#dc2626" },
];

export function DeliveryPipeline({ pipeline, loading }: { pipeline?: DashboardPipeline; loading: boolean }) {
  const pickups = pipeline?.pickups ?? 0;
  const deliveries = pipeline?.deliveries ?? 0;
  const typeTotal = pickups + deliveries;
  const stageTotal = pipeline
    ? Object.entries(pipeline)
        .filter(([k]) => ["pending", "in_transit", "delivered", "failed"].includes(k))
        .reduce((a, [, v]) => a + (v as number), 0)
    : 0;

  const successRate = stageTotal > 0 && pipeline ? Math.round(((pipeline.delivered ?? 0) / stageTotal) * 100) : null;

  return (
    <Card className="@container/card border-0 shadow-sm ring-1 ring-border">
      {/* Header — CardHeader pattern */}
      <CardHeader>
        <CardTitle className="font-semibold leading-none">Stop Pipeline</CardTitle>
        <CardDescription>
          {stageTotal > 0
            ? `${stageTotal} stops · ${successRate ?? 0}% delivered`
            : "Real-time delivery status breakdown"}
        </CardDescription>
        <CardAction>
          <div className="flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1 ring-1 ring-primary/20">
            <div className="size-1.5 animate-pulse rounded-full bg-primary" />
            <span className="font-semibold text-[10px] text-primary">Live</span>
          </div>
        </CardAction>
      </CardHeader>

      <div className="space-y-3 px-6 pb-6">
        {/* Type split */}
        <div className="flex gap-2">
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="flex flex-1 items-center gap-2.5 rounded-lg border border-violet-200/70 bg-violet-50/60 px-3 py-2 dark:border-violet-800/40 dark:bg-violet-900/20"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-600">
              <ArrowDownToLine className="size-3.5 text-white" />
            </div>
            <div>
              <p className="font-medium text-[10px] text-violet-600 uppercase tracking-wide">Pick Ups</p>
              {loading ? (
                <div className="mt-0.5 h-5 w-6 animate-pulse rounded bg-violet-500/25" />
              ) : (
                <p className="font-black text-violet-900 text-xl tabular-nums leading-none dark:text-violet-100">
                  {pickups}
                </p>
              )}
            </div>
            <span className="ml-auto rounded-full bg-violet-500/15 px-1.5 py-0.5 font-semibold text-[10px] text-violet-700 dark:text-violet-400">
              {typeTotal > 0 ? `${Math.round((pickups / typeTotal) * 100)}%` : "—"}
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.05 }}
            className="flex flex-1 items-center gap-2.5 rounded-lg border border-blue-200/70 bg-blue-50/60 px-3 py-2 dark:border-blue-800/40 dark:bg-blue-900/20"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Truck className="size-3.5 text-white" />
            </div>
            <div>
              <p className="font-medium text-[10px] text-blue-600 uppercase tracking-wide">Deliveries</p>
              {loading ? (
                <div className="mt-0.5 h-5 w-6 animate-pulse rounded bg-blue-500/25" />
              ) : (
                <p className="font-black text-blue-900 text-xl tabular-nums leading-none dark:text-blue-100">
                  {deliveries}
                </p>
              )}
            </div>
            <span className="ml-auto rounded-full bg-blue-500/15 px-1.5 py-0.5 font-semibold text-[10px] text-blue-700 dark:text-blue-400">
              {typeTotal > 0 ? `${Math.round((deliveries / typeTotal) * 100)}%` : "—"}
            </span>
          </motion.div>
        </div>

        {/* Stage cards */}
        <div className="flex gap-1.5">
          {STAGES.map((stage, i) => {
            const Icon = stage.icon;
            const count = pipeline?.[stage.key] ?? 0;
            const pct = stageTotal > 0 ? Math.round((count / stageTotal) * 100) : 0;
            return (
              <motion.div
                key={stage.key}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.1 + i * 0.06 }}
                className="flex flex-1 flex-col gap-1.5 rounded-lg border border-border/40 bg-card px-2.5 py-2.5"
              >
                <div className="flex items-center justify-between">
                  <Icon className="size-3.5" style={{ color: stage.color }} />
                  {loading ? (
                    <div className="h-5 w-6 animate-pulse rounded bg-muted/40" />
                  ) : (
                    <span className="font-black text-foreground text-lg tabular-nums leading-none">{count}</span>
                  )}
                </div>
                <p className="font-medium text-[10px] text-muted-foreground">{stage.label}</p>
                <div className="h-1 overflow-hidden rounded-full bg-border/40">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: stage.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, delay: 0.2 + i * 0.06, ease: "easeOut" }}
                  />
                </div>
                <span
                  className={cn(
                    "text-right font-semibold text-[10px] tabular-nums",
                    loading ? "text-transparent" : "text-muted-foreground/50",
                  )}
                >
                  {pct}%
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
