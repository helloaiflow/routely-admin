"use client";

import Link from "next/link";

import { motion } from "framer-motion";
import { ChevronRight, DollarSign, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";

import { statusLabel, statusTone, toneClasses } from "./_helpers";
import type { DashboardStop } from "./_types";

export function CodQueue({ items, loading }: { items: DashboardStop[]; loading: boolean }) {
  const total = items.reduce((acc, s) => acc + (s.collect_amount ?? 0), 0);

  return (
    <Card className="@container/card flex flex-col border-0 shadow-sm ring-1 ring-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold leading-none">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <DollarSign className="size-3.5 text-violet-600 dark:text-violet-400" />
          </span>
          COD Queue
        </CardTitle>
        <CardDescription>
          {loading ? "Loading…" : `${items.length} pending collection${items.length !== 1 ? "s" : ""}`}
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/orders?filter=cod">
              <span className="hidden md:inline">View All</span>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex-1">
        {loading ? (
          <div className="space-y-2">
            {["a", "b", "c"].map((k) => (
              <Skeleton key={k} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-muted-foreground/40">
            <Inbox className="size-8 opacity-50" />
            <p className="font-medium text-xs">No COD collections pending</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[220px]">
            <ul className="space-y-1.5 pr-2">
              {items.slice(0, 8).map((s, i) => {
                const tone = toneClasses[statusTone(s.status)];
                return (
                  <motion.li
                    key={s.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.03 }}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground text-xs">{s.recipient_name || "—"}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {s.delivery_city} {s.delivery_zip}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={cn("rounded-md px-1.5 py-0.5 font-semibold text-[10px]", tone.bg, tone.text)}>
                        {statusLabel(s.status)}
                      </span>
                      <span className="font-bold text-xs tabular-nums">{formatCurrency(s.collect_amount ?? 0)}</span>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>

      <CardFooter className="justify-between border-border/50 border-t pt-3">
        <span className="font-medium text-muted-foreground text-xs">Pending Total</span>
        <span className="font-bold text-base tabular-nums">{formatCurrency(total)}</span>
      </CardFooter>
    </Card>
  );
}
