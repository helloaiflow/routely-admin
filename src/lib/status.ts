// ── Canonical stop classification ──────────────────────────────────────────
// Spoke's success BOOLEAN is the source of truth for the terminal question
// (delivered vs failed), per STOP_LIFECYCLE_DEFINITION: "source of truth for
// success/failure is the succeeded bool, NOT the state string." This single
// module replaces the 4 divergent string-lists that used to live in
// _helpers.ts / next-stop-panel.tsx / sankey-flow.tsx / dashboard-shell.tsx —
// so KPIs, the Sankey and the Live Stop Monitor classify the SAME stop identically.
//
// Rules:
//   • delivery_succeeded === true  → delivered   (terminal success)
//   • delivery_succeeded === false → failed      (attempted, not delivered)
//   • delivery_succeeded null/absent → PRE-TERMINAL: classify by internal status
//       - in motion (assigned/in_transit/…)  → in_motion
//       - draft/unassigned/…                 → pre
//   • return_to_sender is Routely-set terminal-fail (no Spoke bool) → failed
//   • the raw spoke_state string is DISPLAY-ONLY (the human reason), never the decision
// The internal-status fallbacks below are used ONLY when the bool is null/absent
// (legacy docs predating the webhook, or Routely-set terminals).

export interface ClassifiableStop {
  status?: string | null;
  /** Spoke's success signal. true = delivered (unambiguous). false is AMBIGUOUS:
   *  Spoke sets succeeded:false BOTH on a real failed attempt AND on a stop that
   *  hasn't been attempted yet (a just-allocated/assigned stop arrives with
   *  succeeded:false as noise). null/undefined = not yet attempted. */
  delivery_succeeded?: boolean | null;
  /** Spoke's attempt flag (deliveryInfo.attempted). Gates the meaning of
   *  delivery_succeeded:false — only an ATTEMPTED stop can be a real failure. */
  delivery_attempted?: boolean | null;
}

export type StopPhase = "delivered" | "failed" | "in_motion" | "pre";

export const DELIVERED_FALLBACK = ["delivered", "completed", "picked_up"] as const;
export const FAILED_FALLBACK = [
  "failed",
  "attempted",
  "cancelled",
  "failed_not_home",
  "return_to_sender",
  "rts",
  "undeliverable",
] as const;
export const IN_MOTION_STATUSES = ["assigned", "in_transit", "out_for_delivery", "dispatched", "in_progress"] as const;

const lc = (s: ClassifiableStop): string => (s.status ?? "").toLowerCase();

/** The one classifier. Everything else is derived from it for guaranteed parity. */
export function phaseOf(s: ClassifiableStop): StopPhase {
  const st = lc(s);
  const inMotion = (IN_MOTION_STATUSES as readonly string[]).includes(st);

  // succeeded === true is unambiguous (a real successful delivery) → wins always.
  if (s.delivery_succeeded === true) return "delivered";

  // CURRENTLY IN MOTION wins over any non-true succeeded bool. A stop that is
  // assigned/in_transit/out_for_delivery RIGHT NOW is a MORE RECENT signal than
  // any prior attempt: a stop re-dispatched after a failed attempt (or a stop
  // re-allocated when stop.allocated was enabled) still carries succeeded:false /
  // attempted:true from that OLD attempt — but it is back on the road, so it must
  // read as in_motion, NOT failed. Only a confirmed delivery (succeeded === true,
  // handled above) outranks in-motion. THIS is the fix for assigned/in_transit
  // stops rendering red as "failed" once stop.allocated events started arriving.
  if (inMotion) return "in_motion";

  // Not in motion. succeeded === false now means a REAL failure: the stop was
  // attempted and is not currently re-dispatched. (A null/absent attempted flag on
  // a non-in-motion stop is a legacy terminal doc → also treated as failed.)
  if (s.delivery_succeeded === false) {
    if (s.delivery_attempted === true) return "failed";
    if (s.delivery_attempted == null) return "failed";
    // attempted:false & not in motion → not a failure; fall through to status below.
  }

  // Bool absent/null (or false-but-not-attempted) → fall back to internal status.
  if (st === "return_to_sender" || st === "rts") return "failed";
  if ((DELIVERED_FALLBACK as readonly string[]).includes(st)) return "delivered";
  if ((FAILED_FALLBACK as readonly string[]).includes(st)) return "failed";
  return "pre";
}

export const isDelivered = (s: ClassifiableStop): boolean => phaseOf(s) === "delivered";
export const isFailed = (s: ClassifiableStop): boolean => phaseOf(s) === "failed";
export const isInMotion = (s: ClassifiableStop): boolean => phaseOf(s) === "in_motion";
export const isPreDispatch = (s: ClassifiableStop): boolean => phaseOf(s) === "pre";
export const isTerminal = (s: ClassifiableStop): boolean => {
  const p = phaseOf(s);
  return p === "delivered" || p === "failed";
};
