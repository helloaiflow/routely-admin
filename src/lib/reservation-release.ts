import { getSupabaseAdmin } from "@/lib/supabase";

/* ───────────────────────────────────────────────────────────────────────────
 * Orphan reservation release (KNOWN_ISSUES 2026-10-29, Misión 7).
 *
 * orders/create reserves fund capacity BEFORE creating the stop. When the
 * create then fails, the hold is released right away instead of staying
 * frozen for the 48h expiry sweep. FastAPI only releases when NO stop exists
 * under that id (a 5xx/timeout may still have persisted it) and uses the same
 * release_reservation() as cancel-before-dispatch.
 *
 * A failed release is never just a log line (GO_LIVE 5.1 pattern): FastAPI
 * records billing.reservation_release_failed itself; if it could not (or was
 * unreachable), the event is recorded here. Never throws — the caller is
 * already returning an error to the user.
 * ───────────────────────────────────────────────────────────────────────────*/

export type ReleaseOutcome = "released" | "none" | "stop_exists" | "failed";

export async function releaseUnusedReservation(opts: {
  base: string;
  secret: string;
  tenantId: number;
  stopId: string;
  reason: string;
}): Promise<ReleaseOutcome> {
  const { base, secret, tenantId, stopId, reason } = opts;
  let error = "";
  try {
    const res = await fetch(`${base}/v1/billing/reservations/release-unused`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": secret },
      body: JSON.stringify({ tenant_id: tenantId, stop_id: stopId, reason }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) {
      if (data.released) return "released";
      return data.reason === "stop_exists" ? "stop_exists" : "none";
    }
    const detail = (data.detail ?? {}) as Record<string, unknown>;
    if (detail.event_recorded === true) return "failed";
    error = `release-unused HTTP ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  console.error("[orders/create] reservation release failed for", stopId, error);
  try {
    const { error: insErr } = await getSupabaseAdmin()
      .from("events")
      .insert({
        tenant_id: tenantId,
        aggregate_type: "stop",
        aggregate_id: stopId,
        type: "billing.reservation_release_failed",
        payload: { reason, error: error.slice(0, 500) },
        actor: "orders_create",
      });
    if (insErr) throw insErr;
  } catch (evErr) {
    console.error("[orders/create] failed to record reservation_release_failed for", stopId, evErr);
  }
  return "failed";
}
