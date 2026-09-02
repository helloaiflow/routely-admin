"use client";

import { motion } from "framer-motion";
import { Check, Package } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { formatEta, legOf, packageEmoji, statusLabel, statusTone, toneClasses } from "./_helpers";
import type { DashboardStop } from "./_types";

export function UpcomingTimeline({
  items,
  selectedId,
  onSelect,
  loading,
}: {
  items: DashboardStop[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2.5 flex items-center justify-between px-0.5">
        <h4 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">Upcoming</h4>
        {items.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-[10px] text-muted-foreground">
            {items.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`tl-skeleton-${i}`} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
          <motion.div
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 14 }}
            className="flex size-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"
          >
            <Check className="size-4" />
          </motion.div>
          <p className="font-medium text-xs">All caught up</p>
        </div>
      ) : (
        <ScrollArea className="max-h-[420px] flex-1">
          <ol className="relative space-y-1 pr-2">
            {items.slice(0, 25).map((s, i) => {
              const tone = toneClasses[statusTone(s.status)];
              const isSelected = selectedId === s.id;
              const leg = legOf(s);
              const isPickup = leg === "PU";

              return (
                <motion.li
                  key={s.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(i, 8) * 0.03 }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    className={cn(
                      "group relative flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
                      isSelected
                        ? "scale-[1.01] border-primary/40 bg-primary/[0.06] shadow-sm"
                        : "border-border/40 bg-card hover:border-border hover:bg-muted/30",
                    )}
                  >
                    {/* Timeline dot + line */}
                    <div className="flex flex-col items-center pt-1">
                      <span className={cn("size-2 shrink-0 rounded-full ring-2 ring-background", tone.dot)} />
                      {i < Math.min(items.length, 25) - 1 && <span className="mt-1.5 h-8 w-px bg-border/60" />}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      {/* Row 1: name + emoji */}
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "shrink-0 rounded-md px-1.5 py-0.5 font-bold font-mono text-[10px]",
                            isPickup ? "bg-violet-500/15 text-violet-700 dark:text-violet-400" : "bg-blue-500/15 text-blue-700 dark:text-blue-400",
                          )}
                        >
                          {isPickup ? "PU" : "DL"}
                        </span>
                        <span className="truncate font-semibold text-foreground text-xs">
                          {s.recipient_name || "—"}
                        </span>
                        <span className="ml-auto shrink-0 text-sm">{packageEmoji(s.package_type)}</span>
                      </div>

                      {/* Row 2: city + zip */}
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {[s.delivery_city, s.delivery_zip].filter(Boolean).join(" · ") || s.delivery_address || "—"}
                      </p>

                      {/* Row 3: ETA + status */}
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="font-medium text-[10px] text-muted-foreground">
                          {formatEta(s.delivery_date, s.is_same_day)}
                        </span>
                        <span
                          className={cn("ml-auto rounded-full px-2 py-0.5 font-medium text-[10px]", tone.bg, tone.text)}
                        >
                          {statusLabel(s.status)}
                        </span>
                      </div>
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </ol>
        </ScrollArea>
      )}
    </div>
  );
}

export function PackageIcon() {
  return <Package className="size-3" />;
}
