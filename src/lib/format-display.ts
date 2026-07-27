/**
 * Display-only Title Case for DB data that arrives ALL-CAPS
 * ("DEPOT TEST ROUTLY", "12188 W SAMPLE RD", "CORAL SPRINGS").
 *
 * NEVER changes stored data — call it at render time only.
 * Intentional design uppercase (.type-label eyebrows, badges) stays styled
 * via CSS `text-transform`, so it is unaffected by this formatter.
 *
 * Rules:
 *  - Words are Title Cased ("SAMPLE" → "Sample").
 *  - Directionals and state codes stay uppercase: "12188 W SAMPLE RD" →
 *    "12188 W Sample Rd", "FL" stays "FL".
 *  - Digit-bearing tokens keep digits and lowercase any ordinal/unit suffix:
 *    "12TH" → "12th", "33301" → "33301", "#4B" → "#4B".
 *  - Name particles stay lowercase mid-phrase (de, la, van…): matches the
 *    backend's canonical name normalization.
 *  - Mixed-case input is respected (already-clean data passes through
 *    unchanged except pure-uppercase words).
 */

const KEEP_UPPER = new Set([
  // directionals
  "N", "S", "E", "W", "NE", "NW", "SE", "SW",
  // common address/entity abbreviations that read wrong in Title Case
  "PO", "US", "USA", "LLC", "INC", "II", "III", "IV", "AI",
  // Operating state only. The full USPS state list collides with Spanish name
  // particles (DE/LA = Delaware/Louisiana vs "de la Rosa") — Routely's data is
  // Florida-only (zones.state_id='FL' across the board), so FL suffices.
  "FL",
]);

const PARTICLES = new Set([
  "de", "del", "la", "las", "los", "da", "das", "dos", "do",
  "van", "von", "der", "den", "di", "y", "e", "of", "the", "and",
]);

function caseWord(word: string, isFirst: boolean): string {
  if (!word) return word;
  const upper = word.toUpperCase();
  // Only rewrite words that are fully uppercase (the DB-caps case). Mixed or
  // lowercase input is someone's deliberate writing — leave it alone.
  if (word !== upper) return word;
  if (KEEP_UPPER.has(upper)) return upper;
  // Digit-bearing tokens: house numbers, zips, ordinals, unit labels.
  if (/\d/.test(word)) {
    // "12TH"/"3RD" → "12th"/"3rd"; short unit tags like "#4B" keep their caps.
    return word.replace(/(\d)(ST|ND|RD|TH)\b/g, (_, d: string, suf: string) => d + suf.toLowerCase());
  }
  const lower = word.toLowerCase();
  if (!isFirst && PARTICLES.has(lower)) return lower;
  // Hyphen/apostrophe compounds: SMITH-JONES → Smith-Jones, O'BRIEN → O'Brien.
  return lower.replace(/(^|[-'’])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function formatDisplayCase(value: string | null | undefined): string {
  if (!value) return "";
  let first = true;
  return value.replace(/[^\s,/]+/g, (word) => {
    const out = caseWord(word, first);
    first = false;
    return out;
  });
}
