"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { AGENTS, Agent, PROVIDER_COLORS, STATUS_COLORS } from "@/lib/virtual-office/agents";
import { AgentDetailsPanel } from "@/components/virtual-office/AgentDetailsPanel";
import { ActivityFeed } from "@/components/virtual-office/ActivityFeed";
import { Bot, Cpu, Phone, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const ThreeOfficeScene = dynamic(
  () => import("@/components/virtual-office/ThreeOfficeScene").then(m => ({ default: m.ThreeOfficeScene })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative size-12">
            <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
            <div className="size-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground/70">Initializing Virtual Office</p>
            <p className="text-xs text-muted-foreground mt-1">Loading 3D environment…</p>
          </div>
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
  { label: "Active Agents", value: active, icon: Bot,           color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-50 dark:bg-blue-500/10",    border: "border-blue-200 dark:border-blue-500/20"    },
  { label: "Tasks Today",   value: total,  icon: Cpu,           color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/20" },
  { label: "Live Calls",    value: calls,  icon: Phone,         color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-50 dark:bg-amber-500/10",  border: "border-amber-200 dark:border-amber-500/20"  },
  { label: "SLA Alerts",    value: alerts, icon: AlertTriangle, color: "text-red-600 dark:text-red-400",      bg: "bg-red-50 dark:bg-red-500/10",      border: "border-red-200 dark:border-red-500/20"      },
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
  const [isDark, setIsDark] = useState(false);

  // Detect dark mode from the DOM
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

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── KPI bar ── */}
      <div className="grid grid-cols-4 gap-2 px-4 pt-3 pb-2 shrink-0">
        {KPIS.map(c => (
          <div key={c.label} className={`flex items-center gap-2.5 p-3 rounded-xl border ${c.bg} ${c.border}`}>
            <div className={`size-8 rounded-lg flex items-center justify-center ${c.bg} border ${c.border}`}>
              <c.icon className={`size-4 ${c.color}`} />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground leading-none">{c.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Controls ── */}
      <div className="flex items-center gap-2 px-4 pb-2 shrink-0 flex-wrap">
        <span className="text-[11px] text-muted-foreground font-medium">Filter:</span>
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            onClick={() => setFp(p.id)}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all border ${
              fp === p.id
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
            style={fp === p.id && (p as { color?: string }).color
              ? { borderColor: (p as { color?: string }).color + "55", color: (p as { color?: string }).color, backgroundColor: (p as { color?: string }).color + "12" }
              : {}}
          >
            {p.id !== "all" && (
              <span className="inline-block size-1.5 rounded-full mr-1.5" style={{ backgroundColor: (p as { color?: string }).color }} />
            )}
            {p.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground hidden lg:block">
            🖱 Drag · Scroll to zoom · Right-drag to pan
          </span>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs h-7"
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
        <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-border relative">
          <ThreeOfficeScene
            key={key}
            onAgentClick={handleAgentClick}
            selectedAgentId={sel?.id || null}
            isDark={isDark}
          />

          {/* Legend overlay */}
          <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 bg-background/80 backdrop-blur-sm rounded-lg p-2.5 border border-border shadow-sm">
            {[
              { label: "Claude (Anthropic)", color: "#8B5CF6" },
              { label: "OpenAI",             color: "#10A37F" },
              { label: "Routely Custom",     color: "#0167FF" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: item.color, boxShadow: `0 0 5px ${item.color}` }} />
                <span className="text-[10px] text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="w-64 shrink-0 rounded-xl border border-border bg-card overflow-hidden flex flex-col shadow-sm">
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
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all text-left ${
                  sel?.id === a.id
                    ? "border-primary/30 bg-primary/8"
                    : "border-border hover:border-border/80 bg-background hover:bg-muted/40"
                }`}
              >
                <span className="size-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                  style={{ backgroundColor: pc.primary + "20", color: pc.primary, border: `1px solid ${pc.primary}40` }}>
                  {a.avatar}
                </span>
                <span className="text-[11px] text-foreground/80 font-medium">{a.name}</span>
                <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: sc }} />
              </button>
            );
          })}
      </div>
    </div>
  );
}
