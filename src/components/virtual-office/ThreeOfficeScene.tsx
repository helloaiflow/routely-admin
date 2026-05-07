"use client";

import { useRef, useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Text, Billboard, OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import { AGENTS, Agent, PROVIDER_COLORS, STATUS_COLORS } from "@/lib/virtual-office/agents";
type ZoomCmd = "in" | "out" | "reset" | null;

interface Props {
  onAgentClick: (agent: Agent) => void;
  selectedAgentId: string | null;
  isDark: boolean;
  zoomCmd: ZoomCmd;
}

// ── Isometric camera controller ───────────────────────────────────────────
const ISO_ANGLE = Math.PI / 6;       // 30°
const ISO_Y_ANGLE = Math.PI / 4;     // 45° yaw
const DEFAULT_ZOOM = 28;

function IsoCamera({ zoomCmd }: { zoomCmd: ZoomCmd }) {
  const { camera, gl } = useThree();
  const zoom   = useRef(DEFAULT_ZOOM);
  const panX   = useRef(0);
  const panZ   = useRef(0);
  const isDrag = useRef(false);
  const isRightDrag = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const applyCamera = useCallback(() => {
    const cam = camera as THREE.OrthographicCamera;
    cam.zoom = zoom.current;
    // Isometric position: 45° yaw, 35.26° pitch
    const dist = 30;
    const cx = panX.current + dist * Math.cos(ISO_ANGLE) * Math.sin(ISO_Y_ANGLE);
    const cy = dist * Math.sin(ISO_ANGLE) * 1.6;
    const cz = panZ.current + dist * Math.cos(ISO_ANGLE) * Math.cos(ISO_Y_ANGLE);
    cam.position.set(cx, cy, cz);
    cam.lookAt(panX.current, 0, panZ.current);
    cam.updateProjectionMatrix();
  }, [camera]);

  // Zoom cmd from UI buttons
  useEffect(() => {
    if (!zoomCmd) return;
    if (zoomCmd === "in")    { zoom.current = Math.min(zoom.current * 1.25, 80); }
    if (zoomCmd === "out")   { zoom.current = Math.max(zoom.current * 0.8, 8);   }
    if (zoomCmd === "reset") { zoom.current = DEFAULT_ZOOM; panX.current = 0; panZ.current = 0; }
    applyCamera();
  }, [zoomCmd, applyCamera]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.88;
      zoom.current = Math.max(8, Math.min(80, zoom.current * factor));
      applyCamera();
    };

    const onMouseDown = (e: MouseEvent) => {
      isDrag.current = true;
      isRightDrag.current = e.button === 2;
      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDrag.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };

      if (isRightDrag.current || e.buttons === 2) {
        // Pan — move world in iso axes
        const speed = 0.05 / (zoom.current / DEFAULT_ZOOM);
        panX.current -= dx * speed;
        panZ.current += dy * speed * 0.5;
        applyCamera();
      }
    };

    const onMouseUp = () => { isDrag.current = false; };
    const onCtxMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onCtxMenu);

    applyCamera();
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onCtxMenu);
    };
  }, [gl, applyCamera]);

  return null;
}

// ── Wood floor ────────────────────────────────────────────────────────────
function WoodFloor({ x, z, w, d, color }: { x:number;z:number;w:number;d:number;color:string }) {
  return (
    <mesh receiveShadow position={[x, 0, z]}>
      <boxGeometry args={[w, 0.08, d]} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={0} />
    </mesh>
  );
}

// ── Wall with optional top color ──────────────────────────────────────────
function Wall({ pos, size, color="#e8e0d0", topColor }: {
  pos:[number,number,number]; size:[number,number,number]; color?:string; topColor?:string;
}) {
  const h = size[1];
  return (
    <group position={pos}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {topColor && (
        <mesh position={[0, h/2 + 0.02, 0]}>
          <boxGeometry args={[size[0], 0.04, size[2]]} />
          <meshStandardMaterial color={topColor} roughness={0.4} metalness={0.1} />
        </mesh>
      )}
    </group>
  );
}

// ── Glass partition ───────────────────────────────────────────────────────
function GlassWall({ pos, size }: { pos:[number,number,number]; size:[number,number,number] }) {
  const isWide = size[0] > size[2];
  return (
    <group position={pos}>
      <mesh castShadow>
        <boxGeometry args={[size[0], size[1], size[2]]} />
        <meshStandardMaterial color="#a0aec0" roughness={0.2} metalness={0.7} />
      </mesh>
      <mesh>
        <boxGeometry args={[
          isWide ? size[0] - 0.06 : 0.04,
          size[1] - 0.06,
          isWide ? 0.04 : size[2] - 0.06,
        ]} />
        <meshStandardMaterial color="#bee3f8" transparent opacity={0.28} roughness={0} />
      </mesh>
    </group>
  );
}

// ── Desk (modern style) ───────────────────────────────────────────────────
function Desk({ pos, rot=0 }: { pos:[number,number,number]; rot?:number }) {
  return (
    <group position={pos} rotation={[0,rot,0]}>
      {/* Tabletop */}
      <mesh castShadow receiveShadow position={[0,0.42,0]}>
        <boxGeometry args={[1.1,0.05,0.6]} />
        <meshStandardMaterial color="#e8d5a3" roughness={0.4} />
      </mesh>
      {/* Metal legs */}
      {([[-0.48,0.2,-0.26],[0.48,0.2,-0.26],[-0.48,0.2,0.26],[0.48,0.2,0.26]] as [number,number,number][]).map(([lx,ly,lz],i)=>(
        <mesh key={i} position={[lx,ly,lz]}>
          <cylinderGeometry args={[0.025,0.025,0.4,8]} />
          <meshStandardMaterial color="#1a202c" metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
      {/* Monitor */}
      <mesh castShadow position={[0,0.76,-0.16]}>
        <boxGeometry args={[0.55,0.34,0.03]} />
        <meshStandardMaterial color="#1a202c" roughness={0.2} metalness={0.6} />
      </mesh>
      <mesh position={[0,0.76,-0.15]}>
        <boxGeometry args={[0.5,0.29,0.01]} />
        <meshStandardMaterial color="#2d6cdf" emissive="#1a56c0" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0,0.46,-0.16]}>
        <cylinderGeometry args={[0.02,0.02,0.08,8]} />
        <meshStandardMaterial color="#374151" metalness={0.8} />
      </mesh>
      {/* Keyboard */}
      <mesh position={[0,0.45,0.08]}>
        <boxGeometry args={[0.42,0.02,0.16]} />
        <meshStandardMaterial color="#2d3748" roughness={0.9} />
      </mesh>
    </group>
  );
}

// ── Chair ─────────────────────────────────────────────────────────────────
function Chair({ pos, rot=0, color="#4a3f8f" }: { pos:[number,number,number]; rot?:number; color?:string }) {
  return (
    <group position={pos} rotation={[0,rot,0]}>
      <mesh castShadow position={[0,0.28,0]}>
        <boxGeometry args={[0.44,0.06,0.44]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh castShadow position={[0,0.52,-0.19]}>
        <boxGeometry args={[0.44,0.42,0.06]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh position={[0,0.14,0]}>
        <cylinderGeometry args={[0.03,0.03,0.28,8]} />
        <meshStandardMaterial color="#1a202c" metalness={0.8} />
      </mesh>
      {/* Wheels base */}
      <mesh position={[0,0.04,0]} rotation={[Math.PI/2,0,0]}>
        <torusGeometry args={[0.18,0.015,6,5]} />
        <meshStandardMaterial color="#1a202c" metalness={0.6} />
      </mesh>
    </group>
  );
}

// ── Sofa ──────────────────────────────────────────────────────────────────
function Sofa({ pos, rot=0, color="#4a3f8f" }: { pos:[number,number,number]; rot?:number; color?:string }) {
  const arm = "#5a4fa0";
  return (
    <group position={pos} rotation={[0,rot,0]}>
      <mesh castShadow position={[0,0.22,0]}>
        <boxGeometry args={[1.4,0.28,0.6]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh castShadow position={[0,0.44,-0.28]}>
        <boxGeometry args={[1.4,0.4,0.08]} />
        <meshStandardMaterial color={arm} roughness={0.4} />
      </mesh>
      {([-0.66,0.66] as number[]).map((ox,i)=>(
        <mesh key={i} castShadow position={[ox,0.38,0]}>
          <boxGeometry args={[0.09,0.34,0.6]} />
          <meshStandardMaterial color={arm} roughness={0.4} />
        </mesh>
      ))}
      {/* Cushion accents */}
      {([-0.42,0,0.42] as number[]).map((ox,i)=>(
        <mesh key={i} position={[ox,0.32,0.05]}>
          <boxGeometry args={[0.36,0.1,0.5]} />
          <meshStandardMaterial color="#f5a623" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

// ── Coffee table ──────────────────────────────────────────────────────────
function CoffeeTable({ pos }: { pos:[number,number,number] }) {
  return (
    <group position={pos}>
      <mesh castShadow position={[0,0.3,0]}>
        <boxGeometry args={[0.8,0.04,0.45]} />
        <meshStandardMaterial color="#f5a623" roughness={0.3} metalness={0.1} />
      </mesh>
      {([[-0.32,0.14,-0.18],[0.32,0.14,-0.18],[-0.32,0.14,0.18],[0.32,0.14,0.18]] as [number,number,number][]).map(([lx,ly,lz],i)=>(
        <mesh key={i} position={[lx,ly,lz]}>
          <boxGeometry args={[0.05,0.28,0.05]} />
          <meshStandardMaterial color="#1a202c" metalness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

// ── Plant ─────────────────────────────────────────────────────────────────
function Plant({ pos, scale=1 }: { pos:[number,number,number]; scale?:number }) {
  return (
    <group position={pos} scale={scale}>
      <mesh position={[0,0.18,0]}>
        <cylinderGeometry args={[0.12,0.1,0.35,8]} />
        <meshStandardMaterial color="#744210" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0,0.5,0]}>
        <sphereGeometry args={[0.26,10,10]} />
        <meshStandardMaterial color="#276749" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0.12,0.62,0.1]}>
        <sphereGeometry args={[0.16,8,8]} />
        <meshStandardMaterial color="#2f855a" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[-0.1,0.58,-0.1]}>
        <sphereGeometry args={[0.13,8,8]} />
        <meshStandardMaterial color="#38a169" roughness={0.7} />
      </mesh>
    </group>
  );
}

// ── Round meeting table ───────────────────────────────────────────────────
function MeetingTable({ pos, r=0.9 }: { pos:[number,number,number]; r?:number }) {
  return (
    <group position={pos}>
      <mesh castShadow position={[0,0.42,0]}>
        <cylinderGeometry args={[r,r,0.06,20]} />
        <meshStandardMaterial color="#e8d5a3" roughness={0.4} />
      </mesh>
      <mesh position={[0,0.2,0]}>
        <cylinderGeometry args={[0.04,0.04,0.4,8]} />
        <meshStandardMaterial color="#1a202c" metalness={0.7} />
      </mesh>
      <mesh position={[0,0.04,0]} rotation={[0,0,0]}>
        <cylinderGeometry args={[r*0.6,r*0.6,0.04,8]} />
        <meshStandardMaterial color="#1a202c" metalness={0.5} />
      </mesh>
    </group>
  );
}

// ── Whiteboard ────────────────────────────────────────────────────────────
function Whiteboard({ pos, rot=0 }: { pos:[number,number,number]; rot?:number }) {
  return (
    <group position={pos} rotation={[0,rot,0]}>
      {/* Frame */}
      <mesh castShadow position={[0,0,0]}>
        <boxGeometry args={[1.4,0.9,0.06]} />
        <meshStandardMaterial color="#718096" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* White board surface */}
      <mesh position={[0,0,0.04]}>
        <boxGeometry args={[1.28,0.78,0.01]} />
        <meshStandardMaterial color="#f7fafc" roughness={0.05} emissive="#ffffff" emissiveIntensity={0.05} />
      </mesh>
      {/* Chart bar */}
      <mesh position={[0.1,0.05,0.055]}>
        <boxGeometry args={[0.5,0.03,0.005]} />
        <meshStandardMaterial color="#4299e1" emissive="#4299e1" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[-0.1,-0.08,0.055]} rotation={[0,0,0.25]}>
        <boxGeometry args={[0.4,0.02,0.005]} />
        <meshStandardMaterial color="#48bb78" emissive="#48bb78" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

// ── Water cooler ──────────────────────────────────────────────────────────
function WaterCooler({ pos }: { pos:[number,number,number] }) {
  return (
    <group position={pos}>
      <mesh castShadow position={[0,0.4,0]}>
        <boxGeometry args={[0.3,0.8,0.3]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.3} metalness={0.3} />
      </mesh>
      <mesh position={[0,0.86,0]}>
        <cylinderGeometry args={[0.11,0.11,0.3,12]} />
        <meshStandardMaterial color="#bee3f8" transparent opacity={0.7} roughness={0} />
      </mesh>
    </group>
  );
}

// ── Room label ────────────────────────────────────────────────────────────
function RoomLabel({ pos, text, color }: { pos:[number,number,number]; text:string; color:string }) {
  return (
    <Billboard position={pos}>
      <Text fontSize={0.22} color={color} anchorX="center" anchorY="middle"
        outlineWidth={0.015} outlineColor="#ffffff">
        {text}
      </Text>
    </Billboard>
  );
}

// ── OFFICE LAYOUT ─────────────────────────────────────────────────────────
// Inspired by the reference images: warm wood floors, colored accent walls,
// glass partitions, open plan with separate rooms
function OfficeLayout({ isDark }: { isDark: boolean }) {
  const woodLight   = "#d4a843";
  const woodDark    = "#6b3d0f";
  const wood        = isDark ? woodDark    : woodLight;
  const wallLight   = "#f0ebe0";
  const wallDark    = "#1a202c";
  const wallColor   = isDark ? wallDark   : wallLight;
  const accentOrange = "#f5a623";
  const sofaColor   = "#4a3f8f";
  const chairColor  = "#2b6cb0";

  return (
    <group>
      {/* ── OUTER BOUNDARY WALLS ────────────────────────────────────── */}
      {/* Back-left wall (orange accent) */}
      <Wall pos={[-8.1,1.1,0]}    size={[0.18,2.2,12]} color={accentOrange} />
      {/* Back-right wall */}
      <Wall pos={[8.1,1.1,0]}     size={[0.18,2.2,12]} color={wallColor}   />
      {/* Back wall */}
      <Wall pos={[0,1.1,-6.1]}    size={[16.2,2.2,0.18]} color={accentOrange} />
      {/* Front wall (open / low) */}
      <Wall pos={[-6,0.5,6.1]}    size={[4,1,0.18]}   color={wallColor}   />
      <Wall pos={[6,0.5,6.1]}     size={[4,1,0.18]}   color={wallColor}   />

      {/* ── FLOORS ───────────────────────────────────────────────────── */}
      {/* Main open plan */}
      <WoodFloor x={0}    z={0}    w={16}   d={12}  color={wood} />
      {/* Meeting room floor (different color) */}
      <WoodFloor x={6.5}  z={-3.5} w={3}    d={5}   color={isDark?"#3d1f0a":"#c4955a"} />
      {/* Reception floor */}
      <WoodFloor x={-6.5} z={3.5}  w={3}    d={5}   color={isDark?"#1a2744":"#c8dff0"} />

      {/* ── GLASS PARTITION — meeting room ───────────────────────────── */}
      <GlassWall pos={[5,0.9,-1.2]}  size={[0.08,1.8,0.08]} />
      <GlassWall pos={[5,0.9,-1.8]}  size={[0.08,1.8,4]}    />
      <GlassWall pos={[5,0.9,-3.8]}  size={[3,1.8,0.08]}    />
      <GlassWall pos={[8,0.9,-1.8]}  size={[0.08,1.8,4]}    />

      {/* ── MEETING ROOM CONTENT ─────────────────────────────────────── */}
      <MeetingTable pos={[6.5,-0.4,-3.5]} r={1.0} />
      {([0,60,120,180,240,300] as number[]).map((deg,i)=>(
        <Chair key={i}
          pos={[6.5 + Math.sin(deg*Math.PI/180)*1.35, -0.4, -3.5 + Math.cos(deg*Math.PI/180)*1.35]}
          rot={-deg*Math.PI/180}
          color="#2d3748"
        />
      ))}
      <Whiteboard pos={[7.9,1.2,-5.5]} rot={Math.PI/2} />
      <RoomLabel pos={[6.5,2.2,-3.5]} text="MEETING ROOM" color={isDark?"#63b3ed":"#2b6cb0"} />

      {/* ── RECEPTION / LOUNGE ───────────────────────────────────────── */}
      <Wall pos={[-5,0.9,1.2]}   size={[0.08,1.8,0.08]} />
      <Wall pos={[-5,1.0,2.5]}   size={[0.08,2.0,3]}    color={wallColor} />
      <Wall pos={[-5,1.0,5.0]}   size={[3,2.0,0.08]}    color={wallColor} />
      <Sofa       pos={[-6.5,-0.4,3.2]}   rot={Math.PI/2} color={sofaColor} />
      <CoffeeTable pos={[-6.5,-0.4,4.2]} />
      <Plant      pos={[-7.5,-0.4,2]}   scale={0.9} />
      <Plant      pos={[-7.5,-0.4,5.5]} scale={0.8} />
      <WaterCooler pos={[-5.5,-0.4,5.5]} />
      <RoomLabel pos={[-6.5,2.2,3.8]} text="LOUNGE" color={isDark?"#9f7aea":"#6b46c1"} />

      {/* ── MAIN WORKSTATION AREA ────────────────────────────────────── */}
      {/* Row 1 */}
      {([-4,-2,0,2] as number[]).map((x,i)=>(
        <group key={i}>
          <Desk  pos={[x,-0.4,-3]} rot={0} />
          <Chair pos={[x,-0.4,-2.2]} rot={Math.PI} color={chairColor} />
        </group>
      ))}
      {/* Row 2 */}
      {([-4,-2,0,2] as number[]).map((x,i)=>(
        <group key={i}>
          <Desk  pos={[x,-0.4,0]}  rot={0} />
          <Chair pos={[x,-0.4,0.8]} rot={Math.PI} color={chairColor} />
        </group>
      ))}
      {/* Row 3 */}
      {([-4,-2] as number[]).map((x,i)=>(
        <group key={i}>
          <Desk  pos={[x,-0.4,3]}  rot={0} />
          <Chair pos={[x,-0.4,3.8]} rot={Math.PI} color={chairColor} />
        </group>
      ))}

      {/* ── PLANTS scattered ─────────────────────────────────────────── */}
      <Plant pos={[-7,-0.4,-5.5]} scale={1.1} />
      <Plant pos={[3.5,-0.4,-5.5]}  scale={0.9} />
      <Plant pos={[3.5,-0.4,5]}   scale={1.0} />
      <Plant pos={[-3,-0.4,4.8]}  scale={0.85} />

      {/* ── BOSS CABIN — top right ───────────────────────────────────── */}
      <Wall pos={[5,1.0,-5.5]}   size={[6,2.0,0.08]} color={wallColor} />
      <Desk       pos={[6.5,-0.4,-5.2]} rot={Math.PI} />
      <Chair      pos={[6.5,-0.4,-4.6]} rot={0} color="#2d3748" />
      <Chair      pos={[5.8,-0.4,-5.8]} rot={Math.PI*0.75} color="#718096" />
      <Chair      pos={[7.2,-0.4,-5.8]} rot={Math.PI*0.25} color="#718096" />
      <Plant      pos={[7.5,-0.4,-5.6]} scale={0.9} />
    </group>
  );
}

// ── Agent waypoints ───────────────────────────────────────────────────────
const WAYPOINTS: Record<string, [number,number][]> = {
  main_hall:   [[-4,0],[-2,0],[0,0],[2,0],[-4,-3],[-2,-3],[0,-3],[2,-3],[-3,3],[-1,3]],
  reception:   [[-6.5,3],[-6.5,4],[-7,3.5],[-6,4.5]],
  lounge:      [[-6.5,3.5],[-6,4],[-7,4.5],[-6.5,5]],
  boss_cabin:  [[6.5,-5],[5.8,-5.5],[7,-4.8],[6.5,-4.5]],
  accounts:    [[6,-3.5],[7,-3],[6.5,-4],[7,-4.5]],
  staff_room:  [[4,7],[5,7],[4.5,8]],
  centre_head: [[4,10],[5,11],[4.5,10.5]],
  counsellor:  [[9,7],[10,7],[9.5,8],[10,9]],
};

// ── Agent Avatar ──────────────────────────────────────────────────────────
function AgentAvatar({ agent, selected, onClick, isDark }: {
  agent:Agent; selected:boolean; onClick:()=>void; isDark:boolean;
}) {
  const gRef   = useRef<THREE.Group>(null);
  const glowR  = useRef<THREE.Mesh>(null);
  const wpts   = WAYPOINTS[agent.room] || [[0,0]];
  const sp     = wpts[Math.floor(Math.random()*wpts.length)];
  const pos    = useRef<[number,number]>([sp[0], sp[1]]);
  const tgt    = useRef<[number,number]>([sp[0], sp[1]]);
  const timer  = useRef(Math.random()*3);
  const pc     = PROVIDER_COLORS[agent.provider];
  const sc     = STATUS_COLORS[agent.status];

  useFrame((_,dt)=>{
    if (!gRef.current) return;
    timer.current -= dt;
    if (timer.current <= 0) {
      const pts = WAYPOINTS[agent.room] || [[0,0]];
      const n   = pts[Math.floor(Math.random()*pts.length)];
      tgt.current = [n[0], n[1]];
      timer.current = 2 + Math.random()*4;
    }
    const dx = tgt.current[0]-pos.current[0];
    const dz = tgt.current[1]-pos.current[1];
    const d  = Math.sqrt(dx*dx+dz*dz);
    if (d > 0.05) {
      const spd = 1.4;
      pos.current[0] += (dx/d)*spd*dt;
      pos.current[1] += (dz/d)*spd*dt;
      gRef.current.rotation.y = Math.atan2(dx,dz);
    }
    gRef.current.position.set(pos.current[0], Math.sin(Date.now()*0.003+agent.id.charCodeAt(0))*0.03, pos.current[1]);
    if (glowR.current) {
      const m = glowR.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 0.4+Math.sin(Date.now()*0.004)*0.25;
    }
  });

  return (
    <group ref={gRef} onClick={e=>{e.stopPropagation();onClick();}}>
      {/* Floor shadow */}
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.01,0]} scale={[1,0.6,1]}>
        <circleGeometry args={[0.22,16]} />
        <meshStandardMaterial color="#000" transparent opacity={isDark?0.2:0.1} />
      </mesh>
      {/* Glow ring */}
      <mesh ref={glowR} rotation={[-Math.PI/2,0,0]} position={[0,0.02,0]}>
        <ringGeometry args={[0.23,0.32,32]} />
        <meshStandardMaterial color={pc.primary} emissive={pc.primary} emissiveIntensity={0.5} transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
      {/* Body */}
      <mesh castShadow position={[0,0.44,0]}>
        <capsuleGeometry args={[0.16,0.3,8,16]} />
        <meshStandardMaterial color={pc.primary} roughness={0.2} metalness={0.2} emissive={pc.primary} emissiveIntensity={selected?0.5:0.07} />
      </mesh>
      {/* Head */}
      <mesh castShadow position={[0,0.86,0]}>
        <sphereGeometry args={[0.19,16,16]} />
        <meshStandardMaterial color={pc.glow} roughness={0.15} metalness={0.2} emissive={pc.glow} emissiveIntensity={0.12} />
      </mesh>
      {/* Eyes */}
      {([-0.06,0.06] as number[]).map((ex,i)=>(
        <mesh key={i} position={[ex,0.9,0.16]}>
          <sphereGeometry args={[0.028,8,8]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={1} />
        </mesh>
      ))}
      {/* Status */}
      <mesh position={[0.16,0.98,0]}>
        <sphereGeometry args={[0.05,8,8]} />
        <meshStandardMaterial color={sc} emissive={sc} emissiveIntensity={1.2} />
      </mesh>
      {/* Selected ring */}
      {selected&&(
        <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.03,0]}>
          <ringGeometry args={[0.35,0.42,32]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={1} transparent opacity={0.95} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Name */}
      <Billboard position={[0,1.28,0]}>
        <Text fontSize={0.17} color={isDark?"#ffffff":"#1a202c"} anchorX="center" anchorY="middle"
          outlineWidth={0.02} outlineColor={isDark?"#000":"#fff"}>
          {agent.name}
        </Text>
      </Billboard>
      {/* Task */}
      <Billboard position={[0,1.55,0]}>
        <Text fontSize={0.09} color={pc.primary} anchorX="center" anchorY="middle" maxWidth={2.5}
          outlineWidth={0.015} outlineColor={isDark?"#000":"#fff"}>
          {agent.currentTask.slice(0,38)+(agent.currentTask.length>38?"…":"")}
        </Text>
      </Billboard>
    </group>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────
function Scene({ onAgentClick, selectedAgentId, isDark, zoomCmd }: Props) {
  return (
    <>
      <IsoCamera zoomCmd={zoomCmd} />

      {/* Lighting — warm office feel */}
      <ambientLight intensity={isDark?0.5:1.1} color={isDark?"#c8d8ff":"#fff8f0"} />
      <directionalLight castShadow position={[8,18,12]} intensity={isDark?1.0:2.2} color={isDark?"#ffffff":"#fff8e8"}
        shadow-mapSize={[2048,2048]} shadow-camera-far={50}
        shadow-camera-left={-18} shadow-camera-right={18}
        shadow-camera-top={18}   shadow-camera-bottom={-18}
      />
      <pointLight position={[-8,6,-6]} intensity={isDark?0.6:0.8} color="#f5a623" />
      <pointLight position={[8,4,5]}  intensity={isDark?0.4:0.5} color="#4299e1" />
      <pointLight position={[0,8,0]}  intensity={isDark?0.3:0.4} color="#a0aec0" />

      {/* Office */}
      <OfficeLayout isDark={isDark} />

      {/* Agents */}
      {AGENTS.map(a=>(
        <AgentAvatar key={a.id} agent={a} selected={selectedAgentId===a.id}
          onClick={()=>onAgentClick(a)} isDark={isDark} />
      ))}
    </>
  );
}

// ── Export ────────────────────────────────────────────────────────────────
export function ThreeOfficeScene({ onAgentClick, selectedAgentId, isDark, zoomCmd }: Props) {
  return (
    <Canvas
      shadows
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
      camera={undefined}
    >
      <OrthographicCamera makeDefault position={[20,28,20]} zoom={DEFAULT_ZOOM} near={0.1} far={200} />
      <Scene
        onAgentClick={onAgentClick}
        selectedAgentId={selectedAgentId}
        isDark={isDark}
        zoomCmd={zoomCmd}
      />
    </Canvas>
  );
}
