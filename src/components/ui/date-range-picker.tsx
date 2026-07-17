"use client";

import { useState, useRef, useEffect } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

function formatShort(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function sod(d: Date) { // start of day
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}

function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  return sod(r);
}

function buildPresets(): { label: string; range: () => DateRange }[] {
  const today = sod(new Date());
  return [
    { label: "Today",       range: () => ({ from: today, to: today, label: "Today" }) },
    { label: "Yesterday",   range: () => { const y = sod(new Date(today)); y.setDate(y.getDate() - 1); return { from: y, to: y, label: "Yesterday" }; } },
    { label: "This Week",   range: () => ({ from: startOfWeek(today), to: today, label: "This Week" }) },
    { label: "Last 7 Days", range: () => { const f = sod(new Date(today)); f.setDate(f.getDate() - 6); return { from: f, to: today, label: "Last 7 Days" }; } },
    { label: "Last 28 Days",range: () => { const f = sod(new Date(today)); f.setDate(f.getDate() - 27); return { from: f, to: today, label: "Last 28 Days" }; } },
    { label: "This Month",  range: () => { const f = new Date(today.getFullYear(), today.getMonth(), 1); return { from: f, to: today, label: "This Month" }; } },
    { label: "Last Month",  range: () => { const f = new Date(today.getFullYear(), today.getMonth() - 1, 1); const t = new Date(today.getFullYear(), today.getMonth(), 0); return { from: f, to: t, label: "Last Month" }; } },
    { label: "This Year",   range: () => { const f = new Date(today.getFullYear(), 0, 1); return { from: f, to: today, label: "This Year" }; } },
  ];
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface MiniCalProps {
  viewYear: number;
  viewMonth: number;
  range: DateRange;
  selecting: "from" | "to" | null;
  onDayClick: (d: Date) => void;
  onPrev: () => void;
  onNext: () => void;
}

function MiniCal({ viewYear, viewMonth, range, selecting, onDayClick, onPrev, onNext }: MiniCalProps) {
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevDays = new Date(viewYear, viewMonth, 0).getDate();

  const today = sod(new Date());

  return (
    <div className="w-[280px] select-none">
      {/* Month nav */}
      <div className="mb-3 flex items-center justify-between px-1">
        <button type="button" onClick={onPrev} className="rounded-md p-1 hover:bg-muted transition-colors">
          <ChevronLeft className="size-4 text-foreground" />
        </button>
        <span className="text-sm font-semibold text-foreground">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button type="button" onClick={onNext} className="rounded-md p-1 hover:bg-muted transition-colors">
          <ChevronRight className="size-4 text-foreground" />
        </button>
      </div>

      {/* Day headers */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {DAYS.map((d) => (
          <div key={d} className="text-[11px] font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {/* Prev month days */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`p-${i}`} className="flex h-9 items-center justify-center">
            <span className="text-xs text-muted-foreground/30">{prevDays - firstDay + 1 + i}</span>
          </div>
        ))}
        {/* Current month */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = new Date(viewYear, viewMonth, i + 1);
          const sDay = sod(day);
          const isFrom = sDay.getTime() === range.from.getTime();
          const isTo   = sDay.getTime() === range.to.getTime();
          const inRange = sDay >= range.from && sDay <= range.to;
          const isToday = sDay.getTime() === today.getTime();

          return (
            <div key={i} className="flex h-9 items-center justify-center">
              <button
                type="button"
                onClick={() => onDayClick(sDay)}
                className={cn(
                  "relative flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-colors",
                  (isFrom || isTo)
                    ? "bg-primary text-primary-foreground font-semibold shadow"
                    : inRange
                    ? "bg-primary/15 text-foreground rounded-none"
                    : isToday
                    ? "text-primary font-semibold hover:bg-muted"
                    : "text-foreground hover:bg-muted",
                  isFrom && !isTo && "rounded-r-none",
                  isTo && !isFrom && "rounded-l-none",
                )}
              >
                {i + 1}
              </button>
            </div>
          );
        })}
        {/* Next month fill */}
        {(() => {
          const used = firstDay + daysInMonth;
          const remaining = used % 7 === 0 ? 0 : 7 - (used % 7);
          return Array.from({ length: remaining }).map((_, i) => (
            <div key={`n-${i}`} className="flex h-9 items-center justify-center">
              <span className="text-xs text-muted-foreground/30">{i + 1}</span>
            </div>
          ));
        })()}
      </div>
    </div>
  );
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear]   = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [selecting, setSelecting] = useState<"from" | "to" | null>(null);
  const [draft, setDraft]         = useState<DateRange>(value);
  const ref = useRef<HTMLDivElement>(null);

  const presets = buildPresets();

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function handleDayClick(d: Date) {
    if (selecting === null || selecting === "from") {
      setDraft({ from: d, to: d, label: "Custom" });
      setSelecting("to");
    } else {
      const from = draft.from <= d ? draft.from : d;
      const to   = draft.from <= d ? d : draft.from;
      const r = { from, to, label: "Custom" };
      setDraft(r);
      onChange(r);
      setSelecting(null);
      setOpen(false);
    }
  }

  function applyPreset(preset: typeof presets[0]) {
    const r = preset.range();
    setDraft(r);
    onChange(r);
    setViewYear(r.from.getFullYear());
    setViewMonth(r.from.getMonth());
    setOpen(false);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const label = value.label === "Custom"
    ? `${formatShort(value.from)} – ${formatShort(value.to)}`
    : value.label === "Today"
    ? `Today · ${formatShort(value.from)}`
    : `${formatShort(value.from)} – ${formatShort(value.to)}`;

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs font-medium"
        onClick={() => setOpen(o => !o)}
      >
        <CalendarRange className="size-3.5" />
        {label}
      </Button>

      {open && (
        <>
          {/* Mobile: full-screen overlay backdrop */}
          <div className="fixed inset-0 z-40 bg-black/20 sm:hidden" onClick={() => setOpen(false)} />

          {/* Popover — centered fixed on mobile, absolute right-0 on sm+ */}
          <div className={cn(
            "z-50 flex overflow-hidden rounded-xl border border-border bg-popover shadow-lg ring-1 ring-black/5",
            // Mobile: fixed, centered horizontally
            "fixed left-1/2 -translate-x-1/2 top-[60px] w-[calc(100vw-24px)] max-w-[420px]",
            // sm+: absolute, aligned to right of trigger
            "sm:fixed-none sm:absolute sm:right-0 sm:top-10 sm:w-auto sm:translate-x-0 sm:left-auto",
          )}>
            {/* Presets */}
            <div className="flex w-32 flex-col gap-0.5 border-r border-border bg-muted/20 p-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                    value.label === p.label
                      ? "bg-muted font-semibold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Calendar */}
            <div className="p-3">
              <MiniCal
                viewYear={viewYear}
                viewMonth={viewMonth}
                range={draft}
                selecting={selecting}
                onDayClick={handleDayClick}
                onPrev={prevMonth}
                onNext={nextMonth}
              />
              {selecting === "to" && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Now select the end date
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Default: Today
export function todayRange(): DateRange {
  const today = sod(new Date());
  return { from: today, to: today, label: "Today" };
}
