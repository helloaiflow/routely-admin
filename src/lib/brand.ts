/**
 * THE Routely brand blue — single source of truth for JS contexts.
 *
 * Must stay identical to `--primary` in globals.css, which is
 * oklch(0.5654 0.2396 260.72): the EXACT OKLCH of this hex
 * (roundtrip-verified sRGB → OKLab → sRGB, 2026-07-12).
 *
 * Use these ONLY where CSS variables can't reach: chart configs (Recharts),
 * Google Maps markers / static-map URLs, SVG attribute props, email/print
 * HTML templates, and iframe-scoped config (Stripe Elements appearance).
 * In classNames and inline styles always prefer `var(--primary)` and the
 * `--primary-glow*` tokens instead.
 */
export const BRAND_PRIMARY = "#0167FF";

/** "R, G, B" of the brand blue — building block for JS-side alphas. */
export const BRAND_PRIMARY_RGB = "1, 103, 255";

/** rgba() of the brand blue at a given alpha, for JS-context consumers. */
export const brandAlpha = (alpha: number) => `rgba(${BRAND_PRIMARY_RGB}, ${alpha})`;

/**
 * Browser-resolved `--primary` as an rgb() string. Some consumers (Stripe
 * Elements appearance) may not accept oklch() color strings, so we let the
 * browser compute the var into rgb. Falls back to the canonical hex on SSR
 * or if resolution fails.
 */
export function resolvedPrimary(): string {
  if (typeof window === "undefined") return BRAND_PRIMARY;
  try {
    const el = document.createElement("span");
    el.style.color = "var(--primary)";
    el.style.display = "none";
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c || BRAND_PRIMARY;
  } catch {
    return BRAND_PRIMARY;
  }
}
