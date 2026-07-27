"use client";

/* Shared dense form-row kit (density Phase 1d) — the Stops detail-form recipe
 * that hubs-tab / drivers-tab / stops duplicated. One home, token-based.
 *   FieldRow  — label LEFT, control RIGHT, thin divider; optional required/error
 *   StackRow  — label on top, full-width control beneath (autocompletes, selects)
 *   Group     — borderless collapsible section (icon + title + chevron)
 *   ROW_INPUT — borderless right-aligned input recipe (control-h-sm)
 */

import { useState } from "react";

import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export const ROW_INPUT =
  "h-(--spacing-control-h-sm) min-w-0 rounded-none border-0 border-b border-transparent bg-transparent px-0.5 text-right text-13 font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-0 focus-visible:ring-0";

export function FieldRow({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/[0.07] py-2 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <span className="shrink-0 text-11 text-muted-foreground/65 leading-snug">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </span>
        <div className="flex min-w-0 items-center justify-end gap-1.5">{children}</div>
      </div>
      {error && <p className="mt-1 text-right text-11 text-rose-500">{error}</p>}
    </div>
  );
}

export function StackRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 border-b border-border/[0.07] py-2 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0 text-11 text-muted-foreground/65 leading-snug">{label}</span>
        {hint && <span className="type-caption truncate">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function Group({
  icon: Icon,
  title,
  note,
  defaultOpen = true,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  note?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/10 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-muted-foreground/50" aria-hidden={true} />
          <span className="text-xs font-semibold tracking-[-0.01em] text-foreground/80">{title}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground/35 transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="px-3 pb-2">
          {note && <p className="mb-1 text-11 text-muted-foreground/55 leading-snug">{note}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
