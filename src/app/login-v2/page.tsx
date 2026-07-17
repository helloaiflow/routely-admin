"use client";

/**
 * Routely · login-v2 — innovation-lab presentation.
 *
 * This page is intentionally separate from /login. It re-uses the same
 * Clerk hooks (useSignIn / useAuth / useClerk) but adds zero new APIs and
 * touches no existing routes. /login continues to work exactly as before.
 *
 * Design intent
 * ─────────────
 *  - 65/35 split on lg: immersive logistics world | refined form panel.
 *  - Three motion layers with parallax (background dot grid, midground
 *    route network, foreground floating cards + mascot).
 *  - Inline-SVG mascot "Routely Rabbit" — geometric character with
 *    route-tablet accessory; idle ear-twitch + breathing animation.
 *  - Floating glass status cards driven by Framer Motion springs.
 *  - All animation honours prefers-reduced-motion.
 *  - Mobile: immersive panel collapses to a hero band above the form.
 *
 * Drop-in for Higgsfield assets later: any time `/public/mascot/
 * routely-rabbit.webp` exists, the <RoutelyRabbit /> component below
 * can be swapped for <img src="/mascot/routely-rabbit.webp" …> without
 * touching the rest of the file.
 */

import { Suspense, useEffect, useRef, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useSignIn } from "@clerk/nextjs/legacy";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { BRAND_PRIMARY, brandAlpha } from "@/lib/brand";

const ROUTELY_BLUE = BRAND_PRIMARY;

/* ────────────────────────────────────────────────────────────────────────────
 * RoutelyRabbit — inline geometric SVG mascot.
 *
 * Designed in 5 layered shape groups so each can animate independently:
 *   1. Floor glow (soft elliptical blue halo)
 *   2. Body + tail
 *   3. Head + cheeks + nose + whiskers
 *   4. Ears (left ear has an isolated motion transform for the twitch)
 *   5. Route-tablet accessory the rabbit holds — encodes a stylised
 *      pickup-to-dropoff route, ticking forward with a small marker.
 *
 * Stays restrained: 3 colours total (brand blue, white, soft slate). No
 * gradient backgrounds, no exaggerated proportions, no cartoon eyes.
 * ──────────────────────────────────────────────────────────────────────────── */
function RoutelyRabbit({ reducedMotion }: { reducedMotion: boolean }) {
  const breath = reducedMotion ? { y: 0 } : { y: [0, -6, 0] };
  const earTwitch = reducedMotion ? { rotate: 0 } : { rotate: [0, -4, 0, -2, 0] };

  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      style={{ width: 280, height: 320 }}
    >
      {/* Soft floor glow — gives the character lift without a drop shadow */}
      <motion.div
        className="-translate-x-1/2 absolute bottom-2 left-1/2 h-7 w-44 rounded-full blur-2xl"
        style={{ background: `radial-gradient(closest-side, ${brandAlpha(0.55)}, transparent 70%)` }}
        animate={reducedMotion ? {} : { scaleX: [1, 0.92, 1], opacity: [0.7, 0.55, 0.7] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      />

      <motion.svg
        viewBox="0 0 280 320"
        width={280}
        height={320}
        className="relative"
        animate={breath}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="rb-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#E6EBF4" />
          </linearGradient>
          <linearGradient id="rb-ear-inner" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={BRAND_PRIMARY} />
            <stop offset="1" stopColor="#3B8FFF" />
          </linearGradient>
          <linearGradient id="rb-tablet" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0E1A2F" />
            <stop offset="1" stopColor="#1A2B4A" />
          </linearGradient>
        </defs>

        {/* BODY */}
        <ellipse cx="140" cy="240" rx="78" ry="56" fill="url(#rb-body)" stroke="#D8DEE9" strokeWidth="1.5" />
        {/* small tail */}
        <circle cx="210" cy="232" r="10" fill="#FFFFFF" stroke="#D8DEE9" strokeWidth="1.5" />

        {/* COLLAR — routely blue band */}
        <path d="M88 198 Q140 218 192 198" stroke={ROUTELY_BLUE} strokeWidth="6" strokeLinecap="round" fill="none" />
        <circle cx="140" cy="210" r="4" fill={ROUTELY_BLUE} />

        {/* EARS — right is static, left twitches */}
        <g>
          {/* right ear (back layer, slightly tilted) */}
          <g transform="translate(170 38) rotate(8)">
            <path d="M0 0 Q -6 70 12 90 Q 28 70 18 0 Q 9 -10 0 0 Z" fill="url(#rb-body)" stroke="#D8DEE9" strokeWidth="1.5" />
            <path d="M5 12 Q -1 62 12 78 Q 22 62 14 12 Q 9 8 5 12 Z" fill="url(#rb-ear-inner)" opacity="0.55" />
          </g>
          {/* left ear (animated twitch) */}
          <motion.g
            style={{ transformOrigin: "100px 110px" }}
            animate={earTwitch}
            transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.4 }}
          >
            <g transform="translate(90 38) rotate(-6)">
              <path d="M0 0 Q -6 70 12 90 Q 28 70 18 0 Q 9 -10 0 0 Z" fill="url(#rb-body)" stroke="#D8DEE9" strokeWidth="1.5" />
              <path d="M5 12 Q -1 62 12 78 Q 22 62 14 12 Q 9 8 5 12 Z" fill="url(#rb-ear-inner)" opacity="0.55" />
            </g>
          </motion.g>
        </g>

        {/* HEAD */}
        <ellipse cx="140" cy="148" rx="60" ry="56" fill="url(#rb-body)" stroke="#D8DEE9" strokeWidth="1.5" />

        {/* cheeks (very subtle, blue-tinted) */}
        <circle cx="106" cy="170" r="9" fill={ROUTELY_BLUE} opacity="0.10" />
        <circle cx="174" cy="170" r="9" fill={ROUTELY_BLUE} opacity="0.10" />

        {/* eyes */}
        <circle cx="120" cy="148" r="4.6" fill="#0E1A2F" />
        <circle cx="160" cy="148" r="4.6" fill="#0E1A2F" />
        {/* eye highlights */}
        <circle cx="121.5" cy="146.5" r="1.4" fill="#FFFFFF" />
        <circle cx="161.5" cy="146.5" r="1.4" fill="#FFFFFF" />

        {/* nose + mouth */}
        <path d="M138 168 Q140 171 142 168 Q140 172 138 168 Z" fill={ROUTELY_BLUE} />
        <path d="M140 172 Q140 178 134 180" stroke="#0E1A2F" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.6" />
        <path d="M140 172 Q140 178 146 180" stroke="#0E1A2F" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.6" />

        {/* whiskers */}
        <g stroke="#9AA3B2" strokeWidth="0.9" strokeLinecap="round" opacity="0.7">
          <line x1="86" y1="170" x2="100" y2="172" />
          <line x1="86" y1="176" x2="100" y2="176" />
          <line x1="194" y1="170" x2="180" y2="172" />
          <line x1="194" y1="176" x2="180" y2="176" />
        </g>

        {/* ROUTE TABLET — held in front of the body. A stylised pickup→dropoff
            map with a small marker that animates along the path. */}
        <g transform="translate(64 226)">
          <rect width="152" height="58" rx="8" fill="url(#rb-tablet)" stroke="#33415C" strokeWidth="1" />
          {/* top status row */}
          <circle cx="14" cy="14" r="3" fill={BRAND_PRIMARY} />
          <rect x="22" y="11" width="38" height="5" rx="2.5" fill="#33415C" />
          <rect x="120" y="9" width="22" height="10" rx="3" fill={BRAND_PRIMARY} opacity="0.85" />
          {/* route line */}
          <path
            id="rb-route"
            d="M14 42 Q 50 22 76 38 T 142 32"
            stroke={ROUTELY_BLUE}
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            opacity="0.95"
          />
          {/* origin / destination pins */}
          <circle cx="14" cy="42" r="3.4" fill="#FFFFFF" stroke={ROUTELY_BLUE} strokeWidth="1.6" />
          <circle cx="142" cy="32" r="3.4" fill={ROUTELY_BLUE} stroke="#FFFFFF" strokeWidth="1.4" />
          {/* travelling marker */}
          <motion.circle
            r="3"
            fill="#FFFFFF"
            initial={{ offsetDistance: "0%" }}
            animate={reducedMotion ? {} : { offsetDistance: ["0%", "100%"] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "linear" }}
            style={{ offsetPath: "path('M14 42 Q 50 22 76 38 T 142 32')" }}
          />
        </g>

        {/* tiny paws holding the tablet */}
        <ellipse cx="78" cy="240" rx="10" ry="7" fill="url(#rb-body)" stroke="#D8DEE9" strokeWidth="1.5" />
        <ellipse cx="202" cy="240" rx="10" ry="7" fill="url(#rb-body)" stroke="#D8DEE9" strokeWidth="1.5" />
      </motion.svg>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * AnimatedRouteNetwork — midground layer.
 *
 * Five labelled facility pins connected by smooth bezier paths. Lines draw
 * in via stroke-dashoffset, pins pulse softly, and a small "delivery dot"
 * traverses each path on a stagger. Whole network is parallax-shifted by
 * the parent's motion values.
 * ──────────────────────────────────────────────────────────────────────────── */
const FACILITIES = [
  { id: "lab",   label: "QuestLab",   x: 110, y: 90,  kind: "lab"      },
  { id: "pha",   label: "RxDeerfield",x: 380, y: 130, kind: "pharmacy" },
  { id: "cli",   label: "Holy Cross", x: 250, y: 220, kind: "clinic"   },
  { id: "hos",   label: "Memorial",   x: 480, y: 280, kind: "hospital" },
  { id: "hub",   label: "Routely Hub",x: 70,  y: 280, kind: "hub"      },
] as const;

const ROUTES: { from: string; to: string; d: string }[] = [
  { from: "hub", to: "lab", d: "M70 280 Q 60 200 110 90" },
  { from: "lab", to: "pha", d: "M110 90 Q 240 60 380 130" },
  { from: "pha", to: "cli", d: "M380 130 Q 320 180 250 220" },
  { from: "cli", to: "hos", d: "M250 220 Q 360 240 480 280" },
  { from: "hub", to: "cli", d: "M70 280 Q 160 260 250 220" },
];

function AnimatedRouteNetwork({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <svg
      viewBox="0 0 560 360"
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="pin-pulse" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={BRAND_PRIMARY} stopOpacity="0.35" />
          <stop offset="1" stopColor={BRAND_PRIMARY} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Routes — drawn-in with stroke-dasharray */}
      {ROUTES.map((r, i) => (
        <g key={`${r.from}-${r.to}`}>
          {/* base path (faint) */}
          <path d={r.d} stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          {/* drawing path */}
          <motion.path
            d={r.d}
            stroke="rgba(165, 197, 255, 0.55)"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.6, delay: 0.6 + i * 0.2, ease: [0.16, 1, 0.3, 1] }}
          />
          {/* traveling delivery dot — staggered per route */}
          {!reducedMotion && (
            <motion.circle
              r="2.2"
              fill="#FFFFFF"
              initial={{ offsetDistance: "0%", opacity: 0 }}
              animate={{ offsetDistance: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
              transition={{
                duration: 6 + i * 0.5,
                repeat: Infinity,
                delay: 2 + i * 0.7,
                ease: "linear",
                times: [0, 0.1, 0.9, 1],
              }}
              style={{ offsetPath: `path('${r.d}')` }}
            />
          )}
        </g>
      ))}

      {/* Facility pins */}
      {FACILITIES.map((f, i) => (
        <g key={f.id} transform={`translate(${f.x} ${f.y})`}>
          {!reducedMotion && (
            <motion.circle
              r="18"
              fill="url(#pin-pulse)"
              animate={{ scale: [0.6, 1.4, 0.6], opacity: [0.7, 0, 0.7] }}
              transition={{ duration: 3, repeat: Infinity, delay: i * 0.4, ease: "easeInOut" }}
            />
          )}
          <motion.circle
            r="6"
            fill="#FFFFFF"
            stroke={ROUTELY_BLUE}
            strokeWidth="2"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
          />
          <text
            x="10"
            y="3"
            fontSize="9"
            fill="rgba(255,255,255,0.85)"
            fontWeight="500"
            letterSpacing="0.04em"
            style={{ fontFamily: "var(--font-sans, ui-sans-serif)" }}
          >
            {f.label.toUpperCase()}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * FloatingStatusCard — glass card with subtle vertical float.
 * ──────────────────────────────────────────────────────────────────────────── */
function FloatingStatusCard({
  icon: Icon,
  title,
  body,
  className,
  delay = 0,
  floatDelay = 0,
  reducedMotion,
}: {
  icon: typeof Sparkles;
  title: string;
  body: string;
  className?: string;
  delay?: number;
  floatDelay?: number;
  reducedMotion: boolean;
}) {
  return (
    <motion.div
      className={cn(
        "pointer-events-auto absolute flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.06] p-3 pr-4 backdrop-blur-xl",
        "shadow-[0_24px_60px_-30px_var(--primary-glow-strong)]",
        className,
      )}
      initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        animate={reducedMotion ? {} : { y: [0, -3.5, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: floatDelay }}
        className="flex items-start gap-3"
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] ring-1 ring-white/10">
          <Icon className="size-4 text-white/85" aria-hidden="true" />
        </div>
        <div className="leading-tight">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
            {title}
          </p>
          <p className="mt-0.5 text-[13px] font-medium text-white/95">{body}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * ImmersivePanel — the left 65–70% on lg+.
 *
 * Layers (front → back):
 *   foreground  floating status cards + mascot
 *   midground   animated route network
 *   background  radial dot grid + ambient orbs
 *
 * Each layer reads a parent motion value and translates at a different
 * rate — subtle mouse parallax.
 * ──────────────────────────────────────────────────────────────────────────── */
function ImmersivePanel({ reducedMotion }: { reducedMotion: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18, mass: 1 });
  const sy = useSpring(my, { stiffness: 60, damping: 18, mass: 1 });

  // Three parallax depths
  const bgX = useTransform(sx, [-1, 1], [-4, 4]);
  const bgY = useTransform(sy, [-1, 1], [-4, 4]);
  const midX = useTransform(sx, [-1, 1], [-10, 10]);
  const midY = useTransform(sy, [-1, 1], [-10, 10]);
  const fgX = useTransform(sx, [-1, 1], [-18, 18]);
  const fgY = useTransform(sy, [-1, 1], [-18, 18]);

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reducedMotion) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    mx.set(x);
    my.set(y);
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={onMouseMove}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
      }}
      className="relative isolate flex h-full flex-col overflow-hidden rounded-3xl"
      style={{
        background:
          "radial-gradient(120% 90% at 20% 10%, #0F2A6B 0%, #0A1A45 45%, #060F2A 100%)",
      }}
    >
      {/* BACKGROUND — dot grid + ambient orbs */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{ x: bgX, y: bgY }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.55) 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
        <motion.div
          className="-top-32 -right-24 absolute size-[420px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${brandAlpha(0.55)} 0%, transparent 65%)`,
            filter: "blur(40px)",
          }}
          animate={
            reducedMotion
              ? {}
              : { x: [0, -28, 12, 0], y: [0, 22, -10, 0], scale: [1, 1.08, 0.96, 1] }
          }
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="-bottom-24 -left-16 absolute size-[360px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(59,143,255,0.45) 0%, transparent 65%)",
            filter: "blur(36px)",
          }}
          animate={reducedMotion ? {} : { x: [0, 28, -12, 0], y: [0, -22, 14, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 60% at 50% 60%, transparent 0%, rgba(0,0,0,0.45) 100%)",
          }}
        />
      </motion.div>

      {/* MIDGROUND — animated route network */}
      <motion.div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        style={{ x: midX, y: midY }}
        aria-hidden="true"
      >
        <div className="h-full w-full px-10 py-16">
          <AnimatedRouteNetwork reducedMotion={reducedMotion} />
        </div>
      </motion.div>

      {/* FOREGROUND — wordmark, copy, mascot, floating cards */}
      <motion.div
        className="relative z-10 flex flex-1 flex-col p-10 lg:p-14"
        style={{ x: fgX, y: fgY }}
      >
        {/* Top — wordmark + tag */}
        <div className="flex items-center gap-3">
          <Image
            src="/img/routelyLogo.svg"
            alt="Routely"
            width={140}
            height={36}
            className="h-7 w-auto"
            priority
          />
          <span className="rounded-full bg-white/[0.08] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/70 ring-1 ring-white/10">
            Operations
          </span>
        </div>

        {/* Middle — headline + copy + trust */}
        <div className="mt-auto max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.20em] text-white/65"
          >
            <span className="inline-block size-1.5 rounded-full bg-emerald-400" />
            Live · Healthcare logistics
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-balance font-semibold text-[44px] leading-[1.05] tracking-tight text-white lg:text-[52px]"
          >
            Welcome back to{" "}
            <span className="bg-gradient-to-r from-white via-[#a5c5ff] to-[#3b8fff] bg-clip-text text-transparent">
              Routely
            </span>
            .
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 max-w-[28rem] text-[15px] leading-relaxed text-white/70"
          >
            Manage healthcare deliveries, routes, and operations from one
            intelligent platform.
          </motion.p>

          <motion.ul
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { delayChildren: 0.55, staggerChildren: 0.08 } },
            }}
            className="mt-7 flex flex-wrap gap-2"
          >
            {([
              { Icon: Lock,        label: "Secure Access" },
              { Icon: ShieldCheck, label: "HIPAA-Aware Operations" },
              { Icon: Zap,         label: "Real-Time Intelligence" },
            ] as const).map(({ Icon, label }) => (
              <motion.li
                key={label}
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur-md"
              >
                <Icon className="size-3 text-white/70" aria-hidden="true" />
                {label}
              </motion.li>
            ))}
          </motion.ul>
        </div>

        {/* Rabbit — anchored bottom-right of the immersive panel */}
        <div className="pointer-events-none absolute right-6 bottom-2 lg:right-10 lg:bottom-4">
          <RoutelyRabbit reducedMotion={reducedMotion} />
        </div>

        {/* Floating status cards */}
        <FloatingStatusCard
          icon={CheckCircle2}
          title="Delivery completed"
          body="Memorial Hospital · 12:42 ET"
          className="top-[24%] left-[44%] hidden lg:flex"
          delay={1.0}
          floatDelay={0}
          reducedMotion={reducedMotion}
        />
        <FloatingStatusCard
          icon={Sparkles}
          title="Route optimised"
          body="28 stops · 41.3 mi saved"
          className="top-[42%] right-[8%] hidden lg:flex"
          delay={1.25}
          floatDelay={1.2}
          reducedMotion={reducedMotion}
        />
        <FloatingStatusCard
          icon={ShieldCheck}
          title="Cold chain OK"
          body="4.2 °C · 12 packages"
          className="top-[58%] left-[36%] hidden lg:flex"
          delay={1.45}
          floatDelay={2.4}
          reducedMotion={reducedMotion}
        />
      </motion.div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Form panel — re-uses the same Clerk handlers as /login. Only the
 * presentation differs.
 * ──────────────────────────────────────────────────────────────────────────── */
function LoginContent() {
  const { isSignedIn } = useAuth();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { signOut } = useClerk();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const reducedMotion = useReducedMotion() ?? false;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [verifying, setVerifying] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState("");

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      window.location.replace("/dashboard/default");
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isSignedIn) {
    window.location.replace("/dashboard/default");
    return null;
  }

  const attemptSignIn = async (identifier: string, pwd: string) => {
    if (!signIn) throw new Error("signIn not ready");
    return await signIn.create({ identifier, password: pwd });
  };

  const sendVerificationCode = async () => {
    if (!signIn) return;
    try {
      await signIn.prepareSecondFactor({ strategy: "email_code" });
      setVerifying(true);
    } catch {
      setError("Could not send verification code. Please try again.");
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn || !verifyCode.trim()) return;
    setVerifyError("");
    setLoading(true);
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: "email_code",
        code: verifyCode.trim(),
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        window.location.replace("/dashboard/default");
      } else {
        setVerifyError("Verification incomplete. Please try again.");
      }
    } catch {
      setVerifyError("Invalid code. Please check your email and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn) return;
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await attemptSignIn(email, password);
      if ((result.status as string) === "needs_client_trust") {
        await sendVerificationCode();
        return;
      }
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        window.location.replace("/dashboard/default");
      } else {
        setError(`Sign in incomplete. (status:${result.status})`);
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ code?: string; longMessage?: string; message?: string }> };
      const code = clerkErr.errors?.[0]?.code;
      const msg = clerkErr.errors?.[0]?.longMessage ?? clerkErr.errors?.[0]?.message;
      if (code === "session_exists") {
        try {
          await signOut();
          const result = await attemptSignIn(email, password);
          if (result.status === "complete") {
            await setActive({ session: result.createdSessionId });
            window.location.replace("/dashboard/default");
            return;
          }
        } catch (retryErr) {
          const re = retryErr as { errors?: Array<{ code?: string; longMessage?: string; message?: string }> };
          const rc = re?.errors?.[0]?.code;
          if (rc === "form_password_incorrect") setError("Incorrect password. Please try again.");
          else setError(re?.errors?.[0]?.longMessage ?? "Sign in failed.");
        }
        return;
      }
      if (code === "form_password_incorrect") setError("Incorrect password. Please try again.");
      else if (code === "form_identifier_not_found") setError("No account found with this email address.");
      else if (code === "too_many_requests") setError("Too many attempts. Please wait and try again.");
      else setError(`${msg ?? "Sign in failed."} (${code ?? "unknown"})`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      {/* Top utility row */}
      <div className="pointer-events-none absolute top-5 right-6 z-30 text-muted-foreground text-sm">
        <span className="pointer-events-auto">
          Don&apos;t have an account?{" "}
          <Link
            href="https://routelypro.com/register"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Register
          </Link>
        </span>
      </div>

      <div className="grid h-dvh p-2 lg:grid-cols-[65%_35%] lg:gap-2">
        {/* Immersive — order-1 on desktop, hero band on mobile */}
        <div className="order-1 hidden h-full lg:block">
          <ImmersivePanel reducedMotion={reducedMotion} />
        </div>

        {/* Form */}
        <div className="relative order-2 flex h-full flex-col items-center justify-center bg-background">
          <div className="w-full max-w-sm px-4">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="mb-8 flex flex-col items-center gap-3"
            >
              <Image
                src="/img/routelyLogoBlack.svg"
                alt="Routely"
                width={180}
                height={60}
                className="w-36 dark:invert"
                priority
              />
              <div className="h-px w-12 bg-border" />
            </motion.div>

            {verifying ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="mb-7 space-y-1.5 text-center">
                  <h1 className="font-semibold text-2xl tracking-tight">Verify your device</h1>
                  <p className="text-muted-foreground text-sm">
                    We sent a 6-digit code to <strong>{email}</strong>. Enter it below.
                  </p>
                </div>
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="code" className="font-medium text-sm">
                      Verification code
                    </Label>
                    <Input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      placeholder="000000"
                      value={verifyCode}
                      onChange={(e) => {
                        setVerifyCode(e.target.value.replace(/\D/g, ""));
                        setVerifyError("");
                      }}
                      className="h-11 text-center font-mono text-lg tracking-widest focus-visible:border-primary focus-visible:ring-primary/30"
                      maxLength={6}
                      autoFocus
                    />
                  </div>
                  {verifyError && <p className="text-center text-destructive text-xs">{verifyError}</p>}
                  <Button
                    type="submit"
                    disabled={loading || verifyCode.length < 6}
                    className="h-11 w-full gap-1.5 font-semibold text-white shadow-lg transition-all hover:opacity-95 active:scale-[0.98]"
                    style={{ backgroundColor: "var(--primary)", boxShadow: "0 10px 32px -8px var(--primary-glow-strong)" }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Verifying…
                      </>
                    ) : (
                      <>
                        Verify
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </>
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setVerifying(false);
                      setVerifyCode("");
                      setVerifyError("");
                      setError("");
                    }}
                    className="w-full text-center text-muted-foreground text-xs hover:underline"
                  >
                    Back to login
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
              >
                <div className="mb-7 space-y-1.5 text-center">
                  <h1 className="font-semibold text-2xl tracking-tight">Welcome back</h1>
                  <p className="text-muted-foreground text-sm">
                    Sign in to your operations console.
                  </p>
                </div>

                {reason === "timeout" && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-center text-amber-700 text-xs dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    You were signed out due to inactivity.
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="font-medium text-sm">
                      Email address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError("");
                      }}
                      className="h-11 focus-visible:border-primary focus-visible:ring-primary/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="font-medium text-sm">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError("");
                        }}
                        className="h-11 pr-9 focus-visible:border-primary focus-visible:ring-primary/30"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {error && <p className="text-center text-destructive text-xs">{error}</p>}

                  <Button
                    type="submit"
                    disabled={loading}
                    className="h-11 w-full gap-1.5 font-semibold text-white shadow-lg transition-all hover:opacity-95 active:scale-[0.98]"
                    style={{ backgroundColor: "var(--primary)", boxShadow: "0 10px 32px -8px var(--primary-glow-strong)" }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Signing in…
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </>
                    )}
                  </Button>
                </form>

                {/* Trust row — mirrors the immersive panel's chips so the form
                    feels equally trustworthy on mobile, where the immersive
                    panel is hidden. */}
                <ul className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
                  {([
                    { Icon: Lock,        label: "Secure access" },
                    { Icon: ShieldCheck, label: "HIPAA-aware" },
                    { Icon: Zap,         label: "Real-time ops" },
                  ] as const).map(({ Icon, label }) => (
                    <li
                      key={label}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground"
                    >
                      <Icon className="size-3 text-muted-foreground/70" aria-hidden="true" />
                      {label}
                    </li>
                  ))}
                </ul>

                <p className="mt-6 text-center text-muted-foreground text-sm lg:hidden">
                  Don&apos;t have an account?{" "}
                  <Link
                    href="https://routelypro.com/register"
                    className="font-medium underline-offset-4 hover:underline"
                    style={{ color: "var(--primary)" }}
                  >
                    Register
                  </Link>
                </p>
              </motion.div>
            )}
          </div>

          <div className="absolute right-6 bottom-5 left-6 flex items-center justify-between text-muted-foreground text-xs">
            <p>&copy; 2026 Routely LLC</p>
            <p className="hidden sm:block">Innovation lab · v2</p>
          </div>
        </div>
      </div>

      {/* Mobile hero band — shown only below lg. A condensed taste of the
          immersive panel so the page still feels alive on phones. */}
      <div className="fixed inset-x-0 top-0 z-0 h-[34vh] overflow-hidden lg:hidden">
        <ImmersivePanel reducedMotion={reducedMotion} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/30 to-background" />
      </div>
    </div>
  );
}

export default function LoginV2Page() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
