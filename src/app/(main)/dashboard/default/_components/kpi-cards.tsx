"use client";

import { CheckCircle2, MapPin, Truck, XCircle } from "lucide-react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HyperText } from "@/components/ui/hyper-text";
import { cn } from "@/lib/utils";

import type { DashboardKpis } from "./_types";

const CARDS = [
  {
    key: "total" as const,
    label: "Today's Stops",
    subtitle: "Scheduled today",
    subtitleCls: "text-muted-foreground",
    format: "number" as const,
    icon: MapPin,
    pctKey: "total_pct" as const,
  },
  {
    key: "in_transit" as const,
    label: "In Transit",
    subtitle: "Out for delivery",
    subtitleCls: "text-blue-600/80 dark:text-blue-400/80 font-medium",
    format: "number" as const,
    icon: Truck,
    pctKey: null,
  },
  {
    key: "delivered" as const,
    label: "Delivered",
    subtitle: "Completed today",
    subtitleCls: "text-muted-foreground",
    format: "number" as const,
    icon: CheckCircle2,
    pctKey: "delivered_pct" as const,
  },
  {
    key: "failed" as const,
    label: "Failed",
    subtitle: "Couldn't deliver today",
    subtitleCls: "text-rose-600/80 dark:text-rose-400/80 font-medium",
    format: "number" as const,
    icon: XCircle,
    pctKey: null,
  },
] as const;

export function KpiCards({ kpis, loading }: { kpis?: DashboardKpis; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/10 *:data-[slot=card]:to-card md:grid-cols-4">
      {CARDS.map((card) => {
        const Icon = card.icon;
        const value = loading || !kpis ? null : ((kpis[card.key] as number) ?? 0);
        const pct = !loading && kpis && card.pctKey ? (kpis[card.pctKey] as number | null) : null;
        const pos = (pct ?? 0) >= 0;

        // Description text — always 1 line, same height across all cards
        const description =
          pct != null ? (
            <>
              <span
                className={cn(
                  "font-semibold",
                  pos ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400",
                )}
              >
                {pos ? "+" : ""}
                {pct}%
              </span>
              {" from yesterday"}
            </>
          ) : (
            <span className={card.subtitleCls}>{card.subtitle}</span>
          );

        return (
          <Card key={card.key} className="@container/card gap-3 py-4">
            <CardHeader className="pb-1">
              <CardTitle className="font-semibold text-sm leading-none">{card.label}</CardTitle>
              <CardDescription className="truncate text-xs">{description}</CardDescription>
              <CardAction>
                <Icon className="size-4 text-muted-foreground/35 lg:size-5" aria-hidden="true" />
              </CardAction>
            </CardHeader>

            <CardContent className="pt-0">
              {value === null ? (
                <div className="h-8 w-16 animate-pulse rounded-lg bg-muted" />
              ) : (
                <HyperText className="font-bold text-2xl tracking-tight lg:text-3xl" duration={700} delay={100}>
                  {String(Math.round(value))}
                </HyperText>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
