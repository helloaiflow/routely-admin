"use client";

// ──────────────────────────────────────────────────────────────────────────
// StopEditSheet — inline side panel for editing a selected stop.
//
// Renders as a flex sibling to the StopsTable on desktop (lg+ : 440px column,
// no blocking) and as a full-screen overlay on mobile. NOT a Sheet/Dialog —
// the grid stays visible and interactive on desktop while the panel is open.
//
// Per-field edit policy depends on stop status:
//   - "open"   (draft/pending/approved/paid):   everything editable
//   - "limited" (assigned/in_transit/dispatched): only driver-safe fields —
//        notes, phone, gate code, drop preference, cold chain, signature,
//        return-to-pharmacy. Address/recipient/pickup are locked because
//        the driver is already en route.
//   - "locked" (delivered/failed/cancelled/RTS): nothing editable
//
// Cancel (DELETE) and Return to pharmacy (PATCH service.return_to_sender)
// remain available until the stop reaches a locked state.
// ──────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  CircleX,
  Copy,
  ExternalLink,
  FileText,
  Hash,
  Link2,
  Loader2,
  MapPin,
  MessageSquare,
  Navigation,
  Package,
  PenLine,
  Phone,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
  Truck,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ── Helpers copied from /dashboard/stops for exact parity ─────────────────
function fmtNoteTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

type TimelineEntry = {
  event: string;
  label: string;
  actor: string | null;
  actor_name: string | null;
  timestamp: string | null;
  note: string | null;
  field_changes?: Array<{ field: string; old_value: unknown; new_value: unknown }>;
};
const TIMELINE_ICONS: Record<string, typeof Package> = {
  created: Package,
  dropoff_registered: Package,
  posted_to_spoke: Truck,
  checked_in: Package,
  "stop.field_changed": PenLine,
  assigned: User,
  in_transit: Truck,
  picked_up: Package,
  delivered: CheckCircle2,
  failed: X,
};
const FIELD_LABELS: Record<string, string> = {
  "recipient.name": "Recipient name",
  "recipient.phone": "Phone",
  "recipient.email": "Email",
  stop_type: "Stop type",
};
function timelineActorDisplay(e: TimelineEntry): string {
  return e.actor_name ?? e.actor ?? "System";
}

// ── Status policies ───────────────────────────────────────────────────────
const FAILED_STATUSES = ["failed", "attempted", "cancelled", "failed_not_home"];
const DELIVERED_STATUSES = ["delivered", "completed", "picked_up"];
const TRANSIT_STATUSES = ["in_transit", "out_for_delivery", "dispatched", "in_progress", "assigned"];
const RTS_STATUSES = ["return_to_sender", "rts", "undeliverable"];

const LOCKED_STATUSES = [...DELIVERED_STATUSES, ...FAILED_STATUSES, ...RTS_STATUSES, "deleted"];

// `editState` decides which fields users can still touch:
//  • "open"    — draft/pending: anything goes
//  • "limited" — route started: only driver-safe fields (notes, phone, gate
//                code, drop preference, cold-chain, signature, RTS toggle)
//  • "locked"  — truly final: nothing editable
function editState(status: string): "open" | "limited" | "locked" {
  const st = status.toLowerCase();
  if (LOCKED_STATUSES.includes(st)) return "locked";
  if (TRANSIT_STATUSES.includes(st)) return "limited";
  return "open";
}

// ── Stop detail shape ─────────────────────────────────────────────────────
interface StopDetail {
  stop_id: string;
  stop_type: string;
  status: string;
  order_ref: string | null;
  total_price: number;
  created_at: string;
  updated_at?: string;
  recipient: { name: string; phone: string; email: string; dob: string | null };
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    gate_code: string;
    drop_preference: string;
    lat?: number;
    lng?: number;
  };
  package: {
    type: string;
    rx_number: string;
    dp_note: string;
    notes: string;
    cold_chain: boolean;
    requires_signature: boolean;
    weight_oz: number;
    length_in: number;
    width_in: number;
    height_in: number;
  };
  service: {
    type: string;
    date: string | null;
    collect_payment: boolean;
    cod_amount: number;
    return_to_sender: boolean;
  };
  pickup?: { name: string; address: string };
  assignment: { driver_name: string | null; route_title: string | null; eta_at: string | null };
  photos?: string[];
  signature_url?: string | null;
  internal_notes?: InternalNote[];
}

type InternalNote = {
  id?: string;
  text: string;
  author: string;
  role?: string;
  created_at: string;
};

// ── Visual accent tokens per status ───────────────────────────────────────
function statusAccent(status: string) {
  const st = status.toLowerCase();
  if (DELIVERED_STATUSES.includes(st)) {
    return {
      bar: "bg-emerald-500",
      glow: "from-emerald-500/12",
      border: "border-emerald-500/25",
      eventBg: "bg-emerald-500/10",
      eventText: "text-emerald-800",
      eventRing: "border-emerald-200/50",
      eventIcon: "text-emerald-600",
      eventIconBg: "bg-emerald-500/15",
      dot: "bg-emerald-500",
      badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20",
      label: "Delivered",
    };
  }
  if (FAILED_STATUSES.includes(st)) {
    return {
      bar: "bg-rose-500",
      glow: "from-rose-500/12",
      border: "border-rose-500/25",
      eventBg: "bg-rose-50/40",
      eventText: "text-rose-800",
      eventRing: "border-rose-200/50",
      eventIcon: "text-rose-600",
      eventIconBg: "bg-rose-500/15",
      dot: "bg-rose-500",
      badge: "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/20",
      label: "Failed",
    };
  }
  if (RTS_STATUSES.includes(st)) {
    return {
      bar: "bg-amber-500",
      glow: "from-amber-500/12",
      border: "border-amber-500/25",
      eventBg: "bg-amber-50/40",
      eventText: "text-amber-800",
      eventRing: "border-amber-200/50",
      eventIcon: "text-amber-600",
      eventIconBg: "bg-amber-500/15",
      dot: "bg-amber-500",
      badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20",
      label: "Return to Sender",
    };
  }
  if (TRANSIT_STATUSES.includes(st)) {
    return {
      bar: "bg-primary",
      glow: "from-primary/12",
      border: "border-primary/30",
      eventBg: "bg-blue-50/40",
      eventText: "text-blue-800",
      eventRing: "border-blue-200/50",
      eventIcon: "text-primary",
      eventIconBg: "bg-blue-500/15",
      dot: "bg-primary",
      badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-blue-500/20",
      label: "In Transit",
    };
  }
  // Unassigned / Submitted (pending) → AMBER (registered, not falling to grey).
  if (["unassigned", "pending"].includes(st)) {
    return {
      bar: "bg-amber-500",
      glow: "from-amber-500/20",
      border: "border-amber-300",
      eventBg: "bg-amber-50/40",
      eventText: "text-amber-800",
      eventRing: "border-amber-200/50",
      eventIcon: "text-amber-600",
      eventIconBg: "bg-amber-500/15",
      dot: "bg-amber-500",
      badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20",
      label: "Unassigned",
    };
  }
  return {
    bar: "bg-muted-foreground/50",
    glow: "from-muted-foreground/10",
    border: "border-border",
    eventBg: "bg-muted/40",
    eventText: "text-foreground/80",
    eventRing: "border-border/50",
    eventIcon: "text-muted-foreground/70",
    eventIconBg: "bg-muted",
    dot: "bg-muted-foreground/50",
    badge: "bg-muted text-foreground/80 ring-border",
    label: "Pending",
  };
}

// ── Emoji helpers ─────────────────────────────────────────────────────────
function stopTypeEmoji(t: string): { emoji: string; label: string } {
  const x = t.toLowerCase();
  if (x === "pickup") return { emoji: "🏥", label: "Pickup" };
  if (x === "dropoff") return { emoji: "↩️", label: "Dropoff" };
  return { emoji: "📦", label: "Delivery" };
}
function pkgMeta(t: string): { emoji: string; label: string } {
  const x = (t ?? "").toLowerCase();
  if (x === "rx") return { emoji: "💊", label: "Prescription" };
  if (x === "lab") return { emoji: "🩸", label: "Lab" };
  if (x === "cold" || x === "cold_chain") return { emoji: "❄️", label: "Cold Chain" };
  if (x === "internal") return { emoji: "📦", label: "Internal" };
  return { emoji: "📦", label: x ? x.toUpperCase() : "Package" };
}
function toTitleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Progress timeline (5 nodes) ──────────────────────────────────────────
// Canonical sequence (always the same 5 steps): Draft → Unassigned → Assigned →
// In Transit → Delivered. unassigned = step 1. Failed / Return-to-pharmacy are
// terminal branches that END at the In Transit step (never skip it, never swap the
// label set) — see ProgressTimeline.
function progressIndex(status: string): number {
  const st = status.toLowerCase();
  if (st === "draft") return 0;
  if (["unassigned", "pending", "submitted", "approved", "paid", "created"].includes(st)) return 1;
  if (["assigned", "dispatched"].includes(st)) return 2;
  if (TRANSIT_STATUSES.includes(st)) return 3;
  // Delivered AND the terminal outcomes (Failed / Returned) all occupy the FINAL
  // slot (4). In Transit (3) is a separate, intact step they pass through first —
  // a terminal outcome REPLACES "Delivered", never "In Transit".
  if (DELIVERED_STATUSES.includes(st)) return 4;
  if (FAILED_STATUSES.includes(st) || RTS_STATUSES.includes(st)) return 4;
  return 1;
}

function ProgressTimeline({ status }: { status: string }) {
  const st = status.toLowerCase();
  const step = progressIndex(status);
  const isFailed = FAILED_STATUSES.includes(st);
  const isRTS = RTS_STATUSES.includes(st);
  const isDelivered = DELIVERED_STATUSES.includes(st);
  // Canonical sequence. "In Transit" is ALWAYS its own step (slot 3). The FINAL
  // slot (4) shows the OUTCOME: Delivered, or — for terminal stops — Failed /
  // Returned. Failed/Returned occupy the Delivered slot; they never fuse with
  // "In Transit".
  const labels = [
    "Draft",
    "Unassigned",
    "Assigned",
    "In Transit",
    isFailed ? "Failed" : isRTS ? "Returned" : "Delivered",
  ];
  const fillPct = (step / 4) * 100;
  // Accent reflects the outcome at the terminal node: green=delivered, rose=failed,
  // amber=returned; brand --primary token while still in motion.
  const accentHex = isFailed ? "#f43f5e" : isRTS ? "#f59e0b" : isDelivered ? "#10b981" : "var(--primary)";

  return (
    <div className="px-3 pt-1 pb-3">
      <div className="relative flex items-center" style={{ height: 32 }}>
        {/* Track */}
        <div className="absolute inset-x-3 top-1/2 -translate-y-1/2">
          <div
            className="h-[2px] w-full rounded-full"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, hsl(var(--border)/0.35) 0px, hsl(var(--border)/0.35) 10px, transparent 10px, transparent 13px)",
            }}
          />
        </div>
        {/* Filled portion */}
        <div
          className="absolute inset-x-3 top-1/2 -translate-y-1/2 overflow-hidden"
          style={{ width: `calc(${fillPct}% - 0.75rem)` }}
        >
          <div
            className="h-[2px] origin-left"
            style={{
              width: "100%",
              backgroundImage: `repeating-linear-gradient(90deg, ${accentHex} 0px, ${accentHex} 10px, transparent 10px, transparent 13px)`,
            }}
          />
        </div>
        {/* Nodes — 6: consistent marker (truck) at the active step for EVERY status,
            tinted by accent (red=failed, amber=RTS). No icon swapping. */}
        {labels.map((label, i) => {
          const left = `calc(${(i / 4) * 100}% * ((100% - 1.5rem) / 100%) + 0.75rem)`;
          const isActive = i === step;
          const isPast = i < step;
          return (
            <div key={label} className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2" style={{ left }}>
              {isActive ? (
                <div className="relative flex items-center justify-center">
                  <div
                    className="absolute rounded-full"
                    style={{ width: 22, height: 22, backgroundColor: `${accentHex}33` }}
                  />
                  <Truck className="size-[18px]" style={{ color: accentHex }} aria-hidden="true" />
                </div>
              ) : (
                <div
                  className={cn(
                    "size-[9px] rounded-full border-2 transition-colors duration-500",
                    !isPast && "border-border/30 bg-background",
                  )}
                  style={isPast ? { borderColor: accentHex, backgroundColor: `${accentHex}4d` } : undefined}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between">
        {labels.map((label, i) => {
          const isActive = i === step;
          return (
            <span
              key={label}
              className={cn(
                "text-[10px] leading-tight tracking-wide transition-colors duration-500",
                isActive
                  ? "font-semibold"
                  : i < step
                    ? "font-normal text-muted-foreground/55"
                    : "font-normal text-muted-foreground/35",
              )}
              style={isActive ? { color: accentHex } : undefined}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Inline editable field (click value to edit, blur to save) ────────────
function InlineField({
  label,
  value,
  onCommit,
  required,
  placeholder,
  disabled,
  type = "text",
}: {
  label: string;
  value: string;
  onCommit: (next: string) => Promise<void>;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  type?: "text" | "tel" | "email" | "date";
}) {
  const [local, setLocal] = useState(value);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => setLocal(value), [value]);

  const commit = async () => {
    setEditing(false);
    if (local === value) return;
    setSaving(true);
    try {
      await onCommit(local);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="group flex min-h-[34px] items-start justify-between gap-4 border-border/[0.07] border-b py-2 last:border-0">
      <span className="shrink-0 text-[11px] text-muted-foreground/65 leading-snug">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {editing && !disabled ? (
        <input
          type={type}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setLocal(value);
              setEditing(false);
            }
          }}
          placeholder={placeholder}
          className="h-6 min-w-0 max-w-[60%] flex-1 rounded border border-primary/40 bg-background px-1.5 text-right font-medium text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/30"
        />
      ) : (
        <button
          type="button"
          onClick={() => !disabled && setEditing(true)}
          disabled={disabled}
          className={cn(
            "flex min-w-0 items-center gap-1.5 truncate text-right font-medium text-[11px] leading-snug transition-colors",
            disabled ? "cursor-not-allowed text-foreground/85" : "cursor-text text-foreground hover:text-primary",
            !local && !disabled && "text-muted-foreground/60 italic",
          )}
        >
          {saving && <Loader2 className="size-3 animate-spin text-primary" aria-hidden="true" />}
          <span className="truncate">{local || placeholder || "—"}</span>
          {!disabled && (
            <PenLine
              className="size-2.5 shrink-0 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
          )}
        </button>
      )}
    </div>
  );
}

// ── Toggle row ────────────────────────────────────────────────────────────
function ToggleRow({
  label,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  value: boolean;
  onCommit: (next: boolean) => Promise<void>;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => setLocal(value), [value]);

  const handle = async () => {
    if (disabled) return;
    const next = !local;
    setLocal(next);
    setSaving(true);
    try {
      await onCommit(next);
    } catch {
      setLocal(!next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="group flex min-h-[34px] items-center justify-between gap-4 border-border/[0.07] border-b py-2 last:border-0">
      <span className="text-[11px] text-muted-foreground/65 leading-snug">{label}</span>
      <div className="flex items-center gap-1.5">
        {saving && <Loader2 className="size-3 animate-spin text-primary" aria-hidden="true" />}
        <button
          type="button"
          onClick={handle}
          disabled={disabled}
          className={cn(
            "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
            local ? "bg-primary" : "bg-muted",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <span
            className={cn(
              "inline-block size-3 transform rounded-full bg-card shadow-sm transition-transform",
              local ? "translate-x-[14px]" : "translate-x-0.5",
            )}
          />
        </button>
      </div>
    </div>
  );
}

// ── Read-only info row (icon + label + value, right-aligned) ─────────────
function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-border/[0.07] border-b py-2 last:border-0">
      <span className="shrink-0 text-[11px] text-muted-foreground/65 leading-snug">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-right font-medium text-[11px] text-foreground leading-snug">
        <Icon className="size-3 shrink-0 text-muted-foreground/40" aria-hidden="true" />
        <span className="truncate">{children}</span>
      </span>
    </div>
  );
}

// ── Collapsible section (chevron accordion) ──────────────────────────────
function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Parity with /dashboard/stops FormSection (exact classes).
  return (
    <div className="border-border/10 border-b last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-2.5 pr-0.5 text-left transition-colors hover:text-foreground"
      >
        <span className="font-semibold text-xs text-foreground/80 tracking-[-0.01em]">{title}</span>
        <ChevronDown
          className={cn("size-3.5 text-muted-foreground/35 transition-transform duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="pb-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Photo gallery — main image + thumbnail strip ────────────────────────
// ── Proof of Delivery — standalone card rendered ABOVE the Quick Info section.
// Big centered main preview on top, the rest as thumbnails below; any click opens
// a shadcn Dialog modal (never a route). Only renders when proof exists
// (terminal/delivered stops). Photos = result.photo_urls, signature = signature_url.
type ProofItem = { url: string; kind: "photo" | "signature" };
function ProofOfDelivery({ photos, signatureUrl }: { photos: string[]; signatureUrl: string | null }) {
  const items: ProofItem[] = [
    ...photos.map((u) => ({ url: u, kind: "photo" as const })),
    ...(signatureUrl ? [{ url: signatureUrl, kind: "signature" as const }] : []),
  ];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  if (items.length === 0) return null;

  const main = items[0];
  const rest = items.slice(1);
  const openAt = (i: number) => {
    setActive(i);
    setOpen(true);
  };
  const current = items[active] ?? main;

  return (
    <Section title="Proof of Delivery" defaultOpen>
      {/* Main preview — fills available width, sensible height */}
      <button
        type="button"
        onClick={() => openAt(0)}
        aria-label="View proof full size"
        className={cn(
          "group relative block w-full overflow-hidden rounded-xl border border-border/60 shadow-sm ring-1 ring-border/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/30",
          main.kind === "signature" ? "aspect-[16/7] bg-card/95" : "aspect-[16/10]",
        )}
      >
        {/* biome-ignore lint/performance/noImgElement: signed R2 URLs, not optimizable */}
        <img
          src={main.url}
          alt="Proof of delivery"
          className={cn(
            "h-full w-full transition-transform duration-200 group-hover:scale-105",
            main.kind === "signature" ? "object-contain p-3" : "object-cover",
          )}
        />
        {main.kind === "signature" && (
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-foreground/60 px-1.5 py-0.5 font-medium text-[10px] text-background">
            Signature
          </span>
        )}
      </button>

      {/* Other previews — below, wrap, LEFT-aligned */}
      {rest.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-start gap-2">
          {rest.map((item, i) => (
            <button
              key={item.url}
              type="button"
              onClick={() => openAt(i + 1)}
              aria-label={item.kind === "signature" ? "View signature" : `View proof ${i + 2}`}
              className={cn(
                "group relative size-16 shrink-0 overflow-hidden rounded-lg border border-border/60 shadow-sm ring-1 ring-border/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/30",
                item.kind === "signature" && "w-24 bg-card/95",
              )}
            >
              {/* biome-ignore lint/performance/noImgElement: signed R2 URL */}
              <img
                src={item.url}
                alt={item.kind === "signature" ? "Recipient signature" : `Proof ${i + 2}`}
                className={cn(
                  "h-full w-full transition-transform duration-200 group-hover:scale-105",
                  item.kind === "signature" ? "object-contain p-1.5" : "object-cover",
                )}
              />
            </button>
          ))}
        </div>
      )}

      {/* Modal — shadcn Dialog (X / click-outside / Esc), never a route */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl gap-3 p-3 sm:p-4">
          <DialogTitle className="sr-only">Proof of delivery</DialogTitle>
          <div className={cn("overflow-hidden rounded-lg", current.kind === "signature" && "bg-card")}>
            {/* biome-ignore lint/performance/noImgElement: signed R2 URL */}
            <img
              src={current.url}
              alt="Proof of delivery, full size"
              className={cn("mx-auto max-h-[80vh] w-auto object-contain", current.kind === "signature" && "p-4")}
            />
          </div>
          {items.length > 1 && (
            <div className="flex flex-wrap justify-center gap-2">
              {items.map((item, i) => (
                <button
                  key={item.url}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`View image ${i + 1}`}
                  className={cn(
                    "size-12 shrink-0 overflow-hidden rounded-md border transition-all",
                    item.kind === "signature" && "w-16 bg-card/95",
                    i === active
                      ? "border-primary ring-1 ring-primary/40"
                      : "border-border/50 opacity-60 hover:opacity-100",
                  )}
                >
                  {/* biome-ignore lint/performance/noImgElement: signed R2 URL */}
                  <img
                    src={item.url}
                    alt=""
                    className={cn("h-full w-full", item.kind === "signature" ? "object-contain p-1" : "object-cover")}
                  />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Section>
  );
}

// ── Status event banner (renders for final states) ───────────────────────
function EventBanner({ status, timestamp }: { status: string; timestamp: string | null }) {
  const accent = statusAccent(status);
  const st = status.toLowerCase();
  let title = "";
  let Icon = CheckCircle2;

  if (DELIVERED_STATUSES.includes(st)) {
    title = "Delivery completed";
    Icon = CheckCircle2;
  } else if (FAILED_STATUSES.includes(st)) {
    title = "Delivery failed";
    Icon = CircleX;
  } else if (RTS_STATUSES.includes(st)) {
    title = "Returned to pharmacy";
    Icon = RotateCcw;
  } else {
    return null;
  }

  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className={cn("mx-3 mt-3 rounded-xl border p-3", accent.eventRing, accent.eventBg)}>
      <div className="flex items-center gap-2">
        <div className={cn("flex size-6 items-center justify-center rounded-full", accent.eventIconBg)}>
          <Icon className={cn("size-3.5", accent.eventIcon)} aria-hidden="true" />
        </div>
        <span className={cn("font-semibold text-[13px]", accent.eventText)}>{title}</span>
        {time && <span className="ml-auto font-medium text-[11px] text-muted-foreground/70">{time}</span>}
      </div>
    </div>
  );
}

// ── Toolbar action button ────────────────────────────────────────────────
function ToolbarButton({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick?: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground/60 transition-all",
        danger
          ? "hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
          : "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ── Main component — inline panel (not Sheet) ────────────────────────────
export function StopEditSheet({
  stopId,
  onClose,
  onUpdate,
}: {
  stopId: string | null;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [stop, setStop] = useState<StopDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [tab, setTab] = useState<"details" | "notes" | "gatecodes" | "history">("details");
  // Notes (copied from /dashboard/stops)
  const [noteText, setNoteText] = useState("");
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([]);
  const [postingNote, setPostingNote] = useState(false);
  // Gate codes — multi-code workflow (copied from /dashboard/stops)
  const [gateCodeInput, setGateCodeInput] = useState("");
  const [gateCodesData, setGateCodesData] = useState<Array<Record<string, unknown>>>([]);
  const [gateCodesLoading, setGateCodesLoading] = useState(false);
  const [savingGateCode, setSavingGateCode] = useState(false);
  // History timeline (copied from /dashboard/stops)
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[] | null>(null);
  const [timelineExpanded, setTimelineExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (!stopId) {
      setStop(null);
      return;
    }
    setLoading(true);
    setStop(null);
    setConfirmCancel(false);
    setTab("details");
    setNoteText("");
    setInternalNotes([]);
    setGateCodeInput("");
    setGateCodesData([]);
    setTimelineEntries(null);
    setTimelineExpanded(null);
    const ctrl = new AbortController();
    fetch(`/api/client/stops/${encodeURIComponent(stopId)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        setStop(d.stop);
        setInternalNotes((d.stop?.internal_notes as InternalNote[]) ?? []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") toast.error("Couldn't load stop");
      })
      .finally(() => setLoading(false));
    // Gate codes (address-keyed, multi) + history timeline — same endpoints as stops.
    setGateCodesLoading(true);
    fetch(`/api/client/stops/${encodeURIComponent(stopId)}/gate-codes`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { codes: [] }))
      .then((d) => setGateCodesData((d.codes as Array<Record<string, unknown>>) ?? []))
      .catch(() => undefined)
      .finally(() => setGateCodesLoading(false));
    fetch(`/api/client/stops/${encodeURIComponent(stopId)}/timeline`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { timeline: [] }))
      .then((d) => setTimelineEntries((d.timeline as TimelineEntry[]) ?? []))
      .catch(() => setTimelineEntries([]));
    return () => ctrl.abort();
  }, [stopId]);

  // PATCH helper — defined BEFORE the early-return so the hook order stays
  // constant across renders (React rules-of-hooks).
  const patchStop = useCallback(
    async (body: Record<string, unknown>) => {
      if (!stopId) return;
      const r = await fetch(`/api/client/stops/${encodeURIComponent(stopId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        toast.error("Save failed");
        throw new Error("save failed");
      }
      toast.success("Saved", { duration: 1000 });
      onUpdate();
    },
    [stopId, onUpdate],
  );

  const commit = useCallback(
    async (section: "recipient" | "address" | "package" | "service", field: string, value: unknown) => {
      await patchStop({ [section]: { [field]: value } });
      setStop((cur) => (cur ? { ...cur, [section]: { ...cur[section], [field]: value } } : cur));
    },
    [patchStop],
  );

  // Don't render anything if no stop is selected — AFTER all hooks
  if (!stopId) return null;

  const accent = stop ? statusAccent(stop.status) : statusAccent("pending");
  const edit = stop ? editState(stop.status) : "open";
  const isLocked = edit === "locked";
  const isLimited = edit === "limited";
  // 5 — Quick Info is editable ONLY for Unassigned + In-transit (the in-motion set).
  // All other statuses (delivered/failed/RTS/draft/etc.) → read-only Quick Info.
  const stStatus = (stop?.status ?? "").toLowerCase();
  const quickInfoEditable = !isLocked && (["unassigned", "pending"].includes(stStatus) || isLimited);

  // Toolbar actions
  const handleCopyLink = () => {
    if (!stop) return;
    const url = `${window.location.origin}/dashboard/search/${stop.stop_id}`;
    navigator.clipboard.writeText(url).catch(() => undefined);
    toast.success("Link copied", { duration: 800 });
  };

  const handleMaps = () => {
    if (!stop) return;
    const q = encodeURIComponent(
      [stop.address.street, stop.address.city, stop.address.state, stop.address.zip].filter(Boolean).join(", "),
    );
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank", "noopener");
  };

  const handleOpenFull = () => {
    if (!stop) return;
    window.location.href = `/dashboard/search/${stop.stop_id}`;
  };

  const handleCall = () => {
    if (!stop?.recipient.phone) {
      toast.error("No phone number");
      return;
    }
    window.location.href = `tel:${stop.recipient.phone.replace(/\D/g, "")}`;
  };

  const handleSMS = () => {
    if (!stop?.recipient.phone) {
      toast.error("No phone number");
      return;
    }
    window.location.href = `sms:${stop.recipient.phone.replace(/\D/g, "")}`;
  };

  const handlePrint = () => {
    toast.info("Print label coming soon");
  };

  const handleDuplicate = () => {
    toast.info("Duplicate coming soon");
  };

  // Header Delete — only when the edit policy still allows it (not locked).
  const handleHeaderDelete = () => {
    if (isLocked) return;
    if (window.confirm("Cancel this stop? This can't be undone.")) handleDelete();
  };

  const handleDelete = async () => {
    if (!stopId) return;
    try {
      const r = await fetch(`/api/client/stops/${encodeURIComponent(stopId)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success("Stop cancelled");
      onUpdate();
      onClose();
    } catch {
      toast.error("Couldn't cancel stop");
    } finally {
      setConfirmCancel(false);
    }
  };

  // Notes — POST /notes (same workflow as /dashboard/stops)
  const handlePostNote = async () => {
    const text = noteText.trim();
    if (!text || !stopId || postingNote) return;
    setPostingNote(true);
    try {
      const res = await fetch(`/api/client/stops/${encodeURIComponent(stopId)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        toast.error("Failed to post note");
        return;
      }
      const data = await res.json();
      setInternalNotes((prev) => [...prev, data.note as InternalNote]);
      setNoteText("");
    } catch {
      toast.error("Failed to post note");
    } finally {
      setPostingNote(false);
    }
  };

  // Gate codes — POST /gate-codes, multi-code (same workflow as /dashboard/stops)
  const handleSaveGateCode = async () => {
    const code = gateCodeInput.trim();
    if (!code || !stopId || savingGateCode) return;
    setSavingGateCode(true);
    try {
      const res = await fetch(`/api/client/stops/${encodeURIComponent(stopId)}/gate-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        toast.error("Failed to save gate code");
        return;
      }
      const data = await res.json();
      setGateCodesData((prev) => [data.code as Record<string, unknown>, ...prev]);
      setGateCodeInput("");
      toast.success("Gate code saved");
    } catch {
      toast.error("Failed to save gate code");
    } finally {
      setSavingGateCode(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "flex flex-col overflow-hidden bg-card dark:bg-card",
        // Mobile: full-screen overlay
        "fixed inset-0 z-40",
        // Desktop: inline 440px column, doesn't block the grid. FIXED tall height
        // so the full form (all collapsibles + footer) is visible — header/footer
        // pinned, body scrolls (min-h-0 flex-1 overflow-y-auto). Was max-h (too short).
        "lg:relative lg:inset-auto lg:z-auto lg:w-[440px] lg:shrink-0 lg:rounded-xl lg:border lg:border-border lg:shadow-sm",
        "lg:sticky lg:top-3 lg:h-[calc(100vh-96px)]",
      )}
    >
      {loading && (
        <div className="flex flex-1 items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
        </div>
      )}

      {!loading && stop && (
        <div className="flex h-full min-h-0 flex-col bg-card lg:overflow-hidden lg:rounded-xl dark:bg-card">
          {/* ── Sticky header ─────────────────────────────────────── */}
          <div className={cn("relative shrink-0 border-b bg-card dark:bg-card", accent.border)}>
            {/* Accent bar */}
            <div className={cn("h-[3px] w-full", accent.bar)} />
            {/* Soft gradient under the bar */}
            <div
              className={cn(
                "pointer-events-none absolute inset-0 top-[3px] bg-gradient-to-b to-transparent",
                accent.glow,
              )}
            />

            {/* Top row — tracking id (left) + action buttons (right) */}
            <div className="relative flex items-center justify-between px-4 pt-2.5 pb-2">
              <button
                type="button"
                onClick={handleOpenFull}
                className="font-mono font-semibold text-[11px] text-primary tabular-nums transition-colors hover:underline"
                title="Open full details"
              >
                {stop.stop_id}
              </button>
              <div className="flex items-center gap-0.5">
                <ToolbarButton title="Duplicate" onClick={handleDuplicate}>
                  <Copy className="size-3.5" aria-hidden="true" />
                </ToolbarButton>
                {!isLocked && (
                  <ToolbarButton title="Delete stop" onClick={handleHeaderDelete} danger>
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </ToolbarButton>
                )}
                <ToolbarButton title="Print label" onClick={handlePrint}>
                  <Printer className="size-3.5" aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton title="Call recipient" onClick={handleCall}>
                  <Phone className="size-3.5" aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton title="SMS recipient" onClick={handleSMS}>
                  <MessageSquare className="size-3.5" aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton title="Google Maps" onClick={handleMaps}>
                  <Navigation className="size-3.5" aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton title="Open full page" onClick={handleOpenFull}>
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton title="Copy link" onClick={handleCopyLink}>
                  <Link2 className="size-3.5" aria-hidden="true" />
                </ToolbarButton>
                <div className="mx-1 h-4 w-px bg-border/60" />
                <ToolbarButton title="Close" onClick={onClose}>
                  <X className="size-3.5" aria-hidden="true" />
                </ToolbarButton>
              </div>
            </div>

            {/* Identity block — recipient name, address, city/state/zip */}
            <div className="relative px-4 pb-3">
              <p className="font-bold text-base text-foreground leading-tight">
                {toTitleCase(stop.recipient.name) || "—"}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground/70 leading-tight">
                {stop.address.street || "—"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground/55">
                {[stop.address.city, stop.address.state, stop.address.zip].filter(Boolean).join(", ") || "—"}
              </p>

              {/* Driver row */}
              {stop.assignment.driver_name && (
                <div className="mt-2 flex items-center gap-1.5">
                  <div className="flex size-5 items-center justify-center rounded-full bg-muted">
                    <Truck className="size-3 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <span className="font-medium text-xs text-foreground/70">
                    {toTitleCase(stop.assignment.driver_name)}
                  </span>
                  {stop.assignment.route_title && (
                    <span className="text-[11px] text-muted-foreground/60">· {stop.assignment.route_title}</span>
                  )}
                </div>
              )}

              {/* Chips row — status (data-driven) + type + package + flags (reactive to edits) */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={cn("rounded-full px-2 py-0.5 font-semibold text-[10px] ring-1", accent.badge)}>
                  {accent.label}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground">
                  {stopTypeEmoji(stop.stop_type).emoji} {stopTypeEmoji(stop.stop_type).label}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground">
                  {pkgMeta(stop.package.type).emoji} {pkgMeta(stop.package.type).label}
                </span>
                {stop.service.type === "same_day" && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-[10px] text-amber-700 ring-1 ring-amber-200/60 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
                    ⚡ Same Day
                  </span>
                )}
                {stop.package.requires_signature && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-[10px] text-indigo-700 ring-1 ring-indigo-200/60 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30">
                    ✍ Signature
                  </span>
                )}
                {stop.service.collect_payment && (
                  <span className="rounded-full bg-teal-50 px-2 py-0.5 font-semibold text-[10px] text-teal-700 ring-1 ring-teal-200/60 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/30">
                    💵 COD
                  </span>
                )}
                {stop.service.return_to_sender && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-[10px] text-amber-700 ring-1 ring-amber-200/60 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
                    ↩ RTS
                  </span>
                )}
              </div>
            </div>

            {/* Progress timeline — truck marker always visible at the current step */}
            <ProgressTimeline status={stop.status} />
          </div>

          {/* ── Body (scrollable) ────────────────────────────────── */}
          {/* ── Tab strip (D/E): Details · Notes · Gate Codes · History ─── */}
          <div className="flex shrink-0 items-center gap-0.5 border-border/50 border-b px-3">
            {(
              [
                ["details", "Details"],
                ["notes", "Notes"],
                ["gatecodes", "Gate Codes"],
                ["history", "History"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  "relative px-2.5 py-2 font-semibold text-[11px] transition-colors",
                  tab === k ? "text-primary" : "text-muted-foreground/55 hover:text-foreground",
                )}
              >
                {label}
                {tab === k && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
              </button>
            ))}
          </div>

          {/* ── Body (scrollable) — tab content ───────────────────── */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-card dark:bg-card">
            {tab === "details" && (
              <div>
                {/* Status event banner */}
                <EventBanner status={stop.status} timestamp={stop.updated_at ?? stop.created_at} />

                {/* Edit-state info banner (limited / locked) */}
                {isLimited && (
                  <div className="mx-3 mt-3 rounded-xl border border-blue-200/50 bg-blue-50/30 p-3">
                    <div className="flex items-start gap-2">
                      <Truck className="mt-0.5 size-3.5 shrink-0 text-blue-600" aria-hidden="true" />
                      <p className="font-medium text-[11px] text-blue-800 leading-snug">
                        Driver is en route — only safe fields can be edited: notes, phone, gate code, drop preference,
                        cold chain &amp; signature settings.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Primary action(s) — status-driven ─────────────────────
                3 — Unassigned (and other non-in-transit editable states): NO Submit
                    Order, NO Cancel here — the only action is editing Quick Info below.
                limited (in-transit): Cancel stop / Return to pharmacy ONLY.
                locked (delivered/failed/RTS): no actions (read-only).            */}
                {isLimited && (
                  <div className="mx-3 mt-3 flex flex-wrap items-center gap-2">
                    {!confirmCancel ? (
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(true)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2.5 py-1.5 font-semibold text-[11px] text-rose-700 dark:text-rose-400 ring-1 ring-rose-200/70 transition-colors hover:bg-rose-500/15"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Cancel stop
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2.5 py-1.5 ring-1 ring-rose-200/70">
                        <span className="font-semibold text-[11px] text-rose-700">Cancel — sure?</span>
                        <button
                          type="button"
                          onClick={handleDelete}
                          className="rounded bg-rose-600 px-2 py-0.5 font-semibold text-[11px] text-white hover:bg-rose-700"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCancel(false)}
                          className="rounded px-1.5 py-0.5 text-[11px] text-rose-700 dark:text-rose-400 hover:bg-rose-500/15"
                        >
                          No
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => commit("service", "return_to_sender", !stop.service.return_to_sender)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold text-[11px] ring-1 transition-colors",
                        stop.service.return_to_sender
                          ? "bg-amber-500/15 text-amber-800 dark:text-amber-400 ring-amber-300/70 hover:bg-amber-500/25"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-200/70 hover:bg-amber-500/15",
                      )}
                    >
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                      {stop.service.return_to_sender ? "RTS active" : "Return to pharmacy"}
                    </button>
                  </div>
                )}

                {/* Collapsible sections — Quick Info first (most-actionable), then hierarchy */}
                <div className="px-4 pt-3">
                  {/* Proof of Delivery — photos + signature, ABOVE Quick Info. Big centered
                      preview + the rest below; click → modal. Only renders when proof exists. */}
                  <ProofOfDelivery photos={stop.photos ?? []} signatureUrl={stop.signature_url ?? null} />

                  {/* F — Front-Line Quick Info: the use-immediately critical fields */}
                  <Section title="Quick Info" defaultOpen>
                    <InlineField
                      label="Gate code"
                      value={stop.address.gate_code ?? ""}
                      disabled={!quickInfoEditable}
                      placeholder="Access code…"
                      onCommit={(v) => commit("address", "gate_code", v)}
                    />
                    <div className="flex items-center justify-between gap-4 border-border/[0.07] border-b py-2">
                      <span className="shrink-0 text-[11px] text-muted-foreground/65 leading-snug">
                        Drop preference
                      </span>
                      <Select
                        value={stop.address.drop_preference || "none"}
                        onValueChange={(v) => commit("address", "drop_preference", v === "none" ? "" : v)}
                        disabled={!quickInfoEditable}
                      >
                        <SelectTrigger className="h-7 w-[160px] border-border bg-background font-medium text-[11px] text-foreground shadow-sm">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent align="end">
                          <SelectItem value="none">— None —</SelectItem>
                          <SelectItem value="front_door">Front door</SelectItem>
                          <SelectItem value="back_door">Back door</SelectItem>
                          <SelectItem value="garage">Garage</SelectItem>
                          <SelectItem value="reception">Reception</SelectItem>
                          <SelectItem value="hand_to_recipient">Hand to recipient</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <ToggleRow
                      label="Signature required"
                      value={stop.package.requires_signature}
                      disabled={!quickInfoEditable}
                      onCommit={(v) => commit("package", "requires_signature", v)}
                    />
                    <ToggleRow
                      label="Collect on delivery (COD)"
                      value={stop.service.collect_payment}
                      disabled={!quickInfoEditable}
                      onCommit={(v) => commit("service", "collect_payment", v)}
                    />
                    {/* COD amount — shown ONLY when COD is on */}
                    {stop.service.collect_payment && (
                      <InlineField
                        label="COD amount"
                        value={stop.service.cod_amount ? String(stop.service.cod_amount) : ""}
                        disabled={!quickInfoEditable}
                        placeholder="0.00"
                        onCommit={(v) => commit("service", "cod_amount", v ? Number(v) : 0)}
                      />
                    )}
                  </Section>

                  <Section title="Stop setup">
                    <InfoRow icon={MapPin} label="Route">
                      {stop.assignment.route_title || "Unassigned"}
                    </InfoRow>
                    <InfoRow icon={Navigation} label="Stop type">
                      {stopTypeEmoji(stop.stop_type).emoji} {stopTypeEmoji(stop.stop_type).label}
                    </InfoRow>
                    <InfoRow icon={FileText} label="Service">
                      {stop.service.type || "—"}
                    </InfoRow>
                    <InfoRow icon={PenLine} label="Service date">
                      {stop.service.date
                        ? new Date(`${stop.service.date}T12:00:00`).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </InfoRow>
                    <InfoRow icon={Truck} label="ETA">
                      {stop.assignment.eta_at
                        ? new Date(stop.assignment.eta_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "—"}
                    </InfoRow>
                  </Section>

                  <Section title="Recipient information">
                    <InlineField
                      label="Name"
                      required
                      value={stop.recipient.name ?? ""}
                      disabled={isLocked || isLimited}
                      onCommit={(v) => commit("recipient", "name", v)}
                    />
                    <InlineField
                      label="Phone"
                      required
                      type="tel"
                      value={stop.recipient.phone ?? ""}
                      disabled={isLocked}
                      placeholder="(555) 123-4567"
                      onCommit={(v) => commit("recipient", "phone", v)}
                    />
                    <InlineField
                      label="Email"
                      type="email"
                      value={stop.recipient.email ?? ""}
                      disabled={isLocked || isLimited}
                      placeholder="email@example.com"
                      onCommit={(v) => commit("recipient", "email", v)}
                    />
                    <InlineField
                      label="Date of birth"
                      type="date"
                      value={stop.recipient.dob ?? ""}
                      disabled={isLocked || isLimited}
                      placeholder="MM/DD/YYYY"
                      onCommit={(v) => commit("recipient", "dob", v)}
                    />
                  </Section>

                  <Section title="Delivery address">
                    <InlineField
                      label="Street"
                      value={stop.address.street ?? ""}
                      disabled={isLocked || isLimited}
                      onCommit={(v) => commit("address", "street", v)}
                    />
                    <InlineField
                      label="City"
                      value={stop.address.city ?? ""}
                      disabled={isLocked || isLimited}
                      onCommit={(v) => commit("address", "city", v)}
                    />
                    <InlineField
                      label="State"
                      value={stop.address.state ?? ""}
                      disabled={isLocked || isLimited}
                      onCommit={(v) => commit("address", "state", v)}
                    />
                    <InlineField
                      label="ZIP"
                      value={stop.address.zip ?? ""}
                      disabled={isLocked || isLimited}
                      onCommit={(v) => commit("address", "zip", v)}
                    />
                  </Section>

                  <Section title="Package">
                    <InlineField
                      label="Type"
                      value={stop.package.type ?? ""}
                      disabled={isLocked || isLimited}
                      placeholder="rx / cold / lab"
                      onCommit={(v) => commit("package", "type", v.toLowerCase())}
                    />
                    <InlineField
                      label="Rx number"
                      value={stop.package.rx_number ?? ""}
                      disabled={isLocked || isLimited}
                      placeholder="Optional"
                      onCommit={(v) => commit("package", "rx_number", v)}
                    />
                    <InlineField
                      label="DP note"
                      value={stop.package.dp_note ?? ""}
                      disabled={isLocked}
                      placeholder="Optional"
                      onCommit={(v) => commit("package", "dp_note", v)}
                    />
                    {/* Cold chain moved here from the old Driver-Notes block */}
                    <ToggleRow
                      label="Cold chain"
                      value={stop.package.cold_chain}
                      disabled={isLocked}
                      onCommit={(v) => commit("package", "cold_chain", v)}
                    />
                  </Section>

                  <Section title="Order information">
                    <InfoRow icon={FileText} label="Order ref">
                      <span className="font-mono">{stop.order_ref ?? "—"}</span>
                    </InfoRow>
                    <InfoRow icon={Truck} label="Created">
                      {new Date(stop.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </InfoRow>
                  </Section>
                </div>

                {/* Bottom padding so the last section isn't flush against the footer */}
                <div className="h-4" />
              </div>
            )}

            {/* ── Notes tab — client-managed notes ─────────────────── */}
            {/* ── Notes tab — compose + timeline (parity with /dashboard/stops) ── */}
            {tab === "notes" && (
              <div>
                <div className="border-border/50 border-b px-3 py-2.5">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlePostNote();
                    }}
                    placeholder="Add a note, instruction, or update…"
                    rows={2}
                    maxLength={500}
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/35 focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground/40">
                      {noteText.length}/500 · Cmd+Enter to send
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      className="h-6 gap-1 px-2.5 text-[11px]"
                      disabled={!noteText.trim() || postingNote}
                      onClick={handlePostNote}
                    >
                      {postingNote ? (
                        <Loader2 className="size-2.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <ArrowUp className="size-2.5" aria-hidden="true" />
                      )}
                      Post
                    </Button>
                  </div>
                </div>
                {internalNotes.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-[11px] text-muted-foreground/50">No notes yet</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/35">Add an instruction or update above</p>
                  </div>
                ) : (
                  <div className="relative px-3 py-2">
                    <div className="absolute bottom-2 left-[14px] top-5 w-px bg-primary/60" />
                    <div className="space-y-0">
                      {[...internalNotes].reverse().map((note, noteIdx) => {
                        const initials = (note.author ?? "")
                          .split(" ")
                          .map((w) => w[0] ?? "")
                          .join("")
                          .slice(0, 2)
                          .toUpperCase();
                        const isLatest = noteIdx === 0;
                        return (
                          <div
                            key={note.id ?? `${note.created_at}-${noteIdx}`}
                            className="relative flex gap-2 pb-3 last:pb-0"
                          >
                            <div className="relative mt-0.5 size-5 shrink-0">
                              {isLatest && (
                                <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 [animation-duration:2.5s]" />
                              )}
                              <div className="relative z-10 flex size-5 items-center justify-center rounded-full bg-primary font-bold text-[10px] text-white">
                                {initials || "•"}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="mb-0.5 flex min-w-0 items-center gap-1">
                                <span className="truncate font-semibold text-[11px] text-foreground/80 capitalize">
                                  {(note.author ?? "").toLowerCase() || "—"}
                                </span>
                                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/35 tabular-nums">
                                  {fmtNoteTime(note.created_at)}
                                </span>
                              </div>
                              <p className="text-[11px] text-foreground/75 leading-snug">{note.text}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Gate Codes tab — multi-code add + list (parity with /dashboard/stops) ── */}
            {tab === "gatecodes" && (
              <div>
                <div className="border-border/50 border-b px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={gateCodeInput}
                      onChange={(e) => setGateCodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveGateCode();
                      }}
                      placeholder="*1234 or Call Maria at gate…"
                      maxLength={50}
                      className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/35 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5 bg-primary px-3 text-[11px] text-white hover:bg-primary/90"
                      disabled={!gateCodeInput.trim() || savingGateCode}
                      onClick={handleSaveGateCode}
                    >
                      {savingGateCode ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus className="size-3" aria-hidden="true" />
                      )}
                      Save
                    </Button>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground/40">
                    Short code (e.g. *1234) or brief note · {gateCodeInput.length}/50
                  </p>
                </div>
                {stop.address.street && (
                  <div className="border-border/50 border-b bg-muted/20 px-3 py-1.5">
                    <p className="font-semibold text-[10px] text-muted-foreground/55 uppercase tracking-widest">
                      Building:{" "}
                      <span className="font-mono text-foreground/70 normal-case tracking-normal">
                        {stop.address.street}
                      </span>
                    </p>
                  </div>
                )}
                {gateCodesLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10">
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
                    <span className="text-[11px] text-muted-foreground">Looking up access codes…</span>
                  </div>
                ) : gateCodesData.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-[11px] text-muted-foreground/50">No access codes on file</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/35">for this address</p>
                  </div>
                ) : (
                  <div className="relative px-3 py-2">
                    <div className="absolute bottom-2 left-[14px] top-5 w-px bg-primary/60" />
                    <div className="space-y-0">
                      {gateCodesData.map((gc, gcIdx) => {
                        const code = String(gc.gate_code ?? gc.code ?? gc.access_code ?? "");
                        const notes = String(gc.notes ?? gc.note ?? gc.description ?? "");
                        const addedBy = String(gc.added_by ?? gc.created_by ?? "Routely").toLowerCase();
                        const createdAt = String(gc.created_at ?? gc.updated_at ?? "");
                        const isLatestCode = gcIdx === 0;
                        return (
                          <div key={`${code}-${gcIdx}`} className="relative flex gap-2 pb-3 last:pb-0">
                            <div className="relative mt-0.5 size-5 shrink-0">
                              {isLatestCode && (
                                <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 [animation-duration:2.5s]" />
                              )}
                              <div className="relative z-10 flex size-5 items-center justify-center rounded-full bg-primary text-white">
                                <Hash className="size-2.5" aria-hidden="true" />
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="mb-0.5 flex min-w-0 items-center gap-1">
                                <span className="truncate font-semibold text-[11px] text-foreground/80 capitalize">
                                  {addedBy}
                                </span>
                                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/35 tabular-nums">
                                  {createdAt ? fmtNoteTime(createdAt) : ""}
                                </span>
                              </div>
                              <p className="font-mono font-semibold text-[13px] text-foreground tracking-wider">
                                {code}
                              </p>
                              {notes && <p className="text-[11px] text-muted-foreground/70 leading-snug">{notes}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── History tab — read-only timeline (parity with /dashboard/stops) ── */}
            {tab === "history" && (
              <div className="bg-card px-3 py-3">
                {timelineEntries === null ? (
                  <div className="flex items-center justify-center gap-2 py-10">
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
                    <span className="text-[11px] text-muted-foreground">Loading history…</span>
                  </div>
                ) : timelineEntries.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[11px] text-muted-foreground/50">No history yet</div>
                ) : (
                  <ol className="relative ml-2 border-border/50 border-l">
                    {timelineEntries.map((e, i) => {
                      const Icon = TIMELINE_ICONS[e.event] ?? FileText;
                      const hasDetail = (e.field_changes?.length ?? 0) > 0;
                      const isOpen = timelineExpanded === i;
                      const ts = e.timestamp ? new Date(e.timestamp) : null;
                      return (
                        <li key={`${e.event}-${e.timestamp ?? i}`} className="relative pb-4 pl-5 last:pb-1">
                          <span
                            className={cn(
                              "absolute -left-[9px] top-0.5 flex size-[18px] items-center justify-center rounded-full ring-2 ring-card",
                              e.event === "delivered"
                                ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300"
                                : e.event === "failed"
                                  ? "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300"
                                  : "bg-muted text-muted-foreground/70",
                            )}
                          >
                            <Icon className="size-2.5" aria-hidden="true" />
                          </span>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium text-xs text-foreground/85">{e.label}</span>
                            {ts && (
                              <span className="shrink-0 text-[10px] text-muted-foreground/50">
                                {ts.toLocaleDateString(undefined, { month: "short", day: "numeric" })}{" "}
                                {ts.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground/70">{timelineActorDisplay(e)}</p>
                          {e.note && (
                            <p className="mt-0.5 whitespace-pre-line text-[11px] text-muted-foreground/50">
                              {e.note}
                            </p>
                          )}
                          {hasDetail && (
                            <>
                              <button
                                type="button"
                                onClick={() => setTimelineExpanded(isOpen ? null : i)}
                                className="mt-1 flex items-center gap-1 font-medium text-[10px] text-primary/80 hover:text-primary"
                              >
                                <ChevronDown
                                  className={cn("size-3 transition-transform", isOpen && "rotate-180")}
                                  aria-hidden="true"
                                />
                                {isOpen
                                  ? "Hide changes"
                                  : `${e.field_changes?.length} change${(e.field_changes?.length ?? 0) > 1 ? "s" : ""}`}
                              </button>
                              {isOpen && (
                                <div className="mt-1.5 space-y-1 rounded-lg bg-muted/30 px-2.5 py-2">
                                  {e.field_changes?.map((c) => (
                                    <div key={c.field} className="text-[11px]">
                                      <span className="font-medium text-foreground/70">
                                        {FIELD_LABELS[c.field] ?? c.field}:
                                      </span>{" "}
                                      <span className="text-muted-foreground/60 line-through">
                                        {String(c.old_value ?? "—")}
                                      </span>
                                      {" → "}
                                      <span className="text-foreground/80">{String(c.new_value ?? "—")}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}
          </div>

          {/* ── Footer ─────────────────────────────────────────── */}
          <div className="shrink-0 border-border/60 border-t bg-card px-4 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground/55">
                {isLocked
                  ? "Read-only — stop reached a final state"
                  : isLimited
                    ? "Limited edit — driver en route"
                    : "Changes save automatically"}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
