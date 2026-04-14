const ROUTE_COLORS: Record<string, { bg: string; text: string; border: string; glow: string; emoji: string }> = {
  "CENTRAL FL": {
    bg: "#fff0f8",
    text: "#c0006a",
    border: "#f9a8d4",
    glow: "rgba(254,33,139,0.20)",
    emoji: "\u{1F306}",
  },
  "SOUTH FL": { bg: "#fffff0", text: "#7a7200", border: "#fde68a", glow: "rgba(253,255,43,0.25)", emoji: "\u{1F334}" },
  "DEERFIELD FL": {
    bg: "#edfcff",
    text: "#0079a8",
    border: "#a5f3fc",
    glow: "rgba(10,239,255,0.20)",
    emoji: "\u{1F98C}",
  },
  "NORTH FL": { bg: "#edfff5", text: "#007a4a", border: "#6ee7b7", glow: "rgba(10,255,104,0.20)", emoji: "\u{1F33F}" },
};
const FALLBACKS = [
  { bg: "#f4f0ff", text: "#5b21b6", border: "#c4b5fd", glow: "rgba(139,92,246,0.15)", emoji: "\u{1F52E}" },
  { bg: "#fff4ed", text: "#c2410c", border: "#fdba74", glow: "rgba(249,115,22,0.15)", emoji: "\u{1F525}" },
  { bg: "#edfcfa", text: "#0f766e", border: "#99f6e4", glow: "rgba(20,184,166,0.15)", emoji: "\u{1F48E}" },
  { bg: "#fdf4ff", text: "#7e22ce", border: "#e9d5ff", glow: "rgba(168,85,247,0.15)", emoji: "\u26A1" },
];
const _cache: Record<string, (typeof FALLBACKS)[0]> = {};
let _idx = 0;

export function getRouteColor(route?: string) {
  if (!route) return { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0", glow: "transparent", emoji: "\u{1F4CD}" };
  const up = route.toUpperCase();
  for (const [k, v] of Object.entries(ROUTE_COLORS)) if (up.includes(k)) return v;
  if (!_cache[route]) {
    _cache[route] = FALLBACKS[_idx % FALLBACKS.length];
    _idx++;
  }
  return _cache[route];
}

export function RouteBadge({ route, size = "sm" }: { route?: string; size?: "xs" | "sm" | "md" }) {
  if (!route) return <span className="text-[10px] text-muted-foreground/40">{"\u2014"}</span>;
  const c = getRouteColor(route);
  const cls =
    size === "xs" ? "px-1.5 py-0.5 text-[9px]" : size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, boxShadow: `0 0 6px ${c.glow}` }}
      className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full font-bold ${cls}`}
    >
      {c.emoji} <span className="truncate">{route}</span>
    </span>
  );
}
