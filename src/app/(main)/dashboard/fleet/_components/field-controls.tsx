"use client";

import { Minus, Plus } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** 15-minute time options for the whole day: 00:00 … 23:45 (payload stays HH:MM). */
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

const CLEAR = "__clear__";

/** Foolproof time field: a select in 15-min steps — no free typing, no typos.
 *  Emits "HH:MM" (identical payload format) or "" when cleared. */
export function TimeSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  // A stored value off the 15-min grid (legacy data) is kept as an extra option
  // so the select never silently rewrites it.
  const options = value && !TIME_OPTIONS.includes(value)
    ? [value, ...TIME_OPTIONS]
    : TIME_OPTIONS;
  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v === CLEAR ? "" : v)}>
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        className="h-7 w-[110px] justify-end gap-1 border-0 bg-transparent pr-1 font-mono text-13 font-medium tabular-nums text-foreground focus:ring-0"
      >
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent align="end" className="max-h-64">
        {value && <SelectItem value={CLEAR} className="text-11 text-muted-foreground">Clear</SelectItem>}
        {options.map((t) => (
          <SelectItem key={t} value={t} className="font-mono text-13 tabular-nums">
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Foolproof numeric stepper: +/- buttons with clamping; the readout is not
 *  editable, so keyboard garbage is impossible. Value is a string to match the
 *  existing FormState fields ("" = unset → shows em dash). */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  zeroLabel,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  zeroLabel?: string; // e.g. "∞" for max-stops 0 = unlimited
  ariaLabel: string;
}) {
  const n = value.trim() === "" ? null : Number(value);
  const current = n == null || Number.isNaN(n) ? null : n;
  const set = (next: number) => onChange(String(Math.min(max, Math.max(min, next))));
  const display =
    current == null ? "—" : current === 0 && zeroLabel ? zeroLabel : `${current}${unit ?? ""}`;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        disabled={current != null && current <= min}
        onClick={() => set((current ?? min + step) - step)}
        className="flex size-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-35"
      >
        <Minus className="size-3" aria-hidden="true" />
      </button>
      <span
        className={cn(
          "min-w-[52px] text-center font-mono text-13 font-medium tabular-nums",
          current == null ? "text-muted-foreground/50" : "text-foreground",
        )}
      >
        {display}
      </span>
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        disabled={current != null && current >= max}
        onClick={() => set((current ?? min) + step)}
        className="flex size-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-35"
      >
        <Plus className="size-3" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Sticky bottom tab bar for mobile (<sm): List · Details · Map. */
export function MobileTabBar({
  active,
  onChange,
  hasSelection,
  tabs,
}: {
  active: string;
  onChange: (t: "list" | "detail" | "map") => void;
  hasSelection: boolean;
  tabs: { key: "list" | "detail" | "map"; label: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> }[];
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border/60 bg-card/95 backdrop-blur-sm sm:hidden [padding-bottom:env(safe-area-inset-bottom)]">
      {tabs.map(({ key, label, icon: Icon }) => {
        const disabled = key !== "list" && !hasSelection;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            title={disabled ? "Select a record first" : undefined}
            onClick={() => !disabled && onChange(key)}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 font-semibold text-10 transition-colors",
              disabled
                ? "cursor-not-allowed text-muted-foreground/30"
                : active === key
                  ? "text-primary"
                  : "text-muted-foreground",
            )}
          >
            <Icon className={cn("size-5", disabled ? "text-muted-foreground/30" : active === key ? "text-primary" : "text-muted-foreground")} aria-hidden={true} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
