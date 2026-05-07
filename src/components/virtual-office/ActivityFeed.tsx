"use client";
import { useEffect, useRef, useState } from "react";
import { ActivityEvent, EVENT_COLORS, generateEvent } from "@/lib/virtual-office/tasks";
import { AGENTS, PROVIDER_COLORS } from "@/lib/virtual-office/agents";
import { Activity } from "lucide-react";
export function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const initial: ActivityEvent[] = [];
    for (let i = 0; i < 6; i++) { const e = generateEvent(AGENTS); e.timestamp = new Date(Date.now() - (6-i)*12000); initial.push(e); }
    setEvents(initial);
    const iv = setInterval(() => { setEvents(p => [generateEvent(AGENTS), ...p].slice(0, 30)); }, 3000 + Math.random()*3000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
        <Activity className="size-3.5 text-blue-400" />
        <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">Live Activity</span>
        <span className="ml-auto flex items-center gap-1"><span className="size-1.5 rounded-full bg-green-400 animate-pulse" /><span className="text-[10px] text-green-400">Live</span></span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-0">
        {events.map((evt, i) => {
          const c = EVENT_COLORS[evt.type];
          const p = PROVIDER_COLORS[evt.provider as keyof typeof PROVIDER_COLORS];
          return (
            <div key={evt.id} className={`px-3 py-2 border-b border-white/5 ${i===0?"bg-white/5":""}`}>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 size-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0" style={{backgroundColor:p.primary+"33",color:p.primary}}>{evt.agentName.slice(0,2).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold text-white/90">{evt.agentName}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>{evt.action}</span>
                  </div>
                  <p className="text-[10px] text-white/50 mt-0.5 truncate">{evt.detail}</p>
                  <p className="text-[9px] text-white/30 mt-0.5">{evt.timestamp.toLocaleTimeString()}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
