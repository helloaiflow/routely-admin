/**
 * Coerce an API error payload into a human-readable string.
 *
 * FastAPI (and our Next routes that proxy it) can return `error`/`detail` as
 * nested OBJECTS (e.g. the 402 insufficient_funds body carries
 * { error: { detail: "This tenant has $-4507.00 available…", … } }).
 * Rendering those directly shows "[object Object]" — this digs the first
 * human string out, however deep it sits (2026-09-01, CEO-reported).
 */
export function apiErrorText(data: unknown, fallback = "Something went wrong"): string {
  const seen = new Set<unknown>();
  function dig(v: unknown): string | null {
    if (v == null) return null;
    if (typeof v === "string") return v.trim() || null;
    if (typeof v !== "object" || seen.has(v)) return null;
    seen.add(v);
    const o = v as Record<string, unknown>;
    // Preference order: the long human sentence, then machine slugs.
    for (const k of ["detail", "message", "error", "reason"]) {
      const hit = dig(o[k]);
      if (hit) return hit;
    }
    return null;
  }
  return dig(data) ?? fallback;
}
