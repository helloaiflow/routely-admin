/* ── Two-stage OCR — Stage 2: deterministic cleaner/mapper ───────────────────
 * (Session A.3, 2026-06-13 — CEO-directed.)
 *
 * Mirrors the PROVEN n8n architecture: the vision model only READS (transcribes
 * what it sees, raw); THIS module CLEANS/MAPS deterministically. Splitting
 * read from normalize is the root-cause fix for the phone-capture failures —
 * the model no longer has to "find + validate + format" a phone in one shot;
 * it just reports the digits it sees, and this code formats them reliably.
 *
 * Ported faithfully from the CEO's n8n Code-node JS (normalizePhone,
 * normalizeDOB, normalizeZip, titleCaseCity, normalizeState, clean), with TWO
 * Routely-specific deviations, both intentional:
 *   1. normalizePhone returns null when nothing valid is found — NOT the
 *      "+19540000000" placeholder n8n used. A null phone trips the 3-field
 *      hard gate and sends the label to FAILED (never a garbage draft).
 *   2. normalizeDOB picks the date WITHOUT a time component (the DOB) over the
 *      print datetime, even if both are present.
 *
 * Pure functions only — no I/O, no globals — so the whole stage is unit-tested
 * offline (scripts/ocr-clean-unittest.ts) without an API key.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Raw, as-seen transcription the vision model returns (Stage 1). */
export interface RawRead {
  name: string | null;
  phone: string | null;
  phone_candidates?: string[];
  /** Qwen self-report of what it saw for the phone. Used for diagnostics only
   *  (the deterministic cleaner below decides the actual phone). */
  phone_status?: "valid" | "placeholder_zeros" | "missing" | null;
  dob: string | null;
  /** The date that HAS a time next to it (print/fill datetime) — used to
   *  disambiguate DOB; never returned to the app. */
  print_datetime: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  order_ids: string[];
  number_of_items: number | null;
}

/** Cleaned, app-ready fields (the response contract — unchanged downstream). */
export interface CleanFields {
  name: string | null;
  phone: string | null; // 10 digits, app convention (client formats for display)
  phoneE164: string | null; // "+1XXXXXXXXXX" — n8n canonical, for parity/debug
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  dob: string | null; // MM/DD/YYYY
  order_ids: string[]; // \d{6,7}-\d{2,3}, hyphen kept
  number_of_items: number | null;
}

/* ── Primitives ──────────────────────────────────────────────────────────── */

/** clean() — trim + collapse internal whitespace; empty → null. (n8n: clean) */
export function clean(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, " ").trim();
  return s.length > 0 ? s : null;
}

/**
 * normalizePhone() — CEO's n8n logic, faithfully ported.
 *   - strip all non-digits
 *   - 10 digits → prefix +1
 *   - 11 digits starting with 1 → prefix +
 *   - 11–13 digits → take the LAST 10 (handles glued prefixes/suffixes)
 *   - regex fallback to pull a phone out of arbitrary text
 * Routely deviations: area code first digit must be 2–9; known placeholders
 * and all-zeros rejected; nothing valid → null (NOT a placeholder).
 *
 * Returns E.164 ("+1XXXXXXXXXX") or null.
 */
export function normalizePhone(raw: unknown): string | null {
  if (raw == null) return null;
  const text = String(raw);
  const digits = text.replace(/\D/g, "");

  let ten: string | null = null;
  if (digits.length === 10) {
    // Clean 10-digit number (the common case).
    ten = digits;
  } else if (digits.length === 11 && digits[0] === "1") {
    // 1 + 10 (US country-code prefix) — a normal number, not an error.
    ten = digits.slice(1);
  }
  // CEO rule (iter 3): any other length — an 11-digit run NOT starting with 1
  // (a misread/extra digit), or any 12-13 digit run — is a malformed phone.
  // We do NOT guess which 10 digits are right; it stays null → the label FAILS
  // the gate → manual correction (a wrong-but-valid phone is worse than a miss).

  if (!ten || ten.length !== 10) return null;
  // Routely validity: NANP area code first digit 2–9.
  if (ten[0] < "2") return null;
  // Routely: reject known placeholder + all-zeros (never a real patient phone).
  if (ten === "0000000000" || ten === "9540000000") return null;

  return `+1${ten}`;
}

/** 10-digit form of a phone (app convention) or null. */
export function phoneDigits(raw: unknown): string | null {
  const e164 = normalizePhone(raw);
  return e164 ? e164.slice(2) : null;
}

/**
 * normalizeDOB() — CEO's n8n date logic + Routely rule.
 * Accepts a candidate dob plus the (timed) print datetime; returns the DOB as
 * MM/DD/YYYY. Handles MM/DD/YYYY, M/D/YY, ISO (YYYY-MM-DD), and dotted forms.
 * Routely rule: prefer the date WITHOUT a time; if the candidate equals the
 * print datetime's date, treat it as the print date and return null.
 */
export function normalizeDOB(rawDob: unknown, rawPrintDateTime?: unknown): string | null {
  const dobStr = typeof rawDob === "string" ? rawDob.trim() : "";
  if (!dobStr) return null;

  // If the dob token carries a time, it's the print datetime, not a DOB.
  if (/\d{1,2}:\d{2}/.test(dobStr)) return null;

  const parsed = parseDate(dobStr);
  if (!parsed) return null;

  // Routely: if it matches the print date, it isn't the DOB.
  const printStr = typeof rawPrintDateTime === "string" ? rawPrintDateTime.trim() : "";
  if (printStr) {
    const printDate = parseDate(printStr.replace(/\d{1,2}:\d{2}.*$/, "").trim());
    if (printDate && printDate === parsed) return null;
  }

  return parsed;
}

/** Parse a date string into MM/DD/YYYY, or null. */
function parseDate(s: string): string | null {
  const t = s.trim();

  // ISO: YYYY-MM-DD
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return fmtDate(m[2], m[3], m[1]);

  // MM/DD/YYYY or MM-DD-YYYY or MM.DD.YYYY
  m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    let year = m[3];
    if (year.length === 2) {
      // 2-digit year: 00–30 → 20xx, else 19xx (DOB heuristic)
      const n = Number(year);
      year = n <= 30 ? `20${year}` : `19${year}`;
    }
    return fmtDate(m[1], m[2], year);
  }

  return null;
}

function fmtDate(mm: string, dd: string, yyyy: string): string | null {
  const m = Number(mm);
  const d = Number(dd);
  const y = Number(yyyy);
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31) || !(y >= 1900 && y <= 2100)) return null;
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

/** normalizeZip() — first 5-digit run; OCR letters glued to zips tolerated. */
export function normalizeZip(raw: unknown): string | null {
  if (raw == null) return null;
  const m = String(raw).match(/(\d{5})(?:-\d{4})?/);
  return m ? m[1] : null;
}

/** titleCaseCity() — Title Case each word (n8n: titleCaseCity). */
export function titleCaseCity(raw: unknown): string | null {
  const c = clean(raw);
  if (!c) return null;
  return c.toLowerCase().replace(/(^|[\s\-'])([a-zA-ZÀ-ÿ])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

const STATE_ABBR: Record<string, string> = {
  florida: "FL",
  alabama: "AL",
  georgia: "GA",
  "new york": "NY",
  california: "CA",
  texas: "TX",
  "north carolina": "NC",
  "south carolina": "SC",
  virginia: "VA",
  tennessee: "TN",
  louisiana: "LA",
  mississippi: "MS",
  "new jersey": "NJ",
};

/** normalizeState() — 2-letter uppercase; expands a few common full names. */
export function normalizeState(raw: unknown): string | null {
  const c = clean(raw);
  if (!c) return null;
  const lower = c.toLowerCase();
  if (STATE_ABBR[lower]) return STATE_ABBR[lower];
  const letters = c.replace(/[^A-Za-z]/g, "").toUpperCase();
  if (letters.length >= 2) return letters.slice(0, 2);
  return null;
}

/**
 * normalizeName() — Routely rule: flip "LASTNAME, FIRSTNAME" → "Firstname
 * Lastname" + Title Case. (The client's normalizeAndValidateName re-validates;
 * this just produces a clean display value from the raw transcription.)
 */
export function normalizeName(raw: unknown): string | null {
  let s = clean(raw);
  if (!s) return null;

  const ci = s.indexOf(",");
  if (ci > 0) {
    const last = s.slice(0, ci).trim();
    const first = s.slice(ci + 1).trim();
    if (last && first) s = `${first} ${last}`;
  }

  return s
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-zA-ZÀ-ÿ])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Keep only well-formed order ids (6 or 7 leading digits), hyphen preserved. */
export function cleanOrderIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v).trim()).filter((v) => /^\d{6,7}-\d{2,3}$/.test(v));
}

/**
 * A bare 10-digit NANP phone with NO hyphen (e.g. "2397459785"). Order/Rx ids
 * ALWAYS carry a hyphen (`######-##`), so a no-hyphen 10-digit run in order_ids
 * is a misfiled phone, never an id. Area code first digit must be 2–9.
 */
export function isBareTenDigitPhone(v: unknown): boolean {
  const s = String(v ?? "").replace(/\s/g, "");
  return /^\d{10}$/.test(s) && s[0] >= "2" && s[0] <= "9";
}

/**
 * Pull the first STANDALONE 10-digit NANP phone out of arbitrary text — a
 * 10-digit run not glued to other digits or to a hyphen (so it never matches a
 * ZIP, a date like "08/20/1959", or a hyphenated order id "664240-00"). Area
 * code 2–9; rejects all-zeros and the known placeholder. Returns 10 digits or null.
 */
export function extractStandalonePhone(text: unknown): string | null {
  const s = String(text ?? "");
  const re = /(?<![\d-])(\d{10})(?![\d-])/g;
  for (let m = re.exec(s); m !== null; m = re.exec(s)) {
    const ten = m[1];
    if (ten[0] >= "2" && ten[0] <= "9" && ten !== "0000000000" && ten !== "9540000000") return ten;
  }
  return null;
}

/**
 * True when the label shows a MALFORMED phone signal — a bare digit run that
 * looks like a phone but is the wrong length: 11 digits NOT starting with 1 (a
 * misread NANP number, e.g. "56151222228"), or 12–13 digits. Per the CEO rule,
 * such a number is an ERROR → the label goes to FAILED for manual correction.
 * The caller uses this to SUPPRESS the targeted second pass, so the model can't
 * "rescue" it by guessing 10 of the printed 11 digits.
 */
export function hasMalformedPhoneSignal(raw: RawRead): boolean {
  const candidates: unknown[] = [
    raw.phone,
    ...(Array.isArray(raw.phone_candidates) ? raw.phone_candidates : []),
    ...(Array.isArray(raw.order_ids) ? raw.order_ids : []),
  ];
  for (const c of candidates) {
    const s = String(c ?? "").replace(/\s/g, "");
    if (!/^\d+$/.test(s)) continue; // hyphenated ids / text are not phone candidates
    if (s.length === 11 && s[0] !== "1") return true; // misread NANP (extra digit)
    if (s.length === 12 || s.length === 13) return true; // glued / over-long run
  }
  return false;
}

/* ── Top-level mapper: RawRead → CleanFields ─────────────────────────────── */

export function cleanRawRead(raw: RawRead): CleanFields {
  let e164 = normalizePhone(raw.phone);
  let orderIdsSource: unknown[] = Array.isArray(raw.order_ids) ? [...raw.order_ids] : [];

  // GENERALIZED PHONE RESCUE (2026-06-14): the vision model sometimes files the
  // patient phone into the WRONG field (most often order_ids, sometimes
  // street/name). If the phone field yielded nothing, recover a CLEAN phone from
  // wherever it landed — normalizePhone enforces the rule (10 digits, or 11 with
  // a leading 1; anything malformed → null → label FAILS to manual correction).
  if (!e164) {
    // 1. Qwen-specific phone_candidates: every standalone visible 10-digit phone
    //    candidate. This is the most reliable local path from the 114-label bake-off.
    for (const candidate of Array.isArray(raw.phone_candidates) ? raw.phone_candidates : []) {
      const rescued = normalizePhone(candidate);
      if (rescued) {
        e164 = rescued;
        break;
      }
    }
  }

  if (!e164) {
    // 2. order_ids: a bare 10/11-digit token (NO hyphen) may
    //    be a misfiled phone. Hyphenated ids are skipped. Remove a rescued token.
    for (let i = 0; i < orderIdsSource.length; i++) {
      const tok = String(orderIdsSource[i] ?? "").replace(/\s/g, "");
      if (!/^\d{10,11}$/.test(tok)) continue; // hyphenated / non-numeric ids skipped
      const rescued = normalizePhone(tok);
      if (rescued) {
        e164 = rescued;
        orderIdsSource = orderIdsSource.filter((_, j) => j !== i);
        break;
      }
    }
    // 3. Other free-text fields the model might misfile a phone into. We do NOT
    //    scan dob/print_datetime (dates), zip (5 digits), or state.
    if (!e164) {
      for (const field of [raw.street, raw.name, raw.city]) {
        const found = extractStandalonePhone(field);
        if (found) {
          const rescued = normalizePhone(found);
          if (rescued) {
            e164 = rescued;
            break;
          }
        }
      }
    }
  }

  const n = Number(raw.number_of_items);
  return {
    name: normalizeName(raw.name),
    phone: e164 ? e164.slice(2) : null,
    phoneE164: e164,
    street: clean(raw.street),
    city: titleCaseCity(raw.city),
    state: normalizeState(raw.state),
    zip: normalizeZip(raw.zip),
    dob: normalizeDOB(raw.dob, raw.print_datetime),
    order_ids: cleanOrderIds(orderIdsSource),
    number_of_items: Number.isFinite(n) && n > 0 ? n : null,
  };
}
