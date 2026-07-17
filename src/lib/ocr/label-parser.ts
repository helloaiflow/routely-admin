"use client";

/**
 * label-parser.ts  v7  — cluster-based, layout-agnostic extraction
 * ─────────────────────────────────────────────────────────────────────
 * What changed vs v6 (and WHY):
 *
 *   ✗ v6 extractRawCandidates() took the FIRST match of each line type
 *     top-down (inside a TO→FROM zone, then whole-text). Labels whose
 *     recipient block sits at the BOTTOM (pharmacy sticker layout) lost to
 *     anything name/street-shaped above it. → replaced with cluster-based
 *     extraction: classify ALL lines, group spatially adjacent ones into
 *     candidate recipient clusters, score each by completeness + field
 *     adjacency + anchor proximity (TO boosts, FROM penalizes) + vertical
 *     position, and pick the best cluster wherever it sits. Top, middle and
 *     bottom layouts now share one algorithm.
 *   ✓ NEW: LABEL_PROFILES — a small declarative registry of known label
 *     layouts. Profile hints are SCORE ADJUSTMENTS, never hard rules, so
 *     unknown labels still parse via the generic clusterer. Adding a client
 *     label type = one registry entry, not a parser rewrite.
 *   ✓ NEW: STREET_RE accepts ordinal street names ("4210 3RD CT") — the
 *     leading-letter requirement rejected numbered streets.
 *   ✓ NEW: bare-digit phone rescue at classify time. cleanLine() strips
 *     \d{7,} runs (tracking-id defense), which silently killed unformatted
 *     phones ("2392067669", "Phone:7865660222") before classification; those
 *     lines now classify as PHONE from the RAW line under strict guards.
 *   ✓ NEW: name candidates are RANKED ("LAST, FIRST" > multi-token > sits
 *     just above the street) instead of first-match, and pre-validated so a
 *     3-letter box code ("SAN") can no longer consume the name slot.
 *   ✓ Kept: cleaning, sanitize/validate, PSM sweep, per-field merge,
 *     timeouts, worker singleton — all of v6's hard-won layers.
 *
 * What changed vs v5 (and WHY — these were the regressions):
 *
 *   ✗ v5 used an aggressive global Otsu binarization in preprocess → removed.
 *     (Tesseract/Leptonica binarizes locally and better. See preprocess.ts.)
 *
 *   ✗ v5 set tessedit_char_whitelist with the LSTM engine (OEM 1). The
 *     whitelist is a legacy-engine feature; with LSTM it's unreliable and can
 *     silently degrade reads. → removed. We sanitize in post-processing only.
 *
 *   ✗ v5 forced PSM 6 (single uniform block) which merges multi-column labels
 *     into garbage lines. → replaced with a best-of-N sweep over PSM modes
 *     3 (auto), 11 (sparse text), 4 (single column), merging the best value of
 *     each field across passes.
 *
 *   ✓ NEW: per-field merge across passes (union of best results).
 *   ✓ NEW: phone recovery via numeric-glyph normalization (O→0, l→1, …) so we
 *     recover phones even without a char whitelist.
 *   ✓ NEW: per-pass + worker-acquisition timeouts so OCR can never hang.
 *   ✓ Kept: per-field sanitize/validate, confidence, worker singleton,
 *     warmupOCR()/disposeOCR().
 *
 * Public API unchanged:
 *   processLabelImage(dataUrl, onProgress) → Promise<OCRExtracted>
 *   parseShippingLabel(rawText) → OCRExtracted
 *   warmupOCR(), disposeOCR()
 */

import { preprocessLabelImage } from "./preprocess";

/* =====================================================================
   TYPES
===================================================================== */

export type FieldConfidence = "high" | "medium" | "low" | "none";

export interface AddressDetail {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface OCRExtracted {
  rawText: string;
  confidence: number;
  candidateAddress: string | null;
  candidateName: string | null;
  candidatePhone: string | null;
  addressConfidence: FieldConfidence;
  nameConfidence: FieldConfidence;
  phoneConfidence: FieldConfidence;
  addressDetail: AddressDetail | null;
  notes: string[];
  /* Hybrid-OCR AI path only (Phase 1): Tesseract never fills these. */
  candidateDob: string | null; // MM/DD/YYYY
  dobConfidence: FieldConfidence;
  orderIds: string[]; // \d{7}-\d{2}, hyphen kept
  numberOfItems: number | null; // "Number of items: N" cross-check
  aiUsed?: boolean;
  /** Permanent scan id from the AI OCR endpoint — links this scan to the
   *  draft/stop it creates (ocr_scans). Only set on AI (Qwen/OpenAI) reads. */
  scanId?: string;
}

export interface OCRProgress {
  status: string;
  progress: number;
}

type LineType = "PHONE" | "STREET" | "CITY_ZIP" | "NAME" | "NOISE";

interface ClassifiedLine {
  raw: string;
  cleaned: string;
  type: LineType;
}

interface ValidationResult<T> {
  value: T | null;
  confidence: FieldConfidence;
  notes: string[];
}

type ParsedFields = Omit<OCRExtracted, "confidence">;

/* =====================================================================
   TESSERACT WORKER SINGLETON
===================================================================== */

interface TesseractWorker {
  setParameters: (p: Record<string, string>) => Promise<unknown>;
  recognize: (img: string) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
}

let workerPromise: Promise<TesseractWorker> | null = null;
let currentProgress: ((p: OCRProgress) => void) | null = null;
let lastPsm: string = "";

async function getWorker(): Promise<TesseractWorker> {
  if (workerPromise) return workerPromise;
  const { createWorker } = await import("tesseract.js");
  // OEM 1 = LSTM only (best accuracy for modern fonts). No char whitelist.
  workerPromise = createWorker("eng", 1, {
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/worker.min.js",
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@6/tesseract-core.wasm.js",
    logger: (m: { status: string; progress: number }) => {
      if (currentProgress && typeof m.progress === "number") {
        currentProgress({ status: m.status, progress: m.progress });
      }
    },
  }) as unknown as Promise<TesseractWorker>;
  return workerPromise;
}

/** Pre-load Tesseract (~5-10 MB). Call when the modal opens at idle. */
export async function warmupOCR(): Promise<void> {
  try {
    await getWorker();
  } catch {
    workerPromise = null;
  }
}

/** Terminate the worker and free memory. Call when the modal closes. */
export async function disposeOCR(): Promise<void> {
  if (!workerPromise) return;
  try {
    const w = await workerPromise;
    await w.terminate();
  } catch {
    /* ignore */
  }
  workerPromise = null;
  lastPsm = "";
}

/* =====================================================================
   TIMEOUT WRAPPER — OCR can never hang the UI
===================================================================== */

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const WORKER_ACQUIRE_TIMEOUT = 25000; // engine + lang download budget
const PASS_TIMEOUT = 20000; // single recognize() budget

/* =====================================================================
   TESSERACT PASSES — PSM sweep, NO whitelist
   PSM 3  = fully automatic page segmentation (best general default)
   PSM 11 = sparse text, find as much as possible (great for labels)
   PSM 4  = single column of text of variable sizes
===================================================================== */

const PSM_SEQUENCE = ["3", "11", "4"] as const;

interface PassResult {
  text: string;
  confidence: number;
}

async function runPass(worker: TesseractWorker, image: string, psm: string): Promise<PassResult> {
  if (lastPsm !== psm) {
    await worker.setParameters({
      tessedit_pageseg_mode: psm,
      preserve_interword_spaces: "1",
    });
    lastPsm = psm;
  }
  const result = await withTimeout(worker.recognize(image), PASS_TIMEOUT, `OCR pass PSM ${psm}`);
  return { text: result.data.text, confidence: result.data.confidence };
}

/* =====================================================================
   PHASE 1 — CLEAN (strip right-column noise bleeding into lines)
===================================================================== */

const NOISE_WORDS_RE = new RegExp(
  [
    "TRACKING\\s*ID",
    "CODIGO\\s*DE\\s*BARRAS",
    "NUMERO\\s*DE\\s*ENVIO",
    "FECHA\\s*DE\\s*ENVIO",
    "N[O]\\s*DE\\s*ENVIO",
    "TIPO\\s*DE\\s*PAQUETE",
    "REFERENCIA\\s*/\\s*NOTAS?",
    "REFERENCIA",
    "NOTAS?",
    "NOTES?",
    "BARCODE",
    "PESO",
    "PAQUETES?",
    "PACKAGE\\s*TYPE",
    "WEIGHT",
    "QUANTITY",
    "QTY",
    "SERVICIO",
    "SERVICE",
    "ESCANEA[^\\n]*",
    "SCAN[^\\n]*QR[^\\n]*",
    "LOGISTIC[^\\n]*",
    "ENTREGA[^\\n]*",
    "IMPRIMIR",
    "PRINT",
    // Field-label words printed (or annotated) NEXT TO the actual values —
    // "SANCHEZ, ROSITA  Full Name" must clean to just the name.
    "FULL\\s*NAME",
    "PHONE\\s*NUMBER",
    "FULL\\s*ADDRE\\w*",
    "ORDER\\s*IDS?",
    "DAY\\s*OF\\s*BIRTH(?:\\s*OR\\s*DOB)?",
    "\\bDOB\\b",
    "PACKAGE\\s*CREATION\\s*\\w*",
  ]
    .map((s) => `(?:${s})`)
    .join("|"),
  "gi",
);

const TRACKING_ID_RE =
  /\b(?:LS-\d{4,}-\d{3,}(?:-[A-Z]{2})?|[A-Z]{2,5}-\d{4,}[A-Z0-9-]*|1Z[A-Z0-9]{16}|[A-Z]{2}\d{9}[A-Z]{2}|RTL-\d+)\b/gi;

const LONG_DIGITS_RE = /\b\d{7,}\b/g;

const SERVICE_VALUES_RE =
  /\b(estandar|standard|express|priority|caja|box|sobre|envelope|kg|oz|lbs?|1\s*\/\s*1|2\s*\/\s*2)\b/gi;

const OCR_GLYPH_RE =
  /[|\\{}<>\u2588\u2593\u2592\u2591\u25a0\u25a1\u25aa\u25ab\u25cf\u25cb\u25c6\u25c7#*]+/g;

function cleanLine(raw: string): string {
  return raw
    .replace(NOISE_WORDS_RE, "")
    .replace(TRACKING_ID_RE, "")
    .replace(LONG_DIGITS_RE, "")
    .replace(SERVICE_VALUES_RE, "")
    .replace(OCR_GLYPH_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* =====================================================================
   PHASE 2 — CLASSIFY
===================================================================== */

const PHONE_RE =
  /(?:\+?(?:1|52)[\s.\-]?)?\(?(\d{3})\)?[\s.\-]?(\d{3})[\s.\-]?(\d{4})/;

// Loose "phone-ish" shape used to decide when to attempt glyph normalization.
const PHONEISH_RE = /[\dOoIlSBZ][\dOoIlSBZ\s().\-]{6,}[\dOoIlSBZ]/;

// Leading house number, then a word — or an ordinal street name ("4210 3RD CT").
const STREET_RE = /^\d{1,6}\s+(?:[A-Za-z]|\d{1,3}(?:ST|ND|RD|TH)\b)/i;

// \s* after the state: OCR can glue state to zip ("HIALEAH, FL33018").
// [A-Za-z]: OCR title/lower-cases the state ("Hollywood, Fl 33019").
const CITY_ZIP_RE =
  /^[A-Za-z][A-Za-z\s\u00C0-\u00FF]+,\s*(?:[A-Za-z]{2}\s*)?\d{4,6}(?:-\d{4})?$/;

const STREET_SUFFIX_RE =
  /\b(?:ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|RD|ROAD|DR|DRIVE|LN|LANE|CT|COURT|PL|PLACE|WAY|HWY|HIGHWAY|CIR|CIRCLE|TER|TERRACE|TRL|TRAIL|PKWY|PARKWAY|SQ|SQUARE|LOOP|ALY|ALLEY|PASS|RUN|XING|CROSSING|FWY|EXPY|EXPRESSWAY|MNR|MANOR|RDG|RIDGE|HBR|HARBOR|PT|POINT|CV|COVE|BCH|BEACH|ROW|MEWS)\b\.?/i;

const STATE_ABBR_RE =
  /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC|PR)\b/;

const VALID_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "PR",
]);

const STATE_OCR_FIXES: Record<string, string> = {
  F1: "FL", FI: "FL", FT: "FL", FL5: "FL",
  "6A": "GA", G4: "GA",
  C4: "CA", CA5: "CA",
  N1: "NJ", N7: "NY",
  T1: "TX", IX: "TX",
};

// Lookbehind instead of left \b: OCR often glues a letter to the zip
// ("L33417", "FL33018") which kills the word boundary.
const ZIP_RE = /(?<!\d)\d{5}(?:-\d{4})?\b/;

const SECTION_HEADER_RE = new RegExp(
  "^(?:" +
    [
      "TO", "FROM", "SHIP\\s*TO", "DELIVER\\s*TO", "SHIPPED\\s*TO",
      "SHIP\\s*FROM", "RETURN\\s*ADDRESS", "RETURN\\s*TO",
      "DESTINATARIO", "REMITENTE", "CONSIGNEE", "RECIPIENT",
      "RECEIVER", "SENDER", "ORIGIN", "TRACKING\\s*ID", "BARCODE",
      "CODIGO", "FECHA", "SERVICIO", "PAQUETE", "PESO", "REFERENCIA",
      "NOTAS?", "ROUTELY", "BY\\s*SAS", "LOGISTICA.*", "ENTREGA.*",
      "ESCANEA.*", "GRACIAS.*", "THANKS.*", "PEDIDO\\s*#.*",
      "DUDAS.*", "SOPORTE.*", "SUPPORT.*",
      "NUMBER\\s*OF\\s*ITEMS:?\\s*\\d*", "PHONE:?", "TEL:?", "TELEFONO:?",
    ].join("|") +
    ")$",
  "i",
);

const TEST_NAME_RE =
  /^(?:test|sample|demo|example|null|undefined|n\/?a|john\s*doe|jane\s*doe|asdf+|qwerty)$/i;

const NAME_TOKEN_RE = /^[A-Za-z\u00C0-\u00FF][A-Za-z\u00C0-\u00FF'\-\.]*$/;

function isNameCandidate(line: string): boolean {
  if (!line || line.length < 2 || line.length > 70) return false;
  if (/^\d/.test(line)) return false;
  if (ZIP_RE.test(line)) return false;
  if (PHONE_RE.test(line)) return false;
  if (SECTION_HEADER_RE.test(line.trim())) return false;
  if (TEST_NAME_RE.test(line.trim())) return false;

  const tokens = line
    .split(/[,\s]+/)
    .map((t) => t.replace(/[^A-Za-z\u00C0-\u00FF'\-\.]/g, ""))
    .filter((t) => t.length > 0);
  if (tokens.length < 1 || tokens.length > 7) return false;
  return tokens.every((t) => NAME_TOKEN_RE.test(t));
}

/**
 * A state-like 2-char token (any case, OCR-garbled tolerated via fuzzyState)
 * sitting immediately before a zip — "fl 33880", "Fl. 33019".
 */
function hasStateZipPair(line: string): boolean {
  const m = line.match(/\b([A-Za-z][A-Za-z0-9])\.?\s+\d{5}(?:-\d{4})?\b/);
  return m ? fuzzyState(m[1]) !== null : false;
}

function classifyLine(line: string): LineType {
  if (!line || line.length < 2) return "NOISE";
  if (SECTION_HEADER_RE.test(line.trim())) return "NOISE";
  if (PHONE_RE.test(line)) return "PHONE";
  if (STREET_RE.test(line)) return "STREET";
  if (CITY_ZIP_RE.test(line)) return "CITY_ZIP";
  if (STATE_ABBR_RE.test(line) && ZIP_RE.test(line)) return "CITY_ZIP";
  if (hasStateZipPair(line)) return "CITY_ZIP";
  if (isNameCandidate(line)) return "NAME";
  return "NOISE";
}

/* =====================================================================
   PHASE 3 — SANITIZE + VALIDATE PER FIELD
===================================================================== */

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Map common OCR letter→digit confusions, applied ONLY to phone-ish strings
 * (mostly digits + separators). Lets us recover "(3O5) 555-l234" without a
 * char whitelist. Safe because it never touches alphabetic fields.
 */
function normalizeNumericGlyphs(s: string): string {
  return s
    .replace(/[OoQ]/g, "0")
    .replace(/[lI|!]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/B/g, "8")
    .replace(/[Zz]/g, "2")
    .replace(/G/g, "6");
}

function sanitizePhone(raw: string | null): ValidationResult<string> {
  const notes: string[] = [];
  if (!raw) return { value: null, confidence: "none", notes };

  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") digits = digits.slice(1);
  if (digits.length !== 10) {
    return { value: null, confidence: "none", notes: ["Could not extract 10 digits"] };
  }
  if (/^(\d)\1{9}$/.test(digits)) {
    return { value: null, confidence: "none", notes: ["All digits identical"] };
  }

  const area = digits.slice(0, 3);
  const exch = digits.slice(3, 6);
  const last4 = digits.slice(6);
  let confidence: FieldConfidence = "high";

  if (area[0] === "0" || area[0] === "1") {
    notes.push("Area code can't start with 0 or 1");
    confidence = "low";
  }
  if (exch[0] === "0" || exch[0] === "1") {
    notes.push("Exchange code can't start with 0 or 1");
    confidence = "low";
  }

  return { value: `(${area}) ${exch}-${last4}`, confidence, notes };
}

function sanitizeName(raw: string | null): ValidationResult<string> {
  const notes: string[] = [];
  if (!raw) return { value: null, confidence: "none", notes };

  let s = raw.replace(/[^A-Za-z\u00C0-\u00FF'\-. ,]/g, "").trim();
  s = s.replace(/\s{2,}/g, " ");
  if (!s || s.length < 2) {
    return { value: null, confidence: "none", notes: ["Empty after sanitization"] };
  }
  if (TEST_NAME_RE.test(s)) {
    return { value: null, confidence: "none", notes: ["Reserved/test value"] };
  }
  if (/\d/.test(s)) {
    return { value: null, confidence: "none", notes: ["Contains digits"] };
  }

  let formatted: string;
  const commaIdx = s.indexOf(",");
  if (commaIdx > 0) {
    const last = s.slice(0, commaIdx).trim();
    const first = s.slice(commaIdx + 1).trim();
    if (!first || !last) return { value: null, confidence: "none", notes };
    formatted = toTitleCase(`${first} ${last}`);
  } else {
    formatted = toTitleCase(s);
  }

  const tokens = formatted.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return { value: null, confidence: "none", notes };
  if (formatted.length < 4 || formatted.length > 70) {
    return { value: null, confidence: "none", notes: ["Out of acceptable length"] };
  }

  let confidence: FieldConfidence = "high";
  if (tokens.length === 1) {
    notes.push("Only one name token");
    confidence = "medium";
  }
  const weakToken = tokens.some((t) => {
    const stripped = t.replace(/[^A-Za-z\u00C0-\u00FF]/g, "");
    return stripped.length === 0 || (stripped.length === 1 && !/^[A-Z]\.?$/.test(t));
  });
  if (weakToken) {
    notes.push("Has very short tokens");
    if (confidence === "high") confidence = "medium";
  }

  return { value: formatted, confidence, notes };
}

function fuzzyState(raw: string): string | null {
  const up = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!up) return null;
  if (VALID_STATES.has(up)) return up;
  if (STATE_OCR_FIXES[up]) return STATE_OCR_FIXES[up];
  const two = up.slice(0, 2);
  if (VALID_STATES.has(two)) return two;
  return null;
}

function zipMatchesState(zip: string, state: string): boolean {
  if (!zip || !state) return true;
  const head = parseInt(zip.slice(0, 3), 10);
  if (Number.isNaN(head)) return true;
  if (state === "FL") return head >= 320 && head <= 349;
  return true;
}

interface AddressValidation extends ValidationResult<AddressDetail> {
  display: string | null;
}

function sanitizeAddress(street: string | null, cityZip: string | null): AddressValidation {
  const notes: string[] = [];

  const streetClean = (street ?? "")
    .replace(/[^A-Za-z0-9 .,#\-/']/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const streetOk = STREET_RE.test(streetClean);
  if (street && !streetOk) notes.push("Street is missing the leading number");
  const hasSuffix = streetClean ? STREET_SUFFIX_RE.test(streetClean) : false;
  if (streetClean && !hasSuffix) notes.push("No street suffix detected (St / Ave / Blvd / …)");

  let city = "";
  let state = "";
  let zip = "";
  if (cityZip) {
    const clean = cityZip
      .replace(/[^A-Za-z0-9 ,\-]/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    // Prefer a line-final zip; fall back to a zip ANYWHERE on the line —
    // OCR tails ("…, FL 33880 10:03 AM") must not lose the zip. Everything
    // after the zip is discarded either way.
    const zipMatch =
      clean.match(/(?<!\d)(\d{5})(?:-\d{4})?\s*$/) ?? clean.match(/(?<!\d)(\d{5})(?:-\d{4})?\b/);
    if (zipMatch) zip = zipMatch[1];
    const beforeZip = (zipMatch ? clean.slice(0, zipMatch.index) : clean)
      .trim()
      .replace(/[,\s]+$/, "");
    const parts = beforeZip.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      city = parts[0];
      const maybe = fuzzyState(parts[parts.length - 1]);
      if (maybe) state = maybe;
    } else if (parts.length === 1) {
      const tokens = parts[0].split(/\s+/);
      const last = tokens[tokens.length - 1];
      const maybe = last ? fuzzyState(last) : null;
      if (maybe && tokens.length >= 2) {
        state = maybe;
        city = tokens.slice(0, -1).join(" ");
      } else {
        city = parts[0];
      }
    }
    city = city.replace(/[,]+$/, "").trim();
    // OCR junk masquerading as a city ("ll", "L£") — shortest FL city is 3
    // letters; below that, better an empty city than garbage.
    if (city && city.replace(/[^A-Za-zÀ-ÿ]/g, "").length < 3) {
      notes.push("City fragment too short — dropped");
      city = "";
    }
  }

  if (zip && state && !zipMatchesState(zip, state)) {
    notes.push(`ZIP ${zip} doesn't match state ${state}`);
  }

  if (!streetClean && !city && !zip) {
    return { value: null, display: null, confidence: "none", notes };
  }

  let confidence: FieldConfidence = "high";
  if (!streetClean || !city || !zip) {
    confidence = "medium";
    if (!streetClean) notes.push("Street missing");
    if (!city) notes.push("City missing");
    if (!zip) notes.push("ZIP missing");
  }
  if (streetClean && !streetOk) confidence = "medium";
  if (streetClean && !hasSuffix && confidence === "high") confidence = "medium";

  const value: AddressDetail = {
    street: streetClean,
    city: toTitleCase(city),
    state: state || "FL",
    zip,
  };
  const display = [
    streetClean,
    [toTitleCase(city), [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");

  return { value, display, confidence, notes };
}

/* =====================================================================
   ANCHOR DETECTION
===================================================================== */

const TO_ANCHOR_WORDS = [
  "SHIP TO", "SHIPPED TO", "DELIVER TO", "DELIVERY TO",
  "DESTINATARIO", "CONSIGNEE", "RECIPIENT", "RECEIVER",
];

const FROM_ANCHOR_WORDS = [
  "FROM", "SHIP FROM", "RETURN ADDRESS", "SENDER",
  "REMITENTE", "RETURN TO", "ORIGIN",
];

function matchesAnchor(line: string, anchors: string[]): boolean {
  const upper = line.toUpperCase();
  return anchors.some((a) => upper.includes(a));
}

function isToAnchor(line: string): boolean {
  if (matchesAnchor(line, TO_ANCHOR_WORDS)) return true;
  return /^\s*TO\s*$/.test(line.toUpperCase());
}

/* =====================================================================
   LABEL-PROFILE REGISTRY
   Declarative hints for KNOWN label layouts. A profile activates when ALL
   its signatures match the OCR text; the most specific active profile
   (most signatures) contributes a zone boost to cluster scoring. Hints are
   soft — unknown labels parse via the generic clusterer alone. Adding a
   new client label type = one entry here, not a parser change.
===================================================================== */

export interface LabelProfile {
  id: string;
  description: string;
  /** Every signature must match the full OCR text for the profile to activate. */
  signatures: RegExp[];
  /** Where this layout keeps the recipient block. "any" = no positional bias. */
  recipientZone: "top" | "middle" | "bottom" | "any";
  /** Score added to clusters whose center falls inside recipientZone. */
  zoneBoost: number;
  /** Documentation for humans — quirks the generic layers already absorb. */
  quirks: string[];
}

const LABEL_PROFILES: LabelProfile[] = [
  {
    id: "pharmacy-bottom-sticker",
    description:
      "Pharmacy label: header (name + DOB + print datetime + barcode + 'Phone:' line + order id), recipient name/address sticker at the BOTTOM",
    signatures: [/number\s*of\s*items/i, /phone\s*:/i, /\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}/],
    recipientZone: "bottom",
    zoneBoost: 2,
    quirks: [
      "no TO/FROM anchors",
      "recipient name duplicated in header and bottom block",
      "phone only in header, 'Phone:' prefix, bare 10 digits",
      "ordinal street names ('4210 3RD CT')",
    ],
  },
  {
    id: "pharmacy-header-top",
    description:
      "Pharmacy label: name + DOB + print datetime + barcode header, then bare phone / street / city-zip mid-label, order id + items footer",
    signatures: [/number\s*of\s*items/i, /\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}/],
    recipientZone: "any", // generic clusterer already wins here; profile documents the layout
    zoneBoost: 0,
    quirks: [
      "no TO/FROM anchors",
      "bare 10-digit phone line (no separators)",
      "3-letter box code line above the name",
      "DOB + print datetime adjacent to the name",
    ],
  },
];

function activeProfile(rawText: string): LabelProfile | null {
  let best: LabelProfile | null = null;
  for (const p of LABEL_PROFILES) {
    if (!p.signatures.every((re) => re.test(rawText))) continue;
    if (!best || p.signatures.length > best.signatures.length) best = p;
  }
  return best;
}

/* =====================================================================
   PHASE 4 — CLUSTER-BASED EXTRACTION
   Classify every line, group spatially adjacent informative lines into
   candidate recipient clusters, score each cluster, pick the best one
   wherever it sits. Missing fields fall back to a ranked global sweep.
===================================================================== */

interface RawCandidates {
  rawName: string | null;
  rawStreet: string | null;
  rawCityZip: string | null;
  rawPhone: string | null;
}

/** Strict sweep, then numeric-glyph-normalized retry on phone-ish lines. */
function findPhone(rawLines: string[]): string | null {
  for (const l of rawLines) {
    const m = l.match(PHONE_RE);
    if (m) return m[0];
  }
  for (const l of rawLines) {
    const digitish = (l.match(/[\dOoIlSBZG]/g)?.length ?? 0);
    const hasHint = /(?:tel|phone|cel|m[oó]vil|\+)/i.test(l);
    if (!hasHint && digitish < 7) continue;
    if (!PHONEISH_RE.test(l)) continue;
    const m = normalizeNumericGlyphs(l).match(PHONE_RE);
    if (m) return m[0];
  }
  return null;
}

// Non-global probe (TRACKING_ID_RE carries /g — stateful under .test()).
const TRACKING_PROBE_RE = new RegExp(TRACKING_ID_RE.source, "i");

/**
 * cleanLine() strips \d{7,} runs (tracking-id defense), which also erases
 * unformatted phones before classification. Rescue: a short raw line whose
 * digits form exactly one US phone number classifies as PHONE.
 */
function isRawPhoneLine(raw: string): boolean {
  if (raw.length > 24) return false;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 11) return false;
  if (TRACKING_PROBE_RE.test(raw)) return false;
  return PHONE_RE.test(raw);
}

interface LineInfo extends ClassifiedLine {
  toAnchor: boolean;
  fromAnchor: boolean;
}

interface RecipientCluster {
  start: number;
  end: number;
  name: string | null;
  street: string | null;
  cityZip: string | null;
  phone: string | null; // raw line — sanitizePhone wants the unclean text
  nameIdx: number;
  streetIdx: number;
  cityZipIdx: number;
}

const MAX_CLUSTER_GAP = 1; // noise lines tolerated between informative lines

/**
 * Group adjacent informative lines. A second occurrence of NAME / STREET /
 * CITY_ZIP closes the cluster and opens a new one — that's what separates a
 * sender block from a recipient block when no anchors exist.
 */
function buildClusters(lines: LineInfo[]): RecipientCluster[] {
  const clusters: RecipientCluster[] = [];
  let cur: RecipientCluster | null = null;
  let gap = 0;

  const close = () => {
    if (cur) clusters.push(cur);
    cur = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.type === "NOISE") {
      if (cur && ++gap > MAX_CLUSTER_GAP) close();
      continue;
    }
    const duplicate =
      cur &&
      ((ln.type === "NAME" && cur.name !== null) ||
        (ln.type === "STREET" && cur.street !== null) ||
        (ln.type === "CITY_ZIP" && cur.cityZip !== null) ||
        (ln.type === "PHONE" && cur.phone !== null));
    if (duplicate) close();
    if (!cur) {
      cur = {
        start: i, end: i,
        name: null, street: null, cityZip: null, phone: null,
        nameIdx: -1, streetIdx: -1, cityZipIdx: -1,
      };
    }
    gap = 0;
    cur.end = i;
    if (ln.type === "NAME") { cur.name = ln.cleaned; cur.nameIdx = i; }
    else if (ln.type === "STREET") { cur.street = ln.cleaned; cur.streetIdx = i; }
    else if (ln.type === "CITY_ZIP") { cur.cityZip = ln.cleaned; cur.cityZipIdx = i; }
    else if (ln.type === "PHONE") { cur.phone = ln.raw; }
  }
  close();
  return clusters;
}

function scoreCluster(
  c: RecipientCluster,
  lines: LineInfo[],
  profile: LabelProfile | null,
): number {
  let s = 0;
  // Completeness
  if (c.street) s += 3;
  if (c.cityZip) s += 3;
  if (c.name) s += 2;
  if (c.phone) s += 1;
  // Field adjacency — STREET right above CITY_ZIP, NAME right above STREET
  if (c.street && c.cityZip && c.cityZipIdx > c.streetIdx && c.cityZipIdx - c.streetIdx <= 2) s += 2;
  if (c.name && c.street && c.streetIdx > c.nameIdx && c.streetIdx - c.nameIdx <= 2) s += 1;
  // Anchor proximity — TO immediately above boosts, FROM immediately above kills
  for (let k = Math.max(0, c.start - 2); k < c.start; k++) {
    if (lines[k].toAnchor) s += 4;
    if (lines[k].fromAnchor) s -= 5;
  }
  // Position tie-break: sender blocks conventionally sit ABOVE recipient
  // blocks, so later clusters get a fractional edge (never beats a field).
  const total = lines.length;
  if (total > 1) s += (c.start / (total - 1)) * 0.5;
  // Profile zone hint (soft)
  if (profile && profile.recipientZone !== "any" && profile.zoneBoost > 0 && total > 1) {
    const center = (c.start + c.end) / 2 / (total - 1);
    const zone = center < 0.34 ? "top" : center <= 0.67 ? "middle" : "bottom";
    if (zone === profile.recipientZone) s += profile.zoneBoost;
  }
  return s;
}

/* ── Name-candidate hygiene (post-deploy fix 2026-06-10) ──────────────
   Pharmacy labels print the recipient name MULTIPLE times (header next to
   DOB + print datetime, address sticker, order-id line) and OCR often glues
   the header copy to its date tokens. Strip those artifacts BEFORE ranking
   and sanitization, and rank header copies below the sticker copy. */

const NAME_TRAILING_DATETIME_RE =
  /(?:\s+\d{1,2}\/\d{1,2}\/\d{2,4}|\s+\d{1,2}:\d{2}(?:\s*[AP]\.?M\.?)?)+\s*$/i;

const DATE_OR_TIME_RE = /\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}:\d{2}/;

/**
 * Remove glued header artifacts from a name candidate:
 *  - trailing DOB / print date / time runs ("LOPEZ, CARMEN 03/12/1948",
 *    "RUIZ, PABLO 06/10/2026 16:20 PM")
 *  - a leading 2-3 letter box code, but ONLY when it's a prefix of the
 *    surname that follows ("SAN SANCHEZ, ROSITA" → the boxed code; a real
 *    surname particle like "DEL TORO, MARCO" is left alone).
 */
function stripNameNoise(s: string): string {
  let out = s.replace(NAME_TRAILING_DATETIME_RE, "").trim();
  const box = out.match(/^([A-Z]{2,3})\s+([A-Z][A-Za-zÀ-ÿ'-]+)\s*,/);
  if (box?.[2].toUpperCase().startsWith(box[1].toUpperCase()) && box[2].length > box[1].length) {
    out = out.slice(box[1].length).trim();
  }
  return out;
}

interface NameRankContext {
  streetIdx: number;
  clusterStart: number;
  clusterEnd: number;
  lines: LineInfo[];
}

/**
 * Rank a NAME candidate: living in the winning address cluster / directly
 * above its street beats everything; "LAST, FIRST" beats multi-token beats
 * single token; sitting next to DOB / print-datetime lines marks the header
 * copy and is penalized.
 */
function rankName(text: string, idx: number, ctx: NameRankContext): number {
  let r = 0;
  if (text.includes(",")) r += 4;
  const tokens = text.split(/[,\s]+/).filter(Boolean);
  if (tokens.length >= 2) r += 2;
  if (ctx.streetIdx >= 0 && idx < ctx.streetIdx && ctx.streetIdx - idx <= 2) r += 5;
  if (idx >= ctx.clusterStart && idx <= ctx.clusterEnd) r += 4;
  const prev = ctx.lines[idx - 1];
  const next = ctx.lines[idx + 1];
  if ((prev && DATE_OR_TIME_RE.test(prev.raw)) || (next && DATE_OR_TIME_RE.test(next.raw))) r -= 3;
  if (DATE_OR_TIME_RE.test(text)) r -= 2; // glued artifacts that survived stripping
  return r;
}

/** Best NAME line in the document: stripped, ranked, pre-validated; earliest on ties. */
function pickFallbackName(lines: LineInfo[], ctx: NameRankContext): string | null {
  let best: string | null = null;
  let bestRank = Number.NEGATIVE_INFINITY;
  let bestValid: string | null = null;
  let bestValidRank = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== "NAME") continue;
    const text = stripNameNoise(lines[i].cleaned);
    if (!text) continue;
    const r = rankName(text, i, ctx);
    if (r > bestRank) { bestRank = r; best = text; }
    if (r > bestValidRank && sanitizeName(text).value !== null) {
      bestValidRank = r;
      bestValid = text;
    }
  }
  return bestValid ?? best; // prefer a survivor; keep v6's "found something" otherwise
}

function extractRawCandidates(rawText: string): RawCandidates {
  const rawLines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const lines: LineInfo[] = rawLines.map((raw) => {
    const cleaned = cleanLine(raw);
    // Anchor flags from the cleaned line; short anchor lines are never
    // recipient data, so force them to NOISE (keeps them out of clusters).
    const toAnchor = isToAnchor(cleaned);
    const fromAnchor = matchesAnchor(cleaned, FROM_ANCHOR_WORDS) && cleaned.length <= 24;
    let type = classifyLine(cleaned);
    if (toAnchor || fromAnchor) type = "NOISE";
    else if (type === "NOISE" && isRawPhoneLine(raw)) type = "PHONE";
    return { raw, cleaned, type, toAnchor, fromAnchor };
  });

  const profile = activeProfile(rawText);
  const clusters = buildClusters(lines).filter((c) => c.street || c.cityZip);

  let bestCluster: RecipientCluster | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const c of clusters) {
    const s = scoreCluster(c, lines, profile);
    if (s > bestScore) { bestScore = s; bestCluster = c; }
  }

  let rawName = bestCluster?.name ? stripNameNoise(bestCluster.name) : null;
  let rawStreet = bestCluster?.street ?? null;
  let rawCityZip = bestCluster?.cityZip ?? null;
  let rawPhone = bestCluster?.phone ?? null;

  // A cluster name that can't survive sanitization (e.g. a 3-letter box
  // code) must not consume the slot — let the ranked fallback take over.
  if (rawName && sanitizeName(rawName).value === null) rawName = null;

  // Ranked / first-match global fallback for whatever the cluster lacks.
  const nameCtx: NameRankContext = {
    streetIdx: bestCluster?.streetIdx ?? -1,
    clusterStart: bestCluster?.start ?? -1,
    clusterEnd: bestCluster?.end ?? -1,
    lines,
  };
  if (!rawName) rawName = pickFallbackName(lines, nameCtx);
  if (!rawStreet || !rawCityZip || !rawPhone) {
    for (const ln of lines) {
      if (ln.type === "STREET" && !rawStreet) rawStreet = ln.cleaned;
      if (ln.type === "CITY_ZIP" && !rawCityZip) rawCityZip = ln.cleaned;
      if (ln.type === "PHONE" && !rawPhone) rawPhone = ln.raw;
    }
  }
  if (!rawPhone) rawPhone = findPhone(rawLines);

  return { rawName, rawStreet, rawCityZip, rawPhone };
}

/** parse → sanitize → validate for a single OCR text. */
function assembleExtracted(text: string): ParsedFields {
  const c = extractRawCandidates(text);
  const phone = sanitizePhone(c.rawPhone);
  const name = sanitizeName(c.rawName);
  const addr = sanitizeAddress(c.rawStreet, c.rawCityZip);
  const notes = [
    ...phone.notes.map((n) => `Phone: ${n}`),
    ...name.notes.map((n) => `Name: ${n}`),
    ...addr.notes.map((n) => `Address: ${n}`),
  ];
  return {
    rawText: text,
    candidateAddress: addr.display,
    candidateName: name.value,
    candidatePhone: phone.value,
    addressConfidence: addr.confidence,
    nameConfidence: name.confidence,
    phoneConfidence: phone.confidence,
    addressDetail: addr.value,
    notes,
    candidateDob: null,
    dobConfidence: "none",
    orderIds: [],
    numberOfItems: null,
  };
}

/* =====================================================================
   BEST-OF-N MERGE — keep the highest-confidence value per field
===================================================================== */

const CONF_RANK: Record<FieldConfidence, number> = { high: 3, medium: 2, low: 1, none: 0 };

function emptyFields(): ParsedFields {
  return {
    rawText: "",
    candidateAddress: null,
    candidateName: null,
    candidatePhone: null,
    addressConfidence: "none",
    nameConfidence: "none",
    phoneConfidence: "none",
    addressDetail: null,
    notes: [],
    candidateDob: null,
    dobConfidence: "none",
    orderIds: [],
    numberOfItems: null,
  };
}

/** street/city/zip presence — tie-breaker between equal-confidence passes. */
function addressFieldCount(d: AddressDetail | null): number {
  if (!d) return 0;
  return (d.street ? 1 : 0) + (d.city ? 1 : 0) + (d.zip ? 1 : 0);
}

function mergeInto(acc: ParsedFields, next: ParsedFields): void {
  const nextRank = CONF_RANK[next.addressConfidence];
  const accRank = CONF_RANK[acc.addressConfidence];
  if (
    next.candidateAddress &&
    (nextRank > accRank ||
      // Equal confidence: a pass that read MORE address fields (e.g. street
      // + city + zip vs street alone) wins — PSM modes often complement
      // each other on the city/zip line.
      (nextRank === accRank && addressFieldCount(next.addressDetail) > addressFieldCount(acc.addressDetail)))
  ) {
    acc.candidateAddress = next.candidateAddress;
    acc.addressConfidence = next.addressConfidence;
    acc.addressDetail = next.addressDetail;
  }
  if (next.candidateName && CONF_RANK[next.nameConfidence] > CONF_RANK[acc.nameConfidence]) {
    acc.candidateName = next.candidateName;
    acc.nameConfidence = next.nameConfidence;
  }
  if (next.candidatePhone && CONF_RANK[next.phoneConfidence] > CONF_RANK[acc.phoneConfidence]) {
    acc.candidatePhone = next.candidatePhone;
    acc.phoneConfidence = next.phoneConfidence;
  }
  if (next.rawText.length > acc.rawText.length) acc.rawText = next.rawText;
  for (const n of next.notes) if (!acc.notes.includes(n)) acc.notes.push(n);
}

function hasAllFields(f: ParsedFields): boolean {
  return Boolean(f.candidateAddress && f.candidateName && f.candidatePhone);
}

/* =====================================================================
   PUBLIC API
===================================================================== */

/** Backwards-compatible text-only parser (no OCR run). */
export function parseShippingLabel(rawText: string): OCRExtracted {
  return { ...assembleExtracted(rawText), confidence: 0 };
}

/**
 * Merge two extraction results keeping the best value per field — the exact
 * logic processLabelImage() applies across PSM passes (confidence rank, then
 * address-completeness tie-break). Exported so the node eval/verify harnesses
 * mirror production behavior instead of re-implementing it. Returns a new object.
 */
export function mergeExtractions(acc: OCRExtracted, next: OCRExtracted): OCRExtracted {
  const copy: ParsedFields = { ...acc, notes: [...acc.notes] };
  mergeInto(copy, next);
  return { ...copy, confidence: Math.max(acc.confidence, next.confidence) };
}

export async function processLabelImage(
  imageData: string,
  onProgress?: (p: OCRProgress) => void,
): Promise<OCRExtracted> {
  currentProgress = onProgress ?? null;

  // Phase 0 — preprocess (upscale + grayscale + gentle contrast)
  onProgress?.({ status: "preprocessing image", progress: 0.04 });
  let prepped: string;
  try {
    prepped = await preprocessLabelImage(imageData);
  } catch {
    prepped = imageData; // never block OCR on a preprocessing failure
  }

  // Acquire the worker (with a hard timeout — surfaces as a real error so the
  // modal can show "engine failed to load" rather than hanging on "processing").
  const worker = await withTimeout(getWorker(), WORKER_ACQUIRE_TIMEOUT, "OCR engine load");

  // Phase 1..N — PSM sweep, merge best field across passes, early-exit when
  // all three fields are present.
  const merged = emptyFields();
  let bestConfidence = 0;

  for (let i = 0; i < PSM_SEQUENCE.length; i++) {
    const psm = PSM_SEQUENCE[i];
    onProgress?.({
      status: i === 0 ? "recognizing text" : `re-reading (pass ${i + 1})`,
      progress: 0.1 + i * 0.28,
    });
    try {
      const pass = await runPass(worker, prepped, psm);
      const parsed = assembleExtracted(pass.text);
      mergeInto(merged, parsed);
      if (pass.confidence > bestConfidence) bestConfidence = pass.confidence;
      if (hasAllFields(merged)) break; // got everything — stop early
    } catch {
      // Pass timed out or failed — try the next PSM mode.
    }
  }

  onProgress?.({ status: "done", progress: 1 });
  currentProgress = null;
  return { ...merged, confidence: bestConfidence };
}
