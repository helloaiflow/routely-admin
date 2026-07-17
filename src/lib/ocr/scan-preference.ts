export const SCAN_PREFERENCE_KEY = "routely_scan_preference";
export const SCAN_PREFERENCES = ["qwen", "openai"] as const;

export type ScanPreference = (typeof SCAN_PREFERENCES)[number];

export function normalizeScanPreference(value: unknown): ScanPreference {
  return value === "openai" ? "openai" : "qwen";
}

export function readScanPreference(): ScanPreference {
  if (typeof window === "undefined") return "qwen";
  return normalizeScanPreference(window.localStorage.getItem(SCAN_PREFERENCE_KEY));
}

export function writeScanPreference(value: ScanPreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SCAN_PREFERENCE_KEY, value);
}
