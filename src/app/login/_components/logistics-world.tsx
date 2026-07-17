"use client";

import { useEffect, useRef, useState } from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { CheckCircle2, Clock, Package, Truck } from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────────
 *  Login hero — "Clinical Isometric Calm"  (desktop / lg+ only)
 *
 *  Base artwork: /login/city-loop.mp4 — the approved isometric world, now ALIVE
 *  (Higgsfield Kling loop: vans, couriers, pedestrians; locked camera), shown as
 *  a CENTERED ILLUSTRATION (measured contain rect) — never cropped/stretched.
 *  The flat backdrop matches the artwork's edge tone so it feels infinite,
 *  with no hard seam at any resolution. Poster = /login/1002_city.png.
 *
 *  Layout, modelled on Referencia_titulo_Card.png:
 *    • TOP    → strong headline → subtitle → supporting line
 *    • BOTTOM → three Magic-UI-style glass cards:
 *               Live Overview (number tickers) · Real-time Tracking (animated
 *               route + moving vehicle) · Analytics (animated ring + bars)
 *    • a slim feature-chip rail under the cards (xl+)
 *
 *  Everything respects prefers-reduced-motion. No auth logic lives here.
 * ──────────────────────────────────────────────────────────────────────────── */

/* Living city — Higgsfield Kling 3.0 loop (10s, 1080p, seamless: start = end frame).
 * Vans drive the lanes, couriers deliver, pedestrians walk; camera locked.
 * POSTER paints instantly (and stands in under prefers-reduced-motion). */
const VIDEO = "/login/city-loop.mp4"; // 2152×1440 H.264 ~9 MB — AI-upscaled 2K (ByteDance aigc preset)
const POSTER = "/login/1002_city.png"; // same artwork — seamless placeholder while video loads
const VID_W = 2152;
const VID_H = 1440;
/* Edge tone MEASURED from the video frame itself (canvas-sampled corners:
 * rgb(234-239, 237-242, 252-255)). The backdrop sits at the centre of that
 * range and a soft feather mask on the video absorbs the residual variance,
 * so there is no visible seam at any resolution. */
const BACKDROP = "#EDF1FE";
import { BRAND_PRIMARY, brandAlpha } from "@/lib/brand";

const BRAND = BRAND_PRIMARY;

/* Words that complete "Built for Every …" (rotating, brand-gradient emphasis) */
const SCENARIOS = ["Prescription", "Delivery", "Package", "Specimen"];

/* ── Mouse parallax ──────────────────────────────────────────────────────── */
function useMouseParallax() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion() ?? false;

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 40, damping: 26, mass: 1 });
  const sy = useSpring(my, { stiffness: 40, damping: 26, mass: 1 });

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reducedMotion) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    mx.set(((e.clientX - rect.left) / rect.width) * 2 - 1);
    my.set(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }

  const reset = () => {
    mx.set(0);
    my.set(0);
  };

  return { containerRef, sx, sy, onMouseMove, reset, reducedMotion };
}

/* ── Magic-UI-style number ticker (counts up on mount) ───────────────────── */
function NumberTicker({
  value,
  decimals = 0,
  suffix = "",
  reduced,
  delay = 0.7,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  reduced: boolean;
  delay?: number;
}) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  // First animation gets the staged entrance delay; live updates tick fast.
  const firstRun = useRef(true);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    const isFirst = firstRun.current;
    firstRun.current = false;
    const controls = animate(mv, value, {
      duration: isFirst ? 1.6 : 0.7,
      delay: isFirst ? delay : 0,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsub = mv.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [value, decimals, reduced, delay, mv]);

  const text = decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString();
  return (
    <span className="tabular-nums">
      {text}
      {suffix}
    </span>
  );
}

/* ── Magic-UI-style BorderBeam — a light particle orbiting the card border ──
 *  Implemented with CSS offset-path (rect) + double-mask so only the border
 *  ring is painted, exactly like magicui.design's BorderBeam. Self-contained,
 *  no extra deps. Respects reduced motion (caller skips rendering).           */
function BorderBeam({
  size = 64,
  duration = 7,
  delay = 0,
}: {
  size?: number;
  duration?: number;
  delay?: number;
}) {
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
          background: `linear-gradient(to left, ${BRAND}, rgba(61,139,255,0.9), transparent)`,
        }}
        initial={{ offsetDistance: "0%" }}
        animate={{ offsetDistance: "100%" }}
        transition={{ duration, delay, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

function LiveBadge({ reduced }: { reduced: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="relative flex size-1.5">
        {!reduced && (
          <motion.span
            className="absolute inline-flex size-full rounded-full bg-emerald-400"
            animate={{ scale: [1, 2.6], opacity: [0.6, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
      </span>
      <span className="font-medium text-[9px] uppercase tracking-[0.14em] text-emerald-600">Live</span>
    </span>
  );
}

/* ── Live Operations dock — ONE slim glass bar ──────────────────────────────
 *  Replaces the former three-card cluster + chip rail: the animated city is
 *  now the hero, so the data layer shrinks to a single quiet strip. Same
 *  coherent story (24 shipments, 5 vans on the road, 98.6% on-time, 18
 *  delivered) and the numbers still LIVE — every few seconds a van completes
 *  a stop (Delivered +1, In transit −1) or a new shipment enters, and the
 *  Magic-UI tickers glide to the new value.                                 */
function LiveOpsDock({ delay, reduced }: { delay: number; reduced: boolean }) {
  const [stats, setStats] = useState({ shipments: 24, transit: 5, delivered: 18 });

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setStats((s) => {
        const roll = Math.random();
        // a delivery completes…
        if (roll < 0.45 && s.transit > 3) return { ...s, transit: s.transit - 1, delivered: s.delivered + 1 };
        // …or a new shipment is picked up
        if (s.transit < 8) return { shipments: s.shipments + 1, transit: s.transit + 1, delivered: s.delivered };
        return s;
      });
    }, 6500);
    return () => clearInterval(id);
  }, [reduced]);

  const items = [
    { icon: Package, label: "Shipments", value: stats.shipments, decimals: 0, suffix: "", tone: "text-foreground" },
    { icon: Truck, label: "In transit", value: stats.transit, decimals: 0, suffix: "", tone: "text-primary" },
    { icon: Clock, label: "On time", value: 98.6, decimals: 1, suffix: "%", tone: "text-emerald-600" },
    { icon: CheckCircle2, label: "Delivered", value: stats.delivered, decimals: 0, suffix: "", tone: "text-foreground" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/70 shadow-[0_24px_60px_-26px_color-mix(in_srgb,var(--primary)_42%,transparent)] backdrop-blur-2xl"
    >
      {!reduced && <BorderBeam size={44} duration={9} delay={delay * 2} />}
      <div className="flex items-center px-5 py-3">
        {/* identity block */}
        <div className="mr-4 flex flex-col items-start gap-1 border-border/30 border-r pr-4">
          <LiveBadge reduced={reduced} />
          <span className="font-semibold text-[9.5px] uppercase tracking-[0.16em] text-foreground/60">Operations</span>
        </div>

        {items.map((it, i) => (
          <div key={it.label} className="flex items-center">
            {i > 0 && <span className="mx-3.5 h-7 w-px bg-border/30" aria-hidden="true" />}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: delay + 0.25 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-2.5"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10">
                <it.icon className="size-3.5 text-primary" aria-hidden="true" />
              </span>
              <span className="flex flex-col leading-none">
                <span className={`font-semibold text-[14.5px] tabular-nums tracking-tight ${it.tone}`}>
                  <NumberTicker
                    value={it.value}
                    decimals={it.decimals}
                    suffix={it.suffix}
                    reduced={reduced}
                    delay={delay + 0.4 + i * 0.09}
                  />
                </span>
                <span className="mt-1 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{it.label}</span>
              </span>
            </motion.div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ── Magic-UI-style word rotator — brand-gradient ink, fade + slide + blur ──
 *  The container ANIMATES ITS WIDTH to the current word (measured live via a
 *  hidden twin + ResizeObserver), so "Every <word>" always reads with ONE
 *  natural space — no reserved gap from the longest word, no layout jumps.   */
function WordRotate({ words, reduced }: { words: string[]; reduced: boolean }) {
  const [i, setI] = useState(0);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState<number | null>(null);

  useEffect(() => {
    if (reduced) return;
    // Calm rotation — each word gets time to be read (3.4s).
    const id = setInterval(() => setI((p) => (p + 1) % words.length), 3400);
    return () => clearInterval(id);
  }, [reduced, words.length]);

  // Measure the CURRENT word with identical type metrics (hidden twin);
  // re-measures on rotation and on font-size changes (clamp/vw resize).
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const update = () => setW(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [i]);

  return (
    <motion.span
      className="relative inline-grid h-[1.25em] place-items-center overflow-hidden align-middle"
      animate={w != null ? { width: w } : undefined}
      transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* hidden twin of the current word — the width source of truth */}
      <span ref={measureRef} className="invisible absolute top-0 left-0 whitespace-nowrap" aria-hidden="true">
        {words[i]}
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={words[i]}
          initial={reduced ? false : { y: "60%", opacity: 0, filter: "blur(6px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={reduced ? undefined : { y: "-60%", opacity: 0, filter: "blur(6px)" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="col-start-1 row-start-1 whitespace-nowrap bg-clip-text text-transparent"
          style={{ backgroundImage: `linear-gradient(100deg, ${BRAND_PRIMARY} 0%, #3d8bff 55%, #0b2e7a 100%)` }}
        >
          {words[i]}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

/* ── TOP band — clean 3-level hierarchy, set in Plus Jakarta Sans ──────────
 *  The display face (already loaded app-wide via the font registry) gives the
 *  hero its own voice vs. the Geist UI chrome. Hierarchy by WEIGHT, not by
 *  washed-out opacity: eyebrow (quiet, brand-tinted small caps) → headline
 *  (bold statement / medium lead-in / extrabold gradient word) → support.
 *  Vertical rhythm: 14px → 16px steps, all optically centred.               */
const DISPLAY_FONT = "var(--font-plus-jakarta-sans), var(--font-sans), system-ui, sans-serif";

function HeroHeading({ reduced }: { reduced: boolean }) {
  const reveal = (delay: number) => ({
    initial: { opacity: 0, y: -12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.85, delay, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <div
      className="absolute inset-x-0 top-0 z-30 flex flex-col items-center px-8 pt-[clamp(1.75rem,5vh,3.25rem)] text-center"
      style={{ fontFamily: DISPLAY_FONT }}
    >
      {/* 1 · eyebrow — quiet brand-tinted small caps, no hairline clutter */}
      <motion.div
        {...reveal(0.1)}
        className="font-semibold text-[10.5px] uppercase tracking-[0.32em] text-primary/70"
      >
        Healthcare Logistics, Unified
      </motion.div>

      {/* 2 · headline — one sentence across two lines. Contrast comes from
          weight (700 / 500 / 800), never from grayed ink, so both lines feel
          equally present and the gradient word stays the single accent. */}
      <motion.h1
        {...reveal(0.2)}
        className="mt-3.5 font-bold text-[clamp(1.95rem,3vw,2.7rem)] leading-[1.16] tracking-[-0.032em] text-foreground"
      >
        One Platform.
        <br />
        <span className="font-medium text-foreground/85">Built for Every </span>
        <span className="font-extrabold tracking-[-0.024em]">
          <WordRotate words={SCENARIOS} reduced={reduced} />
        </span>
      </motion.h1>

      {/* 3 · supporting copy — one calm line, a full breath below */}
      <motion.p
        {...reveal(0.4)}
        className="mt-4 max-w-lg text-balance font-medium text-[13.5px] leading-relaxed tracking-[0.005em] text-muted-foreground"
      >
        Powering Healthcare Logistics from Pickup to Proof of Delivery.
      </motion.p>
    </div>
  );
}

/* ── Measured stage — computes the EXACT rect object-contain draws the image
 *  into, so the route overlay maps 1:1 onto the artwork at any panel size.  */
function useContainRect() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      // PIXEL-PERFECT cap: contain-fit but NEVER upscale beyond the video's
      // native resolution (upscaling is what made the loop look distorted —
      // 1.3×+ stretch on fine isometric linework). On huge panels the video
      // simply renders at native size, crisp, centred on the matching backdrop.
      const s = Math.min(cw / VID_W, ch / VID_H, 1);
      setRect({ w: Math.round(VID_W * s), h: Math.round(VID_H * s) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { stageRef, rect };
}

/* ── Main hero ───────────────────────────────────────────────────────────── */
export function LogisticsWorld() {
  const { containerRef, sx, sy, onMouseMove, reset, reducedMotion } = useMouseParallax();
  const { stageRef, rect } = useContainRect();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Autoplay reliability (Safari/iOS need muted set imperatively) + respect
  // prefers-reduced-motion by holding the loop on its poster/first frame.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    if (reducedMotion) {
      v.pause();
    } else {
      // play() can reject if the browser defers autoplay — poster covers us.
      v.play().catch(() => {});
    }
  }, [reducedMotion]);

  const worldX = useTransform(sx, [-1, 1], [-5, 5]);
  const worldY = useTransform(sy, [-1, 1], [-4, 4]);
  const cardX = useTransform(sx, [-1, 1], [-8, 8]);
  const cardY = useTransform(sy, [-1, 1], [-5, 5]);

  return (
    <div
      ref={containerRef}
      onMouseMove={onMouseMove}
      onMouseLeave={reset}
      className="relative isolate flex h-full w-full items-center justify-center overflow-hidden rounded-3xl"
      style={{
        // MEASURED from the video frame itself (canvas-sampled edges). A flat
        // backdrop in that exact tone makes the container literally part of
        // the moving artwork — zero seam at any size; the scene's own baked-in
        // glow supplies the light.
        background: BACKDROP,
      }}
    >
      {/* THE LIVING CITY — Higgsfield loop rendered inside the EXACT rect that
          object-contain would use (measured stage), so the full scene fits ANY
          panel size with zero crop/stretch: wide-short viewports constrain by
          height, tall-narrow by width. The video's edge tone matches the flat
          #EAEFFB backdrop, so there is no seam at any resolution. Poster paints
          first; under prefers-reduced-motion the loop stays paused on it. */}
      <motion.div
        ref={stageRef}
        className="absolute inset-x-0 top-[4%] bottom-[6%] z-0 flex items-center justify-center"
        style={{ x: worldX, y: worldY }}
      >
        <div
          className="relative"
          style={{
            ...(rect ? { width: rect.w, height: rect.h } : { width: "100%", height: "100%" }),
            // Feather the video's rectangular edges into the backdrop (~3.5%
            // per side): two intersected linear-gradient masks, same technique
            // as BorderBeam's ring mask. Kills any residual tone difference.
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, #000 3.5%, #000 96.5%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 3.5%, #000 96.5%, transparent 100%)",
            maskImage:
              "linear-gradient(to right, transparent 0%, #000 3.5%, #000 96.5%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 3.5%, #000 96.5%, transparent 100%)",
            WebkitMaskComposite: "source-in",
            maskComposite: "intersect",
          }}
        >
          <video
            ref={videoRef}
            className="h-full w-full select-none object-contain"
            autoPlay={!reducedMotion}
            muted
            loop
            playsInline
            preload="auto"
            poster={POSTER}
            disablePictureInPicture
            aria-hidden="true"
            tabIndex={-1}
          >
            <source src={VIDEO} type="video/mp4" />
          </video>
        </div>
      </motion.div>

      {/* Ambient light beams — two soft diagonal sheens sweeping the scene
          (Magic-UI "beams" feel: slow, blurred, brand-tinted, never loud). */}
      {!reducedMotion && (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
          <motion.div
            className="absolute -inset-y-1/4 w-[26%] rotate-[18deg] blur-3xl"
            style={{
              background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.55), ${brandAlpha(0.10)}, transparent)`,
            }}
            initial={{ left: "-35%" }}
            animate={{ left: "125%" }}
            transition={{ duration: 11, repeat: Infinity, ease: "linear", repeatDelay: 3 }}
          />
          <motion.div
            className="absolute -inset-y-1/4 w-[14%] rotate-[18deg] blur-3xl"
            style={{ background: `linear-gradient(90deg, transparent, ${brandAlpha(0.12)}, transparent)` }}
            initial={{ left: "-25%" }}
            animate={{ left: "125%" }}
            transition={{ duration: 11, repeat: Infinity, ease: "linear", repeatDelay: 3, delay: 1.1 }}
          />
        </div>
      )}
      {/* Soft bottom fade (matched to backdrop) — gently seats the dock; much
          shorter than before so the living city stays visible. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[24%]"
        style={{
          background:
            "linear-gradient(to top, #EDF1FE 0%, rgba(237,241,254,0.8) 34%, rgba(237,241,254,0.2) 68%, rgba(237,241,254,0) 100%)",
        }}
        aria-hidden="true"
      />

      <HeroHeading reduced={reducedMotion} />

      {/* BOTTOM band — one slim live-operations dock (own parallax layer) */}
      <motion.div
        className="absolute inset-x-0 bottom-0 z-30 flex justify-center px-6 pb-7"
        style={{ x: cardX, y: cardY }}
      >
        <LiveOpsDock delay={0.55} reduced={reducedMotion} />
      </motion.div>
    </div>
  );
}
