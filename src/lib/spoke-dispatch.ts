/* ───────────────────────────────────────────────────────────────────────────
 * Spoke dispatch switch (Misión 8, D56).
 *
 * SPOKE_DISPATCH_ENABLED=false (server env): Routely never posts its own stops
 * to Spoke/Circuit — they stay "unassigned" in Routely. Same switch name as
 * routely-api, which gates create/edit/delete/retry there. Anything other than
 * the literal "false" keeps the previous behavior (rollback = set true).
 * ───────────────────────────────────────────────────────────────────────────*/

export const SPOKE_DISABLED_MESSAGE =
  "Spoke dispatch is turned off — this stop stays in Routely and is not sent to Circuit.";

export function spokeDispatchEnabled(): boolean {
  return process.env.SPOKE_DISPATCH_ENABLED !== "false";
}
