"use client";

import { motion } from "framer-motion";
import { ArrowLeftRight, PenLine } from "lucide-react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { statusLabel, statusTone, toneClasses } from "./_helpers";
import type { DashboardStop } from "./_types";

function OperationalCard({
  icon: Icon,
  title,
  subtitle,
  href,
  items,
  loading,
  accentClass,
  iconBg,
  emptyMsg,
  countColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  href?: string;
  items: DashboardStop[];
  loading: boolean;
  accentClass: string;
  iconBg: string;
  emptyMsg: string;
  countColor: string;
}) {
  return (
    <Card className="@container/card flex flex-col border-0 shadow-sm ring-1 ring-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold leading-none">
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-lg", iconBg)}>
            <Icon className={cn("size-3.5", accentClass)} />
          </span>
          {title}
        </CardTitle>
        <CardDescription>{subtitle}</CardDescription>
        <CardAction>
          <div className={cn("flex items-center gap-2")}>
            <span
              className={cn(
                "inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 font-bold text-xs tabular-nums",
                countColor,
              )}
            >
              {loading ? "—" : items.length}
            </span>
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex-1">
        {loading ? (
          <div className="space-y-2">
            {["a", "b", "c"].map((k) => (
              <Skeleton key={k} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-muted-foreground/40">
            <Icon className="size-8 opacity-50" />
            <p className="font-medium text-xs">{emptyMsg}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[200px]">
            <ul className="space-y-1.5 pr-1">
              {items.slice(0, 10).map((s, i) => {
                const tone = toneClasses[statusTone(s.status)];
                return (
                  <motion.li
                    key={s.id}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: i * 0.03 }}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground text-xs">{s.recipient_name || "—"}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {[s.delivery_city, s.delivery_zip].filter(Boolean).join(" · ") || s.delivery_address || "—"}
                      </p>
                    </div>
                    <span
                      className={cn("shrink-0 rounded-md px-1.5 py-0.5 font-semibold text-[10px]", tone.bg, tone.text)}
                    >
                      {statusLabel(s.status)}
                    </span>
                  </motion.li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export function ActivityTrend({ stops, loading }: { stops?: DashboardStop[]; loading: boolean; trend?: unknown[] }) {
  const allStops = stops ?? [];

  const sigRequired = allStops.filter((s) => (s as unknown as Record<string, unknown>).requires_signature === true);

  const returnToSender = allStops.filter(
    (s) =>
      (s as unknown as Record<string, unknown>).return_to_sender === true ||
      s.status === "return_to_sender" ||
      s.status === "rts",
  );

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
      <OperationalCard
        icon={PenLine}
        title="Signature Required"
        subtitle="Stops needing recipient signature"
        href="/dashboard/orders?filter=signature"
        items={sigRequired}
        loading={loading}
        accentClass="text-blue-600 dark:text-blue-400"
        iconBg="bg-blue-500/10"
        countColor="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        emptyMsg="No signature stops today"
      />
      <OperationalCard
        icon={ArrowLeftRight}
        title="Return to Sender"
        subtitle="Failed deliveries flagged for return"
        href="/dashboard/orders?filter=rts"
        items={returnToSender}
        loading={loading}
        accentClass="text-rose-600 dark:text-rose-400"
        iconBg="bg-rose-500/10"
        countColor="bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
        emptyMsg="No returns flagged"
      />
    </div>
  );
}
