"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { AGENTS, Agent, PROVIDER_COLORS, STATUS_COLORS } from "@/lib/virtual-office/agents";
import { AgentDetailsPanel } from "@/components/virtual-office/AgentDetailsPanel";
import { ActivityFeed } from "@/components/virtual-office/ActivityFeed";
import { Bot, Cpu, Phone, AlertTriangle, RefreshCw, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const ThreeOfficeScene = dynamic(
  () => import("@/components/virtual-office/ThreeOfficeScene").then(m => ({ default: m.ThreeOfficeScene })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-[#060c1a]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative size-12">
            <div className="absolute inset-0 rounded-full border-2 border-blue-500/30 animate-ping" />
            <div className="size-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white/70">Initializing Virtual Office</p>
            <p className="text-xs text-white/30 mt-1">Loading 3D environment…</p>
          </div>
        </div>
      </div>
    ),
  }
);

const active  = AGENTS.filter(a => a.status === "active" || a.status === "processing").length;
const calls   = AGENTS.filter(a => a.status === "on_call").length;
const alerts  = AGENTS.filter(a => a.status === "escalated").length;
const total   = AGENTS.reduce((s, a) => s + a.completedToday, 0);

const KPIS = [
  { label: "Active Agents", value: active,  icon: Bot,           color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20"    },
  { label: "Tasks Today",   value: total,   icon: Cpu,           color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  { label: "Live Calls",    value: calls,   icon: Phone,         color: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/20"  },
  { label: "SLA Alerts",    value: alerts,  icon: AlertTriangle, color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20"     },
];

const PROVIDERS = [
  { id: "all",     label: "All Agents" },
  { id: "claude",  label: "Claude",  color: "#8B5CF6" },
  { id: "openai",  label: "OpenAI",  color: "#10A37F" },
  { id: "routely", label: "Routely", color: "#0167FF" },
];

export function VirtualOfficeClient() {
  const [sel,    setSel]    = useState<Agent | null>(null);
  const [fp,     setFp]     = useState("all");
  const [key,    setKey]    = useState(0);

  const handleAgentClick = useCallback((agent: Agent) => {
    setSel(prev => prev?.id === agent.id ? null : agent);
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#04080F]">

      {/* ── KPI bar ── */}
      <div className="grid grid-cols-4 gap-2 px-4 pt-3 pb-2 shrink-0">
        {KPIS.map(c => (
          <div key={c.label} className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${c.bg} ${c.border}`}>
            <div className={`size-7 rounded-md flex items-center justify-center ${c.bg}`}>
              <c.icon className={`size-3.5 ${c.color}`} />
            </div>
            <div>
              <p className="text-lg font-bold text-white leading-none">{c.value}</p>
              <p className="text-[10px] text-white/40 mt-0.5">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Controls ── */}
      <div className="flex items-center gap-2 px-4 pb-2 shrink-0">
        <span className="text-[10px] text-white/30">Filter:</span>
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            onClick={() => setFp(p.id)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
              fp === p.id ? "bg-white/10 border-white/20 text-white" : "border-white/5 text-white/40 hover:text-white/60"
            }`}
            style={fp === p.id && (p as { color?: string }).color
              ? { borderColor: (p as { color?: string }).color + "66", color: (p as { color?: string }).color }
              : {}}
          >
            {p.id !== "all" && (
              <span className="inline-block size-1.5 rounded-full mr-1" style={{ backgroundColor: (p as { color?: string }).color }} />
            )}
            {p.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-white/20 hidden lg:block">
            🖱 Drag to rotate · Scroll to zoom · Right-drag to pan
          </span>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-white/10 text-white/50 hover:text-white text-xs h-7"
            onClick={() => { setSel(null); setKey(k => k + 1); }}
          >
            <RefreshCw className="size-3" />
            Reset
          </Button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex gap-3 flex-1 min-h-0 px-4 pb-3">

        {/* 3D Canvas */}
        <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-white/5 relative">
          <ThreeOfficeScene
            key={key}
            onAgentClick={handleAgentClick}
            selectedAgentId={sel?.id || null}
          />

          {/* Provider legend overlay */}
          <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 bg-black/50 backdrop-blur-sm rounded-lg p-2.5 border border-white/10">
            {[
              { label: "Claude (Anthropic)", color: "#8B5CF6" },
              { label: "OpenAI",             color: "#10A37F" },
              { label: "Routely Custom",     color: "#0167FF" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: item.color, boxShadow: `0 0 6px ${item.color}` }} />
                <span className="text-[10px] text-white/60">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="w-68 shrink-0 rounded-xl border border-white/5 bg-[#0A0F1E] overflow-hidden flex flex-col" style={{ width: "272px" }}>
          {sel
            ? <AgentDetailsPanel agent={sel} onClose={() => setSel(null)} />
            : <ActivityFeed />
          }
        </div>
      </div>

      {/* ── Agent roster ── */}
      <div className="px-4 pb-3 shrink-0 flex gap-1.5 flex-wrap">
        {AGENTS
          .filter(a => fp === "all" || a.provider === fp)
          .map(a => {
            const pc = PROVIDER_COLORS[a.provider];
            const sc = STATUS_COLORS[a.status];
            return (
              <button
                key={a.id}
                onClick={() => setSel(p => p?.id === a.id ? null : a)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all ${
                  sel?.id === a.id
                    ? "bg-white/10 border-white/20"
                    : "border-white/5 hover:border-white/15 bg-white/3"
                }`}
              >
                <span
                  className="size-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                  style={{ backgroundColor: pc.primary + "33", color: pc.primary }}
                >
                  {a.avatar}
                </span>
                <span className="text-[11px] text-white/70">{a.name}</span>
                <span className="size-1.5 rounded-full" style={{ backgroundColor: sc }} />
              </button>
            );
          })}
      </div>

    </div>
  );
}
