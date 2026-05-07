"use client";
import { useEffect, useRef } from "react";
import { AGENTS, PROVIDER_COLORS, STATUS_COLORS } from "@/lib/virtual-office/agents";
import { ROOMS } from "@/lib/virtual-office/rooms";
import type { Agent } from "@/lib/virtual-office/agents";
interface Props { onAgentClick:(a:Agent)=>void; onAgentHover:(a:Agent|null)=>void; selectedAgentId:string|null; }
export function PhaserOfficeScene({ onAgentClick, onAgentHover, selectedAgentId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const stateRef = useRef(AGENTS.map(a=>({...a,px:0,py:0,tx:0,ty:0,pulse:Math.random()*Math.PI*2})));
  const hoveredRef = useRef<string|null>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
      stateRef.current = stateRef.current.map(a=>({...a,px:(a.x/100)*canvas.width,py:(a.y/100)*canvas.height,tx:(a.x/100)*canvas.width,ty:(a.y/100)*canvas.height}));
    }
    resize(); window.addEventListener("resize",resize);
    function onMouseMove(e:MouseEvent) {
      if (!canvas) return;
      const r=canvas.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
      let found:string|null=null;
      for (const a of stateRef.current) { const dx=mx-a.px,dy=my-a.py; if (Math.sqrt(dx*dx+dy*dy)<18){found=a.id;break;} }
      if (found!==hoveredRef.current) { hoveredRef.current=found; canvas.style.cursor=found?"pointer":"default"; const ag=found?AGENTS.find(a=>a.id===found)||null:null; onAgentHover(ag); }
    }
    function onClick(e:MouseEvent) {
      if (!canvas) return;
      const r=canvas.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
      for (const a of stateRef.current) { const dx=mx-a.px,dy=my-a.py; if (Math.sqrt(dx*dx+dy*dy)<18){const ag=AGENTS.find(x=>x.id===a.id);if(ag)onAgentClick(ag);return;} }
    }
    canvas.addEventListener("mousemove",onMouseMove); canvas.addEventListener("click",onClick);
    const wander = setInterval(()=>{
      stateRef.current = stateRef.current.map(a=>{
        if (Math.random()<0.3) { const room=ROOMS.find(r=>r.id===a.room); if(room&&canvas){const rx=((room.x+2+Math.random()*(room.w-4))/100)*canvas.width,ry=((room.y+2+Math.random()*(room.h-4))/100)*canvas.height;return{...a,tx:rx,ty:ry};} } return a;
      });
    }, 4000);
    function draw() {
      if (!canvas||!ctx) return;
      const W=canvas.width,H=canvas.height;
      ctx.fillStyle="#060B18"; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle="#0F1729"; ctx.lineWidth=1;
      for(let x=0;x<W;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
      for(let y=0;y<H;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
      for (const room of ROOMS) {
        const rx=(room.x/100)*W,ry=(room.y/100)*H,rw=(room.w/100)*W,rh=(room.h/100)*H;
        const g=ctx.createLinearGradient(rx,ry,rx+rw,ry+rh); g.addColorStop(0,"#0C1428"); g.addColorStop(1,"#080E1C");
        ctx.fillStyle=g; ctx.beginPath(); ctx.roundRect(rx,ry,rw,rh,6); ctx.fill();
        ctx.strokeStyle=room.borderColor+"66"; ctx.lineWidth=1.5; ctx.beginPath(); ctx.roundRect(rx,ry,rw,rh,6); ctx.stroke();
        ctx.fillStyle=room.borderColor+"BB"; ctx.font=`bold ${Math.max(8,W*0.008)}px monospace`; ctx.textAlign="left"; ctx.fillText(room.label.toUpperCase(),rx+8,ry+14);
      }
      stateRef.current = stateRef.current.map(a=>({...a,px:a.px+(a.tx-a.px)*0.03,py:a.py+(a.ty-a.py)*0.03,pulse:a.pulse+0.05}));
      for (const a of stateRef.current) {
        const isHov=hoveredRef.current===a.id,isSel=selectedAgentId===a.id;
        const pc=PROVIDER_COLORS[a.provider as keyof typeof PROVIDER_COLORS];
        const sc=STATUS_COLORS[a.status as keyof typeof STATUS_COLORS];
        if (isHov||isSel){const gg=ctx.createRadialGradient(a.px,a.py,0,a.px,a.py,30);gg.addColorStop(0,pc.glow+"44");gg.addColorStop(1,"transparent");ctx.fillStyle=gg;ctx.beginPath();ctx.arc(a.px,a.py,30,0,Math.PI*2);ctx.fill();}
        const pr=14+Math.sin(a.pulse)*3; ctx.strokeStyle=pc.primary+"44"; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(a.px,a.py,pr,0,Math.PI*2); ctx.stroke();
        const ag2=ctx.createRadialGradient(a.px-2,a.py-2,0,a.px,a.py,12); ag2.addColorStop(0,pc.primary+"EE"); ag2.addColorStop(1,pc.primary+"99");
        ctx.fillStyle=ag2; ctx.beginPath(); ctx.arc(a.px,a.py,12,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle=pc.glow; ctx.lineWidth=isSel?2:1; ctx.beginPath(); ctx.arc(a.px,a.py,12,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle="#fff"; ctx.font=`bold ${Math.max(7,W*0.007)}px system-ui`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(a.avatar,a.px,a.py);
        ctx.fillStyle=sc; ctx.shadowColor=sc; ctx.shadowBlur=6; ctx.beginPath(); ctx.arc(a.px+9,a.py-9,3.5,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
        ctx.fillStyle="rgba(255,255,255,0.7)"; ctx.font=`${Math.max(8,W*0.0075)}px system-ui`; ctx.textAlign="center"; ctx.textBaseline="top"; ctx.fillText(a.name,a.px,a.py+15);
        if (isHov) {
          const orig=AGENTS.find(x=>x.id===a.id); if(orig){
            const task=orig.currentTask.slice(0,42)+(orig.currentTask.length>42?"…":"");
            const tw=ctx.measureText(task).width+16,tx2=a.px-tw/2,ty2=a.py-52;
            ctx.fillStyle="#0F1729EE"; ctx.strokeStyle=pc.primary+"99"; ctx.lineWidth=1; ctx.beginPath(); ctx.roundRect(tx2,ty2,tw,22,4); ctx.fill(); ctx.stroke();
            ctx.fillStyle="#fff"; ctx.font=`${Math.max(7,W*0.007)}px system-ui`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(task,a.px,ty2+11);
          }
        }
      }
      const items=[{label:"Claude",color:"#8B5CF6"},{label:"OpenAI",color:"#10A37F"},{label:"Routely",color:"#0167FF"}];
      const lx=W-120,ly=H-72;
      ctx.fillStyle="#0A0F1ECC"; ctx.strokeStyle="#ffffff11"; ctx.lineWidth=1; ctx.beginPath(); ctx.roundRect(lx-8,ly-8,112,items.length*20+16,6); ctx.fill(); ctx.stroke();
      items.forEach((item,i)=>{const y=ly+i*20;ctx.fillStyle=item.color;ctx.beginPath();ctx.arc(lx,y,5,0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(255,255,255,0.6)";ctx.font="10px system-ui";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(item.label,lx+10,y);});
      animRef.current=requestAnimationFrame(draw);
    }
    animRef.current=requestAnimationFrame(draw);
    return ()=>{cancelAnimationFrame(animRef.current);clearInterval(wander);canvas.removeEventListener("mousemove",onMouseMove);canvas.removeEventListener("click",onClick);window.removeEventListener("resize",resize);};
  }, [onAgentClick, onAgentHover, selectedAgentId]);
  return <canvas ref={canvasRef} className="w-full h-full" style={{display:"block"}} />;
}
