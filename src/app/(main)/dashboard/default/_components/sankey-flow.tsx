"use client";

import { brandAlpha } from "@/lib/brand";

import { useCallback, useMemo, useRef, useState } from "react";

import { motion } from "framer-motion";

import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { DashboardData, DashboardStop } from "./_types";
// Terminal (delivered/failed) classification = Spoke's success boolean via the
// canonical classifier (lib/status.ts) — same as KPIs + monitor. IN_TRANSIT_ST
// below is only the PRE-terminal flow split (assigned vs in-transit), not a
// success/fail decision.
import { isDelivered, isFailed, isTerminal } from "@/lib/status";

const IN_TRANSIT_ST = ["in_transit", "out_for_delivery", "dispatched"];

// ── Desktop canvas ───────────────────────────────────────────────────
const W = 900,
  H = 370;
const PC_X = 18,
  PC_W = 140,
  PC_H = 134,
  PC_CY = H / 2;
const PC_RX = PC_X + PC_W;
const CC_W = 168,
  CC_H = 104;
const CC_X = 388;
const CC_RX = CC_X + CC_W;
const RC_X = 712,
  RC_W = 164,
  RC_H = 104;

// ── Mobile canvas — full width, desktop-proportional column spacing ──
// Desktop proportions: total(15.6%) gap1(25.6%) center(18.7%) gap2(17.3%) right(18.2%)
// Scaled to WM=360 → gap1≈88px, gap2≈46px → ribbons have real room to breathe
const WM = 360,
  HM = 255;
const M_PC_X = 4,
  M_PC_W = 60,
  M_PC_H = 70,
  M_PC_CY = HM / 2;
const M_PC_RX = M_PC_X + M_PC_W; // 64
const M_CC_W = 82,
  M_CC_H = 54;
const M_CC_X = 152; // 64 + 88 gap
const M_CC_RX = M_CC_X + M_CC_W; // 234
const M_RC_X = 280; // 234 + 46 gap
const M_RC_W = 76,
  M_RC_H = 54; // right edge 356, 4px margin

function yCenters(n: number, cardH: number): number[] {
  if (n === 1) return [H / 2];
  // Tighter vertical spacing = more cinematic feel
  const totalUsed = n * cardH;
  const gap = (H - totalUsed) / (n + 1);
  return Array.from({ length: n }, (_, i) => gap * (i + 1) + cardH * i + cardH / 2);
}
const [CY0, CY1, CY2] = yCenters(3, CC_H);
const [RY0, RY1] = yCenters(2, RC_H);

function yCentersM(n: number, cardH: number): number[] {
  if (n === 1) return [HM / 2];
  const totalUsed = n * cardH;
  const gap = (HM - totalUsed) / (n + 1);
  return Array.from({ length: n }, (_, i) => gap * (i + 1) + cardH * i + cardH / 2);
}
const [MCY0, MCY1, MCY2] = yCentersM(3, M_CC_H);
// Align right cards with top/bottom center cards — equal visual span
const MRY0 = MCY0;
const MRY1 = MCY2;

const mxp = (x: number) => `${(x / WM) * 100}%`;
const myp = (y: number) => `${(y / HM) * 100}%`;
const mwp = (v: number) => `${(v / WM) * 100}%`;
const mhp = (v: number) => `${(v / HM) * 100}%`;

function ribbon(x1: number, y1: number, h1: number, x2: number, y2: number, h2: number): string {
  // Cubic bezier for smooth S-curves
  const cx = (x1 + x2) / 2,
    a = h1 / 2,
    b = h2 / 2;
  return [
    `M${x1} ${y1 - a}`,
    `C${cx} ${y1 - a} ${cx} ${y2 - b} ${x2} ${y2 - b}`,
    `L${x2} ${y2 + b}`,
    `C${cx} ${y2 + b} ${cx} ${y1 + a} ${x1} ${y1 + a}`,
    "Z",
  ].join(" ");
}

// Ribbon thickness: square-root scale, capped at 48% of card height
function rh(n: number, total: number, cardH: number, minPx = 10): number {
  if (!total || n <= 0) return minPx;
  const maxPx = cardH * 0.48;
  return Math.max(minPx, Math.min(maxPx, Math.sqrt(n / total) * maxPx));
}

const xp = (x: number) => `${(x / W) * 100}%`;
const yp = (y: number) => `${(y / H) * 100}%`;
const wp = (v: number) => `${(v / W) * 100}%`;
const hp = (v: number) => `${(v / H) * 100}%`;

// ── MagicCard ──────────────────────────────────────────────────────────
function MagicCard({
  children,
  className,
  spot = "rgba(255,255,255,0.22)",
}: {
  children: React.ReactNode;
  className?: string;
  spot?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hov, setHov] = useState(false);
  const move = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  }, []);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: decorative hover-spotlight effect, not user-interactive
    <div
      ref={ref}
      onMouseMove={move}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={cn("group relative overflow-hidden", className)}
    >
      <div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
        style={{
          opacity: hov ? 1 : 0,
          background: `radial-gradient(circle 70px at ${pos.x}px ${pos.y}px,${spot},transparent 70%)`,
        }}
      />
      {children}
    </div>
  );
}

// ── Total card (left) ──────────────────────────────────────────────────
function TotalCard({ count }: { count: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16, scale: 0.82 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.65, type: "spring", stiffness: 180, damping: 18 }}
      style={{ position: "absolute", left: xp(PC_X), top: yp(PC_CY - PC_H / 2), width: wp(PC_W), height: hp(PC_H) }}
    >
      <MagicCard
        spot={brandAlpha(0.20)}
        className="flex h-full cursor-default flex-col justify-between rounded-2xl border border-primary/20 bg-card/95 p-3.5 shadow-md backdrop-blur-sm"
      >
        <p className="font-semibold text-[10px] text-muted-foreground/55 uppercase leading-none tracking-[0.18em]">
          Total
        </p>
        <p
          className="font-black text-foreground tabular-nums leading-none tracking-tight"
          style={{ fontSize: "clamp(18px, 2.2vw, 26px)" }}
        >
          {count}
        </p>
        <p className="font-medium text-[10px] text-muted-foreground/45 uppercase leading-none tracking-wide">stops</p>
      </MagicCard>
    </motion.div>
  );
}

// ── Center card (pink gradient) ────────────────────────────────────────
function CenterCard({
  cy,
  count,
  label,
  stat,
  delay,
}: {
  cy: number;
  count: number;
  label: string;
  stat: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.6, delay, type: "spring", stiffness: 190, damping: 18 }}
      style={{ position: "absolute", left: xp(CC_X), top: yp(cy - CC_H / 2), width: wp(CC_W), height: hp(CC_H) }}
    >
      <MagicCard
        spot="rgba(255,255,255,0.26)"
        className="flex h-full cursor-default flex-col justify-between rounded-xl bg-gradient-to-br from-[#FF6B8A] via-[#FF7DC8] to-[#FF95E8] px-3 py-2.5 shadow-[0_4px_18px_rgba(255,107,138,0.40)] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_8px_26px_rgba(255,107,138,0.52)]"
      >
        <p className="font-bold text-[10px] text-white/65 uppercase leading-none tracking-[0.14em]">{label}</p>
        <p className="font-black text-white tabular-nums leading-none" style={{ fontSize: "clamp(16px, 1.9vw, 22px)" }}>
          {count}
        </p>
        <p className="font-medium text-[7.5px] text-white/50 leading-none tracking-wide">{stat}</p>
      </MagicCard>
    </motion.div>
  );
}

// ── Right card (blue-purple gradient) ─────────────────────────────────
function RightCard({
  cy,
  count,
  label,
  stat,
  delay,
  isDelivered,
}: {
  cy: number;
  count: number;
  label: string;
  stat: string;
  delay: number;
  isDelivered: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.6, delay, type: "spring", stiffness: 190, damping: 18 }}
      style={{ position: "absolute", left: xp(RC_X), top: yp(cy - RC_H / 2), width: wp(RC_W), height: hp(RC_H) }}
    >
      <MagicCard
        spot="rgba(255,255,255,0.20)"
        className={cn(
          "flex h-full cursor-default flex-col justify-between rounded-xl px-3 py-2.5 transition-all duration-200 hover:-translate-y-px",
          isDelivered
            ? "bg-gradient-to-br from-[#0F49FB] via-[#3669FF] to-[#7260D6] shadow-[0_4px_18px_rgba(15,73,251,0.42)] hover:shadow-[0_8px_26px_rgba(15,73,251,0.55)]"
            : "bg-gradient-to-br from-[#5B3DD6] via-[#8040FF] to-[#B03DD1] shadow-[0_4px_18px_rgba(91,61,214,0.38)] hover:shadow-[0_8px_26px_rgba(91,61,214,0.52)]",
        )}
      >
        <p className="font-bold text-[10px] text-white/65 uppercase leading-none tracking-[0.14em]">{label}</p>
        <p className="font-black text-white tabular-nums leading-none" style={{ fontSize: "clamp(16px, 1.9vw, 22px)" }}>
          {count}
        </p>
        <p className="font-medium text-[7.5px] text-white/50 leading-none tracking-wide">{stat}</p>
      </MagicCard>
    </motion.div>
  );
}

function derive(stops: DashboardStop[]) {
  const total = stops.length;
  // Terminal buckets — Spoke boolean (canonical), identical to KPIs + monitor.
  const delivered = stops.filter(isDelivered).length;
  const failed = stops.filter(isFailed).length;
  // Pre-terminal flow split (non-terminal stops only): unassigned → assigned → in-transit.
  const pre = stops.filter((s) => !isTerminal(s));
  const in_transit = pre.filter((s) => IN_TRANSIT_ST.includes(s.status)).length;
  const assigned = pre.filter((s) => s.driver_id && !IN_TRANSIT_ST.includes(s.status)).length;
  const unassigned = pre.filter((s) => !s.driver_id && !IN_TRANSIT_ST.includes(s.status)).length;
  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}% of total` : "—");
  return {
    total,
    unassigned,
    assigned,
    in_transit,
    delivered,
    failed,
    stats: {
      unassigned: pct(unassigned),
      assigned: pct(assigned),
      in_transit: pct(in_transit),
      delivered: total > 0 ? `${Math.round((delivered / total) * 100)}% success` : "—",
      failed: total > 0 ? `${Math.round((failed / total) * 100)}% failure` : "—",
    },
  };
}

export function SankeyFlow({ data, loading }: { data?: DashboardData; loading: boolean }) {
  const [hov, setHov] = useState<string | null>(null);
  const stops = data?.stops ?? [];
  const flow = useMemo(() => derive(stops), [stops]);
  const T = Math.max(flow.total, 1);
  const empty = flow.total === 0;

  const ribbons = useMemo(() => {
    const arr: Array<{ id: string; d: string; fill: string; z: number }> = [];

    // Ribbons from Total card: origins are spread proportionally within PC_H
    // so they never exceed the card boundary and look centered + harmonic
    const lcU = rh(flow.unassigned, T, CC_H);
    const lcA = rh(flow.assigned, T, CC_H);
    const lcI = rh(flow.in_transit, T, CC_H);

    // All 3 ribbons originate from the SAME center point of Total card
    // srcW bigger = more visible, but still fits within card
    const srcW = Math.min(Math.min(lcU, lcA, lcI), PC_H * 0.44);

    arr.push({ id: "lc0", z: 1, fill: "url(#glc0)", d: ribbon(PC_RX, PC_CY, srcW, CC_X, CY0, lcU * 1.3) });
    arr.push({ id: "lc1", z: 2, fill: "url(#glc1)", d: ribbon(PC_RX, PC_CY, srcW, CC_X, CY1, lcA * 1.3) });
    arr.push({ id: "lc2", z: 3, fill: "url(#glc2)", d: ribbon(PC_RX, PC_CY, srcW, CC_X, CY2, lcI * 1.3) });

    // Center → Right: powerful wide ribbons
    const cr = CC_H * 0.46;
    arr.push({ id: "cr00", z: 2, fill: "url(#gcrd)", d: ribbon(CC_RX, CY0, cr, RC_X, RY0, cr) });
    arr.push({ id: "cr10", z: 3, fill: "url(#gcrd)", d: ribbon(CC_RX, CY1, cr * 0.9, RC_X, RY0, cr * 0.9) });
    arr.push({ id: "cr20", z: 5, fill: "url(#gcrd)", d: ribbon(CC_RX, CY2, cr * 0.76, RC_X, RY0, cr * 0.76) });

    const cf = CC_H * 0.3;
    arr.push({ id: "cr02", z: 4, fill: "url(#gcrf)", d: ribbon(CC_RX, CY0, cf * 0.72, RC_X, RY1, cf * 0.72) });
    arr.push({ id: "cr12", z: 3, fill: "url(#gcrf)", d: ribbon(CC_RX, CY1, cf * 0.88, RC_X, RY1, cf * 0.88) });
    arr.push({ id: "cr22", z: 2, fill: "url(#gcrf)", d: ribbon(CC_RX, CY2, cf, RC_X, RY1, cf) });
    return arr;
  }, [flow, T]);

  if (loading) {
    return (
      <Card className="border-0 shadow-sm ring-1 ring-border">
        <div className="m-3 h-[240px] animate-pulse rounded-xl bg-muted/20" />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-0 bg-card shadow-sm ring-1 ring-border">
      {/* Header — same CardHeader pattern as Stop Pipeline */}
      <CardHeader className="pb-3">
        <CardTitle className="font-semibold leading-none">Stop Flow Chart</CardTitle>
        <CardDescription>
          {empty ? "Real-time stop progression" : `${flow.total} stops · ${flow.delivered} delivered`}
        </CardDescription>
        <CardAction>
          <div className="flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1 ring-1 ring-primary/20">
            <div className="size-1.5 animate-pulse rounded-full bg-primary" />
            <span className="font-semibold text-[10px] text-primary">Live</span>
          </div>
        </CardAction>
      </CardHeader>

      {/* ── Mobile SVG Sankey ── same 3-col flow, portrait canvas, no stat text ── */}
      <div className="px-1.5 pt-1 pb-3 sm:hidden">
        {empty ? (
          <div className="flex h-[100px] items-center justify-center text-muted-foreground/40 text-sm">
            No stops today
          </div>
        ) : (
          <div style={{ position: "relative", width: "100%", paddingTop: `${(HM / WM) * 100}%` }}>
            <div style={{ position: "absolute", inset: 0 }}>
              {/* Mobile SVG ribbons — same gradients, mobile-specific IDs */}
              <svg
                viewBox={`0 0 ${WM} ${HM}`}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden" }}
                preserveAspectRatio="none"
                role="img"
                aria-label="Stop flow Sankey chart (mobile)"
              >
                <title>Stop flow Sankey chart</title>
                <defs>
                  <clipPath id="sfclip-m">
                    <rect x={0} y={0} width={WM} height={HM} />
                  </clipPath>
                  <linearGradient id="glc0-m" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#FF6B8A" stopOpacity="0.82" />
                    <stop offset="100%" stopColor="#FF80C8" stopOpacity="0.78" />
                  </linearGradient>
                  <linearGradient id="glc1-m" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#FF7DC8" stopOpacity="0.78" />
                    <stop offset="100%" stopColor="#0F49FB" stopOpacity="0.72" />
                  </linearGradient>
                  <linearGradient id="glc2-m" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#FF95E8" stopOpacity="0.72" />
                    <stop offset="100%" stopColor="#55D9FB" stopOpacity="0.68" />
                  </linearGradient>
                  <linearGradient id="gcrd-m" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7260D6" stopOpacity="0.65" />
                    <stop offset="100%" stopColor="#55D9FB" stopOpacity="0.78" />
                  </linearGradient>
                  <linearGradient id="gcrf-m" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#FF7DC8" stopOpacity="0.62" />
                    <stop offset="100%" stopColor="#8040FF" stopOpacity="0.70" />
                  </linearGradient>
                  <linearGradient id="sfshim-m" x1="-0.5" y1="0" x2="0.5" y2="0" gradientUnits="objectBoundingBox">
                    <stop offset="0%" stopColor="white" stopOpacity="0" />
                    <stop offset="50%" stopColor="white" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                    <animateTransform
                      attributeName="gradientTransform"
                      type="translate"
                      from="-2 0"
                      to="3 0"
                      dur="4s"
                      repeatCount="indefinite"
                    />
                  </linearGradient>
                  <filter id="sfglow-m" x="-4%" y="-8%" width="108%" height="116%">
                    <feGaussianBlur stdDeviation="1.8" result="blur" />
                    <feColorMatrix in="blur" type="saturate" values="1.4" result="saturated" />
                    <feMerge>
                      <feMergeNode in="saturated" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <g clipPath="url(#sfclip-m)">
                  {/* Total → Center ribbons */}
                  {[
                    {
                      id: "mlc0",
                      fill: "url(#glc0-m)",
                      d: ribbon(
                        M_PC_RX,
                        M_PC_CY,
                        rh(flow.unassigned, T, M_CC_H) * 0.9,
                        M_CC_X,
                        MCY0,
                        rh(flow.unassigned, T, M_CC_H),
                      ),
                    },
                    {
                      id: "mlc1",
                      fill: "url(#glc1-m)",
                      d: ribbon(
                        M_PC_RX,
                        M_PC_CY,
                        rh(flow.assigned, T, M_CC_H) * 0.9,
                        M_CC_X,
                        MCY1,
                        rh(flow.assigned, T, M_CC_H),
                      ),
                    },
                    {
                      id: "mlc2",
                      fill: "url(#glc2-m)",
                      d: ribbon(
                        M_PC_RX,
                        M_PC_CY,
                        rh(flow.in_transit, T, M_CC_H) * 0.9,
                        M_CC_X,
                        MCY2,
                        rh(flow.in_transit, T, M_CC_H),
                      ),
                    },
                    /* Center → Right ribbons */
                    {
                      id: "mcr00",
                      fill: "url(#gcrd-m)",
                      d: ribbon(M_CC_RX, MCY0, M_CC_H * 0.42, M_RC_X, MRY0, M_CC_H * 0.42),
                    },
                    {
                      id: "mcr10",
                      fill: "url(#gcrd-m)",
                      d: ribbon(M_CC_RX, MCY1, M_CC_H * 0.38, M_RC_X, MRY0, M_CC_H * 0.38),
                    },
                    {
                      id: "mcr20",
                      fill: "url(#gcrd-m)",
                      d: ribbon(M_CC_RX, MCY2, M_CC_H * 0.32, M_RC_X, MRY0, M_CC_H * 0.32),
                    },
                    {
                      id: "mcr02",
                      fill: "url(#gcrf-m)",
                      d: ribbon(M_CC_RX, MCY0, M_CC_H * 0.28, M_RC_X, MRY1, M_CC_H * 0.28),
                    },
                    {
                      id: "mcr12",
                      fill: "url(#gcrf-m)",
                      d: ribbon(M_CC_RX, MCY1, M_CC_H * 0.34, M_RC_X, MRY1, M_CC_H * 0.34),
                    },
                    {
                      id: "mcr22",
                      fill: "url(#gcrf-m)",
                      d: ribbon(M_CC_RX, MCY2, M_CC_H * 0.38, M_RC_X, MRY1, M_CC_H * 0.38),
                    },
                  ].map((r, i) => (
                    <motion.path
                      key={r.id}
                      d={r.d}
                      fill={r.fill}
                      filter="url(#sfglow-m)"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.9 }}
                      transition={{ duration: 0.45, delay: 0.04 + i * 0.03 }}
                    />
                  ))}
                  {/* Shim overlay */}
                  {[
                    ribbon(
                      M_PC_RX,
                      M_PC_CY,
                      rh(flow.unassigned, T, M_CC_H) * 0.9,
                      M_CC_X,
                      MCY0,
                      rh(flow.unassigned, T, M_CC_H),
                    ),
                    ribbon(
                      M_PC_RX,
                      M_PC_CY,
                      rh(flow.assigned, T, M_CC_H) * 0.9,
                      M_CC_X,
                      MCY1,
                      rh(flow.assigned, T, M_CC_H),
                    ),
                    ribbon(
                      M_PC_RX,
                      M_PC_CY,
                      rh(flow.in_transit, T, M_CC_H) * 0.9,
                      M_CC_X,
                      MCY2,
                      rh(flow.in_transit, T, M_CC_H),
                    ),
                    ribbon(M_CC_RX, MCY0, M_CC_H * 0.42, M_RC_X, MRY0, M_CC_H * 0.42),
                    ribbon(M_CC_RX, MCY1, M_CC_H * 0.38, M_RC_X, MRY0, M_CC_H * 0.38),
                    ribbon(M_CC_RX, MCY2, M_CC_H * 0.32, M_RC_X, MRY0, M_CC_H * 0.32),
                    ribbon(M_CC_RX, MCY0, M_CC_H * 0.28, M_RC_X, MRY1, M_CC_H * 0.28),
                    ribbon(M_CC_RX, MCY1, M_CC_H * 0.34, M_RC_X, MRY1, M_CC_H * 0.34),
                    ribbon(M_CC_RX, MCY2, M_CC_H * 0.38, M_RC_X, MRY1, M_CC_H * 0.38),
                  ].map((d, i) => (
                    <path
                      key={`msh_${i}`}
                      d={d}
                      fill="url(#sfshim-m)"
                      style={{ pointerEvents: "none" } as React.CSSProperties}
                    />
                  ))}
                </g>
              </svg>

              {/* Total card */}
              <motion.div
                initial={{ opacity: 0, x: -10, scale: 0.86 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.6, type: "spring", stiffness: 180, damping: 18 }}
                style={{
                  position: "absolute",
                  left: mxp(M_PC_X),
                  top: myp(M_PC_CY - M_PC_H / 2),
                  width: mwp(M_PC_W),
                  height: mhp(M_PC_H),
                }}
              >
                <MagicCard
                  spot={brandAlpha(0.18)}
                  className="flex h-full cursor-default flex-col justify-between rounded-2xl border border-primary/20 bg-card/95 p-2.5 shadow-md backdrop-blur-sm"
                >
                  <span className="font-semibold text-[7.5px] text-muted-foreground/55 leading-none tracking-wide">
                    Stop
                  </span>
                  <span className="font-black text-xl text-foreground tabular-nums leading-none tracking-tight">
                    {flow.total}
                  </span>
                </MagicCard>
              </motion.div>

              {/* Center 3 cards — pink gradients, label + number only */}
              {(
                [
                  { cy: MCY0, count: flow.unassigned, label: "Unassigned", delay: 0.12 },
                  { cy: MCY1, count: flow.assigned, label: "Assigned", delay: 0.18 },
                  { cy: MCY2, count: flow.in_transit, label: "In Transit", delay: 0.24 },
                ] as const
              ).map((c) => (
                <motion.div
                  key={c.label}
                  initial={{ opacity: 0, scale: 0.82, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: c.delay, type: "spring", stiffness: 190, damping: 18 }}
                  style={{
                    position: "absolute",
                    left: mxp(M_CC_X),
                    top: myp(c.cy - M_CC_H / 2),
                    width: mwp(M_CC_W),
                    height: mhp(M_CC_H),
                  }}
                >
                  <MagicCard
                    spot="rgba(255,255,255,0.24)"
                    className="flex h-full cursor-default flex-col justify-between rounded-xl bg-gradient-to-br from-[#FF6B8A] via-[#FF7DC8] to-[#FF95E8] p-2.5 shadow-[0_3px_14px_rgba(255,107,138,0.38)]"
                  >
                    <span className="font-semibold text-[7.5px] text-white/65 leading-none">{c.label}</span>
                    <span className="font-black text-lg text-white tabular-nums leading-none">{c.count}</span>
                  </MagicCard>
                </motion.div>
              ))}

              {/* Right 2 cards — blue/purple gradients */}
              {(
                [
                  {
                    cy: MRY0,
                    count: flow.delivered,
                    label: "Delivered",
                    delay: 0.32,
                    cls: "from-[#0F49FB] via-[#3669FF] to-[#7260D6] shadow-[0_3px_14px_rgba(15,73,251,0.36)]",
                  },
                  {
                    cy: MRY1,
                    count: flow.failed,
                    label: "Failed",
                    delay: 0.38,
                    cls: "from-[#5B3DD6] via-[#8040FF] to-[#B03DD1] shadow-[0_3px_14px_rgba(91,61,214,0.33)]",
                  },
                ] as const
              ).map((c) => (
                <motion.div
                  key={c.label}
                  initial={{ opacity: 0, scale: 0.82, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: c.delay, type: "spring", stiffness: 190, damping: 18 }}
                  style={{
                    position: "absolute",
                    left: mxp(M_RC_X),
                    top: myp(c.cy - M_RC_H / 2),
                    width: mwp(M_RC_W),
                    height: mhp(M_RC_H),
                  }}
                >
                  <MagicCard
                    spot="rgba(255,255,255,0.18)"
                    className={cn(
                      "flex h-full cursor-default flex-col justify-between rounded-xl bg-gradient-to-br p-2.5",
                      c.cls,
                    )}
                  >
                    <span className="font-semibold text-[7.5px] text-white/65 leading-none">{c.label}</span>
                    <span className="font-black text-lg text-white tabular-nums leading-none">{c.count}</span>
                  </MagicCard>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Desktop layout ── hidden on mobile, full SVG Sankey ── */}
      <div className="hidden px-2 pt-1 pb-3 sm:block">
        {empty ? (
          <div className="flex h-[120px] items-center justify-center text-muted-foreground/40 text-sm">
            No stops today
          </div>
        ) : (
          // paddingTop = H/W keeps aspect ratio on desktop.
          // On narrow mobile the SVG shrinks proportionally — clamp() fonts stay readable.
          <div style={{ position: "relative", width: "100%", paddingTop: `${(H / W) * 100}%` }}>
            <div style={{ position: "absolute", inset: 0 }}>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden" }}
                preserveAspectRatio="none"
                role="img"
                aria-label="Stop flow Sankey chart"
              >
                <title>Stop flow Sankey chart</title>
                <defs>
                  <clipPath id="sfclip">
                    <rect x={0} y={0} width={W} height={H} />
                  </clipPath>
                  <linearGradient id="glc0" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#FF6B8A" stopOpacity="0.82" />
                    <stop offset="100%" stopColor="#FF80C8" stopOpacity="0.78" />
                  </linearGradient>
                  <linearGradient id="glc1" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#FF7DC8" stopOpacity="0.78" />
                    <stop offset="100%" stopColor="#0F49FB" stopOpacity="0.72" />
                  </linearGradient>
                  <linearGradient id="glc2" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#FF95E8" stopOpacity="0.72" />
                    <stop offset="100%" stopColor="#55D9FB" stopOpacity="0.68" />
                  </linearGradient>
                  <linearGradient id="gcrd" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7260D6" stopOpacity="0.65" />
                    <stop offset="100%" stopColor="#55D9FB" stopOpacity="0.78" />
                  </linearGradient>
                  <linearGradient id="gcrf" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#FF7DC8" stopOpacity="0.62" />
                    <stop offset="100%" stopColor="#8040FF" stopOpacity="0.70" />
                  </linearGradient>
                  <linearGradient id="sfshim" x1="-0.5" y1="0" x2="0.5" y2="0" gradientUnits="objectBoundingBox">
                    <stop offset="0%" stopColor="white" stopOpacity="0" />
                    <stop offset="50%" stopColor="white" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                    <animateTransform
                      attributeName="gradientTransform"
                      type="translate"
                      from="-2 0"
                      to="3 0"
                      dur="4s"
                      repeatCount="indefinite"
                    />
                  </linearGradient>
                  <filter id="sfglow" x="-4%" y="-8%" width="108%" height="116%">
                    <feGaussianBlur stdDeviation="2.2" result="blur" />
                    <feColorMatrix in="blur" type="saturate" values="1.4" result="saturated" />
                    <feMerge>
                      <feMergeNode in="saturated" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <g clipPath="url(#sfclip)">
                  {[...ribbons]
                    .sort((a, b) => a.z - b.z)
                    .map((r, i) => (
                      <motion.path
                        key={r.id}
                        d={r.d}
                        fill={r.fill}
                        filter="url(#sfglow)"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: hov === null ? 0.94 : hov === r.id ? 1 : 0.12 }}
                        transition={{ duration: 0.45, delay: 0.04 + i * 0.03 }}
                        onMouseEnter={() => setHov(r.id)}
                        onMouseLeave={() => setHov(null)}
                        style={{ cursor: "pointer" } as React.CSSProperties}
                      />
                    ))}
                  {ribbons.map((r) => (
                    <path
                      key={`sh_${r.id}`}
                      d={r.d}
                      fill="url(#sfshim)"
                      style={{ pointerEvents: "none" } as React.CSSProperties}
                    />
                  ))}
                </g>
              </svg>

              <TotalCard count={flow.total} />
              <CenterCard
                cy={CY0}
                count={flow.unassigned}
                label="Unassigned"
                stat={flow.stats.unassigned}
                delay={0.14}
              />
              <CenterCard cy={CY1} count={flow.assigned} label="Assigned" stat={flow.stats.assigned} delay={0.2} />
              <CenterCard
                cy={CY2}
                count={flow.in_transit}
                label="In Transit"
                stat={flow.stats.in_transit}
                delay={0.26}
              />
              <RightCard
                cy={RY0}
                count={flow.delivered}
                label="Delivered"
                stat={flow.stats.delivered}
                delay={0.38}
                isDelivered={true}
              />
              <RightCard
                cy={RY1}
                count={flow.failed}
                label="Failed"
                stat={flow.stats.failed}
                delay={0.44}
                isDelivered={false}
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
