"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { AGENTS, Agent, PROVIDER_COLORS, STATUS_COLORS } from "@/lib/virtual-office/agents";
import { AgentDetailsPanel } from "@/components/virtual-office/AgentDetailsPanel";
import { ActivityFeed } from "@/components/virtual-office/ActivityFeed";
import { ZoomIn, ZoomOut, Maximize2, RefreshCw } from "lucide-react";

// Shared zoom state — passed to scene
export type ZoomCmd = "in" | "out" | "reset" | null;

const ThreeOfficeScene = dynamic(
  () => import("@/components/virtual-office/ThreeOfficeScene").then(m => ({ default: m.ThreeOfficeScene })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-background rounded-xl">
        <div className="flex flex-col items-center gap-4">
          <div className="relative size-12">
            <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
            <div className="size-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Loading 3D office…</p>
        </div>
      </div>
    ),
  }
);

const PROVIDERS = [
  { id: "all",     label: "All" },
  { id: "claude",  label: "Claude",  color: "#8B5CF6" },
  { id: "openai",  label: "OpenAI",  color: "#10A37F" },
  { id: "routely", label: "Routely", color: "#0167FF" },
];

export function VirtualOfficeClient() {
  const [sel,     setSel]     = useState<Agent | null>(null);
  const [fp,      setFp]      = useState("all");
  const [key,     setKey]     = useState(0);
  const [isDark,  setIsDark]  = useState(false);
  const [zoomCmd, setZoomCmd] = useState<ZoomCmd>(null);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const handleAgentClick = useCallback((agent: Agent) => {
    setSel(prev => prev?.id === agent.id ? null : agent);
  }, []);

  const sendZoom = (cmd: ZoomCmd) => {
    setZoomCmd(cmd);
    setTimeout(() => setZoomCmd(null), 50);
  };

  return (
    <div className="flex gap-3 h-full min-h-0">

      {/* ── 3D Canvas ── */}
      <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-border relative shadow-sm">
        <ThreeOfficeScene
          key={key}
          onAgentClick={handleAgentClick}
          selectedAgentId={sel?.id || null}
          isDark={isDark}
          zoomCmd={zoomCmd}
        />

        {/* Filter pills — floating top left */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-background/80 backdrop-blur-sm rounded-xl px-2 py-1.5 border border-border shadow-sm">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => setFp(p.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                fp === p.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={fp === p.id && (p as { color?: string }).color
                ? { backgroundColor: (p as { color?: string }).color, color: "#fff" }
                : {}}
            >
              {p.id !== "all" && <span className="inline-block size-1.5 rounded-full mr-1" style={{ backgroundColor: fp === p.id ? "#fff" : (p as { color?: string }).color }} />}
              {p.label}
            </button>
          ))}
        </div>

        {/* Zoom controls — floating bottom right */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1 bg-background/80 backdrop-blur-sm rounded-xl p-1.5 border border-border shadow-sm">
          <button onClick={() => sendZoom("in")}    className="size-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" title="Zoom in">
            <ZoomIn className="size-4 text-foreground/70" />
          </button>
          <button onClick={() => sendZoom("out")}   className="size-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" title="Zoom out">
            <ZoomOut className="size-4 text-foreground/70" />
          </button>
          <div className="h-px bg-border mx-1" />
          <button onClick={() => sendZoom("reset")} className="size-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" title="Fit view">
            <Maximize2 className="size-4 text-foreground/70" />
          </button>
          <button onClick={() => { setSel(null); setKey(k => k + 1); }} className="size-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" title="Reload">
            <RefreshCw className="size-4 text-foreground/70" />
          </button>
        </div>

        {/* Provider legend — floating bottom left */}
        <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 bg-background/80 backdrop-blur-sm rounded-xl p-2.5 border border-border shadow-sm">
          {[
            { label: "Claude", color: "#8B5CF6" },
            { label: "OpenAI", color: "#10A37F" },
            { label: "Routely", color: "#0167FF" },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ backgroundColor: item.color, boxShadow: `0 0 4px ${item.color}` }} />
              <span className="text-[10px] text-muted-foreground font-medium">{item.label}</span>
            </div>
          ))}
        </div>

        {/* Hint */}
        <div className="absolute top-3 right-3 bg-background/70 backdrop-blur-sm rounded-lg px-2.5 py-1.5 border border-border">
          <p className="text-[10px] text-muted-foreground">Drag · Scroll · Right-click pan</p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="w-64 shrink-0 rounded-2xl border border-border bg-card overflow-hidden flex flex-col shadow-sm">
        {sel
          ? <AgentDetailsPanel agent={sel} onClose={() => setSel(null)} />
          : <ActivityFeed />
        }

        {/* Agent roster */}
        <div className="px-3 pb-3 pt-1 border-t border-border flex flex-wrap gap-1">
          {AGENTS
            .filter(a => fp === "all" || a.provider === fp)
            .map(a => {
              const pc = PROVIDER_COLORS[a.provider];
              const sc = STATUS_COLORS[a.status];
              return (
                <button
                  key={a.id}
                  onClick={() => setSel(p => p?.id === a.id ? null : a)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition-all ${
                    sel?.id === a.id ? "border-primary/40 bg-primary/8" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <span className="size-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                    style={{ backgroundColor: pc.primary + "20", color: pc.primary }}>
                    {a.avatar}
                  </span>
                  <span className="text-[10px] text-foreground/70 font-medium">{a.name}</span>
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: sc }} />
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
