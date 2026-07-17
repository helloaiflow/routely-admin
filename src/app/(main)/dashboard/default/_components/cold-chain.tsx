"use client";

import { motion } from "framer-motion";
import { Snowflake } from "lucide-react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { statusLabel, statusTone, toneClasses } from "./_helpers";
import type { DashboardStop } from "./_types";

export function ColdChain({ items, loading }: { items: DashboardStop[]; loading: boolean }) {
  return (
    <Card className="@container/card flex flex-col border-0 shadow-sm ring-1 ring-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold leading-none">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-sky-500/10">
            <Snowflake className="size-3.5 text-sky-600 dark:text-sky-400" />
          </span>
          Cold Chain
        </CardTitle>
        <CardDescription>Temperature-sensitive deliveries</CardDescription>
        <CardAction>
          <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-sky-50 px-2 py-0.5 font-bold text-sky-700 text-xs tabular-nums dark:bg-sky-900/30 dark:text-sky-400">
            {loading ? "—" : items.length}
          </span>
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
            <motion.div
              animate={{ rotate: [0, -10, 10, 0] }}
              transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            >
              <Snowflake className="size-8 opacity-50" />
            </motion.div>
            <p className="font-medium text-xs">No cold packages today</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[260px]">
            <ul className="space-y-1.5 pr-2">
              {items.slice(0, 10).map((s, i) => {
                const tone = toneClasses[statusTone(s.status)];
                return (
                  <motion.li
                    key={s.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.03 }}
                    className="flex items-center justify-between gap-2 rounded-lg border border-sky-500/15 bg-sky-500/[0.04] px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground text-xs">{s.recipient_name || "—"}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{s.delivery_address}</p>
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
