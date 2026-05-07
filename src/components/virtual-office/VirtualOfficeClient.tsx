"use client";
import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { AGENTS, Agent, PROVIDER_COLORS, STATUS_COLORS } from "@/lib/virtual-office/agents";
import { AgentDetailsPanel } from "@/components/virtual-office/AgentDetailsPanel";
import { ActivityFeed } from "@/components/virtual-office/ActivityFeed";
import { Bot, Cpu, Phone, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
const PhaserOfficeScene = dynamic(
  () => import("@/components/virtual-office/PhaserOfficeScene").then(m=>({default:m.PhaserOfficeScene})),
  { ssr:false, loading:()=><div className="w-full h-full flex items-center justify-center bg-[#060B18]"><div className="flex flex-col items-center gap-3"><div className="size-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /><p className="text-xs text-white/40">Loading operations floor…</p></div></div> }
);
const active=AGENTS.filter(a=>a.status==="active"||a.status==="processing").length;
const calls=AGENTS.filter(a=>a.status==="on_call").length;
const alerts=AGENTS.filter(a=>a.status==="escalated").length;
const total=AGENTS.reduce((s,a)=>s+a.completedToday,0);
const KPIS=[
  {label:"Active Agents",value:active,icon:Bot,color:"text-blue-400",bg:"bg-blue-500/10",border:"border-blue-500/20"},
  {label:"Tasks Today",value:total,icon:Cpu,color:"text-emerald-400",bg:"bg-emerald-500/10",border:"border-emerald-500/20"},
  {label:"Live Calls",value:calls,icon:Phone,color:"text-yellow-400",bg:"bg-yellow-500/10",border:"border-yellow-500/20"},
  {label:"SLA Alerts",value:alerts,icon:AlertTriangle,color:"text-red-400",bg:"bg-red-500/10",border:"border-red-500/20"},
];
const PROVIDERS=[{id:"all",label:"All Agents"},{id:"claude",label:"Claude",color:"#8B5CF6"},{id:"openai",label:"OpenAI",color:"#10A37F"},{id:"routely",label:"Routely",color:"#0167FF"}];
export function VirtualOfficeClient() {
  const [sel,setSel]=useState<Agent|null>(null);
  const [hov,setHov]=useState<Agent|null>(null);
  const [fp,setFp]=useState("all");
  const [key,setKey]=useState(0);
  const click=useCallback((a:Agent)=>setSel(p=>p?.id===a.id?null:a),[]);
  const hover=useCallback((a:Agent|null)=>setHov(a),[]);
  return (
    <div className="flex flex-col h-full gap-4 p-4 bg-[#04080F] min-h-0">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        {KPIS.map(c=>(
          <div key={c.label} className={`flex items-center gap-3 p-3 rounded-xl border ${c.bg} ${c.border}`}>
            <div className={`size-8 rounded-lg flex items-center justify-center ${c.bg}`}><c.icon className={`size-4 ${c.color}`} /></div>
            <div><p className="text-xl font-bold text-white">{c.value}</p><p className="text-xs text-white/40">{c.label}</p></div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <span className="text-xs text-white/30 mr-1">Filter:</span>
        {PROVIDERS.map(p=>(
          <button key={p.id} onClick={()=>setFp(p.id)} className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${fp===p.id?"bg-white/10 border-white/20 text-white":"border-white/5 text-white/40 hover:text-white/70"}`} style={fp===p.id&&(p as {color?:string}).color?{borderColor:(p as {color?:string}).color+"66",color:(p as {color?:string}).color}:{}}>
            {p.id!=="all"&&<span className="inline-block size-1.5 rounded-full mr-1.5" style={{backgroundColor:(p as {color?:string}).color}} />}{p.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {hov&&<div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10"><span className="size-1.5 rounded-full" style={{backgroundColor:STATUS_COLORS[hov.status]}} /><span className="text-xs text-white/70">{hov.name} — {hov.role}</span></div>}
          <Button size="sm" variant="outline" className="gap-1.5 border-white/10 text-white/50 hover:text-white text-xs h-7" onClick={()=>setKey(k=>k+1)}><RefreshCw className="size-3" />Reset</Button>
        </div>
      </div>
      <div className="flex gap-3 flex-1 min-h-0">
        <div className={`flex-1 min-h-0 rounded-xl overflow-hidden border border-white/5 bg-[#060B18] transition-all duration-300 ${sel?"lg:flex-[2]":""}`}>
          <PhaserOfficeScene key={key} onAgentClick={click} onAgentHover={hover} selectedAgentId={sel?.id||null} />
        </div>
        <div className="w-72 shrink-0 rounded-xl border border-white/5 bg-[#0A0F1E] overflow-hidden flex flex-col">
          {sel?<AgentDetailsPanel agent={sel} onClose={()=>setSel(null)} />:<ActivityFeed />}
        </div>
      </div>
      <div className="shrink-0 flex gap-2 flex-wrap">
        {AGENTS.filter(a=>fp==="all"||a.provider===fp).map(a=>{
          const pc=PROVIDER_COLORS[a.provider],sc=STATUS_COLORS[a.status];
          return <button key={a.id} onClick={()=>setSel(p=>p?.id===a.id?null:a)} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all ${sel?.id===a.id?"bg-white/10 border-white/20":"border-white/5 hover:border-white/15 bg-white/3"}`}>
            <span className="size-5 rounded-full flex items-center justify-center text-[9px] font-bold" style={{backgroundColor:pc.primary+"33",color:pc.primary}}>{a.avatar}</span>
            <span className="text-xs text-white/70">{a.name}</span>
            <span className="size-1.5 rounded-full" style={{backgroundColor:sc}} />
          </button>;
        })}
      </div>
    </div>
  );
}
