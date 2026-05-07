"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { AGENTS, Agent, PROVIDER_COLORS, STATUS_COLORS } from "@/lib/virtual-office/agents";
import { AgentDetailsPanel } from "@/components/virtual-office/AgentDetailsPanel";
import { ActivityFeed } from "@/components/virtual-office/ActivityFeed";
import { Bot, Cpu, Phone, AlertTriangle } from "lucide-react";

const FloorPlanCanvas = dynamic(
  () => import("@/components/virtual-office/FloorPlanCanvas").then(m => ({ default: m.FloorPlanCanvas })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900 rounded-xl">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground">Loading floor plan…</p>
        </div>
      </div>
    ),
  }
);

const active = AGENTS.filter(a => a.status === "active" || a.status === "processing").length;
const calls  = AGENTS.filter(a => a.status === "on_call").length;
const alerts = AGENTS.filter(a => a.status === "escalated").length;
const total  = AGENTS.reduce((s, a) => s + a.completedToday, 0);

const KPIS = [
  { label: "Active",    value: active, icon: Bot,           color: "text-blue-600",    dot: "bg-blue-500"    },
  { label: "Tasks",     value: total,  icon: Cpu,           color: "text-emerald-600", dot: "bg-emerald-500" },
  { label: "Calls",     value: calls,  icon: Phone,         color: "text-amber-600",   dot: "bg-amber-500"   },
  { label: "Alerts",    value: alerts, icon: AlertTriangle, color: "text-red-600",     dot: "bg-red-500"     },
];

const PROVIDERS = [
  { id: "all",     label: "All" },
  { id: "claude",  label: "Claude",  color: "#8B5CF6" },
  { id: "openai",  label: "OpenAI",  color: "#10A37F" },
  { id: "routely", label: "Routely", color: "#0167FF" },
];

export function VirtualOfficeClient() {
  const [sel, setSel] = useState<Agent | null>(null);
  const [fp,  setFp]  = useState("all");

  const handleAgentClick = useCallback((agent: Agent) => {
    setSel(prev => prev?.id === agent.id ? null : agent);
  }, []);

  return (
    <div className="flex gap-3 h-full min-h-0">

      {/* ── 2D Floor Plan ── */}
      <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-border relative shadow-sm">
        <FloorPlanCanvas
          onAgentClick={handleAgentClick}
          selectedAgentId={sel?.id || null}
        />

        {/* ── KPI + Filter card — top left overlay ── */}
        <div className="absolute top-3 left-3 bg-white/92 dark:bg-gray-900/92 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md p-3 flex flex-col gap-3">

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-2">
            {KPIS.map(k => (
              <div key={k.label} className="flex items-center gap-2">
                <div className={`size-7 rounded-lg flex items-center justify-center ${k.dot} bg-opacity-10`}>
                  <k.icon className={`size-3.5 ${k.color}`} />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground leading-none">{k.value}</p>
                  <p className="text-[9px] text-muted-foreground">{k.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="h-px bg-border"/>

          {/* Provider filters */}
          <div className="flex flex-wrap gap-1">
            {PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => setFp(p.id)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all border ${
                  fp === p.id ? "text-white border-transparent" : "border-gray-200 dark:border-gray-700 text-muted-foreground hover:text-foreground"
                }`}
                style={fp === p.id ? { backgroundColor: (p as {color?:string}).color || "#334155", borderColor: "transparent" } : {}}
              >
                {p.id !== "all" && (
                  <span className="inline-block size-1.5 rounded-full mr-1 mb-px" style={{ backgroundColor: fp === p.id ? "#fff" : (p as {color?:string}).color }} />
                )}
                {p.label}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-1">
            {[
              { label: "Claude", color: "#8B5CF6" },
              { label: "OpenAI", color: "#10A37F" },
              { label: "Routely", color: "#0167FF" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: item.color }}/>
                <span className="text-[9px] text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="w-64 shrink-0 rounded-2xl border border-border bg-card overflow-hidden flex flex-col shadow-sm">
        {sel
          ? <AgentDetailsPanel agent={sel} onClose={() => setSel(null)} />
          : <ActivityFeed />
        }

        {/* Agent roster */}
        <div className="px-3 pb-3 pt-2 border-t border-border flex flex-wrap gap-1 shrink-0">
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
                  <span className="size-4 rounded-full flex items-center justify-center text-[7px] font-bold"
                    style={{ backgroundColor: pc.primary + "20", color: pc.primary }}>
                    {a.avatar}
                  </span>
                  <span className="text-[10px] text-foreground/70 font-medium">{a.name}</span>
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: sc }}/>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
