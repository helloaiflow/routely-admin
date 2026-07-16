// ── Status presentation — single source of truth ───────────────────────────
// The ONE place that maps a stop status string → its chip/dot styling + label.
// Do NOT reimplement status color maps anywhere else; import from
// "@/lib/ui/status". (search/_helpers + default/_helpers re-export these.)
//
// Two chip styles:
//   • statusColors()  → SOFT tinted chip (light tint bg + colored text + ring).
//     Every tint carries a `dark:` variant so it stays legible in dark mode.
//   • statusPill()    → FILLED saturated pill (solid color + white text). Legible
//     in BOTH themes already, so no dark: variant needed. Defined once here.
//
// Classification of delivered/failed/in-motion for COUNTS lives in
// "@/lib/status" (phaseOf, keyed on the Spoke success boolean) — this module is
// presentation only (how a given status string looks), not the count decision.

// Canonical status groupings (presentation buckets).
export const DELIVERED_GROUP = ["delivered", "completed", "picked_up"];
export const IN_TRANSIT_GROUP = ["in_transit", "out_for_delivery", "dispatched", "assigned", "in_progress"];
export const FAILED_GROUP = ["failed", "attempted", "cancelled", "failed_not_home", "return_to_sender", "rts"];
export const APPROVED_GROUP = ["approved", "paid"];
export const PENDING_GROUP = ["pending", "draft", "created"];
export const UNASSIGNED_GROUP = ["unassigned"];

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    in_transit: "In Transit",
    out_for_delivery: "Out for Delivery",
    in_progress: "In Transit",
    dispatched: "Dispatched",
    assigned: "Assigned",
    delivered: "Delivered",
    completed: "Delivered",
    picked_up: "Picked Up",
    failed: "Failed",
    attempted: "Attempted",
    cancelled: "Cancelled",
    failed_not_home: "Not Home",
    return_to_sender: "Return to Sender",
    pending: "Pending",
    draft: "Draft",
    approved: "Approved",
    paid: "Paid",
    unassigned: "Unassigned",
    created: "Created",
    submit_failed: "Submit Failed",
  };
  return map[status] ?? status.split("_").map((w) => (w[0]?.toUpperCase() ?? "") + w.slice(1)).join(" ");
}

export interface StatusColors {
  bg: string;
  text: string;
  ring: string;
  dot: string;
}

// SOFT tinted chip — light tint + colored text + ring + dot. Each tint has a
// dark: variant (deeper bg, lighter text) so it reads in dark mode. The neutral
// fallback uses theme tokens.
export function statusColors(status: string): StatusColors {
  const s = (status ?? "").toLowerCase();
  if (DELIVERED_GROUP.includes(s))
    return {
      bg: "bg-emerald-50 dark:bg-emerald-500/15",
      text: "text-emerald-700 dark:text-emerald-300",
      ring: "ring-emerald-200/60 dark:ring-emerald-500/30",
      dot: "bg-emerald-500",
    };
  if (IN_TRANSIT_GROUP.includes(s))
    return {
      bg: "bg-blue-50 dark:bg-blue-500/15",
      text: "text-blue-700 dark:text-blue-300",
      ring: "ring-blue-200/60 dark:ring-blue-500/30",
      dot: "bg-primary",
    };
  if (FAILED_GROUP.includes(s))
    return {
      bg: "bg-rose-50 dark:bg-rose-500/15",
      text: "text-rose-600 dark:text-rose-300",
      ring: "ring-rose-200/60 dark:ring-rose-500/30",
      dot: "bg-rose-500",
    };
  if (APPROVED_GROUP.includes(s))
    return {
      bg: "bg-indigo-50 dark:bg-indigo-500/15",
      text: "text-indigo-700 dark:text-indigo-300",
      ring: "ring-indigo-200/60 dark:ring-indigo-500/30",
      dot: "bg-indigo-500",
    };
  if (PENDING_GROUP.includes(s) || UNASSIGNED_GROUP.includes(s))
    return {
      bg: "bg-amber-50 dark:bg-amber-500/15",
      text: "text-amber-700 dark:text-amber-300",
      ring: "ring-amber-200/60 dark:ring-amber-500/30",
      dot: "bg-amber-400",
    };
  return { bg: "bg-muted", text: "text-muted-foreground", ring: "ring-border/50", dot: "bg-muted-foreground/40" };
}

// FILLED saturated pill — solid color + white text. Legible in both themes, so
// no dark: variant. `text-white` is intentional and allowed (not a surface).
export function statusPill(status: string): { bg: string; text: string } {
  const s = (status ?? "").toLowerCase();
  if (DELIVERED_GROUP.includes(s)) return { bg: "bg-emerald-500", text: "text-white" };
  if (IN_TRANSIT_GROUP.includes(s)) return { bg: "bg-primary", text: "text-primary-foreground" };
  if (FAILED_GROUP.includes(s)) return { bg: "bg-rose-500", text: "text-white" };
  if (APPROVED_GROUP.includes(s)) return { bg: "bg-indigo-500", text: "text-white" };
  if (PENDING_GROUP.includes(s) || UNASSIGNED_GROUP.includes(s)) return { bg: "bg-amber-400", text: "text-white" };
  return { bg: "bg-muted", text: "text-muted-foreground" };
}

// Source chip (stop vs draft) — tinted, dark-safe.
export function sourceColors(source: "stop" | "draft"): { bg: string; text: string } {
  return source === "stop"
    ? { bg: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", text: "text-blue-700 dark:text-blue-300" }
    : { bg: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", text: "text-amber-700 dark:text-amber-300" };
}
