import { NextResponse } from "next/server";

import { logExternalCall } from "@/lib/api-log";
import {
  type CleanFields,
  cleanRawRead,
  hasMalformedPhoneSignal,
  normalizePhone,
  type RawRead,
} from "@/lib/ocr/ai-clean";
import { randomUUID } from "node:crypto";

import { imageDataUrlMeta, logOcrScan } from "@/lib/ocr/scan-log";
import { getSupabaseAdmin } from "@/lib/supabase";

const OCR_FIELD_KEYS = ["name", "phone", "street", "city", "state", "zip", "dob"] as const;

/** Permanent per-scan record (Supabase ocr_scans) — the linking backbone
 *  scan → draft → stop. Image bytes are stored later by the local NAS
 *  integration (image_url filled then). Fire-and-forget, non-fatal. */
function recordOcrScan(row: {
  scan_id: string;
  tenant_id: number | null;
  source: string;
  batch_id: string | null;
  provider: string;
  ok: boolean;
  latency_ms: number;
  model: string;
  status_code: number;
  error_code?: string | null;
  fields_captured?: number | null;
  critical_score?: number | null;
}): void {
  if (row.tenant_id == null) return;
  void (async () => {
    try {
      await getSupabaseAdmin()
        .from("ocr_scans")
        .insert({
          scan_id: row.scan_id,
          tenant_id: row.tenant_id,
          source: row.source,
          batch_id: row.batch_id,
          provider: row.provider,
          ok: row.ok,
          latency_ms: Math.round(row.latency_ms),
          model: row.model,
          status_code: row.status_code,
          error_code: row.error_code ?? null,
          fields_captured: row.fields_captured ?? null,
          critical_score: row.critical_score ?? null,
          image_status: "pending",
        });
    } catch (err) {
      console.error("[ocr_scans] insert failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  })();
}
import { requirePagePermission } from "@/lib/tenant";

// Correlation/tenant metadata threaded into the OpenAI calls so each audit-log
// line can be tied back to the batch + tenant. NON-PHI.
type LogMeta = { tenantId: number | null; batchId: string | null };
type ReadStage = "primary" | "retry";
type ReadResult = { raw: RawRead; rawText: string; readMs: number };

/* ── POST /api/client/ocr/ai-extract ─────────────────────────────────────────
 * Hybrid-OCR AI layer. Tesseract stays client-side as layer 1; THIS endpoint
 * is the AI fallback. The OpenAI key lives ONLY in server env (OPENAI_API_KEY).
 *
 * TWO-STAGE pipeline (Session A.3, 2026-06-13 — mirrors the proven n8n flow):
 *   Stage 1 — READ:  the vision model only TRANSCRIBES what it sees (raw).
 *   Stage 2 — CLEAN: deterministic JS (lib/ocr/ai-clean) normalizes/maps.
 * Splitting read from normalize is the root-cause fix for phone capture: the
 * model reports the digits it sees instead of trying to find+validate+format
 * a phone in one shot.
 *
 * Provider-swappable by design: `PROVIDERS` is an ordered chain; Phase 2
 * prepends a Qwen-local extractor WITHOUT any frontend change.
 *
 * PHI note: we do NOT log the image or extracted PII — only metadata.
 * ─────────────────────────────────────────────────────────────────────────── */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const QWEN_OCR_BASE_URL = (process.env.QWEN_OCR_BASE_URL ?? "").replace(/\/$/, "");
const QWEN_OCR_MODEL = process.env.QWEN_OCR_MODEL ?? "Qwen/Qwen2.5-VL-3B-Instruct";
const QWEN_OCR_API_KEY = process.env.QWEN_OCR_API_KEY ?? "local";
const QWEN_OCR_ALLOW_OPENAI_FALLBACK = process.env.QWEN_OCR_ALLOW_OPENAI_FALLBACK === "true";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // ~8MB dataUrl cap

// Response contract — unchanged so every downstream consumer keeps working.
export type AIExtractFields = CleanFields;

// ── STAGE 1 prompt — READ ONLY. The model transcribes; it does NOT format,
// validate, or interpret. Stage 2 (ai-clean.ts) does all normalization.
const READ_PROMPT = `You are transcribing a US pharmacy shipping-bag label. Report EXACTLY what you SEE. Do NOT reformat, validate, correct, or interpret — just transcribe the characters as printed. The system cleans and formats afterwards.

Return STRICT JSON only — no markdown, no code fences, no prose. Exactly this shape:
{"name":string|null,"phone":string|null,"phone_candidates":string[],"dob":string|null,"print_datetime":string|null,"street":string|null,"city":string|null,"state":string|null,"zip":string|null,"order_ids":string[],"number_of_items":number|null}

What to transcribe:
- name: the patient/recipient name exactly as printed (e.g. "PADRON, WILFREDO" or "WILFREDO PADRON"). As-is.
- phone: the patient's phone number. It is usually a standalone ~10-digit number on the line DIRECTLY ABOVE the street address, but it may appear elsewhere or be labeled (Phone/Tel/Ph#/Cell/Mobile/Teléfono). Report the DIGITS exactly as you see them — copy every digit, in order. Do NOT add, drop, reorder, or format. If you genuinely see no phone number anywhere, null. Do NOT invent a number and never output "9540000000".
- phone_candidates: every visible standalone US/NANP-like 10 digit phone candidate. Include bare 10-digit values here even if you are unsure they are the phone.
- dob: the patient date of birth, as printed (e.g. "08/20/1959"). The label may show TWO dates: a date of birth (NO time next to it) and a print/fill date (HAS a time like "14:33 PM"). Put the date WITHOUT a time here.
- print_datetime: the date that HAS a time next to it (the print/fill datetime), as printed, or null.
- street: the delivery street line exactly as printed (e.g. "1185 NW 134TH ST").
- city: the delivery city as printed (e.g. "NORTH MIAMI").
- state: the delivery state as printed (e.g. "FL").
- zip: the delivery ZIP as printed (e.g. "33168").
- order_ids: every order/Rx id you see (formats like "664232-00", "640777-000", "6006418-01"). One per item line. Copy all, as printed, keeping the hyphen. A bare 10-digit value without a hyphen is not an order id; put it in phone_candidates.
- number_of_items: the integer from a "Number of items: N" line, or null.

Transcribe only. Never guess — if a field is unreadable or absent, use null (or [] for order_ids).`;

// ── Qwen READ prompt — FAST config proven in the Windows/NVIDIA vLLM bake-off
// (2026-07-03): "extract only, do NOT transcribe full text" beat both the long
// READ_PROMPT and the rawlines+rescue variant — phone 91 vs 40 exact, 100/100
// complete, p50 1.5s. No raw_lines, no phone rescue. Qwen uses THIS; OpenAI
// keeps READ_PROMPT. phone_status is emitted but harmlessly ignored downstream.
const QWEN_READ_PROMPT = `You are an OCR + data-extraction system for a US pharmacy delivery label.

Return ONLY one valid JSON object. No markdown, no code fences, no prose.
Use exactly this shape:
{"name":string|null,"phone":string|null,"phone_candidates":string[],"phone_status":"valid"|"placeholder_zeros"|"missing","dob":string|null,"print_datetime":string|null,"street":string|null,"city":string|null,"state":string|null,"zip":string|null,"order_ids":string[],"number_of_items":number|null}

Extract only the fields requested. Do not transcribe the full label text.

PHONE (read carefully — this is the field most often missed):
- STEP 1: Locate the delivery street address line.
- STEP 2: Scan the WHOLE label for every standalone 10-digit number (a run of exactly 10 digits, possibly with spaces, dashes or parentheses like (561) 396-4565).
- The line IMMEDIATELY ABOVE the street address is the highest-priority location for the phone, but a phone may appear anywhere on the label.
- A phone may also be labeled: "Phone:##########", "Tel", "Ph#", "Cell", "Mobile", "Teléfono".
- Put EVERY standalone 10-digit value whose area code (first digit) is 2-9 into phone_candidates — even if you are unsure it is THE phone.
- If a real US phone is visible, set phone to its 10 digits (digits only) and phone_status:"valid". A valid phone has exactly 10 digits and an area code starting 2-9.
- NEVER invent, guess, or default a phone. Never output 0000000000 or 9540000000.
- Set phone_status:"placeholder_zeros" and phone:null ONLY if the label explicitly shows "Phone:0000000000" or a visible standalone "0000000000".
- If no real phone is visible anywhere, set phone:null, phone_candidates:[], phone_status:"missing".
- Never treat a ZIP, a date, a barcode, an Rx number, or a hyphenated order ID as a phone.

ORDER IDS:
- Only return IDs matching a hyphenated pattern: ######-##, ######-###, #######-##, or #######-###.
- A bare 10-digit value (no hyphen) is NOT an order ID — it is a phone candidate.

ADDRESS:
- street = street number + name + unit if visible.
- city / state / zip come from the delivery address. state is 2 letters.

number_of_items: the integer from a "Number of items" line, or null.

If a field is genuinely unreadable or absent, use null (or [] for arrays).`;

function parseJsonObject(content: string): Record<string, unknown> {
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  const json = start >= 0 && end >= start ? stripped.slice(start, end + 1) : stripped;
  return JSON.parse(json) as Record<string, unknown>;
}

function coerceRawRead(obj: Record<string, unknown>): RawRead {
  return {
    name: typeof obj.name === "string" ? obj.name : null,
    // phone + zip: the model often transcribes a bare digit run as a JSON
    // NUMBER (7867096450 / 33168), not a string. Coerce to String() instead of
    // nulling — otherwise a phone the model DID see was silently dropped here,
    // before normalizePhone ever ran. (Root cause of the phone-capture failures.)
    phone: obj.phone != null ? String(obj.phone) : null,
    phone_candidates: Array.isArray(obj.phone_candidates) ? obj.phone_candidates.map((v) => String(v)) : [],
    phone_status:
      obj.phone_status === "valid" || obj.phone_status === "placeholder_zeros" || obj.phone_status === "missing"
        ? obj.phone_status
        : null,
    dob: typeof obj.dob === "string" ? obj.dob : null,
    print_datetime: typeof obj.print_datetime === "string" ? obj.print_datetime : null,
    street: typeof obj.street === "string" ? obj.street : null,
    city: typeof obj.city === "string" ? obj.city : null,
    state: typeof obj.state === "string" ? obj.state : null,
    zip: obj.zip != null ? String(obj.zip) : null,
    order_ids: Array.isArray(obj.order_ids) ? obj.order_ids.map((v) => String(v)) : [],
    number_of_items: obj.number_of_items == null ? null : Number(obj.number_of_items),
  };
}

function rawSummary(raw: RawRead) {
  return {
    name: Boolean(raw.name),
    phone: Boolean(raw.phone),
    phone_candidates_count: raw.phone_candidates?.length ?? 0,
    street: Boolean(raw.street),
    city: Boolean(raw.city),
    state: Boolean(raw.state),
    zip: Boolean(raw.zip),
    dob: Boolean(raw.dob),
    order_ids_count: raw.order_ids.length,
    number_of_items: raw.number_of_items != null,
  };
}

function fieldsSummary(fields: CleanFields) {
  const missing = [
    ["name", fields.name],
    ["phone", fields.phone],
    ["street", fields.street],
    ["city", fields.city],
    ["state", fields.state],
    ["zip", fields.zip],
  ]
    .filter(([, value]) => !value)
    .map(([field]) => field);

  return {
    critical_score: criticalScore(fields),
    missing,
    name: Boolean(fields.name),
    phone: Boolean(fields.phone),
    street: Boolean(fields.street),
    city: Boolean(fields.city),
    state: Boolean(fields.state),
    zip: Boolean(fields.zip),
    dob: Boolean(fields.dob),
    order_ids_count: fields.order_ids.length,
    number_of_items: fields.number_of_items != null,
  };
}

async function readViaOpenAI(imageDataUrl: string, meta: LogMeta): Promise<ReadResult> {
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      // gpt-4o-mini: known-good for this transcription task (~3s, deterministic).
      // gpt-5-mini was reverted (2026-06-16) — reasoning tokens consumed
      // max_completion_tokens and truncated/emptied the JSON (+ ~10s latency).
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 450,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: READ_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe the fields from this label." },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    // AUDIT: the real OpenAI status + body (this is what distinguishes an OpenAI
    // 401/429 from Routely's own auth — see the api_logs read endpoint).
    logExternalCall({
      provider: "openai",
      operation: "ocr.ai-extract.read",
      method: "POST",
      status_code: res.status,
      ok: false,
      error_message: errText,
      latency_ms: Date.now() - started,
      tenant_id: meta.tenantId,
      batch_id: meta.batchId,
      request_summary: { model: "gpt-4o-mini", stage: "read" },
    });
    throw new Error(`openai ${res.status}: ${errText.slice(0, 200)}`);
  }
  logExternalCall({
    provider: "openai",
    operation: "ocr.ai-extract.read",
    method: "POST",
    status_code: res.status,
    ok: true,
    latency_ms: Date.now() - started,
    tenant_id: meta.tenantId,
    batch_id: meta.batchId,
    request_summary: { model: "gpt-4o-mini", stage: "read" },
  });
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "";
  const raw = coerceRawRead(parseJsonObject(content));
  logExternalCall({
    provider: "openai",
    operation: "ocr.ai-extract.raw",
    method: "POST",
    status_code: res.status,
    ok: true,
    latency_ms: Date.now() - started,
    tenant_id: meta.tenantId,
    batch_id: meta.batchId,
    request_summary: { model: "gpt-4o-mini", stage: "read", raw: rawSummary(raw) },
  });
  return { raw, rawText: content, readMs: Date.now() - started };
}

async function readViaQwen(imageDataUrl: string, meta: LogMeta, stage: ReadStage = "primary"): Promise<ReadResult> {
  const started = Date.now();
  const res = await fetch(`${QWEN_OCR_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${QWEN_OCR_API_KEY}` },
    body: JSON.stringify({
      model: QWEN_OCR_MODEL,
      temperature: 0,
      max_tokens: 260,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: QWEN_READ_PROMPT },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    logExternalCall({
      provider: "qwen",
      operation: "ocr.ai-extract.read",
      method: "POST",
      status_code: res.status,
      ok: false,
      error_message: errText,
      latency_ms: Date.now() - started,
      tenant_id: meta.tenantId,
      batch_id: meta.batchId,
      request_summary: { model: QWEN_OCR_MODEL, stage },
    });
    throw new Error(`qwen ${res.status}: ${errText.slice(0, 200)}`);
  }
  logExternalCall({
    provider: "qwen",
    operation: "ocr.ai-extract.read",
    method: "POST",
    status_code: res.status,
    ok: true,
    latency_ms: Date.now() - started,
    tenant_id: meta.tenantId,
    batch_id: meta.batchId,
    request_summary: { model: QWEN_OCR_MODEL, stage },
  });
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "";
  const raw = coerceRawRead(parseJsonObject(content));
  logExternalCall({
    provider: "qwen",
    operation: "ocr.ai-extract.raw",
    method: "POST",
    status_code: res.status,
    ok: true,
    latency_ms: Date.now() - started,
    tenant_id: meta.tenantId,
    batch_id: meta.batchId,
    request_summary: { model: QWEN_OCR_MODEL, stage, raw: rawSummary(raw) },
  });
  return { raw, rawText: content, readMs: Date.now() - started };
}

type ProviderId = "qwen" | "openai";
type ScanPreference = ProviderId;
type Provider = {
  id: ProviderId;
  available: () => boolean;
  read: (img: string, meta: LogMeta, stage?: ReadStage) => Promise<ReadResult>;
};

const PROVIDERS: Record<ProviderId, Provider> = {
  qwen: { id: "qwen", available: () => QWEN_OCR_BASE_URL.length > 0, read: readViaQwen },
  openai: { id: "openai", available: () => OPENAI_API_KEY.length > 0, read: readViaOpenAI },
};

function orderedProviders(preference: ScanPreference): Provider[] {
  if (preference === "openai") return [PROVIDERS.openai, PROVIDERS.qwen];
  return QWEN_OCR_ALLOW_OPENAI_FALLBACK ? [PROVIDERS.qwen, PROVIDERS.openai] : [PROVIDERS.qwen];
}

function criticalScore(fields: CleanFields): number {
  return [fields.name, fields.phone, fields.street, fields.city, fields.state, fields.zip].filter(Boolean).length;
}

function logExtractionResult({
  provider,
  ok,
  latencyMs,
  meta,
  fields,
  retry,
  secondPass,
  errorCode,
}: {
  provider: ProviderId;
  ok: boolean;
  latencyMs: number;
  meta: LogMeta;
  fields: CleanFields;
  retry: boolean;
  secondPass: boolean;
  errorCode?: string;
}) {
  logExternalCall({
    provider,
    operation: "ocr.ai-extract.result",
    method: "POST",
    status_code: ok ? 200 : 422,
    ok,
    error_code: errorCode,
    latency_ms: latencyMs,
    tenant_id: meta.tenantId,
    batch_id: meta.batchId,
    request_summary: {
      stage: "result",
      retry,
      second_pass: secondPass,
      fields: fieldsSummary(fields),
    },
  });
}

// ── Targeted second pass — runs ONLY when Stage 2 found no phone (the model
// occasionally omits a phone that IS on the label). A tiny focused call that
// asks for nothing but the 10 digits. The result still passes through
// normalizePhone, so an 11-digit/malformed answer is rejected (→ FAILED).
const PHONE_PASS_PROMPT = `Look at this US pharmacy shipping label. Find the patient's phone number — a 10-digit number, usually on the line directly ABOVE the street address. Return STRICT JSON only, no prose: {"phone":"<the 10 digits exactly as printed>"} or {"phone":null} if there is genuinely no phone. Digits only, no formatting.`;

async function phoneSecondPass(imageDataUrl: string, meta: LogMeta): Promise<string | null> {
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 30,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PHONE_PASS_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "What is the patient phone number?" },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    logExternalCall({
      provider: "openai",
      operation: "ocr.ai-extract.phone-pass",
      method: "POST",
      status_code: res.status,
      ok: false,
      latency_ms: Date.now() - started,
      tenant_id: meta.tenantId,
      batch_id: meta.batchId,
    });
    throw new Error(`openai ${res.status}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const obj = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;
  return obj.phone != null ? String(obj.phone) : null;
}

export async function POST(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    image?: string;
    retry_image?: string | null;
    batch_id?: string | null;
    scan_preference?: "qwen" | "openai";
    source?: "ocr" | "ivy";
    debug?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const meta: LogMeta = { tenantId: Number(ctx.tenantId) || null, batchId: body.batch_id ?? null };
  const scanSource = body.source === "ivy" ? "ivy" : "ocr";
  const scanId = randomUUID();
  const image = body.image ?? "";
  const retryImage = body.retry_image ?? "";
  const scanPreference: ScanPreference = body.scan_preference === "openai" ? "openai" : "qwen";
  const primaryImageMeta = imageDataUrlMeta(image);
  const retryImageMeta = imageDataUrlMeta(retryImage);
  if (!image.startsWith("data:image/")) {
    return NextResponse.json({ error: "image must be an image data URL" }, { status: 400 });
  }
  if (retryImage && !retryImage.startsWith("data:image/")) {
    return NextResponse.json({ error: "retry_image must be an image data URL" }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }
  if (retryImage.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Retry image too large" }, { status: 413 });
  }

  const started = Date.now();
  let lastErr = "no provider available";
  for (const p of orderedProviders(scanPreference)) {
    if (!p.available()) continue;
    try {
      const { raw, rawText, readMs } = await p.read(image, meta, "primary"); // Stage 1 — READ
      let fields = cleanRawRead(raw); // Stage 2 — CLEAN/MAP
      // 1200px retry removed (2026-07-04, CEO-directed): the second Qwen pass
      // added ~2s on nearly every scan (phone is usually the missing field) and
      // barely recovered phone — resolution was never the bottleneck. Single
      // 600px pass now; a missing critical field fails clean → manual repair.
      const qwenRetry = false;

      // Stage 3 — targeted second pass, ONLY if no phone was found AND the label
      // showed no malformed-phone signal (an 11-digit misread → FAILED, per CEO
      // rule; we must not let the 2nd pass guess 10 of the printed 11 digits).
      let secondPass = false;
      if (!fields.phone && p.id === "openai" && !hasMalformedPhoneSignal(raw)) {
        try {
          const e164 = normalizePhone(await phoneSecondPass(image, meta));
          if (e164) {
            fields.phone = e164.slice(2);
            fields.phoneE164 = e164;
            secondPass = true;
          }
        } catch {
          /* second pass is best-effort; a failure just leaves phone null */
        }
      }
      const score = criticalScore(fields);
      // Diagnostic (PHI-safe: no digits) — surfaces WHY a phone came back empty
      // so missing-phone rates are traceable in server logs. The actual digits
      // (raw.phone / candidates) are visible per-scan in the debug panel only.
      if (!fields.phone) {
        const candCount = Array.isArray(raw.phone_candidates) ? raw.phone_candidates.length : 0;
        const reason = hasMalformedPhoneSignal(raw)
          ? "malformed_length"
          : candCount > 0
            ? "candidates_rejected"
            : (raw.phone_status ?? "none_seen");
        console.warn(
          `[ocr/ai-extract] phone MISSING provider=${p.id} status=${raw.phone_status ?? "n/a"} candidates=${candCount} reason=${reason} ms=${Date.now() - started}`,
        );
      }
      if (p.id === "qwen" && score === 0) {
        logExtractionResult({
          provider: p.id,
          ok: false,
          latencyMs: Date.now() - started,
          meta,
          fields,
          retry: qwenRetry,
          secondPass,
          errorCode: "qwen_empty_result",
        });
        throw new Error("qwen_empty_result: no critical fields after cleanup");
      }
      logExtractionResult({
        provider: p.id,
        ok: true,
        latencyMs: Date.now() - started,
        meta,
        fields,
        retry: qwenRetry,
        secondPass,
      });
      logOcrScan({
        provider: p.id,
        scan_preference: scanPreference,
        ok: true,
        status_code: 200,
        latency_ms: Date.now() - started,
        tenant_id: meta.tenantId,
        batch_id: meta.batchId,
        model: p.id === "qwen" ? QWEN_OCR_MODEL : "gpt-4o-mini",
        primary_image: primaryImageMeta,
        retry_image: retryImage ? retryImageMeta : null,
        used_retry: qwenRetry,
        used_second_pass: secondPass,
        fields: fieldsSummary(fields),
      });
      console.log(
        `[ocr/ai-extract] preference=${scanPreference} provider=${p.id} ms=${Date.now() - started} phone=${fields.phone ? "y" : "n"}${secondPass ? "(2nd)" : ""}${qwenRetry ? "(retry)" : ""} ids=${fields.order_ids.length} dob=${fields.dob ? "y" : "n"}`,
      );
      // Debug channel (gated by body.debug — CEO diagnostic): echoes the EXACT
      // model output + timings back to the caller so the scan modal can show what
      // Qwen actually read vs what the site received. Ephemeral (never persisted);
      // the PHI here is the same PHI already returned in `fields`.
      const debug = body.debug
        ? {
            provider: p.id,
            model: p.id === "qwen" ? QWEN_OCR_MODEL : "gpt-4o-mini",
            scan_preference: scanPreference,
            read_ms: readMs,
            total_ms: Date.now() - started,
            image_bytes: image.length,
            image_meta: primaryImageMeta,
            raw_text: rawText,
            raw_parsed: raw,
            cleaned: fields,
            critical_score: score,
            used_second_pass: secondPass,
          }
        : undefined;
      recordOcrScan({
        scan_id: scanId,
        tenant_id: meta.tenantId,
        source: scanSource,
        batch_id: meta.batchId,
        provider: p.id,
        ok: true,
        latency_ms: Date.now() - started,
        model: p.id === "qwen" ? QWEN_OCR_MODEL : "gpt-4o-mini",
        status_code: 200,
        fields_captured: OCR_FIELD_KEYS.filter((k) => Boolean((fields as unknown as Record<string, unknown>)[k]))
          .length,
        critical_score: score,
      });
      return NextResponse.json({ ok: true, scan_id: scanId, provider: p.id, fields, ...(debug ? { debug } : {}) });
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      console.error(`[ocr/ai-extract] provider=${p.id} failed: ${lastErr.slice(0, 200)}`);
    }
  }
  logOcrScan({
    provider: scanPreference,
    scan_preference: scanPreference,
    ok: false,
    status_code: 502,
    error_code: "ai_extraction_failed",
    error_message: lastErr,
    latency_ms: Date.now() - started,
    tenant_id: meta.tenantId,
    batch_id: meta.batchId,
    model: scanPreference === "qwen" ? QWEN_OCR_MODEL : "gpt-4o-mini",
    primary_image: primaryImageMeta,
    retry_image: retryImage ? retryImageMeta : null,
    used_retry: false,
    used_second_pass: false,
    fields: fieldsSummary({
      name: null,
      phone: null,
      phoneE164: null,
      street: null,
      city: null,
      state: null,
      zip: null,
      dob: null,
      order_ids: [],
      number_of_items: null,
    }),
  });
  recordOcrScan({
    scan_id: scanId,
    tenant_id: meta.tenantId,
    source: scanSource,
    batch_id: meta.batchId,
    provider: scanPreference,
    ok: false,
    latency_ms: Date.now() - started,
    model: scanPreference === "qwen" ? QWEN_OCR_MODEL : "gpt-4o-mini",
    status_code: 502,
    error_code: "ai_extraction_failed",
    fields_captured: 0,
    critical_score: null,
  });
  return NextResponse.json(
    { error: "AI extraction failed", scan_id: scanId, detail: lastErr.slice(0, 200) },
    { status: 502 },
  );
}
