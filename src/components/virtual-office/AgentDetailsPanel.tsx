"use client";
import { Agent, PROVIDER_COLORS, STATUS_COLORS, STATUS_LABELS } from "@/lib/virtual-office/agents";
import { X, Cpu, Zap, CheckCircle, Clock, ExternalLink, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

const PROVIDER_LABELS = { claude: "Anthropic Claude", openai: "OpenAI", routely: "Routely Custom" };
const PROVIDER_ICONS  = { claude: "✦", openai: "⬡", routely: "◈" };

export function AgentDetailsPanel({ agent, onClose }: { agent: Agent | null; onClose: () => void }) {
  if (!agent) return null;
  const pc = PROVIDER_COLORS[agent.provider];
  const sc = STATUS_COLORS[agent.status];

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl flex items-center justify-center text-sm font-bold relative"
            style={{ backgroundColor: pc.primary + "18", border: `1.5px solid ${pc.primary}44`, color: pc.primary }}>
            {agent.avatar}
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card"
              style={{ backgroundColor: sc }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{agent.name}</h3>
            <p className="text-xs text-muted-foreground">{agent.role}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
          <X className="size-4" />
        </button>
      </div>

      {/* Provider */}
      <div className="px-4 py-3 border-b border-border">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: pc.primary + "14", color: pc.primary, border: `1px solid ${pc.primary}30` }}>
          <span>{PROVIDER_ICONS[agent.provider]}</span>
          <span>{PROVIDER_LABELS[agent.provider]}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="font-mono text-[10px] opacity-80">{agent.model}</span>
        </div>
      </div>

      {/* Status + task */}
      <div className="p-4 space-y-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: sc, boxShadow: `0 0 6px ${sc}` }} />
          <span className="text-xs font-semibold" style={{ color: sc }}>{STATUS_LABELS[agent.status]}</span>
        </div>
        <div className="bg-muted/40 rounded-lg p-3 border border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Current Task</p>
          <p className="text-xs text-foreground/80 leading-relaxed">{agent.currentTask}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 grid grid-cols-2 gap-2.5 border-b border-border">
        {[
          { icon: CheckCircle, iconCls: "text-emerald-500", label: "Done today",   value: agent.completedToday.toString() },
          { icon: Clock,       iconCls: "text-blue-500",    label: "Avg response", value: agent.avgResponseMs === 0 ? "—" : `${agent.avgResponseMs}ms` },
          { icon: Cpu,         iconCls: "text-violet-500",  label: "Department",   value: agent.department },
          { icon: Zap,         iconCls: "text-amber-500",   label: "Room",         value: agent.room.replace(/_/g, " ") },
        ].map(({ icon: Icon, iconCls, label, value }) => (
          <div key={label} className="bg-muted/30 rounded-lg p-2.5 border border-border">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className={`size-3 ${iconCls}`} />
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
            <p className="text-sm font-bold text-foreground capitalize truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="p-4 space-y-2 mt-auto">
        <Button size="sm" className="w-full text-xs gap-2" style={{ backgroundColor: pc.primary, color: "#fff", borderColor: pc.primary }}>
          <ExternalLink className="size-3" /> View Workflow
        </Button>
        <Button size="sm" variant="outline" className="w-full text-xs gap-2">
          <MessageSquare className="size-3" /> Message Agent
        </Button>
      </div>
    </div>
  );
}
