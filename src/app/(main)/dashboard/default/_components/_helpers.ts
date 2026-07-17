import { DELIVERED_FALLBACK, FAILED_FALLBACK } from "@/lib/status";

import type { DashboardStop } from "./_types";

// statusLabel is consolidated — single source of truth (@/lib/ui/status). The
// default-specific helpers (statusTone/toneClasses/legOf/packageEmoji/formatEta)
// stay local; toneClasses tints already carry dark: variants.
export { statusLabel } from "@/lib/ui/status";

// Re-export the canonical fallback sets (lib/status.ts) so the divergent local
// lists are gone. statusTone() below is a status-STRING tone helper (no stop, so
// no Spoke bool) — it keeps using these for the chip color only, never as a
// delivered/failed COUNT (those go through the boolean classifier in lib/status).
export const DELIVERED_STATUSES: readonly string[] = DELIVERED_FALLBACK;
export const FAILED_STATUSES: readonly string[] = FAILED_FALLBACK;
export const PRE_DISPATCH_STATUSES = ["draft", "approved", "paid", "pending", "unassigned"];

export function statusTone(status: string): "neutral" | "warning" | "info" | "success" | "danger" {
  if (DELIVERED_STATUSES.includes(status)) return "success";
  if (FAILED_STATUSES.includes(status)) return "danger";
  if (status === "dispatched" || status === "in_progress" || status === "loaded") return "info";
  // Unassigned / Submitted (pending) → amber "warning" tone (was falling through to
  // neutral/grey). Registered here so every consumer of statusTone shows amber.
  if (status === "unassigned" || status === "pending" || status === "approved" || status === "paid") return "warning";
  return "neutral";
}

export const toneClasses: Record<ReturnType<typeof statusTone>, { bg: string; text: string; dot: string }> = {
  success: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  danger: {
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  info: {
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  warning: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  neutral: {
    bg: "bg-zinc-500/10",
    text: "text-zinc-600 dark:text-zinc-400",
    dot: "bg-zinc-400",
  },
};

export function legOf(stop: DashboardStop): "PU" | "DL" {
  return PRE_DISPATCH_STATUSES.includes(stop.status) ? "PU" : "DL";
}

export function packageEmoji(t: string): string {
  if (t === "cold") return "❄️";
  if (t === "rx") return "💊";
  return "📦";
}

export function formatEta(dateStr: string | null, isSameDay: boolean): string {
  if (isSameDay) return "Today · Xpress";
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
