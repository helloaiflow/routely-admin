#!/usr/bin/env node
// ── Design-token enforcement gate (portable, no external deps) ─────────────
// Fails the build on hardcoded styles that break theming, dark mode, or the
// one-blue / one-hue-per-meaning rules. Node-based so it runs everywhere —
// local, CI, and Vercel. Rule + replacement map: routely-os/DESIGN_TOKENS_CRITERION.md.
//
// RULES (hardened 2026-07-12, design(5/7)):
//  1. SURFACES  — slate-* classes, solid bg-white (bg-white/<opacity> is the
//     intentional-overlay exemption), (bg|text|border)-[#hex] classes.
//  2. BRAND     — the brand blue may exist as a literal ONLY in src/lib/brand.ts
//     (and globals.css). Everything else: var(--primary) / brand.ts imports.
//  3. PALETTE   — status colors are emerald / rose / amber / blue families.
//     green-*, red-*, yellow-*, orange-* classes are blocked (design(2/7)).
//  4. TYPE SCALE — arbitrary text-[Npx] allowed only for the approved micro
//     scale {10, 11, 13}px. Everything else uses the Tailwind scale or .type-*.
//  5. STYLE COLORS — non-neutral hex / rgb() inside style-object color props
//     is blocked outside the explicit allowlist below.
//
// Deliberately NOT flagged:
//  • bg-black / bg-black/NN, rgba(0,0,0,…), rgba(255,255,255,…), #fff/#000
//    → neutral scrims/overlays are dark-safe by construction
//  • from-[#…] via-[#…] to-[#…] gradient classes → data-viz brand ramps
//  • bare #hex in non-color JS (ids, seeds) → only color-prop contexts scanned
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

/* Rule 1 — surfaces (original gate) */
const SURFACES =
  /(bg-slate-|text-slate-|border-slate-|divide-slate-|ring-slate-)|\bbg-white(?![/\w])|\b(?:bg|text|border)-\[#[0-9a-fA-F]/;

/* Rule 2 — brand blue literals (any casing, hex or rgb triplet) */
const BRAND = /0167FF|1,\s*103,\s*255/i;
const BRAND_ALLOW = new Set(["src/lib/brand.ts"]); // THE single source of truth

/* Rule 3 — off-palette status colors */
const OFF_PALETTE = /(?<![a-zA-Z])(?:green|red|yellow|orange)-\d/;

/* Rule 4 — arbitrary px type outside the approved micro scale */
const PX = /text-\[(\d+(?:\.\d+)?)px\]/g;
const APPROVED_PX = new Set(["7.5", "10", "11", "13"]); // 7.5 = micro-viz only (text inside ≤14px chips)
// Scale fully enforced since design(4/7) — grandfather list is EMPTY and stays empty.
const GRANDFATHERED_PX = new Set([]);
// Marketing/login art uses display sizes (44/52px hero) outside the app scale.
const PX_EXEMPT_PATHS = /^src\/app\/login/;

/* Rule 5 — non-neutral colors in style-object color props */
const STYLE_COLOR =
  /(?:backgroundColor|borderColor|boxShadow|textShadow|backgroundImage|(?<![a-zA-Z-])background|(?<![a-zA-Z-])color|stopColor|fill|stroke)\s*:\s*["'`][^"'`\n]*(?:#[0-9a-fA-F]{3,8}|rgba?\()/;
const NEUTRAL_ONLY =
  /^(?:(?!#[0-9a-fA-F]|rgba?\().)*?(?:#f{3,8}\b|#0{3,6}\b|#fff(?:fff)?\b|#000(?:000)?\b|rgba?\(\s*(?:255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)[^)]*\))/i;
// Files allowed to carry literal colors in style props — each with a reason.
const STYLE_COLOR_ALLOW = new Set([
  // Marketing/login art: hand-tuned gradient compositions, not app surfaces
  "src/app/login/_components/logistics-world.tsx",
  "src/app/login-v2/page.tsx",
  "src/app/login/page.tsx",
  // Data-viz: tonal ramps and chart fills live in JS config by nature
  "src/app/(main)/dashboard/default/_components/delivery-charts.tsx",
  "src/app/(main)/dashboard/default/_components/sankey-flow.tsx",
  "src/app/(main)/dashboard/default/_components/next-stop-panel.tsx",
  // Print-window HTML + physical label renderers: printed output can't read
  // CSS vars from the app document; colors must be literal
  "src/app/(main)/dashboard/orders/new/_components/shipping-label.tsx",
  "src/app/(main)/dashboard/orders/new/_components/shipping-label-dymo.tsx",
  "src/app/(main)/dashboard/orders/new/_components/shipping-label-niimbot.tsx",
  "src/app/(main)/dashboard/orders/new/_components/shipping-label-zebra.tsx",
  "src/app/(main)/dashboard/stops/_components/print-label-dialog.tsx",
  "src/app/(main)/dashboard/stops/_components/print-pool-labels-dialog.tsx",
  // Stripe Elements appearance: rendered inside Stripe's iframe (neutral grays)
  "src/app/(main)/dashboard/orders/new/_components/stripe-payment-element.tsx",
  // Google Maps canvas: dark-style JSON, custom marker DOM overlays, and
  // static-map placeholders — vendor context where CSS vars don't reach
  "src/app/(main)/dashboard/stops/page.tsx",
  // Data-viz: pipeline stage colors feed chart/icon fills via JS
  "src/app/(main)/dashboard/default/_components/delivery-pipeline.tsx",
  // Camera viewfinder overlays (scan lasers/scrims over live video)
  "src/app/(main)/dashboard/stops/_components/barcode-scan-modal.tsx",
  "src/app/(main)/dashboard/stops/_components/ocr-scan-modal.tsx",
  "src/app/(main)/dashboard/stops/_components/ocr-batch-modal.tsx",
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const hits = [];
for (const file of walk(SRC)) {
  const rel = file.replace(ROOT, "");
  const isTsx = file.endsWith(".tsx");
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const at = (rule) => hits.push(`${rel}:${i + 1} [${rule}] ${line.trim().slice(0, 120)}`);

    // Rule 2 — brand literals (tsx + ts)
    if (!BRAND_ALLOW.has(rel) && BRAND.test(line)) at("brand-blue");

    if (!isTsx) return;

    // Rule 1 — surfaces
    if (SURFACES.test(line)) at("surface");
    // Rule 3 — off-palette
    if (OFF_PALETTE.test(line)) at("off-palette");
    // Rule 4 — type scale (login/marketing display type is exempt)
    if (!PX_EXEMPT_PATHS.test(rel)) {
      for (const m of line.matchAll(PX)) {
        const size = m[1];
        if (!APPROVED_PX.has(size) && !GRANDFATHERED_PX.has(size)) at(`px-scale:${size}px`);
      }
    }
    // Rule 5 — style-object colors (non-neutral, non-allowlisted)
    if (!STYLE_COLOR_ALLOW.has(rel) && STYLE_COLOR.test(line) && !NEUTRAL_ONLY.test(line)) at("style-color");
  });
}

if (hits.length) {
  console.error(`\n❌ Design-token gate FAILED — ${hits.length} hit(s). Use semantic tokens.`);
  console.error("   Map + rule: routely-os/DESIGN_TOKENS_CRITERION.md\n");
  for (const h of hits) console.error(h);
  process.exit(1);
}

console.log("✅ Design-token gate passed — surfaces, brand blue, palette, type scale, style colors all clean.");
