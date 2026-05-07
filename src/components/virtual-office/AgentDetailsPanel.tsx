"use client";
import { Agent, PROVIDER_COLORS, STATUS_COLORS, STATUS_LABELS } from "@/lib/virtual-office/agents";
import { X, Cpu, Zap, CheckCircle, Clock, ExternalLink, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
const PROVIDER_LABELS = { claude: "Anthropic Claude", openai: "OpenAI", routely: "Routely Custom" };
const PROVIDER_ICONS = { claude: "✦", openai: "⬡", routely: "◈" };
export function AgentDetailsPanel({ agent, onClose }: { agent: Agent | null; onClose: () => void }) {
  if (!agent) return null;
  const pc = PROVIDER_COLORS[agent.provider]; const sc = STATUS_COLORS[agent.status];
  return (
    <div className="flex flex-col h-full bg-[#0A0F1E] border-l border-white/5">
      <div className="flex items-start justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl flex items-center justify-center text-sm font-bold relative" style={{backgroundColor:pc.primary+"22",border:`1px solid ${pc.primary}44`,color:pc.primary,boxShadow:`0 0 12px ${pc.glow}33`}}>
            {agent.avatar}
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border border-[#0A0F1E]" style={{backgroundColor:sc}} />
          </div>
          <div><h3 className="text-sm font-semibold text-white">{agent.name}</h3><p className="text-xs text-white/50">{agent.role}</p></div>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/70 p-1"><X className="size-4" /></button>
      </div>
      <div className="px-4 py-3 border-b border-white/5">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium" style={{backgroundColor:pc.primary+"18",color:pc.primary,border:`1px solid ${pc.primary}33`}}>
          <span>{PROVIDER_ICONS[agent.provider]}</span><span>{PROVIDER_LABELS[agent.provider]}</span><span className="text-white/30">·</span><span className="font-mono text-[10px]">{agent.model}</span>
        </div>
      </div>
      <div className="p-4 space-y-3 border-b border-white/5">
        <div className="flex items-center gap-2"><span className="size-2 rounded-full" style={{backgroundColor:sc,boxShadow:`0 0 6px ${sc}`}} /><span className="text-xs font-medium" style={{color:sc}}>{STATUS_LABELS[agent.status]}</span></div>
        <div className="bg-white/3 rounded-lg p-3 border border-white/5"><p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Current Task</p><p className="text-xs text-white/80 leading-relaxed">{agent.currentTask}</p></div>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3 border-b border-white/5">
        <div className="bg-white/3 rounded-lg p-3 border border-white/5"><div className="flex items-center gap-1.5 mb-1"><CheckCircle className="size-3 text-green-400" /><span className="text-[10px] text-white/40">Done today</span></div><p className="text-xl font-bold text-white">{agent.completedToday}</p></div>
        <div className="bg-white/3 rounded-lg p-3 border border-white/5"><div className="flex items-center gap-1.5 mb-1"><Clock className="size-3 text-blue-400" /><span className="text-[10px] text-white/40">Avg response</span></div><p className="text-xl font-bold text-white">{agent.avgResponseMs===0?"—":`${agent.avgResponseMs}ms`}</p></div>
        <div className="bg-white/3 rounded-lg p-3 border border-white/5"><div className="flex items-center gap-1.5 mb-1"><Cpu className="size-3 text-violet-400" /><span className="text-[10px] text-white/40">Department</span></div><p className="text-xs font-semibold text-white">{agent.department}</p></div>
        <div className="bg-white/3 rounded-lg p-3 border border-white/5"><div className="flex items-center gap-1.5 mb-1"><Zap className="size-3 text-yellow-400" /><span className="text-[10px] text-white/40">Room</span></div><p className="text-xs font-semibold text-white capitalize">{agent.room.replace(/_/g," ")}</p></div>
      </div>
      <div className="p-4 space-y-2 mt-auto">
        <Button size="sm" className="w-full text-xs gap-2" style={{backgroundColor:pc.primary}}><ExternalLink className="size-3" />View Workflow</Button>
        <Button size="sm" variant="outline" className="w-full text-xs gap-2 border-white/10 text-white/70 hover:text-white"><MessageSquare className="size-3" />Message Agent</Button>
      </div>
    </div>
  );
}
