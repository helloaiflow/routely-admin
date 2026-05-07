"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AGENTS, Agent, PROVIDER_COLORS, STATUS_COLORS, STATUS_LABELS } from "@/lib/virtual-office/agents";

// ── Floor plan room definitions ────────────────────────────────────────────
// Coordinate space: 1200 x 780
// Inspired by the reference architectural floor plan

interface Room {
  id: string;
  label: string;
  sublabel?: string;
  x: number; y: number; w: number; h: number;
  fill: string;
  labelColor?: string;
  type: "workspace" | "meeting" | "support" | "core" | "corridor" | "dark";
}

const ROOMS: Room[] = [
  // ── UPPER LEFT — Main Operations / Open Workspace ────────────────────
  { id: "main_hall", label: "Open Workspace", sublabel: "Main Ops · 348 m²", x:20,  y:20,  w:320, h:470, fill:"#EEF2FF", labelColor:"#3730a3", type:"workspace" },
  { id: "storage",   label: "Storage",          sublabel:"4 m²",              x:20,  y:20,  w:90,  h:65,  fill:"#E2E8F0", labelColor:"#475569", type:"support"  },
  { id: "cafe",      label: "Café",             sublabel:"90 m²",             x:110, y:20,  w:230, h:90,  fill:"#FEF3C7", labelColor:"#92400e", type:"support"  },

  // ── DARK CORE — Stairs, Restrooms, Elevators ─────────────────────────
  { id: "dark1",    label: "",   x:340, y:20,  w:30,  h:200, fill:"#334155", type:"dark"     },
  { id: "restroom1",label:"Restroom",sublabel:"7 m²",x:370,y:20,w:80,h:70,fill:"#CBD5E1",labelColor:"#475569",type:"support"},
  { id: "restroom2",label:"Restroom",sublabel:"12 m²",x:370,y:90,w:80,h:80,fill:"#CBD5E1",labelColor:"#475569",type:"support"},
  { id: "staircase",label:"Staircase",sublabel:"20 m²",x:450,y:20,w:100,h:200,fill:"#94A3B8",labelColor:"#1e293b",type:"dark"},
  { id: "foyer",    label:"Foyer",sublabel:"41 m²",x:550,y:20,w:80,h:60,fill:"#BFDBFE",labelColor:"#1e40af",type:"corridor"},
  { id: "elevator1",label:"Elev",sublabel:"7 m²",x:630,y:20,w:60,h:65,fill:"#94A3B8",labelColor:"#1e293b",type:"dark"},
  { id: "elevator2",label:"Elev",sublabel:"6 m²",x:630,y:85,w:60,h:60,fill:"#94A3B8",labelColor:"#1e293b",type:"dark"},
  { id: "confroom", label:"Conf",sublabel:"5 m²",x:690,y:20,w:60,h:65,fill:"#E0E7FF",labelColor:"#4338ca",type:"meeting"},
  { id: "restroom3",label:"Restroom",sublabel:"11 m²",x:690,y:85,w:80,h:60,fill:"#CBD5E1",labelColor:"#475569",type:"support"},
  { id: "dark2",    label:"", x:770,y:20,w:30,h:200,fill:"#334155",type:"dark"},

  // ── UPPER RIGHT — Operational + Meeting Rooms ─────────────────────────
  { id: "boss_cabin",label:"Operational Room",sublabel:"54 m²",x:800,y:20,w:200,h:160,fill:"#DBEAFE",labelColor:"#1e40af",type:"workspace"},
  { id: "mtg_a",   label:"Meeting Room",sublabel:"38 m²",x:1000,y:20,w:180,h:160,fill:"#EDE9FE",labelColor:"#6d28d9",type:"meeting"},
  { id: "print",   label:"Print Station",sublabel:"15 m²",x:800,y:180,w:110,h:80,fill:"#E2E8F0",labelColor:"#475569",type:"support"},
  { id: "storage2",label:"Storage",sublabel:"10 m²",x:910,y:180,w:90,h:80,fill:"#E2E8F0",labelColor:"#475569",type:"support"},
  { id: "mtg_b",  label:"Meeting Room",sublabel:"22 m²",x:1000,y:180,w:180,h:100,fill:"#EDE9FE",labelColor:"#6d28d9",type:"meeting"},

  // ── HUB RIGHT ─────────────────────────────────────────────────────────
  { id: "hub_right",label:"Hub",sublabel:"97 m²",x:800,y:260,w:380,h:230,fill:"#F0FDF4",labelColor:"#166534",type:"workspace"},

  // ── CENTER ZONE — Corridors ────────────────────────────────────────────
  { id: "corridor_left", label:"Corridor",sublabel:"8 m²",x:340,y:220,w:110,h:40,fill:"#F1F5F9",labelColor:"#94a3b8",type:"corridor"},
  { id: "corridor_mid",  label:"Corridor",sublabel:"9 m²",x:550,y:220,w:250,h:40,fill:"#F1F5F9",labelColor:"#94a3b8",type:"corridor"},
  { id: "corridor_right",label:"Corridor",sublabel:"6 m²",x:690,y:145,w:110,h:75,fill:"#F1F5F9",labelColor:"#94a3b8",type:"corridor"},

  // ── CENTER MEETING ROOMS LEFT ──────────────────────────────────────────
  { id: "hub_left",  label:"Hub",sublabel:"65 m²",x:340,y:260,w:110,h:110,fill:"#FFF7ED",labelColor:"#9a3412",type:"workspace"},
  { id: "mtg_c1",   label:"Meeting Room",sublabel:"11 m²",x:340,y:370,w:110,h:90,fill:"#EDE9FE",labelColor:"#6d28d9",type:"meeting"},
  { id: "mtg_c2",   label:"Meeting Room",sublabel:"22 m²",x:450,y:260,w:100,h:100,fill:"#EDE9FE",labelColor:"#6d28d9",type:"meeting"},
  { id: "mtg_c3",   label:"Meeting Room",sublabel:"11 m²",x:450,y:360,w:100,h:60,fill:"#EDE9FE",labelColor:"#6d28d9",type:"meeting"},
  { id: "mtg_c4",   label:"Meeting Room",sublabel:"20 m²",x:450,y:420,w:100,h:80,fill:"#EDE9FE",labelColor:"#6d28d9",type:"meeting"},
  { id: "mtg_c5",   label:"Meeting Room",sublabel:"25 m²",x:450,y:500,w:100,h:70,fill:"#EDE9FE",labelColor:"#6d28d9",type:"meeting"},
  { id: "hub_c",    label:"Hub",sublabel:"8 m²",x:340,y:460,w:110,h:40,fill:"#FFF7ED",labelColor:"#9a3412",type:"support"},

  // ── CENTER RECEPTION ───────────────────────────────────────────────────
  { id: "reception",label:"Reception",sublabel:"188 m²",x:550,y:260,w:250,h:310,fill:"#ECFDF5",labelColor:"#065f46",type:"workspace"},

  // ── CENTER MEETING ROOMS RIGHT ─────────────────────────────────────────
  { id: "mtg_r1",  label:"Meeting Room",sublabel:"8 m²", x:800,y:490,w:90,h:80, fill:"#EDE9FE",labelColor:"#6d28d9",type:"meeting"},
  { id: "mtg_r2",  label:"Meeting Room",sublabel:"27 m²",x:890,y:490,w:100,h:80,fill:"#EDE9FE",labelColor:"#6d28d9",type:"meeting"},
  { id: "mtg_r3",  label:"Meeting Room",sublabel:"18 m²",x:990,y:490,w:90,h:80, fill:"#EDE9FE",labelColor:"#6d28d9",type:"meeting"},
  { id: "mtg_r4",  label:"Meeting Room",sublabel:"25 m²",x:800,y:570,w:90,h:80, fill:"#EDE9FE",labelColor:"#6d28d9",type:"meeting"},
  { id: "mtg_r5",  label:"Meeting Room",sublabel:"25 m²",x:890,y:570,w:100,h:80,fill:"#EDE9FE",labelColor:"#6d28d9",type:"meeting"},
  { id: "mtg_r6",  label:"Meeting Room",sublabel:"18 m²",x:990,y:570,w:90,h:80, fill:"#EDE9FE",labelColor:"#6d28d9",type:"meeting"},

  // ── LOWER CORRIDORS ────────────────────────────────────────────────────
  { id:"corr_bot1",label:"Corridor",sublabel:"7 m²",x:340,y:570,w:55,h:40,fill:"#F1F5F9",labelColor:"#94a3b8",type:"corridor"},
  { id:"corr_bot2",label:"Corridor",sublabel:"7 m²",x:395,y:570,w:55,h:40,fill:"#F1F5F9",labelColor:"#94a3b8",type:"corridor"},
  { id:"corr_bot3",label:"Corridor",sublabel:"7 m²",x:690,y:570,w:55,h:40,fill:"#F1F5F9",labelColor:"#94a3b8",type:"corridor"},
  { id:"corr_bot4",label:"Corridor",sublabel:"7 m²",x:745,y:570,w:55,h:40,fill:"#F1F5F9",labelColor:"#94a3b8",type:"corridor"},

  // ── LOWER ZONE ────────────────────────────────────────────────────────
  { id:"corr_low1",label:"Corridor",sublabel:"7 m²",x:340,y:610,w:55,h:40,fill:"#F1F5F9",labelColor:"#94a3b8",type:"corridor"},
  { id:"corr_low2",label:"Corridor",sublabel:"7 m²",x:690,y:610,w:55,h:40,fill:"#F1F5F9",labelColor:"#94a3b8",type:"corridor"},
  { id:"stair_low1",label:"Staircase",sublabel:"8 m²",x:395,y:610,w:80,h:150,fill:"#94A3B8",labelColor:"#1e293b",type:"dark"},
  { id:"hub_low1",  label:"Hub",sublabel:"5 m²",x:475,y:610,w:65,h:40,fill:"#FFF7ED",labelColor:"#9a3412",type:"support"},
  { id:"board1",    label:"Board Room",sublabel:"50 m²",x:475,y:650,w:150,h:110,fill:"#FEF3C7",labelColor:"#92400e",type:"meeting"},
  { id:"board2",    label:"Board Room",sublabel:"51 m²",x:625,y:650,w:150,h:110,fill:"#FEF3C7",labelColor:"#92400e",type:"meeting"},
  { id:"stair_low2",label:"Staircase",sublabel:"8 m²",x:745,y:610,w:80,h:150,fill:"#94A3B8",labelColor:"#1e293b",type:"dark"},
  { id:"hub_low2",  label:"Hub",sublabel:"15 m²",x:825,y:610,w:65,h:40,fill:"#FFF7ED",labelColor:"#9a3412",type:"support"},

  // ── LOWER LEFT WORKSPACE ───────────────────────────────────────────────
  { id:"lounge",    label:"Open Workspace",sublabel:"141 m²",x:20,y:490,w:320,h:270,fill:"#EEF2FF",labelColor:"#3730a3",type:"workspace"},
  // ── LOWER RIGHT WORKSPACE ─────────────────────────────────────────────
  { id:"counsellor",label:"Open Workspace",sublabel:"89 m²",x:890,y:650,w:290,h:110,fill:"#EEF2FF",labelColor:"#3730a3",type:"workspace"},
  { id:"accounts",  label:"Open Workspace",sublabel:"236 m²",x:890,y:490,w:290,h:160,fill:"#EEF2FF",labelColor:"#3730a3",type:"workspace"},
];

// ── Agent room assignment → SVG coordinates ───────────────────────────────
const ROOM_CENTERS: Record<string, [number,number][]> = {
  main_hall:   [[120,250],[180,300],[240,350],[120,350],[180,200],[240,200],[150,420],[200,150]],
  lounge:      [[100,540],[150,580],[200,620],[100,650],[160,700],[220,680]],
  reception:   [[620,320],[660,380],[620,450],[680,420],[640,500]],
  boss_cabin:  [[860,80],[920,100],[960,60],[880,130]],
  accounts:    [[940,520],[1000,540],[1060,520],[940,580],[1000,580],[1060,570]],
  staff_room:  [[870,530],[920,560],[860,570]],
  centre_head: [[870,680],[920,700],[860,700]],
  counsellor:  [[940,680],[1000,700],[1060,680],[940,720],[1000,720]],
};

// ── Furniture shapes (2D, top-down) ───────────────────────────────────────
function Furniture() {
  return (
    <g opacity={0.6}>
      {/* Main hall desks */}
      {[[60,130],[120,130],[180,130],[240,130],[60,200],[120,200],[180,200],[240,200],[60,280],[120,280],[180,280],[240,280]].map(([x,y],i)=>(
        <g key={`d${i}`}>
          <rect x={x} y={y} width={46} height={28} rx={2} fill="#c8a96e" stroke="#8B6914" strokeWidth={1}/>
          <rect x={x+8} y={y+4} width={30} height={18} rx={1} fill="#3b82f6" opacity={0.5}/>
          <rect x={x+8} y={y+22} width={30} height={4} rx={1} fill="#374151"/>
        </g>
      ))}
      {/* Lounge sofas */}
      <rect x={40} y={520} width={90} height={45} rx={6} fill="#4a3f8f"/>
      <rect x={150} y={520} width={90} height={45} rx={6} fill="#4a3f8f"/>
      <rect x={40} y={590} width={90} height={45} rx={6} fill="#4a3f8f"/>
      <ellipse cx={250} cy={570} rx={30} ry={30} fill="#c8a96e" stroke="#8B6914" strokeWidth={1}/>
      {/* Reception counter */}
      <rect x={580} y={370} width={120} height={30} rx={3} fill="#c8a96e" stroke="#8B6914" strokeWidth={1.5}/>
      {/* Meeting room tables */}
      <ellipse cx={475} cy={295} rx={28} ry={22} fill="#c8a96e" stroke="#8B6914" strokeWidth={1}/>
      <ellipse cx={475} cy={395} rx={28} ry={20} fill="#c8a96e" stroke="#8B6914" strokeWidth={1}/>
      <ellipse cx={475} cy={460} rx={28} ry={18} fill="#c8a96e" stroke="#8B6914" strokeWidth={1}/>
      {/* Board room tables */}
      <rect x={490} y={665} width={120} height={75} rx={4} fill="#c8a96e" stroke="#8B6914" strokeWidth={1}/>
      <rect x={640} y={665} width={120} height={75} rx={4} fill="#c8a96e" stroke="#8B6914" strokeWidth={1}/>
      {/* Plants */}
      {[[300,40],[300,430],[820,40],[820,480],[1160,490],[50,480]].map(([x,y],i)=>(
        <g key={`p${i}`}>
          <ellipse cx={x} cy={y} rx={14} ry={14} fill="#276749"/>
          <ellipse cx={x+5} cy={y-5} rx={9} ry={9} fill="#38a169"/>
        </g>
      ))}
    </g>
  );
}

// ── Wall lines (exterior + interior) ─────────────────────────────────────
function Walls() {
  return (
    <g>
      {/* Outer boundary */}
      <rect x={20} y={20} width={1160} height={740} fill="none" stroke="#334155" strokeWidth={6} rx={2}/>
      {/* Upper interior dividers */}
      <line x1={340} y1={20} x2={340} y2={260} stroke="#334155" strokeWidth={4}/>
      <line x1={800} y1={20} x2={800} y2={260} stroke="#334155" strokeWidth={4}/>
      <line x1={340} y1={260} x2={450} y2={260} stroke="#334155" strokeWidth={3}/>
      <line x1={550} y1={260} x2={800} y2={260} stroke="#334155" strokeWidth={3}/>
      {/* Center zone boundary */}
      <line x1={340} y1={570} x2={800} y2={570} stroke="#334155" strokeWidth={3}/>
      <line x1={340} y1={490} x2={340} y2={760} stroke="#334155" strokeWidth={4}/>
      <line x1={800} y1={490} x2={800} y2={760} stroke="#334155" strokeWidth={4}/>
      {/* Meeting room grid - left */}
      <line x1={450} y1={260} x2={450} y2={570} stroke="#334155" strokeWidth={2.5}/>
      <line x1={550} y1={260} x2={550} y2={570} stroke="#334155" strokeWidth={2.5}/>
      {[360,420,500].map(y=>(
        <line key={y} x1={340} y1={y} x2={550} y2={y} stroke="#334155" strokeWidth={2}/>
      ))}
      {/* Meeting room grid - right */}
      <line x1={890} y1={490} x2={890} y2={650} stroke="#334155" strokeWidth={2}/>
      <line x1={990} y1={490} x2={990} y2={650} stroke="#334155" strokeWidth={2}/>
      <line x1={800} y1={570} x2={1080} y2={570} stroke="#334155" strokeWidth={2}/>
      {/* Upper right dividers */}
      <line x1={1000} y1={20} x2={1000} y2={260} stroke="#334155" strokeWidth={2.5}/>
      <line x1={800} y1={180} x2={1000} y2={180} stroke="#334155" strokeWidth={2}/>
      <line x1={1080} y1={490} x2={1080} y2={760} stroke="#334155" strokeWidth={3}/>
      {/* Lower dividers */}
      <line x1={395} y1={650} x2={745} y2={650} stroke="#334155" strokeWidth={2}/>
      <line x1={625} y1={650} x2={625} y2={760} stroke="#334155" strokeWidth={2}/>
    </g>
  );
}

// ── Agent circle ──────────────────────────────────────────────────────────
interface AgentDotProps {
  agent: Agent;
  selected: boolean;
  onClick: () => void;
}

function AgentDot({ agent, selected, onClick }: AgentDotProps) {
  const pos = useRef<[number, number]>([0, 0]);
  const tgt = useRef<[number, number]>([0, 0]);
  const [xy, setXY] = useState<[number,number]>([0,0]);
  const pc = PROVIDER_COLORS[agent.provider];
  const sc = STATUS_COLORS[agent.status];
  const animRef = useRef<number>(0);
  const timerRef = useRef(Math.random() * 3000);
  const lastTime = useRef(0);

  useEffect(() => {
    const pts = ROOM_CENTERS[agent.room] || [[600,400]];
    const sp = pts[Math.floor(Math.random() * pts.length)];
    pos.current = [sp[0], sp[1]];
    tgt.current = [sp[0], sp[1]];
    setXY([sp[0], sp[1]]);

    const animate = (now: number) => {
      const dt = now - lastTime.current;
      lastTime.current = now;

      timerRef.current -= dt;
      if (timerRef.current <= 0) {
        const newPts = ROOM_CENTERS[agent.room] || [[600,400]];
        const n = newPts[Math.floor(Math.random() * newPts.length)];
        tgt.current = [n[0], n[1]];
        timerRef.current = 2000 + Math.random() * 4000;
      }

      const dx = tgt.current[0] - pos.current[0];
      const dz = tgt.current[1] - pos.current[1];
      const d = Math.sqrt(dx*dx + dz*dz);
      if (d > 0.5) {
        const speed = 30; // px per second
        pos.current[0] += (dx/d) * speed * (dt/1000);
        pos.current[1] += (dz/d) * speed * (dt/1000);
        setXY([pos.current[0], pos.current[1]]);
      }

      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [agent.room, agent.id]);

  return (
    <g
      transform={`translate(${xy[0]},${xy[1]})`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      {/* Outer pulse ring */}
      <circle r={18} fill={pc.primary} opacity={0.12}>
        <animate attributeName="r" values="14;20;14" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.15;0.05;0.15" dur="2s" repeatCount="indefinite"/>
      </circle>
      {/* Selected ring */}
      {selected && <circle r={16} fill="none" stroke="#ffffff" strokeWidth={2.5} opacity={0.9}/>}
      {/* Body */}
      <circle r={12} fill={pc.primary} stroke={selected?"#fff":pc.primary} strokeWidth={selected?2:0}/>
      {/* Status dot */}
      <circle cx={9} cy={-9} r={4} fill={sc} stroke="#fff" strokeWidth={1.5}/>
      {/* Avatar text */}
      <text textAnchor="middle" dominantBaseline="central" fontSize={8} fontWeight="700" fill="#fff">
        {agent.avatar}
      </text>
      {/* Name label */}
      <text textAnchor="middle" y={20} fontSize={8} fontWeight="600" fill="#1e293b"
        style={{paintOrder:"stroke", stroke:"#fff", strokeWidth:3, strokeLinejoin:"round"}}>
        {agent.name}
      </text>
    </g>
  );
}

// ── Scale bar ─────────────────────────────────────────────────────────────
function ScaleBar() {
  return (
    <g transform="translate(1080,750)">
      <line x1={0} y1={0} x2={80} y2={0} stroke="#334155" strokeWidth={2}/>
      <line x1={0} y1={-4} x2={0} y2={4} stroke="#334155" strokeWidth={2}/>
      <line x1={80} y1={-4} x2={80} y2={4} stroke="#334155" strokeWidth={2}/>
      <text x={40} y={-6} textAnchor="middle" fontSize={9} fill="#475569">2 m</text>
    </g>
  );
}

// ── Main Floor Plan Canvas ─────────────────────────────────────────────────
interface FloorPlanCanvasProps {
  onAgentClick: (a: Agent) => void;
  selectedAgentId: string | null;
}

function FloorPlanCanvas({ onAgentClick, selectedAgentId }: FloorPlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState({ x: 0, y: 0, w: 1200, h: 780 });
  const drag = useRef({ active: false, startX: 0, startY: 0, vbx: 0, vby: 0 });

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.85 : 1.18;
    setVb(prev => {
      const newW = Math.max(300, Math.min(1200, prev.w * factor));
      const newH = newW * (780/1200);
      const cx = prev.x + prev.w / 2;
      const cy = prev.y + prev.h / 2;
      return { x: cx - newW/2, y: cy - newH/2, w: newW, h: newH };
    });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, vbx: vb.x, vby: vb.y };
  }, [vb.x, vb.y]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag.current.active) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = vb.w / rect.width;
    const scaleY = vb.h / rect.height;
    const dx = (e.clientX - drag.current.startX) * scaleX;
    const dy = (e.clientY - drag.current.startY) * scaleY;
    setVb(prev => ({ ...prev, x: drag.current.vbx - dx, y: drag.current.vby - dy }));
  }, [vb.w, vb.h]);

  const onMouseUp = useCallback(() => { drag.current.active = false; }, []);
  const resetView = useCallback(() => setVb({ x: 0, y: 0, w: 1200, h: 780 }), []);
  const zoomIn    = useCallback(() => setVb(p => { const nw=p.w*0.8; const nh=nw*(780/1200); return {x:p.x+p.w/2-nw/2,y:p.y+p.h/2-nh/2,w:nw,h:nh}; }), []);
  const zoomOut   = useCallback(() => setVb(p => { const nw=Math.min(1200,p.w*1.25); const nh=nw*(780/1200); return {x:p.x+p.w/2-nw/2,y:p.y+p.h/2-nh/2,w:nw,h:nh}; }), []);

  return (
    <div className="relative w-full h-full select-none">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="w-full h-full"
        style={{ cursor: drag.current.active ? "grabbing" : "grab", background: "#f8fafc" }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Room fills */}
        {ROOMS.map(r => (
          <g key={r.id}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} stroke="none"/>
            {r.label && r.w > 60 && r.h > 40 && (
              <>
                <text x={r.x+r.w/2} y={r.y+r.h/2 - (r.sublabel?6:0)} textAnchor="middle"
                  fontSize={Math.min(11, r.w/8)} fontWeight="600" fill={r.labelColor||"#475569"}>
                  {r.label}
                </text>
                {r.sublabel && (
                  <text x={r.x+r.w/2} y={r.y+r.h/2+9} textAnchor="middle"
                    fontSize={Math.min(9, r.w/10)} fill={r.labelColor||"#94a3b8"} opacity={0.7}>
                    {r.sublabel}
                  </text>
                )}
              </>
            )}
          </g>
        ))}

        {/* Furniture */}
        <Furniture />

        {/* Walls on top */}
        <Walls />

        {/* Scale */}
        <ScaleBar />

        {/* Agents */}
        {AGENTS.map(a => (
          <AgentDot key={a.id} agent={a} selected={selectedAgentId===a.id} onClick={()=>onAgentClick(a)}/>
        ))}
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-white/90 backdrop-blur-sm rounded-xl p-1.5 border border-gray-200 shadow-sm dark:bg-gray-900/90 dark:border-gray-700">
        <button onClick={zoomIn}  className="size-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 text-lg font-bold transition-colors">+</button>
        <button onClick={zoomOut} className="size-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 text-lg font-bold transition-colors">−</button>
        <div className="h-px bg-gray-200 dark:bg-gray-700 mx-1"/>
        <button onClick={resetView} className="size-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-medium transition-colors">⊡</button>
      </div>

      {/* Hint */}
      <div className="absolute top-3 right-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-lg px-2.5 py-1 border border-gray-200 dark:border-gray-700">
        <p className="text-[10px] text-gray-500 dark:text-gray-400">Scroll to zoom · Drag to pan</p>
      </div>
    </div>
  );
}

export { FloorPlanCanvas };
