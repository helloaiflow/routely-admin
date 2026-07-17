"use client";

import { useMemo } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { eventStatus, fmtMs, fmtTime, type Scan, type ScanRecord, type ScanStatus } from "./types";

const ICON: Record<ScanStatus, { Icon: React.ElementType; cls: string }> = {
  processed: { Icon: CheckCircle2, cls: "bg-success/10 text-success" },
  failed: { Icon: AlertTriangle, cls: "bg-warning/15 text-warning dark:text-warning" },
  error: { Icon: XCircle, cls: "bg-destructive/10 text-destructive" },
  inprocess: { Icon: CheckCircle2, cls: "bg-info/10 text-info" },
};

export function OcrActivity({
  scans,
  loading,
  onSelect,
}: {
  scans: Scan[];
  loading: boolean;
  onSelect: (s: Scan) => void;
}) {
  const events = useMemo(() => {
    const flat: { r: ScanRecord; scan: Scan }[] = [];
    for (const s of scans) for (const r of s.events) flat.push({ r, scan: s });
    return flat.sort((a, b) => new Date(b.r.created_at ?? 0).getTime() - new Date(a.r.created_at ?? 0).getTime());
  }, [scans]);

  if (loading && events.length === 0) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={`ake-${i}`} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-14 text-center text-muted-foreground text-sm">No activity in this window.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-2">
        <div className="divide-y divide-border/50">
          <AnimatePresence initial={false}>
            {events.slice(0, 100).map(({ r, scan }, i) => {
              const st = eventStatus(r);
              const { Icon, cls } = ICON[st];
              return (
                <motion.button
                  key={`${r._id ?? i}-${r.created_at}`}
                  type="button"
                  layout
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => onSelect(scan)}
                  className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                >
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", cls)}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <span className="font-medium capitalize">{st}</span>
                      <span className="text-muted-foreground"> · {(r.provider ?? "—").toUpperCase()}</span>
                      {r.used_retry && <span className="text-warning"> · retry</span>}
                      {r.used_second_pass && <span className="text-muted-foreground"> · 2nd pass</span>}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">
                      {r.error_code ? `${r.error_code}${r.error_message ? ` — ${r.error_message}` : ""}` : (r.model ?? "extraction")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium text-sm tabular-nums">{fmtMs(r.latency_ms)}</p>
                    <p className="text-muted-foreground text-xs tabular-nums">{fmtTime(r.created_at)}</p>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
