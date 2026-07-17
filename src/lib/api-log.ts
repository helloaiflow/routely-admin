import { getDb } from "@/lib/tenant";

/* ── api_logs — external-API audit log (lean, PHI-safe, auto-expiring) ────────
 * ONE choke-point helper every outbound external call (OpenAI, Spoke, Google,
 * Telnyx, …) funnels through. One document per call: provider + operation +
 * status + the PROVIDER's real error body (truncated & PHI-scrubbed) + latency
 * + tenant + a correlation id (stop_id/draft_id/batch_id) so we can answer
 * "what happened to these 15 scans?".
 *
 * RULES:
 *  - PHI-SAFE: callers pass NON-PHI request_summary (shapes/counts, e.g.
 *    { fields: 6, phone: "present" }) — never raw patient name/phone/address/dob.
 *    Provider error bodies are stored truncated AND run through scrubPHI().
 *  - NON-BLOCKING: logExternalCall() is fire-and-forget. It never throws and
 *    never awaits in the caller's critical path — a failed log write must NEVER
 *    break or slow the real API call.
 *  - AUTO-EXPIRING: TTL index drops docs RETENTION_DAYS after created_at (same
 *    pattern as failed_scans) so the collection never grows unbounded.
 *  - LEAN: this is an audit log + TTL + a read path. Not a metrics platform.
 * ─────────────────────────────────────────────────────────────────────────── */

const RETENTION_DAYS = 10; // 7–14d window; recent-debugging retention, not forever.

export type ApiLogEntry = {
  provider: "openai" | "spoke" | "google_places" | "telnyx" | (string & {});
  operation: string; // "ocr.ai-extract.read", "spoke.create_stop", "places.validate"
  method?: string;
  status_code?: number | null;
  ok: boolean;
  error_code?: string | null;
  error_message?: string | null; // provider error body — truncated + scrubbed here
  latency_ms?: number | null;
  tenant_id?: number | null;
  actor?: string | null;
  request_summary?: Record<string, unknown> | null; // NON-PHI shapes/counts only
  // correlation — link a log line back to the operation it belongs to
  stop_id?: string | null;
  draft_id?: string | null;
  batch_id?: string | null;
};

let indexesEnsured = false;
async function ensureIndexes(db: Awaited<ReturnType<typeof getDb>>) {
  if (indexesEnsured) return;
  try {
    await db.collection("api_logs").createIndexes([
      // TTL — Mongo auto-deletes a doc RETENTION_DAYS after created_at. The field
      // MUST be a real BSON Date for the TTL monitor to act on it.
      { key: { created_at: 1 }, name: "ttl_created_at", expireAfterSeconds: RETENTION_DAYS * 86400 },
      // Read path: "failed spoke calls for this tenant in the last hour".
      { key: { tenant_id: 1, provider: 1, created_at: -1 }, name: "idx_tenant_provider_created" },
    ]);
    indexesEnsured = true;
  } catch (err) {
    // Non-fatal: a parallel cold start may race; createIndexes is idempotent.
    console.error("[api-log ensureIndexes]", err instanceof Error ? err.message : err);
  }
}

// Defensive PHI scrub on provider error bodies (auth/rate errors rarely carry
// PHI, but never assume): redact emails, long digit runs (phones/zips/ids), and
// US-phone-shaped strings. Keeps the error meaning, drops anything PHI-like.
function scrubPHI(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, "[phone]")
    .replace(/\d{7,}/g, "[num]");
}

/**
 * Fire-and-forget audit write. Call AFTER an external API call returns/throws.
 * Never throws, never blocks — safe to call without await.
 */
export function logExternalCall(entry: ApiLogEntry): void {
  void (async () => {
    try {
      const db = await getDb();
      await ensureIndexes(db);
      await db.collection("api_logs").insertOne({
        provider: entry.provider,
        operation: entry.operation,
        method: entry.method ?? null,
        status_code: entry.status_code ?? null,
        ok: entry.ok,
        error_code: entry.error_code ?? null,
        error_message: entry.error_message ? scrubPHI(String(entry.error_message)).slice(0, 600) : null,
        latency_ms: entry.latency_ms ?? null,
        tenant_id: entry.tenant_id ?? null,
        actor: entry.actor ?? null,
        request_summary: entry.request_summary ?? null,
        correlation: {
          stop_id: entry.stop_id ?? null,
          draft_id: entry.draft_id ?? null,
          batch_id: entry.batch_id ?? null,
        },
        created_at: new Date(),
      });
    } catch (err) {
      // A failed audit write must NEVER affect the real operation.
      console.error("[api-log] write failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  })();
}
