"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Link2,
  MessageSquare,
  Navigation,
  Phone,
  Printer,
  Search,
  Truck,
  X,
} from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
// Canonical classification — Spoke's success boolean (delivery_succeeded) is the
// source of truth; the divergent local string-lists were removed (lib/status.ts).
import { isDelivered, isFailed, isInMotion, phaseOf } from "@/lib/status";
import { cn } from "@/lib/utils";

import { statusLabel } from "./_helpers";
import type { DashboardStop } from "./_types";
import { NextStopMap } from "./next-stop-map";

function stopPhase(s: DashboardStop): "completed" | "active" | "pending" {
  const p = phaseOf(s);
  return p === "in_motion" ? "active" : p === "pre" ? "pending" : "completed";
}

// The Live Stop Monitor is a control-tower feed of TODAY's DELIVERIES IN MOTION
// (+ the day's terminal stops that sink to the bottom). A stop only belongs here
// if it's dispatched/in-transit (a driver is moving it) OR already terminal today.
// EXCLUDE unassigned/draft/submit_failed/pending/deleted — they have no driver and
// aren't in motion, so they don't belong in a live delivery monitor.
function monitorEligible(s: DashboardStop): boolean {
  return phaseOf(s) !== "pre";
}

function fmtTime(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function _fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
  } catch {
    return "—";
  }
}

function toTitleCase(s: string): string {
  if (!s) return s;
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Format a US phone as (XXX) XXX-XXXX for the monitor row. Strips non-digits,
// drops a leading country-code 1 on 11-digit E.164, and degrades gracefully on
// short/garbage input (returns the raw string rather than mangling it).
function fmtPhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  if (d.length !== 10) return raw;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function pkgMeta(type: string): { emoji: string; label: string } {
  const t = (type ?? "").toLowerCase();
  if (t === "rx") return { emoji: "💊", label: "Prescription" };
  if (t === "lab") return { emoji: "🩸", label: "Lab" };
  if (t === "cold" || t === "cold_chain") return { emoji: "❄️", label: "Cold Chain" };
  if (t === "internal") return { emoji: "📦", label: "Internal" };
  if (t === "legal") return { emoji: "📄", label: "Legal" };
  if (t === "organs" || t === "organ") return { emoji: "🫀", label: "Organs" };
  if (t === "blood") return { emoji: "🩸", label: "Blood" };
  return { emoji: "📦", label: t ? t.toUpperCase() : "Package" };
}

function typeMeta(stopType: string): { emoji: string; label: string } {
  const t = (stopType ?? "").toLowerCase();
  if (t === "pickup") return { emoji: "📥", label: "Pickup" };
  if (t === "dropoff") return { emoji: "↩️", label: "Dropoff" };
  return { emoji: "🚚", label: "Delivery" };
}

function getEtaAt(s: DashboardStop): string | null {
  return s.eta_at ?? s.eta ?? null;
}

function getDriverName(s: DashboardStop): string {
  return s.driver_name ?? "Unassigned";
}

// ── "Today's deliveries" date logic (ET, DST-safe) ────────────────────────
// The monitor shows what is being DELIVERED today, by scheduled date — never
// created_at (that's only when the stop was entered).
function todayYmdET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
// Short "Jun 20" label (ET) for the monitor footer.
function monthDayET(): string {
  return new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
}
function ymdET(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  } catch {
    return null;
  }
}
// A stop "delivers today" by its scheduled delivery_date, else same-day flag,
// else its live ETA falling today. created_at is intentionally NOT considered.
function deliversToday(s: DashboardStop, today: string): boolean {
  if (s.delivery_date) return s.delivery_date.slice(0, 10) === today;
  if (s.is_same_day) return true;
  return ymdET(s.eta_at ?? s.eta ?? null) === today;
}

// Address shown at the StopNode — pickup-leg stops physically visit the
// pickup location (pharmacy), not the patient address.
function physicalStreet(s: DashboardStop): string {
  return s.stop_type === "pickup" ? s.pickup_address || s.delivery_address : s.delivery_address;
}

// ── Progress timeline stages ──────────────────────────────────────────────
// Lifecycle: Draft → Submitted → Assigned → In Route → Delivered
type Stage = { key: string; label: string };
const STAGES: Stage[] = [
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "assigned", label: "Assigned" },
  { key: "in_route", label: "In Route" },
  { key: "delivered", label: "Delivered" },
];

// Maps a real status → its active step on the Draft→…→Delivered stepper. The
// tracker is fully DATA-DRIVEN off this (the fill width + truck position are
// computed from the index, never a constant). `unassigned` = submitted to Spoke
// with NO driver yet → it sits at "Submitted" (1), NOT "Assigned" (2, which means
// a driver is assigned) — matches STOP_LIFECYCLE_DEFINITION.
function stageIndex(s: DashboardStop): number {
  const p = phaseOf(s);
  if (p === "delivered") return 4;
  if (p === "failed") return 3; // stopped here
  const st = (s.status ?? "").toLowerCase();
  if (p === "in_motion") return st === "assigned" ? 2 : 3;
  // pre-dispatch
  if (st === "draft") return 0;
  return 1; // submitted / unassigned / pending / created
}

// ── Status badge with colored pill (filled style for the new design) ──────
function statusBadgeColors(s: DashboardStop): { bg: string; text: string; ring: string; label: string } {
  const status = s.status ?? "";
  const st = status.toLowerCase();
  const p = phaseOf(s);
  if (p === "delivered") return { bg: "bg-emerald-500/90", text: "text-white", ring: "", label: "Delivered" };
  if (p === "failed") return { bg: "bg-rose-500/90", text: "text-white", ring: "", label: statusLabel(status) };
  // In-motion: show the REAL status (assigned vs in_transit) so a batch-assigned
  // stop reads "Assigned", not a blanket "In Transit". out_for_delivery/dispatched
  // still normalize to "In Transit" via statusLabel's mapping where applicable.
  if (p === "in_motion") {
    const label = st === "assigned" ? "Assigned" : st === "in_transit" ? "In Transit" : statusLabel(status);
    return { bg: "bg-blue-500/90", text: "text-white", ring: "", label };
  }
  // Pre-dispatch: unassigned / pending → amber chip (consistent w/ header strip + batch).
  if (["unassigned", "pending"].includes(st))
    return { bg: "bg-amber-500/90", text: "text-white", ring: "", label: "Unassigned" };
  return { bg: "bg-muted-foreground/90", text: "text-white", ring: "", label: statusLabel(status) };
}

// ── StopNode — clean professional row, no candy colors ───────────────────
function StopNode({
  s,
  pos,
  isSelected,
  isNext,
  onSelect,
}: {
  s: DashboardStop;
  pos: number;
  isSelected: boolean;
  isNext: boolean;
  onSelect: () => void;
}) {
  const delivered = isDelivered(s);
  const failed = isFailed(s);
  const live = isInMotion(s);

  // Subtle outlined status pill — not filled saturated. Each light chip carries
  // a dark: variant so it doesn't render as a white block on the dark grid (#6).
  const pillCls = delivered
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
    : failed
      ? "bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30"
      : live
        ? "bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30"
        : "bg-muted/60 text-muted-foreground ring-border/40 dark:bg-muted/40";

  // Number circle: only the active one gets the primary tint, rest stay muted.
  // dark: variants keep the tinted circles legible on the dark grid (#6).
  const numCls = delivered
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
    : failed
      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
      : live
        ? "bg-primary/10 text-primary dark:bg-primary/20"
        : "bg-muted/70 text-muted-foreground/80";

  const status = statusBadgeColors(s);
  const street = physicalStreet(s);
  const etaTag = fmtTime(getEtaAt(s));
  const stopId = s.stop_id ?? s.id.slice(-12).toUpperCase();
  // City/State/Zip line + phone for the stacked mobile-friendly row (#3/#4).
  const cityLine = [s.delivery_city, s.delivery_state, s.delivery_zip].filter(Boolean).join(", ");
  const phone = s.recipient_phone ? fmtPhone(s.recipient_phone) : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2.5 border-border/40 border-b px-3 py-2.5 text-left transition-all duration-200",
        // Brand-blue inset rail marks the live "NEXT" / selected row — adds a
        // real-time feel without layout shift. Subtle lift on hover.
        isSelected
          ? "bg-accent/30 shadow-[inset_2px_0_0_0_var(--primary)]"
          : isNext
            ? "bg-primary/[0.04] shadow-[inset_2px_0_0_0_var(--primary)] hover:bg-primary/[0.07]"
            : "hover:bg-accent/20 hover:pl-3.5",
      )}
    >
      <span
        className={cn(
          "relative mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-semibold text-[10px]",
          numCls,
        )}
      >
        {pos}
        {isNext && (
          <motion.span
            className="absolute -inset-1 rounded-full ring-2 ring-primary/55"
            animate={{ opacity: [0.45, 1, 0.45], scale: [1, 1.08, 1] }}
            transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            aria-hidden="true"
          />
        )}
      </span>

      <div className="min-w-0 flex-1">
        {/* Line 1: Name + NEXT badge + subtle status pill */}
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-semibold text-xs text-foreground leading-tight">
            {toTitleCase(s.recipient_name || "—")}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {isNext && (
              <span className="inline-flex items-center rounded-md bg-primary/12 px-1.5 py-0.5 font-bold text-[10px] text-primary leading-none tracking-widest ring-1 ring-primary/25">
                NEXT
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 font-semibold text-[10px] leading-none ring-1",
                pillCls,
              )}
            >
              {status.label}
            </span>
          </div>
        </div>

        {/* Line 2: Street address + ETA (clock icon, semibold, no background) */}
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <p className="truncate text-[11px] text-muted-foreground leading-tight">{street || "—"}</p>
          <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-[11px] text-foreground/75 tabular-nums leading-none">
            <Clock className="size-2.5 text-muted-foreground/60" aria-hidden="true" />
            {etaTag}
          </span>
        </div>

        {/* Line 3: City, State ZIP — full address stacked for mobile (#3) */}
        {cityLine && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70 leading-tight">{cityLine}</p>
        )}

        {/* Line 4: Recipient phone (mono italic, muted) */}
        {phone && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/65 italic leading-none">{phone}</p>
        )}

        {/* Line 5: RTL tracking number — always present in the monitor (no drafts
            here), kept visible on mobile per spec (#4). */}
        <p className="mt-0.5 truncate font-mono font-semibold text-[10px] text-primary leading-none tracking-tight">
          {stopId}
        </p>
      </div>
    </button>
  );
}

// ── ToolbarButton — small icon button used in DetailHeader ────────────────
function ToolbarButton({
  title,
  onClick,
  href,
  danger,
  children,
}: {
  title: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const cls = cn(
    "flex size-7 items-center justify-center rounded-md transition-all text-muted-foreground/60",
    danger ? "hover:bg-rose-500/10 hover:text-rose-500" : "hover:bg-muted hover:text-foreground",
  );
  if (href) {
    return (
      <a href={href} title={title} aria-label={title} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

// ── ProgressTimeline — Draft → Submitted → Assigned → In Route → Delivered
function ProgressTimeline({ s }: { s: DashboardStop }) {
  const idx = stageIndex(s);
  const failed = isFailed(s);
  const progressPct = idx === 0 ? 0 : (idx / (STAGES.length - 1)) * 100;

  return (
    <div className="px-3 pt-1 pb-3">
      <div className="relative flex items-center" style={{ height: 32 }}>
        {/* Background dashed track */}
        <div className="absolute inset-x-3 top-1/2 -translate-y-1/2">
          <div
            className="h-[2px] w-full rounded-full"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, hsl(var(--border)/0.35) 0px, hsl(var(--border)/0.35) 10px, transparent 10px, transparent 13px, hsl(var(--border)/0.2) 13px, hsl(var(--border)/0.2) 15px, transparent 15px, transparent 18px)",
            }}
          />
        </div>
        {/* Progress fill */}
        <div
          className="absolute inset-x-3 top-1/2 -translate-y-1/2 overflow-hidden"
          style={{ width: `calc(${progressPct}% - 0.75rem)` }}
        >
          <div
            className="h-[2px] origin-left"
            style={{
              width: "100%",
              backgroundImage: failed
                ? "repeating-linear-gradient(90deg, rgb(244, 63, 94) 0px, rgb(244, 63, 94) 10px, transparent 10px, transparent 13px, rgb(251, 113, 133) 13px, rgb(251, 113, 133) 15px, transparent 15px, transparent 18px)"
                : "repeating-linear-gradient(90deg, var(--primary) 0px, var(--primary) 10px, transparent 10px, transparent 13px, rgb(96, 165, 250) 13px, rgb(96, 165, 250) 15px, transparent 15px, transparent 18px)",
            }}
          />
        </div>
        {/* Stage dots */}
        {STAGES.map((stage, i) => {
          const pct = (i / (STAGES.length - 1)) * 100;
          const isCurrent = i === idx;
          const isPast = i < idx;
          const isFuture = i > idx;
          return (
            <div
              key={stage.key}
              className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `calc((${pct}% * ((100% - 1.5rem) * (1 / 100%))) + 0.75rem)` }}
            >
              {isCurrent ? (
                <div className="relative flex items-center justify-center">
                  <div
                    className={cn("absolute rounded-full", failed ? "bg-rose-500/20" : "bg-primary/20")}
                    style={{ width: 22, height: 22, transform: "scale(1.3)" }}
                  />
                  <Truck className={cn("size-[18px]", failed ? "text-rose-500" : "text-primary")} aria-hidden="true" />
                </div>
              ) : (
                <div
                  className={cn(
                    "size-[9px] rounded-full border-2 transition-colors duration-500",
                    isPast
                      ? failed
                        ? "border-rose-500 bg-rose-500/30"
                        : "border-primary bg-primary/30"
                      : isFuture
                        ? "border-border/50 bg-background"
                        : "border-primary bg-primary/30",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between px-0">
        {STAGES.map((stage, i) => {
          const isCurrent = i === idx;
          const isFuture = i > idx;
          return (
            <span
              key={stage.key}
              className={cn(
                "text-[10px] leading-tight tracking-wide transition-colors duration-500",
                isCurrent
                  ? failed
                    ? "font-semibold text-rose-600"
                    : "font-semibold text-primary"
                  : isFuture
                    ? "font-normal text-muted-foreground/35"
                    : "font-normal text-muted-foreground/55",
              )}
            >
              {stage.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Accent palette for the DetailSection stripe (matches status semantics) ─
function detailAccent(s: DashboardStop): { border: string; stripe: string; gradientFrom: string } {
  const p = phaseOf(s);
  if (p === "delivered")
    return { border: "border-emerald-300", stripe: "bg-emerald-600", gradientFrom: "from-emerald-600/10" };
  if (p === "failed") return { border: "border-rose-300", stripe: "bg-rose-600", gradientFrom: "from-rose-600/10" };
  if (p === "in_motion") return { border: "border-blue-300", stripe: "bg-blue-600", gradientFrom: "from-blue-600/10" };
  const st = (s.status ?? "").toLowerCase();
  // Unassigned / Submitted → AMBER (matches the status chip + the unassigned batch),
  // instead of falling through to the grey default.
  if (["unassigned", "pending"].includes(st))
    return { border: "border-amber-300", stripe: "bg-amber-500", gradientFrom: "from-amber-500/20" };
  return { border: "border-border", stripe: "bg-muted-foreground", gradientFrom: "from-muted-foreground/10" };
}

// ── DetailSection — new sticky header with action toolbar + progress ──────
function DetailSection({ s }: { s: DashboardStop & Record<string, unknown> }) {
  const accent = detailAccent(s);
  const tBadge = typeMeta(s.stop_type);
  const { emoji: pkgEmoji, label: pkgLabel } = pkgMeta(s.package_type ?? "");
  const status = statusBadgeColors(s);
  const driver = getDriverName(s);
  const stopId = s.stop_id ?? (s.id as string).slice(-12).toUpperCase();
  const recipientPhone = (s.recipient_phone as string | null) ?? null;
  const cityLine = [s.delivery_city, s.delivery_state, s.delivery_zip].filter(Boolean).join(", ");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([s.delivery_address, cityLine].filter(Boolean).join(", "))}`;
  const labelUrl = `/dashboard/stops?print=${stopId}`;
  const detailUrl = `/dashboard/search/${stopId}`;

  const handleCopyId = () => {
    navigator.clipboard.writeText(stopId).catch(() => undefined);
  };
  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(`${window.location.origin}${detailUrl}`).catch(() => undefined);
    }
  };

  return (
    <div className={cn("sticky top-0 z-10 shrink-0 border-b bg-card", accent.border)}>
      <div className={cn("h-[3px] w-full", accent.stripe)} />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 top-[3px] bg-gradient-to-b to-transparent",
          accent.gradientFrom,
        )}
      />

      {/* Top toolbar — RTL + action buttons */}
      <div className="relative flex items-center justify-between gap-2 px-4 pt-2.5 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={detailUrl} className="truncate font-mono font-semibold text-xs text-primary hover:underline">
            {stopId}
          </Link>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 font-semibold text-[10px] leading-none ring-1",
              s.stop_type === "pickup"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20"
                : s.stop_type === "dropoff"
                  ? "bg-violet-500/10 text-violet-700 dark:text-violet-400 ring-violet-500/20"
                  : "bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-sky-500/20",
            )}
          >
            {tBadge.label}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ToolbarButton title="Copy Stop ID" onClick={handleCopyId}>
            <Copy className="size-3.5" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton title="Print Label" href={labelUrl}>
            <Printer className="size-3.5" aria-hidden="true" />
          </ToolbarButton>
          {recipientPhone && (
            <ToolbarButton title="Call recipient" href={`tel:${recipientPhone}`}>
              <Phone className="size-3.5" aria-hidden="true" />
            </ToolbarButton>
          )}
          {recipientPhone && (
            <ToolbarButton title="SMS recipient" href={`sms:${recipientPhone}`}>
              <MessageSquare className="size-3.5" aria-hidden="true" />
            </ToolbarButton>
          )}
          <ToolbarButton title="Google Maps" href={mapsUrl}>
            <Navigation className="size-3.5" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton title="Open full details" href={detailUrl}>
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton title="Copy share link" onClick={handleCopyLink}>
            <Link2 className="size-3.5" aria-hidden="true" />
          </ToolbarButton>
        </div>
      </div>

      {/* Recipient block */}
      <div className="relative px-4 pb-3">
        <p className="font-bold text-base text-foreground leading-tight tracking-tight">
          {toTitleCase(s.recipient_name || "—")}
        </p>
        <p className="mt-0.5 truncate font-semibold text-xs text-foreground/75 leading-tight">
          {physicalStreet(s) || "—"}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{cityLine || "—"}</p>

        {/* Inline badges row — type / package / status / same-day / signature / cod / rts */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/70 px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
            {tBadge.emoji} {tBadge.label}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/70 px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
            {pkgEmoji} {pkgLabel}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-semibold text-[10px] ring-1",
              isDelivered(s)
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20"
                : isFailed(s)
                  ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/20"
                  : isInMotion(s)
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20"
                    : "bg-muted/40 text-muted-foreground ring-border",
            )}
          >
            {status.label}
          </span>
          {s.is_same_day && (
            <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/20">
              ⚡ Same Day
            </span>
          )}
          {s.requires_signature && (
            <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 font-medium text-[10px] text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-500/20">
              ✍ Signature
            </span>
          )}
          {s.collect_cod && (
            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-medium text-[10px] text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20">
              💵 COD
            </span>
          )}
          {s.return_to_sender && (
            <span className="rounded-md bg-rose-500/10 px-1.5 py-0.5 font-medium text-[10px] text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/20">
              ↩ RTS
            </span>
          )}
        </div>

        {/* Driver row */}
        <div className="mt-1.5 flex items-center gap-1.5">
          <Truck className="size-3 text-muted-foreground/60" aria-hidden="true" />
          <span className="font-medium text-[11px] text-muted-foreground">{toTitleCase(driver)}</span>
          {s.notes && <span className="truncate text-[10px] text-muted-foreground/60">· {s.notes as string}</span>}
        </div>
      </div>

      {/* Progress timeline */}
      <ProgressTimeline s={s} />
    </div>
  );
}

function StopFlow({
  stops,
  effectiveSelectedId,
  nextStopId,
  onSelect,
  mobileScroll,
}: {
  stops: DashboardStop[];
  effectiveSelectedId: string | null;
  nextStopId: string | null;
  onSelect: (id: string) => void;
  mobileScroll?: boolean;
}) {
  const [search, setSearch] = useState("");

  // No status filter — this is a live control-tower feed of ALL today's stops
  // (the parent already sorted them: next-to-deliver on top, terminal at the
  // bottom). Text search only.
  const filtered = useMemo(() => {
    if (!search.trim()) return stops;
    const q = search.toLowerCase();
    return stops.filter(
      (s) =>
        s.recipient_name?.toLowerCase().includes(q) ||
        s.delivery_address?.toLowerCase().includes(q) ||
        s.delivery_city?.toLowerCase().includes(q) ||
        (s.stop_id ?? s.id).toLowerCase().includes(q),
    );
  }, [stops, search]);

  return (
    <>
      <div className="mt-1 flex items-center justify-between border-border/35 border-t bg-muted/10 px-3 py-2">
        <span className="font-semibold text-[10px] text-muted-foreground/55 tracking-wide">Active Deliveries</span>
        <span className="text-[10px] text-muted-foreground/40 tabular-nums">
          {filtered.length}/{stops.length}
        </span>
      </div>

      <div className="flex items-center gap-1.5 px-3 pb-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3 -translate-y-1/2 text-muted-foreground/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stops…"
            className="h-7 w-full rounded-md border border-border/35 bg-background pr-6 pl-7 text-[10px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/35 focus:border-primary/35 focus:ring-1 focus:ring-primary/15"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground"
            >
              <X className="size-2.5" />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-5 text-center text-[10px] text-muted-foreground/45">
          {search ? "No stops match" : "No stops today"}
        </div>
      ) : (
        <div className={mobileScroll ? "max-h-[420px] overflow-y-auto" : undefined}>
          {/* Live reorder: each row animates to its new position (layout) as statuses
              change — next-to-deliver rises, delivered/failed sink — instead of jumping. */}
          <AnimatePresence initial={false}>
            {filtered.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ layout: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.15 } }}
              >
                <StopNode
                  s={item}
                  pos={stops.indexOf(item) + 1}
                  isSelected={item.id === effectiveSelectedId}
                  isNext={item.id === nextStopId}
                  onSelect={() => onSelect(item.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
export function NextStopPanel({
  allStops,
  loading,
  selectedId,
  onSelect,
}: {
  // `stop` (next_stop) and `upcoming` are still accepted from the parent but no
  // longer used here — the header now derives ONLY from the displayed monitorStops
  // (built from allStops) so header + list never diverge. See activeStop below.
  stop?: DashboardStop | null;
  upcoming?: DashboardStop[];
  allStops: DashboardStop[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // Live control-tower feed: ALL of TODAY's stops (no status filter), ordered so
  // the next-to-deliver is on top and delivered/failed sink to the bottom. Sort key:
  // phase rank (active 0 → pending 1 → terminal 2), then ETA ascending. Reorders live
  // as statuses change; the list animates the movement (StopFlow `layout`).
  const monitorStops = useMemo(() => {
    const today = todayYmdET();
    const rank = (s: DashboardStop) => {
      const ph = stopPhase(s); // "active" | "pending" | "completed"(terminal)
      return ph === "active" ? 0 : ph === "pending" ? 1 : 2;
    };
    return [...allStops]
      .filter((s) => deliversToday(s, today) && monitorEligible(s))
      .sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        const eA = getEtaAt(a) ?? a.delivery_date ?? "9999";
        const eB = getEtaAt(b) ?? b.delivery_date ?? "9999";
        return eA < eB ? -1 : eA > eB ? 1 : 0;
      });
  }, [allStops]);

  // "Next" = the first ACTIVE stop (closest ETA). Falls back to the first row.
  const nextStopId = useMemo(() => {
    const live = monitorStops.find((x) => stopPhase(x) === "active");
    return (live ?? monitorStops[0])?.id ?? null;
  }, [monitorStops]);

  // Active/header stop comes ONLY from the displayed feed, so header + list stay in
  // sync with the selected date. Empty feed → null → empty state (no phantom).
  const activeStop =
    (selectedId ? monitorStops.find((x) => x.id === selectedId) : null) ??
    monitorStops.find((x) => x.id === nextStopId) ??
    monitorStops[0] ??
    null;
  const s = activeStop as (DashboardStop & Record<string, unknown>) | null;

  const liveCount = monitorStops.filter((x) => stopPhase(x) === "active").length;
  // Footer tally — by the canonical classifier, of what the monitor is showing.
  // green = delivered, blue = active (assigned/in_transit), red = failed.
  // draft & unassigned are never here (monitorEligible excludes phaseOf "pre").
  const deliveredCount = monitorStops.filter(isDelivered).length;
  const failedCount = monitorStops.filter(isFailed).length;
  const effectiveSelectedId = selectedId ?? activeStop?.id ?? null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-border/40 border-b px-4 py-3">
        <div>
          <h3 className="font-semibold text-foreground text-sm leading-none">Live Stop Monitor</h3>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {liveCount > 0 ? `${liveCount} active now` : "Route overview"}
          </p>
        </div>
        {liveCount > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-primary/8 px-2.5 py-1 ring-1 ring-primary/20">
            <motion.span
              className="size-1.5 rounded-full bg-primary"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY }}
            />
            <span className="font-semibold text-[10px] text-primary tabular-nums">{liveCount} live</span>
          </span>
        )}
      </div>

      {/* Map */}
      <div className="shrink-0 px-4 pt-3 pb-3">
        <div className="overflow-hidden rounded-xl border border-border/40 shadow-sm">
          <NextStopMap stop={activeStop} />
        </div>
      </div>

      {/* Mobile */}
      <div className="sm:hidden">
        {loading ? (
          <div className="space-y-1.5 px-3 py-3">
            {["a", "b", "c", "d"].map((k) => (
              <div key={k} className="h-4 animate-pulse rounded bg-muted/40" />
            ))}
          </div>
        ) : !s ? (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/12 ring-1 ring-emerald-500/20">
              <CheckCircle2 className="size-4 text-emerald-600" />
            </div>
            <p className="font-medium text-[11px] text-muted-foreground">All stops complete</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={s.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
            >
              <DetailSection s={s} />
            </motion.div>
          </AnimatePresence>
        )}
        {!loading && monitorStops.length > 0 && (
          <StopFlow
            stops={monitorStops}
            effectiveSelectedId={effectiveSelectedId}
            nextStopId={nextStopId}
            onSelect={onSelect}
            mobileScroll
          />
        )}
      </div>

      {/* Desktop */}
      <div className="hidden sm:flex sm:flex-col">
        <div className="shrink-0">
          {loading ? (
            <div className="space-y-1.5 px-3 py-3">
              {["a", "b", "c", "d"].map((k) => (
                <div key={k} className="h-4 animate-pulse rounded bg-muted/40" />
              ))}
            </div>
          ) : !s ? (
            <div className="flex flex-col items-center gap-1.5 py-6 text-center">
              <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/12 ring-1 ring-emerald-500/20">
                <CheckCircle2 className="size-4 text-emerald-600" />
              </div>
              <p className="font-medium text-[11px] text-muted-foreground">All stops complete</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={s.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
              >
                <DetailSection s={s} />
              </motion.div>
            </AnimatePresence>
          )}
        </div>
        {!loading && monitorStops.length > 0 && (
          // FIXED height — bounded to ~12 stop rows (row ≈ 48px → 12 rows ≈ 576px
          // + the "Today's Route" bar + search ≈ 64px ≈ 640px). The list scrolls
          // beyond that; the card never stretches unbounded down the column.
          <ScrollArea className="h-[640px]">
            <StopFlow
              stops={monitorStops}
              effectiveSelectedId={effectiveSelectedId}
              nextStopId={nextStopId}
              onSelect={onSelect}
            />
          </ScrollArea>
        )}
        {!loading && monitorStops.length === 0 && !s && (
          <div className="flex flex-col items-center gap-1.5 py-5">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 240, damping: 14 }}
              className="flex size-7 items-center justify-center rounded-full bg-emerald-500/15"
            >
              <CheckCircle2 className="size-3.5 text-emerald-600" />
            </motion.div>
            <p className="text-[10px] text-muted-foreground">All caught up</p>
          </div>
        )}
      </div>

      {/* Footer — live tally of what the monitor is SHOWING, by the canonical
          classifier. Total "showing" + per-status counts (green delivered /
          blue active / red failed). Draft & unassigned are never counted here
          (the feed already excludes phaseOf === "pre"). */}
      {!loading && monitorStops.length > 0 && (
        <div className="shrink-0 border-border/50 border-t bg-card">
          <div className="px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-bold text-base text-foreground tabular-nums leading-none">
                    {monitorStops.length}
                  </span>
                  <span className="text-[11px] text-muted-foreground/65">showing</span>
                </span>
                {deliveredCount > 0 && (
                  <>
                    <div className="h-3 w-px bg-border/40" />
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {deliveredCount} delivered
                    </span>
                  </>
                )}
                {liveCount > 0 && (
                  <>
                    <div className="h-3 w-px bg-border/40" />
                    <span className="inline-flex items-center gap-1 text-[11px] text-blue-600">
                      <span className="size-1.5 rounded-full bg-blue-500" />
                      {liveCount} active
                    </span>
                  </>
                )}
                {failedCount > 0 && (
                  <>
                    <div className="h-3 w-px bg-border/40" />
                    <span className="inline-flex items-center gap-1 text-[11px] text-rose-600">
                      <span className="size-1.5 rounded-full bg-rose-500" />
                      {failedCount} failed
                    </span>
                  </>
                )}
              </div>
              <span className="font-medium text-[11px] text-muted-foreground/45 uppercase tracking-widest">
                {monthDayET()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
