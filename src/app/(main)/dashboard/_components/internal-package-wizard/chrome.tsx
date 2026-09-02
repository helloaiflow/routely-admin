"use client";

/* Wizard chrome: header stepper + shared summary primitives. */

import { Check } from "lucide-react";

import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";

import { STEP_LABELS, type WizardStep } from "./types";

export function WizardStepper({
  current,
  maxReached,
  onJump,
}: {
  current: WizardStep;
  maxReached: WizardStep;
  onJump: (s: WizardStep) => void;
}) {
  const steps: WizardStep[] = [1, 2, 3, 4, 5];
  return (
    <div
      className="flex w-full items-center justify-center gap-1 overflow-x-auto pb-0.5 sm:gap-1.5"
      role="tablist"
      aria-label="Wizard steps"
    >
      {steps.map((s, i) => {
        const done = s < current || (current === 5 && s < 5);
        const active = s === current;
        const clickable = done && current !== 5 && s <= maxReached;
        return (
          <div key={s} className={cn("flex min-w-0 items-center gap-1 sm:gap-1.5", i > 0 && "flex-1")}>
            {i > 0 && (
              <div className={cn("h-px min-w-3 flex-1", done || active ? "bg-primary/50" : "bg-border")} />
            )}
            <button
              type="button"
              role="tab"
              aria-selected={active}
              disabled={!clickable}
              onClick={() => clickable && onJump(s)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-1.5 py-0.5",
                clickable && "cursor-pointer hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                  done
                    ? "bg-emerald-500 text-white"
                    : active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3" /> : s}
              </span>
              <span
                className={cn(
                  "text-xs whitespace-nowrap",
                  active ? "font-semibold text-foreground" : done ? "font-medium text-foreground/80" : "text-muted-foreground",
                )}
              >
                {STEP_LABELS[s]}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Small labeled section card used across step summaries. */
export function SummaryCard({
  title,
  action,
  children,
  className,
  beam = false,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Magic-UI border beam orbiting the card (CEO: "dale vida"). */
  beam?: boolean;
}) {
  return (
    <div className={cn("relative space-y-1.5 overflow-hidden rounded-xl border border-border bg-card p-3", className)}>
      {beam && <BorderBeam size={56} duration={8} />}
      <div className="flex items-center justify-between">
        <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-[10px] text-destructive">{msg}</p>;
}
