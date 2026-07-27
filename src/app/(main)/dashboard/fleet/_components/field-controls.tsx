"use client";

import { useState } from "react";

import { Check, ChevronsUpDown, Minus, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

/** 12-hour display for an HH:MM 24h value: "13:15" → "1:15 PM". */
export function formatTime12(hhmm: string): string {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return hhmm;
  let h = parseInt(m[1], 10);
  const mer = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${mer}`;
}

/** Loose time parse → canonical HH:MM 24h, or null when unparseable.
 * Accepts "1:15 PM", "1:15pm", "115pm", "13:15", "1:15", "7", "0730". */
export function parseLooseTime(input: string): string | null {
  const t = input.trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
  if (!t) return null;
  let mer: "a" | "p" | null = null;
  let core = t;
  const mm = core.match(/(am|pm|a|p)$/);
  if (mm) { mer = mm[1][0] as "a" | "p"; core = core.slice(0, -mm[1].length); }
  let h: number, min: number;
  if (/^\d{3,4}$/.test(core)) {          // compact: 115 / 0730 / 1315
    h = parseInt(core.slice(0, core.length - 2), 10);
    min = parseInt(core.slice(-2), 10);
  } else {
    const m = core.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
    if (!m) return null;
    h = parseInt(m[1], 10);
    min = m[2] ? parseInt(m[2].padEnd(2, "0"), 10) : 0;
  }
  if (min > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (mer === "p" && h !== 12) h += 12;
    if (mer === "a" && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Editable 12-hour time combobox: shows the 15-min grid AND accepts free
 * typing ("1:15 PM", "115pm", "13:15"). Emits canonical HH:MM 24h — payload
 * format unchanged. Invalid input shows an inline error and never saves. */
export function TimeCombobox({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;               // HH:MM 24h or ""
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null); // null = not editing
  const [invalid, setInvalid] = useState(false);
  const shown = draft ?? (value ? formatTime12(value) : "");

  const commit = (raw: string) => {
    const t = raw.trim();
    if (!t) { setDraft(null); setInvalid(false); onChange(""); return; }
    const parsed = parseLooseTime(t);
    if (!parsed) { setInvalid(true); return; } // keep draft; never save garbage
    setDraft(null); setInvalid(false); setOpen(false); onChange(parsed);
  };

  return (
    <div className="flex flex-col items-end">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <input
            value={shown}
            aria-label={ariaLabel}
            aria-invalid={invalid || undefined}
            placeholder="—"
            onFocus={() => setOpen(true)}
            onChange={(e) => { setDraft(e.target.value); setInvalid(false); }}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }}
            className={cn(
              "h-(--spacing-control-h-sm) w-[110px] rounded-none border-0 border-b bg-transparent px-0.5 text-right font-mono text-13 font-medium tabular-nums text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:ring-0",
              invalid ? "border-rose-500/70 text-rose-600" : "border-transparent focus:border-primary/40",
            )}
          />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="max-h-64 w-[130px] overflow-y-auto p-1"
        >
          {TIME_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setDraft(null); setInvalid(false); setOpen(false); onChange(t); }}
              className={cn(
                "block w-full rounded-sm px-2 py-1 text-left font-mono text-13 tabular-nums transition-colors hover:bg-accent",
                value === t && "bg-accent font-semibold",
              )}
            >
              {formatTime12(t)}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      {invalid && <p className="mt-0.5 text-10 text-rose-500">Invalid time — try "1:15 PM"</p>}
    </div>
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
    <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border/60 bg-card/95 backdrop-blur-sm lg:hidden [padding-bottom:env(safe-area-inset-bottom)]">
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

/* ── Generic searchable multi-select (Command + Popover, replace-toggle) ──── */
export function SearchMultiSelect({
  items,
  selected,
  onToggle,
  placeholder,
  searchPlaceholder,
  emptyText,
  icon: Icon,
  badgeTone = "default",
}: {
  items: { id: string; label: string; hint?: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  badgeTone?: "default" | "destructive";
}) {
  const [open, setOpen] = useState(false);
  const selectedItems = items.filter((i) => selected.includes(i.id));
  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 w-full justify-between font-normal text-13"
          >
            <span className="flex items-center gap-2 truncate">
              {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden={true} />}
              {selected.length > 0 ? (
                <span>
                  {placeholder} <span className="text-muted-foreground">· {selected.length} selected</span>
                </span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {items.map((item) => {
                  const isSel = selected.includes(item.id);
                  return (
                    <CommandItem key={item.id} value={item.label} onSelect={() => onToggle(item.id)}>
                      <Check className={cn("size-3.5", isSel ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                      {item.hint && <span className="ml-auto text-10 text-muted-foreground">{item.hint}</span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <Badge
              key={item.id}
              variant={badgeTone === "destructive" ? "destructive" : "secondary"}
              className="gap-1 pr-1"
            >
              {item.label}
              {item.hint && <span className="opacity-60">{item.hint}</span>}
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                className="grid size-4 place-items-center rounded-sm transition-colors hover:bg-background/40"
                aria-label={`Remove ${item.label}`}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
