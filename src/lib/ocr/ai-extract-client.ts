import type { OCRExtracted } from "./label-parser";
import { readScanPreference, type ScanPreference } from "./scan-preference";

/* ── Hybrid-OCR AI layer, client side (Phase 1) ──────────────────────────────
 * Thin caller for POST /api/client/ocr/ai-extract (server-side — the OpenAI
 * key never reaches the browser). Maps the AI result into the SAME
 * OCRExtracted shape Tesseract produces so every downstream consumer
 * (review UI, batch queue, draft submit) works unchanged.
 * ─────────────────────────────────────────────────────────────────────────── */

type AIFields = {
  name: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  dob: string | null;
  order_ids: string[];
  number_of_items: number | null;
};

/** Debug payload the server echoes when `debug:true` is sent — the exact model
 *  output + timings, so the scan UI can show what Qwen read vs what the site got.
 *  Ephemeral (never persisted); the PHI here is the same PHI already in `fields`. */
export interface OcrDebug {
  provider: string;
  model: string;
  scan_preference: string;
  read_ms: number;
  total_ms: number;
  image_bytes: number;
  image_meta: unknown;
  raw_text: string;
  raw_parsed: unknown;
  cleaned: unknown;
  critical_score: number;
  used_second_pass: boolean;
}

export async function aiExtractLabel(
  dataUrl: string,
  batchId?: string,
  scanPreference: ScanPreference = readScanPreference(),
  retryDataUrl?: string,
  onDebug?: (d: OcrDebug) => void,
): Promise<OCRExtracted> {
  const res = await fetch("/api/client/ocr/ai-extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // batch_id is NON-PHI — only used to correlate the api_logs audit lines for
    // the images of one batch ("what happened to these 15 scans?").
    body: JSON.stringify({
      image: dataUrl,
      retry_image: retryDataUrl ?? null,
      batch_id: batchId ?? null,
      scan_preference: scanPreference,
      // Ask the server to echo raw model output + timings, only when a debug
      // sink is wired (the modal's Debug toggle). Off = nothing extra returned.
      debug: onDebug ? true : undefined,
    }),
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(d.error ?? `AI extraction failed (HTTP ${res.status})`);
  }
  const parsed = (await res.json()) as { scan_id?: string; fields: AIFields; debug?: OcrDebug };
  const { fields } = parsed;
  if (onDebug && parsed.debug) onDebug(parsed.debug);

  const street = fields.street ?? "";
  const cityZip = [fields.city, fields.state, fields.zip].filter(Boolean).join(", ");
  const display = [street, cityZip].filter(Boolean).join(", ") || null;
  const fmtPhone =
    fields.phone && fields.phone.length === 10
      ? `(${fields.phone.slice(0, 3)}) ${fields.phone.slice(3, 6)}-${fields.phone.slice(6)}`
      : null;

  const mismatch =
    fields.number_of_items != null && fields.order_ids.length > 0 && fields.order_ids.length !== fields.number_of_items;

  return {
    rawText: "[AI extraction]",
    confidence: 100,
    candidateAddress: display,
    candidateName: fields.name,
    candidatePhone: fmtPhone,
    addressConfidence: display ? "high" : "none",
    nameConfidence: fields.name ? "high" : "none",
    phoneConfidence: fmtPhone ? "high" : "none",
    addressDetail: street
      ? { street, city: fields.city ?? "", state: fields.state ?? "FL", zip: fields.zip ?? "" }
      : null,
    notes: mismatch
      ? [`Order IDs: found ${fields.order_ids.length} but label says ${fields.number_of_items} items`]
      : [],
    candidateDob: fields.dob,
    dobConfidence: fields.dob ? "high" : "none",
    orderIds: fields.order_ids,
    numberOfItems: fields.number_of_items,
    aiUsed: true,
    scanId: parsed.scan_id,
  };
}

/** CEO-locked trigger: escalate to AI when Tesseract hits a hard gate or any
 *  critical field comes back low/none. */
export function shouldEscalateToAI(r: OCRExtracted): boolean {
  if (!r.candidateAddress) return true;
  const low = (c: string) => c === "low" || c === "none";
  return low(r.addressConfidence) || low(r.nameConfidence) || low(r.phoneConfidence);
}

/* ── CEO-locked hard validation (Part 1, 2026-06-12 Session A) ───────────────
 * 3 required fields: phone + name + address. Any one failing → label is FAILED.
 * Applied in both single-scan submit and batch auto-submit.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Validates a 10-digit US phone. Strips formatting first. */
export function validatePhone(raw: string | null): { valid: boolean; reason?: string } {
  if (!raw || !raw.trim()) return { valid: false, reason: "Phone missing" };
  const stripped = raw.replace(/\D/g, "");
  // Strip leading country code
  const digits = stripped.length === 11 && stripped[0] === "1" ? stripped.slice(1) : stripped;
  if (digits.length !== 10) return { valid: false, reason: "Must be exactly 10 digits" };
  if (digits[0] < "2") return { valid: false, reason: "Area code cannot start with 0 or 1" };
  // Known invalid numbers
  if (digits === "0000000000") return { valid: false, reason: "All-zeros number is invalid" };
  if (digits === "9540000000") return { valid: false, reason: "Placeholder number — must be a real phone" };
  return { valid: true };
}

/** Normalizes "LASTNAME, FIRSTNAME" → "Firstname Lastname" + Title Case, then validates.
 *  Requirements: 2+ words, each 2+ letters, letters/hyphens/apostrophes only.
 *  Suspicious OCR noise (no vowels in a 3+ char word) is rejected. */
export function normalizeAndValidateName(raw: string | null): { valid: boolean; normalized?: string; reason?: string } {
  if (!raw || !raw.trim()) return { valid: false, reason: "Name missing" };

  // Strip leading/trailing non-letter chars
  let s = raw
    .trim()
    .replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ]+$/g, "")
    .trim();
  if (!s) return { valid: false, reason: "Name empty after cleaning" };

  // Flip "LASTNAME, FIRSTNAME [MIDDLE]" → "FIRSTNAME [MIDDLE] LASTNAME"
  const ci = s.indexOf(",");
  if (ci > 0) {
    const last = s.slice(0, ci).trim();
    const first = s.slice(ci + 1).trim();
    if (!last || !first) return { valid: false, reason: "Name malformed around comma" };
    s = `${first} ${last}`;
  }

  // Title Case + drop initial/suffix periods ("Jane M. Doe" -> "Jane M Doe").
  s = s
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-zA-ZÀ-ÿ])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\.\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const words = s.split(/\s+/).filter((w) => w.length > 0);
  // Need 2 REAL parts (2+ letters = first & last). Single-letter words are
  // allowed only as middle initials ("Jane M Doe"), never as the whole name —
  // so OCR noise like "A B" is still rejected.
  const fullWords = words.filter((w) => w.length >= 2);
  if (fullWords.length < 2) return { normalized: s, valid: false, reason: "Name must have at least 2 words" };

  // Each word: starts + ends with a letter (letters/hyphens/apostrophes inside),
  // OR a single letter (a middle initial like the "M" in "Jane M Doe").
  const WORD_RE = /^[A-Za-zÀ-ÿ](?:[A-Za-zÀ-ÿ'-]*[A-Za-zÀ-ÿ])?$/;
  // Has at least one vowel-like char (catches "Trl Lill" style OCR noise)
  const HAS_VOWEL_RE = /[aeiouAEIOUÀ-ÖØ-öø-ÿ]/;
  for (const w of words) {
    if (!WORD_RE.test(w)) {
      return { normalized: s, valid: false, reason: `Invalid name part: "${w}"` };
    }
    if (w.length >= 3 && !HAS_VOWEL_RE.test(w)) {
      return { normalized: s, valid: false, reason: "Name contains OCR noise — no vowels in a word" };
    }
  }

  return { normalized: s, valid: true };
}
