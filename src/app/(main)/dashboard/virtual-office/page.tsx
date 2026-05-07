import { VirtualOfficeClient } from "@/components/virtual-office/VirtualOfficeClient";
import { AGENTS } from "@/lib/virtual-office/agents";
import { Bot, Cpu, Phone, AlertTriangle } from "lucide-react";

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

export default function VirtualOfficePage() {
  return (
    // Escape the layout padding with -m-6 and use full viewport height minus header (48px)
    <div className="-m-6 flex flex-col" style={{ height: "calc(100dvh - 48px)" }}>

      {/* KPI bar */}
      <div className="grid grid-cols-4 gap-3 px-6 pt-4 pb-3 shrink-0">
        {KPIS.map(c => (
          <div key={c.label} className={`flex items-center gap-3 p-3 rounded-xl border ${c.bg} ${c.border}`}>
            <div className={`size-9 rounded-xl flex items-center justify-center border ${c.bg} ${c.border}`}>
              <c.icon className={`size-4 ${c.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground leading-none">{c.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Canvas — takes all remaining height */}
      <div className="flex-1 min-h-0 px-6 pb-6 overflow-hidden">
        <VirtualOfficeClient />
      </div>
    </div>
  );
}
