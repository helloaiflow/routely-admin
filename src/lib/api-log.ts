import { getSupabaseAdmin } from "@/lib/supabase";

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
 *  - RETENTION: Mongo dropped docs after RETENTION_DAYS with a TTL index. Since M18 the rows
 *    live in public.api_logs, which has no purge yet (pending, see ROS M18).
 *  - LEAN: this is an audit log + TTL + a read path. Not a metrics platform.
 * ─────────────────────────────────────────────────────────────────────────── */

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
      // M18: public.api_logs (tenant_id + doc), the table /api/client/api-logs reads.
      const doc = {
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
        created_at: new Date().toISOString(),
      };
      const { error } = await getSupabaseAdmin()
        .from("api_logs")
        .insert({ tenant_id: entry.tenant_id ?? null, doc, created_at: doc.created_at });
      if (error) throw new Error(error.message);
    } catch (err) {
      // A failed audit write must NEVER affect the real operation.
      console.error("[api-log] write failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  })();
}
