"use client";

/* ────────────────────────────────────────────────────────────────────────────
 *  Fleet isometric vignettes — "Clinical Isometric Calm" (login-scene family)
 *
 *  Pure SVG/CSS (no images, no runtime JS): a mini-depot for Hubs and a
 *  courier van for Drivers. 2:1 isometric projection, three-face shading from
 *  the brand hue, soft gradient backdrop. Ambient animation is opacity/
 *  transform-only keyframes (GPU-cheap, zero jank) and fully disabled under
 *  prefers-reduced-motion. Light/dark aware via scoped CSS variables.
 *
 *  variants:
 *    header — compact garnish behind the detail-header identity block (right-
 *             aligned, masked so the text column stays fully legible)
 *    empty  — hero for the "No hub/driver selected" empty states
 * ──────────────────────────────────────────────────────────────────────────── */

const SCOPE_CSS = `
.fleet-art {
  --iso-sky-a: hsl(228 100% 97%);
  --iso-sky-b: hsl(224 60% 92%);
  --iso-ground: hsl(226 40% 88%);
  --iso-top: hsl(224 45% 97%);
  --iso-left: hsl(225 25% 78%);
  --iso-right: hsl(226 22% 66%);
  --iso-accent: var(--primary);
  --iso-glass: hsl(210 60% 85% / 0.55);
  --iso-line: hsl(226 25% 55% / 0.35);
  --iso-glow: hsl(228 90% 62% / 0.25);
}
.dark .fleet-art {
  --iso-sky-a: hsl(228 30% 12%);
  --iso-sky-b: hsl(226 28% 9%);
  --iso-ground: hsl(226 22% 16%);
  --iso-top: hsl(225 18% 30%);
  --iso-left: hsl(226 20% 20%);
  --iso-right: hsl(227 22% 14%);
  --iso-glass: hsl(215 60% 45% / 0.35);
  --iso-line: hsl(220 30% 70% / 0.25);
  --iso-glow: hsl(228 90% 62% / 0.35);
}
@media (prefers-reduced-motion: no-preference) {
  .fleet-art .iso-bob   { animation: fleet-bob 5s ease-in-out infinite; }
  .fleet-art .iso-pulse { animation: fleet-pulse 3.2s ease-in-out infinite; }
  .fleet-art .iso-dash  { animation: fleet-dash 7s linear infinite; }
  .fleet-art .iso-blink { animation: fleet-pulse 2.1s ease-in-out infinite; animation-delay: 1s; }
}
@keyframes fleet-bob   { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
@keyframes fleet-pulse { 0%,100% { opacity: .25; } 50% { opacity: .9; } }
@keyframes fleet-dash  { to { stroke-dashoffset: -48; } }
`;

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--iso-sky-a)" />
        <stop offset="100%" stopColor="var(--iso-sky-b)" />
      </linearGradient>
      <radialGradient id={`${id}-halo`} cx="50%" cy="42%" r="55%">
        <stop offset="0%" stopColor="var(--iso-glow)" />
        <stop offset="100%" stopColor="transparent" />
      </radialGradient>
    </defs>
  );
}

/* Shared iso ground diamond centred at (cx, cy). */
function Ground({ cx, cy, w }: { cx: number; cy: number; w: number }) {
  const h = w / 2;
  return (
    <polygon
      points={`${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}`}
      fill="var(--iso-ground)"
      opacity="0.8"
    />
  );
}

/* Iso box: top/left/right faces from an origin (x,y = top vertex), sizes in
 * iso units (dx right-run, dz left-run, h height). */
function Box({ x, y, dx, dz, h, tone = 1 }: { x: number; y: number; dx: number; dz: number; h: number; tone?: number }) {
  const rx = dx, ry = dx / 2, lx = dz, ly = dz / 2;
  const o = tone;
  return (
    <g>
      <polygon points={`${x},${y} ${x + rx},${y + ry} ${x + rx - lx},${y + ry + ly} ${x - lx},${y + ly}`} fill="var(--iso-top)" opacity={o} />
      <polygon points={`${x - lx},${y + ly} ${x + rx - lx},${y + ry + ly} ${x + rx - lx},${y + ry + ly + h} ${x - lx},${y + ly + h}`} fill="var(--iso-left)" opacity={o} />
      <polygon points={`${x + rx - lx},${y + ry + ly} ${x + rx},${y + ry} ${x + rx},${y + ry + h} ${x + rx - lx},${y + ry + ly + h}`} fill="var(--iso-right)" opacity={o} />
    </g>
  );
}

/* ── Hubs: mini-depot — warehouse, dock canopy, box truck at the bay ──────── */
export function IsoDepotScene({ variant }: { variant: "header" | "empty" }) {
  const id = `depot-${variant}`;
  return (
    <div className={`fleet-art pointer-events-none ${variant === "header" ? "absolute inset-y-0 right-0 w-[46%] opacity-80 [mask-image:linear-gradient(to_right,transparent,black_38%)]" : "relative mx-auto w-full max-w-[340px]"}`} aria-hidden="true">
      <style>{SCOPE_CSS}</style>
      <svg viewBox="0 0 320 200" className="h-full w-full" role="presentation">
        <Defs id={id} />
        {variant === "empty" && <rect width="320" height="200" rx="16" fill={`url(#${id}-sky)`} />}
        <ellipse cx="160" cy="150" rx="130" ry="38" fill={`url(#${id}-halo)`} />
        <Ground cx={160} cy={140} w={230} />

        {/* warehouse body */}
        <Box x={150} y={52} dx={86} dz={58} h={52} />
        {/* roof edge highlight + scan pulse */}
        <polygon points="150,52 236,95 178,124 92,81" fill="var(--iso-accent)" opacity="0.10" />
        <polygon className="iso-pulse" points="150,52 236,95 178,124 92,81" fill="var(--iso-accent)" opacity="0.2" />

        {/* dock canopy (glass) */}
        <polygon points="92,81 178,124 178,132 92,89" fill="var(--iso-glass)" />

        {/* roller doors on the left face */}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <polygon
              points={`${104 + i * 24},${99 + i * 12} ${118 + i * 24},${106 + i * 12} ${118 + i * 24},${128 + i * 12} ${104 + i * 24},${121 + i * 12}`}
              fill="var(--iso-right)"
              opacity="0.85"
            />
            {[0.3, 0.5, 0.7].map((t) => (
              <line
                key={t}
                x1={104 + i * 24} y1={99 + i * 12 + 22 * t}
                x2={118 + i * 24} y2={106 + i * 12 + 22 * t}
                stroke="var(--iso-line)" strokeWidth="1"
              />
            ))}
          </g>
        ))}

        {/* beacon */}
        <circle className="iso-blink" cx="150" cy="46" r="3" fill="var(--iso-accent)" />
        <line x1="150" y1="46" x2="150" y2="56" stroke="var(--iso-line)" strokeWidth="1.5" />

        {/* box truck at the far dock (gentle bob) */}
        <g className="iso-bob">
          <Box x={236} y={118} dx={34} dz={20} h={20} />
          <Box x={266} y={135} dx={16} dz={12} h={13} tone={0.95} />
          <polygon points="270,139 278,143 278,149 270,145" fill="var(--iso-glass)" />
          <ellipse cx="248" cy="163" rx="5" ry="2.6" fill="var(--iso-right)" />
          <ellipse cx="272" cy="172" rx="5" ry="2.6" fill="var(--iso-right)" />
          {/* brand stripe on the cargo box */}
          <polygon points="216,128 250,145 250,150 216,133" fill="var(--iso-accent)" opacity="0.55" />
        </g>

        {/* route dashes leaving the dock */}
        <path
          className="iso-dash"
          d="M 90 168 Q 150 186 235 176"
          fill="none"
          stroke="var(--iso-accent)"
          strokeOpacity="0.5"
          strokeWidth="1.6"
          strokeDasharray="5 7"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/* ── Drivers: courier van vignette — van, parcel, route ──────────────────── */
export function IsoCourierScene({ variant }: { variant: "header" | "empty" }) {
  const id = `courier-${variant}`;
  return (
    <div className={`fleet-art pointer-events-none ${variant === "header" ? "absolute inset-y-0 right-0 w-[46%] opacity-80 [mask-image:linear-gradient(to_right,transparent,black_38%)]" : "relative mx-auto w-full max-w-[340px]"}`} aria-hidden="true">
      <style>{SCOPE_CSS}</style>
      <svg viewBox="0 0 320 200" className="h-full w-full" role="presentation">
        <Defs id={id} />
        {variant === "empty" && <rect width="320" height="200" rx="16" fill={`url(#${id}-sky)`} />}
        <ellipse cx="160" cy="148" rx="120" ry="34" fill={`url(#${id}-halo)`} />
        <Ground cx={160} cy={138} w={210} />

        {/* road strip */}
        <polygon points="60,150 220,73 260,93 100,170" fill="var(--iso-right)" opacity="0.28" />
        <path
          className="iso-dash"
          d="M 78 152 L 238 76"
          fill="none"
          stroke="var(--iso-top)"
          strokeWidth="1.6"
          strokeDasharray="7 8"
          strokeLinecap="round"
          opacity="0.9"
        />

        {/* the van (bob) — cargo body + cab + glass + wheels + brand stripe */}
        <g className="iso-bob">
          <Box x={150} y={84} dx={52} dz={30} h={30} />
          <Box x={196} y={109} dx={22} dz={17} h={19} tone={0.97} />
          <polygon points="201,114 213,120 213,129 201,123" fill="var(--iso-glass)" />
          <polygon points="120,114 172,140 172,147 120,121" fill="var(--iso-accent)" opacity="0.6" />
          <ellipse cx="138" cy="152" rx="6" ry="3" fill="var(--iso-right)" />
          <ellipse cx="172" cy="168" rx="6" ry="3" fill="var(--iso-right)" />
          <ellipse cx="206" cy="152" rx="6" ry="3" fill="var(--iso-right)" />
          {/* headlight glow */}
          <circle className="iso-pulse" cx="216" cy="141" r="2.4" fill="var(--iso-accent)" />
        </g>

        {/* parcel on the ground + ping */}
        <Box x={96} y={132} dx={13} dz={9} h={9} tone={0.95} />
        <circle className="iso-pulse" cx="96" cy="128" r="8" fill="none" stroke="var(--iso-accent)" strokeOpacity="0.5" strokeWidth="1.4" />
        <circle cx="96" cy="128" r="2" fill="var(--iso-accent)" />
      </svg>
    </div>
  );
}
