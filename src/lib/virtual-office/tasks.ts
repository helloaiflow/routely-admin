import type { Agent } from "./agents";
export interface ActivityEvent {
  id: string; agentId: string; agentName: string; provider: string;
  action: string; detail: string; timestamp: Date;
  type: "dispatch" | "call" | "optimize" | "review" | "billing" | "alert" | "complete";
}
const TEMPLATES = [
  { agentId: "sofia",  type: "dispatch"  as const, action: "Dispatched stop",    detail: () => `RTL-${Math.floor(Date.now()/1000)} → SOUTH FL route` },
  { agentId: "max",    type: "optimize"  as const, action: "Optimized route",    detail: () => `${Math.floor(Math.random()*12)+8} stops — saved ${Math.floor(Math.random()*20)+5}min` },
  { agentId: "zoe",    type: "call"      as const, action: "Completed call",     detail: () => `Confirmed delivery — ${Math.floor(Math.random()*3)+1}m ${Math.floor(Math.random()*50)+10}s` },
  { agentId: "luna",   type: "review"    as const, action: "Verified POD",       detail: () => `Stop RTL-${Math.floor(Math.random()*9999)} photo + signature confirmed` },
  { agentId: "emma",   type: "billing"   as const, action: "Processed invoice",  detail: () => `Tenant #${Math.floor(Math.random()*5)+1} — $${(Math.random()*2000+500).toFixed(2)}` },
  { agentId: "noah",   type: "complete"  as const, action: "Resolved exception", detail: () => `Wrong address corrected — stop rescheduled` },
  { agentId: "leo",    type: "dispatch"  as const, action: "Intake processed",   detail: () => `New order from pharmacy → draft stop created` },
  { agentId: "ethan",  type: "alert"     as const, action: "SLA Alert",          detail: () => `Stop delayed ${Math.floor(Math.random()*3)+1}h — escalating` },
  { agentId: "kai",    type: "review"    as const, action: "Report generated",   detail: () => `${Math.floor(Math.random()*200)+100} stops, ${(Math.random()*0.1+0.88).toFixed(2)} on-time rate` },
];
export function generateEvent(agents: Agent[]): ActivityEvent {
  const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  const agent = agents.find(a => a.id === t.agentId)!;
  return { id: `evt_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, agentId: agent.id, agentName: agent.name, provider: agent.provider, action: t.action, detail: t.detail(), timestamp: new Date(), type: t.type };
}
export const EVENT_COLORS = {
  dispatch:  { bg: "bg-blue-500/10",    text: "text-blue-400",    border: "border-blue-500/20"    },
  call:      { bg: "bg-yellow-500/10",  text: "text-yellow-400",  border: "border-yellow-500/20"  },
  optimize:  { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  review:    { bg: "bg-violet-500/10",  text: "text-violet-400",  border: "border-violet-500/20"  },
  billing:   { bg: "bg-cyan-500/10",    text: "text-cyan-400",    border: "border-cyan-500/20"    },
  alert:     { bg: "bg-red-500/10",     text: "text-red-400",     border: "border-red-500/20"     },
  complete:  { bg: "bg-green-500/10",   text: "text-green-400",   border: "border-green-500/20"   },
};
