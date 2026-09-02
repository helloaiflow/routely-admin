"use client";

/* Magic-UI-style BorderBeam — a light particle orbiting the card border.
 * Same offset-path + double-mask technique as the login page's local copy
 * (logistics-world.tsx), extracted as a reusable primitive for the Internal
 * Packages surfaces (CEO: "dale vida", 2026-09-01). Paints ONLY the border
 * ring; colors come from the theme token so it stays brand-blue in both
 * themes. Skips itself entirely under prefers-reduced-motion. */

import { motion, useReducedMotion } from "framer-motion";

export function BorderBeam({
  size = 64,
  duration = 7,
  delay = 0,
}: {
  size?: number;
  duration?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]"
      aria-hidden="true"
    >
      <motion.div
        className="absolute aspect-square"
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          background: "linear-gradient(to left, var(--primary), color-mix(in oklch, var(--primary) 70%, transparent), transparent)",
        }}
        initial={{ offsetDistance: "0%" }}
        animate={{ offsetDistance: "100%" }}
        transition={{ duration, delay, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
      />
    </div>
  );
}
