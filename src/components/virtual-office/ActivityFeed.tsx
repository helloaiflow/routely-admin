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
    for (let i = 0; i < 6; i++) {
      const e = generateEvent(AGENTS);
      e.timestamp = new Date(Date.now() - (6 - i) * 12000);
      initial.push(e);
    }
    setEvents(initial);
    const iv = setInterval(() => {
      setEvents(p => [generateEvent(AGENTS), ...p].slice(0, 30));
    }, 3000 + Math.random() * 3000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <Activity className="size-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Live Activity</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Live</span>
        </span>
      </div>

      {/* Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto divide-y divide-border">
        {events.map((evt, i) => {
          const c = EVENT_COLORS[evt.type];
          const p = PROVIDER_COLORS[evt.provider as keyof typeof PROVIDER_COLORS];
          return (
            <div key={evt.id} className={`px-3 py-2.5 transition-colors ${i === 0 ? "bg-muted/40" : "hover:bg-muted/20"}`}>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 size-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 border"
                  style={{ backgroundColor: p.primary + "18", color: p.primary, borderColor: p.primary + "30" }}>
                  {evt.agentName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold text-foreground/90">{evt.agentName}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${c.bg} ${c.text} ${c.border}`}>
                      {evt.action}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{evt.detail}</p>
                  <p className="text-[9px] text-muted-foreground/60 mt-0.5">{evt.timestamp.toLocaleTimeString()}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
