import { getSupabaseAdmin } from "@/lib/supabase";

const ROLLUP_FIELD_KEYS = ["name", "phone", "street", "city", "state", "zip", "dob"] as const;

/** Long-term daily rollup in Supabase (permanent; survives the raw TTL).
 *  Fire-and-forget, fully independent of the raw row write. */
function bumpDailyRollup(entry: OcrScanLogEntry): void {
  if (entry.tenant_id == null) return; // rollup is keyed by tenant
  void (async () => {
    try {
      const f = (entry.fields ?? {}) as Record<string, unknown>;
      const fieldsCaptured = ROLLUP_FIELD_KEYS.filter((k) => Boolean(f[k])).length;
      const score = typeof f.critical_score === "number" ? (f.critical_score as number) : null;
      // ET calendar day (Florida ops) so daily buckets align with the tenant tz.
      const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      await getSupabaseAdmin().rpc("ocr_scan_daily_bump", {
        p_tenant: entry.tenant_id,
        p_day: day,
        p_provider: entry.provider ?? "",
        p_ok: entry.ok,
        p_error: !entry.ok && (entry.status_code ?? 0) >= 500,
        p_latency: Math.round(entry.latency_ms ?? 0),
        p_retry: entry.used_retry,
        p_second: entry.used_second_pass,
        p_fields: fieldsCaptured,
        p_score: score,
        p_has_score: score != null,
        p_error_code: entry.error_code ?? null,
      });
    } catch (err) {
      console.error("[ocr-scan-daily] rollup failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  })();
}

type ImageMeta = {
  mime: string | null;
  approx_bytes: number;
};

export type OcrScanLogEntry = {
  provider: string;
  scan_preference: "qwen" | "openai";
  ok: boolean;
  status_code: number;
  error_code?: string | null;
  error_message?: string | null;
  latency_ms: number;
  tenant_id?: number | null;
  actor?: string | null;
  batch_id?: string | null;
  model?: string | null;
  primary_image?: ImageMeta | null;
  retry_image?: ImageMeta | null;
  used_retry: boolean;
  used_second_pass: boolean;
  fields: Record<string, unknown>;
};

function scrubMessage(value?: string | null) {
  if (!value) return null;
  return value
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, "[phone]")
    .replace(/\d{7,}/g, "[num]")
    .slice(0, 600);
}

export function imageDataUrlMeta(dataUrl?: string | null): ImageMeta | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) return { mime: null, approx_bytes: Math.ceil(dataUrl.length * 0.75) };
  return {
    mime: match[1],
    approx_bytes: Math.ceil(match[2].length * 0.75),
  };
}

export function logOcrScan(entry: OcrScanLogEntry): void {
  // Permanent daily rollup (Supabase) — independent of the raw row write.
  bumpDailyRollup(entry);
  void (async () => {
    try {
      // M18: raw rows go to public.ocr_scan_logs (tenant_id + doc), the table the OCR monitor reads.
      const doc = {
        provider: entry.provider,
        scan_preference: entry.scan_preference,
        ok: entry.ok,
        status_code: entry.status_code,
        error_code: entry.error_code ?? null,
        error_message: scrubMessage(entry.error_message),
        latency_ms: entry.latency_ms,
        tenant_id: entry.tenant_id ?? null,
        actor: entry.actor ?? null,
        model: entry.model ?? null,
        primary_image: entry.primary_image ?? null,
        retry_image: entry.retry_image ?? null,
        used_retry: entry.used_retry,
        used_second_pass: entry.used_second_pass,
        fields: entry.fields,
        correlation: {
          batch_id: entry.batch_id ?? null,
        },
        created_at: new Date().toISOString(),
      };
      const { error } = await getSupabaseAdmin()
        .from("ocr_scan_logs")
        .insert({ tenant_id: entry.tenant_id ?? null, doc, created_at: doc.created_at });
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error("[ocr-scan-log] write failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  })();
}
