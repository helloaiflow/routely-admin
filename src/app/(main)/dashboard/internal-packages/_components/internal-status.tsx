import { isDelivered, isFailed, isInMotion } from "@/lib/status";

import type { InternalPackage } from "./_types";

/* Status label + badge tint for internal packages — same canonical
 * classifiers as everything else (lib/status.ts), plain non-medical labels. */
export function statusLabelOf(p: InternalPackage): string {
  if (isDelivered(p)) return "Delivered";
  if (isFailed(p)) return "Failed";
  if (isInMotion(p)) return "In Transit";
  if (p.status === "unassigned") return "Unassigned";
  return "Pending";
}

export function statusBadgeCls(p: InternalPackage): string {
  if (isDelivered(p)) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (isFailed(p)) return "bg-rose-500/10 text-rose-600 dark:text-rose-400";
  if (isInMotion(p)) return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
  if (p.status === "unassigned") return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}
