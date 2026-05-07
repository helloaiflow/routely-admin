export type AgentProvider = "claude" | "openai" | "routely";
export type AgentStatus = "active" | "on_call" | "processing" | "reviewing" | "idle" | "escalated";
export interface Agent {
  id: string; name: string; role: string; department: string;
  provider: AgentProvider; model: string; status: AgentStatus;
  room: string; x: number; y: number; color: string; glowColor: string;
  avatar: string; currentTask: string; completedToday: number; avgResponseMs: number;
}
export const PROVIDER_COLORS: Record<AgentProvider, { primary: string; glow: string; badge: string }> = {
  claude:  { primary: "#8B5CF6", glow: "#A78BFA", badge: "bg-violet-500" },
  openai:  { primary: "#10A37F", glow: "#34D399", badge: "bg-emerald-500" },
  routely: { primary: "#0167FF", glow: "#60A5FA", badge: "bg-blue-500" },
};
export const AGENTS: Agent[] = [
  { id: "sofia",  name: "Sofia",   role: "AI Dispatcher",     department: "Operations",     provider: "claude",  model: "claude-sonnet-4-6", status: "active",     room: "main_hall",   x: 22, y: 30, color: "#8B5CF6", glowColor: "#A78BFA", avatar: "SF", currentTask: "Dispatching stop RTL-1778131793 to Route SOUTH FL",              completedToday: 47, avgResponseMs: 820  },
  { id: "luna",   name: "Luna",    role: "QA Monitor",        department: "Quality",        provider: "claude",  model: "claude-sonnet-4-6", status: "reviewing",  room: "accounts",    x: 72, y: 38, color: "#8B5CF6", glowColor: "#A78BFA", avatar: "LN", currentTask: "Reviewing proof of delivery for RTL-1778119001",               completedToday: 31, avgResponseMs: 1100 },
  { id: "ava",    name: "Ava",     role: "Compliance Agent",  department: "Legal",          provider: "claude",  model: "claude-opus-4-6",   status: "processing", room: "boss_cabin",  x: 78, y: 20, color: "#8B5CF6", glowColor: "#A78BFA", avatar: "AV", currentTask: "Auditing cold-chain handling for tenant #4",                   completedToday: 12, avgResponseMs: 2100 },
  { id: "olivia", name: "Olivia",  role: "Client Success",    department: "CRM",            provider: "claude",  model: "claude-sonnet-4-6", status: "on_call",    room: "reception",   x: 15, y: 72, color: "#8B5CF6", glowColor: "#A78BFA", avatar: "OL", currentTask: "Onboarding WALDRUG — Deerfield Beach",                        completedToday: 8,  avgResponseMs: 950  },
  { id: "max",    name: "Max",     role: "Route Optimizer",   department: "Logistics",      provider: "openai",  model: "gpt-4o",            status: "active",     room: "main_hall",   x: 35, y: 40, color: "#10A37F", glowColor: "#34D399", avatar: "MX", currentTask: "Optimizing 24 stops for CENTRAL FL route",                    completedToday: 63, avgResponseMs: 680  },
  { id: "emma",   name: "Emma",    role: "Billing Assistant", department: "Finance",        provider: "openai",  model: "gpt-4o",            status: "processing", room: "accounts",    x: 68, y: 45, color: "#10A37F", glowColor: "#34D399", avatar: "EM", currentTask: "Generating invoice for tenant #2 — $1,240.00",                completedToday: 19, avgResponseMs: 740  },
  { id: "noah",   name: "Noah",    role: "Support Agent",     department: "Support",        provider: "openai",  model: "gpt-4o-mini",       status: "active",     room: "counsellor",  x: 75, y: 75, color: "#10A37F", glowColor: "#34D399", avatar: "NH", currentTask: "Resolving delivery exception — wrong address",                 completedToday: 28, avgResponseMs: 510  },
  { id: "leo",    name: "Leo",     role: "Intake Agent",      department: "Operations",     provider: "openai",  model: "gpt-4o",            status: "active",     room: "main_hall",   x: 28, y: 52, color: "#10A37F", glowColor: "#34D399", avatar: "LO", currentTask: "Processing new order from MedFlorida Pharmacy",               completedToday: 41, avgResponseMs: 620  },
  { id: "zoe",    name: "Zoe",     role: "Voice Agent",       department: "Communications", provider: "routely", model: "VAPI + Sofia",      status: "on_call",    room: "staff_room",  x: 68, y: 62, color: "#0167FF", glowColor: "#60A5FA", avatar: "ZO", currentTask: "Inbound call — recipient missed delivery confirmation",       completedToday: 22, avgResponseMs: 0    },
  { id: "kai",    name: "Kai",     role: "Data Analyst",      department: "Analytics",      provider: "routely", model: "claude-sonnet-4-6", status: "idle",       room: "centre_head", x: 72, y: 68, color: "#0167FF", glowColor: "#60A5FA", avatar: "KI", currentTask: "Generating weekly delivery performance report",               completedToday: 5,  avgResponseMs: 1800 },
  { id: "mia",    name: "Mia",     role: "Scheduling Agent",  department: "Operations",     provider: "routely", model: "gpt-4o",            status: "processing", room: "main_hall",   x: 42, y: 30, color: "#0167FF", glowColor: "#60A5FA", avatar: "MI", currentTask: "Scheduling 8 same-day xpress stops",                         completedToday: 33, avgResponseMs: 890  },
  { id: "ethan",  name: "Ethan",   role: "Escalation Agent",  department: "Support",        provider: "routely", model: "claude-opus-4-6",   status: "escalated",  room: "lounge",      x: 18, y: 50, color: "#0167FF", glowColor: "#60A5FA", avatar: "ET", currentTask: "SLA breach — stop RTL-1778100012 delayed 2h",                completedToday: 4,  avgResponseMs: 1500 },
];
export const STATUS_COLORS: Record<AgentStatus, string> = {
  active: "#22C55E", on_call: "#F59E0B", processing: "#3B82F6",
  reviewing: "#8B5CF6", idle: "#6B7280", escalated: "#EF4444",
};
export const STATUS_LABELS: Record<AgentStatus, string> = {
  active: "Active", on_call: "On Call", processing: "Processing",
  reviewing: "Reviewing", idle: "Idle", escalated: "Escalated",
};
