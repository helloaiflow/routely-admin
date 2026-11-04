export const SCAN_PREFERENCE_KEY = "routely_scan_preference";
export const SCAN_PREFERENCES = ["qwen", "openai"] as const;

export type ScanPreference = (typeof SCAN_PREFERENCES)[number];

/* M22: OpenAI receives label photos (PHI) and has no BAA, so it is off unless OCR_OPENAI_ENABLED=true at build
 * (next.config inlines it). Off, every saved "openai" preference is read and rewritten as "qwen". */
export const OCR_OPENAI_ENABLED = process.env.OCR_OPENAI_ENABLED === "true";

export function normalizeScanPreference(value: unknown): ScanPreference {
  return OCR_OPENAI_ENABLED && value === "openai" ? "openai" : "qwen";
}

export function readScanPreference(): ScanPreference {
  if (typeof window === "undefined") return "qwen";
  const saved = window.localStorage.getItem(SCAN_PREFERENCE_KEY);
  const value = normalizeScanPreference(saved);
  if (saved && saved !== value) window.localStorage.setItem(SCAN_PREFERENCE_KEY, value);
  return value;
}

export function writeScanPreference(value: ScanPreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SCAN_PREFERENCE_KEY, value);
}
