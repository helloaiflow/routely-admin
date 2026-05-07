"use client";

import { useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Billboard } from "@react-three/drei";
import * as THREE from "three";
import { AGENTS, Agent, PROVIDER_COLORS, STATUS_COLORS } from "@/lib/virtual-office/agents";

interface ThreeOfficeSceneProps {
  onAgentClick: (agent: Agent) => void;
  selectedAgentId: string | null;
  isDark: boolean;
}

// ── Gather Town color palette ─────────────────────────────────────────────
const GT = {
  floorBase:    { light: "#E8E0D0", dark: "#1a2035" },
  floorGrid:    { light: "#D4C9B8", dark: "#1e2a42" },
  wallColor:    { light: "#4A5568", dark: "#2d3748" },
  wallTop:      { light: "#2D3748", dark: "#1a202c" },

  rooms: [
    { id: "main_hall",   label: "Operations Floor", x: -7,  z: -1,  w: 10, d: 10,
      light: "#C8DFF0", dark: "#0f2035", border: { light: "#3B82F6", dark: "#2563eb" } },
    { id: "reception",   label: "Reception",         x: -14, z:  5,  w:  5, d:  5,
      light: "#D4EDD4", dark: "#0f2518", border: { light: "#22C55E", dark: "#16a34a" } },
    { id: "lounge",      label: "Client Lounge",     x: -8,  z:  6,  w:  5, d:  5,
      light: "#EDD4F0", dark: "#1f0f2d", border: { light: "#A855F7", dark: "#9333ea" } },
    { id: "boss_cabin",  label: "Command Center",    x:  4,  z: -6,  w:  7, d:  6,
      light: "#D0E8FF", dark: "#0a1628", border: { light: "#0EA5E9", dark: "#0284c7" } },
    { id: "accounts",    label: "Finance & QA",      x:  4,  z:  1,  w:  7, d:  5,
      light: "#D4F0E8", dark: "#0a2018", border: { light: "#10B981", dark: "#059669" } },
    { id: "staff_room",  label: "Comms Hub",         x:  4,  z:  7,  w:  4, d:  4,
      light: "#FFF0D0", dark: "#1f1800", border: { light: "#F59E0B", dark: "#d97706" } },
    { id: "centre_head", label: "Analytics",         x:  4,  z: 11,  w:  4, d:  3,
      light: "#FFD0D0", dark: "#200a0a", border: { light: "#EF4444", dark: "#dc2626" } },
    { id: "counsellor",  label: "Support",           x:  9,  z:  7,  w:  4, d:  7,
      light: "#D8F0D4", dark: "#0a1f08", border: { light: "#4ADE80", dark: "#22c55e" } },
  ],
};

const ROOM_WAYPOINTS: Record<string, [number, number][]> = {
  main_hall:   [[-10,0],[-9,-1],[-8,1],[-7,-2],[-6,0],[-9,2],[-8,-3],[-7,1],[-10,-3],[-6,-2]],
  reception:   [[-14,5],[-13,6],[-15,4],[-14,4],[-13,5]],
  lounge:      [[-8,6],[-7,7],[-9,5],[-8,5],[-7,6]],
  boss_cabin:  [[5,-6],[6,-5],[7,-7],[5,-5],[7,-6]],
  accounts:    [[5,1],[6,2],[7,0],[5,3],[6,1],[7,2]],
  staff_room:  [[4,7],[5,8],[6,7],[5,7],[4,8]],
  centre_head: [[4,11],[5,11],[6,12],[5,12]],
  counsellor:  [[9,7],[10,8],[11,7],[10,9],[9,8]],
};

// ── Desk ──────────────────────────────────────────────────────────────────
function Desk({ position, isDark }: { position: [number, number, number]; isDark: boolean }) {
  const deskCol  = isDark ? "#5a3e1a" : "#8B6914";
  const legCol   = isDark ? "#3a2800" : "#6b4f10";
  const monBack  = isDark ? "#111827" : "#1f2937";
  const monScreen = isDark ? "#1d4ed8" : "#3b82f6";
  const kbdCol   = isDark ? "#1f2937" : "#374151";

  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[1.1, 0.06, 0.65]} />
        <meshStandardMaterial color={deskCol} roughness={0.4} metalness={0.1} />
      </mesh>
      {([ [-0.48,0.2,-0.27],[0.48,0.2,-0.27],[-0.48,0.2,0.27],[0.48,0.2,0.27] ] as [number,number,number][]).map(([lx,ly,lz],i)=>(
        <mesh key={i} position={[lx,ly,lz]}>
          <boxGeometry args={[0.05,0.4,0.05]} />
          <meshStandardMaterial color={legCol} roughness={0.6} />
        </mesh>
      ))}
      <mesh castShadow position={[0,0.72,-0.18]}>
        <boxGeometry args={[0.55,0.36,0.03]} />
        <meshStandardMaterial color={monBack} roughness={0.3} metalness={0.5} />
      </mesh>
      <mesh position={[0,0.72,-0.17]}>
        <boxGeometry args={[0.5,0.31,0.01]} />
        <meshStandardMaterial color={monScreen} emissive={monScreen} emissiveIntensity={isDark?0.5:0.2} />
      </mesh>
      <mesh position={[0,0.47,-0.18]}>
        <boxGeometry args={[0.05,0.07,0.05]} />
        <meshStandardMaterial color="#4B5563" metalness={0.6} />
      </mesh>
      <mesh position={[0,0.44,0.05]}>
        <boxGeometry args={[0.45,0.02,0.18]} />
        <meshStandardMaterial color={kbdCol} roughness={0.8} />
      </mesh>
    </group>
  );
}

// ── Chair ─────────────────────────────────────────────────────────────────
function Chair({ position, rotation=0, isDark }: { position:[number,number,number]; rotation?:number; isDark:boolean }) {
  const col = isDark ? "#1e3a5f" : "#2563EB";
  const col2 = isDark ? "#1e40af" : "#3B82F6";
  return (
    <group position={position} rotation={[0,rotation,0]}>
      <mesh castShadow position={[0,0.26,0]}>
        <boxGeometry args={[0.48,0.06,0.48]} />
        <meshStandardMaterial color={col} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0,0.52,-0.21]}>
        <boxGeometry args={[0.48,0.46,0.06]} />
        <meshStandardMaterial color={col2} roughness={0.5} />
      </mesh>
      <mesh position={[0,0.12,0]}>
        <cylinderGeometry args={[0.035,0.035,0.24,8]} />
        <meshStandardMaterial color="#374151" metalness={0.8} />
      </mesh>
    </group>
  );
}

// ── Plant ─────────────────────────────────────────────────────────────────
function Plant({ position }: { position:[number,number,number] }) {
  return (
    <group position={position}>
      <mesh position={[0,0.15,0]}>
        <cylinderGeometry args={[0.11,0.09,0.28,8]} />
        <meshStandardMaterial color="#92400e" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0,0.42,0]}>
        <sphereGeometry args={[0.2,8,8]} />
        <meshStandardMaterial color="#15803d" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0.09,0.52,0.09]}>
        <sphereGeometry args={[0.13,8,8]} />
        <meshStandardMaterial color="#16a34a" roughness={0.7} />
      </mesh>
    </group>
  );
}

// ── Sofa ──────────────────────────────────────────────────────────────────
function Sofa({ position, rotation=0, isDark }: { position:[number,number,number]; rotation?:number; isDark:boolean }) {
  const col = isDark ? "#4c1d95" : "#7C3AED";
  const col2 = isDark ? "#5b21b6" : "#8B5CF6";
  return (
    <group position={position} rotation={[0,rotation,0]}>
      <mesh castShadow position={[0,0.2,0]}>
        <boxGeometry args={[1.1,0.28,0.5]} />
        <meshStandardMaterial color={col} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0,0.42,-0.21]}>
        <boxGeometry args={[1.1,0.36,0.07]} />
        <meshStandardMaterial color={col2} roughness={0.5} />
      </mesh>
      {([-0.52,0.52] as number[]).map((ox,i)=>(
        <mesh key={i} castShadow position={[ox,0.38,0]}>
          <boxGeometry args={[0.08,0.32,0.5]} />
          <meshStandardMaterial color={col2} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

// ── Round Table ───────────────────────────────────────────────────────────
function RoundTable({ position }: { position:[number,number,number] }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0,0.38,0]}>
        <cylinderGeometry args={[0.45,0.45,0.06,20]} />
        <meshStandardMaterial color="#8B6914" roughness={0.4} />
      </mesh>
      <mesh position={[0,0.18,0]}>
        <cylinderGeometry args={[0.04,0.04,0.36,8]} />
        <meshStandardMaterial color="#4B5563" metalness={0.7} />
      </mesh>
    </group>
  );
}

// ── Room Floor Tile ───────────────────────────────────────────────────────
function RoomTile({ room, isDark }: { room: typeof GT.rooms[0]; isDark: boolean }) {
  const floorColor  = isDark ? room.dark  : room.light;
  const borderColor = isDark ? room.border.dark : room.border.light;
  return (
    <group position={[room.x, 0, room.z]}>
      <mesh receiveShadow position={[0,-0.04,0]}>
        <boxGeometry args={[room.w,0.08,room.d]} />
        <meshStandardMaterial color={floorColor} roughness={0.9} />
      </mesh>
      {/* Glowing border strips */}
      {([
        [-room.w/2, 0, 0,         0.06, room.d ],
        [ room.w/2, 0, 0,         0.06, room.d ],
        [0,         0, -room.d/2, room.w, 0.06 ],
        [0,         0,  room.d/2, room.w, 0.06 ],
      ] as [number,number,number,number,number][]).map(([bx,by,bz,bw,bd],i)=>(
        <mesh key={i} position={[bx,0.01,bz]}>
          <boxGeometry args={[bw,0.02,bd]} />
          <meshStandardMaterial color={borderColor} emissive={borderColor} emissiveIntensity={isDark?0.7:0.3} transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// ── Room Label ────────────────────────────────────────────────────────────
function RoomLabel({ room, isDark }: { room: typeof GT.rooms[0]; isDark: boolean }) {
  const color = isDark ? room.border.dark : room.border.light;
  return (
    <Billboard position={[room.x, 1.5, room.z - room.d/2 + 0.3]}>
      <Text fontSize={0.2} color={color} anchorX="center" anchorY="middle">
        {room.label.toUpperCase()}
      </Text>
    </Billboard>
  );
}

// ── Agent Avatar ──────────────────────────────────────────────────────────
function AgentAvatar({ agent, selected, onClick, isDark }: {
  agent: Agent; selected: boolean; onClick: ()=>void; isDark: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef  = useRef<THREE.Mesh>(null);
  const waypoints = ROOM_WAYPOINTS[agent.room] || [[0,0]];
  const startPt   = waypoints[Math.floor(Math.random()*waypoints.length)];
  const posRef    = useRef<[number,number]>([startPt[0], startPt[1]]);
  const targetRef = useRef<[number,number]>([startPt[0], startPt[1]]);
  const timerRef  = useRef(Math.random()*4);
  const pc = PROVIDER_COLORS[agent.provider];
  const sc = STATUS_COLORS[agent.status];
  const labelColor = isDark ? "#ffffff" : "#1f2937";
  const taskColor  = isDark ? pc.glow : pc.primary;

  useFrame((_,delta)=>{
    if (!groupRef.current) return;
    timerRef.current -= delta;
    if (timerRef.current<=0) {
      const pts = ROOM_WAYPOINTS[agent.room]||[[0,0]];
      const next = pts[Math.floor(Math.random()*pts.length)];
      targetRef.current = [next[0], next[1]];
      timerRef.current = 2.5 + Math.random()*4;
    }
    const speed = 1.6;
    const dx = targetRef.current[0]-posRef.current[0];
    const dz = targetRef.current[1]-posRef.current[1];
    const dist = Math.sqrt(dx*dx+dz*dz);
    if (dist>0.05) {
      posRef.current[0]+=(dx/dist)*speed*delta;
      posRef.current[1]+=(dz/dist)*speed*delta;
      groupRef.current.rotation.y = Math.atan2(dx,dz);
    }
    groupRef.current.position.x = posRef.current[0];
    groupRef.current.position.z = posRef.current[1];
    groupRef.current.position.y = Math.sin(Date.now()*0.003+agent.id.charCodeAt(0))*0.035;
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.35+Math.sin(Date.now()*0.004)*0.25;
      glowRef.current.scale.setScalar(1+Math.sin(Date.now()*0.003)*0.1);
    }
  });

  return (
    <group ref={groupRef} onClick={e=>{e.stopPropagation();onClick();}}>
      {/* Shadow on floor */}
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.005,0]} scale={[1,0.65,1]}>
        <circleGeometry args={[0.22,16]} />
        <meshStandardMaterial color="#000000" transparent opacity={isDark?0.25:0.12} />
      </mesh>

      {/* Glow ring */}
      <mesh ref={glowRef} rotation={[-Math.PI/2,0,0]} position={[0,0.01,0]}>
        <ringGeometry args={[0.24,0.34,32]} />
        <meshStandardMaterial color={pc.primary} emissive={pc.primary} emissiveIntensity={0.5} transparent opacity={0.65} side={THREE.DoubleSide} />
      </mesh>

      {/* Body */}
      <mesh castShadow position={[0,0.44,0]}>
        <capsuleGeometry args={[0.17,0.32,8,16]} />
        <meshStandardMaterial color={pc.primary} roughness={0.25} metalness={0.2} emissive={pc.primary} emissiveIntensity={selected?0.45:0.08} />
      </mesh>

      {/* Head */}
      <mesh castShadow position={[0,0.88,0]}>
        <sphereGeometry args={[0.19,16,16]} />
        <meshStandardMaterial color={pc.glow} roughness={0.2} metalness={0.25} emissive={pc.glow} emissiveIntensity={0.15} />
      </mesh>

      {/* Eyes */}
      {([-0.065,0.065] as number[]).map((ex,i)=>(
        <mesh key={i} position={[ex,0.91,0.16]}>
          <sphereGeometry args={[0.03,8,8]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.9} />
        </mesh>
      ))}

      {/* Status dot */}
      <mesh position={[0.17,0.99,0]}>
        <sphereGeometry args={[0.055,8,8]} />
        <meshStandardMaterial color={sc} emissive={sc} emissiveIntensity={1.2} />
      </mesh>

      {/* Selected ring */}
      {selected&&(
        <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.02,0]}>
          <ringGeometry args={[0.36,0.44,32]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.9} transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Name */}
      <Billboard position={[0,1.3,0]}>
        <Text fontSize={0.17} color={labelColor} anchorX="center" anchorY="middle" outlineWidth={isDark?0:0.03} outlineColor="#ffffff">
          {agent.name}
        </Text>
      </Billboard>

      {/* Task bubble */}
      <Billboard position={[0,1.58,0]}>
        <Text fontSize={0.10} color={taskColor} anchorX="center" anchorY="middle" maxWidth={2.2} outlineWidth={isDark?0:0.02} outlineColor="#ffffff">
          {agent.currentTask.slice(0,34)+(agent.currentTask.length>34?"…":"")}
        </Text>
      </Billboard>
    </group>
  );
}

// ── Furniture layout ──────────────────────────────────────────────────────
function Furniture({ isDark }: { isDark: boolean }) {
  return (
    <group>
      {/* Main Hall — 3 rows of desks */}
      {([ [-11,0,-3],[-9,0,-3],[-7,0,-3],[-11,0,0],[-9,0,0],[-7,0,0],[-11,0,3],[-9,0,3],[-7,0,3] ] as [number,number,number][]).map((p,i)=>(
        <Desk key={`d${i}`} position={p} isDark={isDark} />
      ))}
      {([ [-11,0,-2],[-9,0,-2],[-7,0,-2],[-11,0,1],[-9,0,1],[-7,0,1],[-11,0,4],[-9,0,4],[-7,0,4] ] as [number,number,number][]).map((p,i)=>(
        <Chair key={`cm${i}`} position={p} rotation={Math.PI} isDark={isDark} />
      ))}

      {/* Reception */}
      <Desk position={[-13,0,5]} isDark={isDark} />
      <Chair position={[-13,0,6]} rotation={Math.PI} isDark={isDark} />
      <Sofa position={[-15,0,5]} rotation={Math.PI/2} isDark={isDark} />
      <Plant position={[-15,0,3.5]} />

      {/* Lounge */}
      <RoundTable position={[-8,0,6]} />
      <Sofa position={[-8,0,7.5]} rotation={Math.PI} isDark={isDark} />
      <Sofa position={[-8,0,4.8]} isDark={isDark} />

      {/* Command Center */}
      <Desk position={[5,0,-6]}  isDark={isDark} />
      <Desk position={[7.5,0,-6]} isDark={isDark} />
      <Chair position={[5,0,-5]}   rotation={Math.PI} isDark={isDark} />
      <Chair position={[7.5,0,-5]} rotation={Math.PI} isDark={isDark} />
      <Plant position={[8.5,0,-8]} />
      <Plant position={[3.5,0,-8]} />

      {/* Finance & QA */}
      <Desk position={[5,0,1]}   isDark={isDark} />
      <Desk position={[7.5,0,1]} isDark={isDark} />
      <Chair position={[5,0,2]}   rotation={Math.PI} isDark={isDark} />
      <Chair position={[7.5,0,2]} rotation={Math.PI} isDark={isDark} />

      {/* Comms Hub */}
      <Desk position={[5,0,7]} isDark={isDark} />
      <Chair position={[5,0,8]} rotation={Math.PI} isDark={isDark} />

      {/* Support */}
      <Desk position={[10,0,8]} isDark={isDark} />
      <Chair position={[10,0,9]} rotation={Math.PI} isDark={isDark} />
      <Sofa position={[9.5,0,7]} rotation={-Math.PI/2} isDark={isDark} />

      {/* Plants */}
      <Plant position={[-6,0,-6.5]} />
      <Plant position={[2.5,0,-4]}  />
      <Plant position={[2.5,0,4]}   />
      <Plant position={[13,0,4]}    />
      <Plant position={[-17,0,2]}   />
    </group>
  );
}

// ── Walls ─────────────────────────────────────────────────────────────────
function Walls({ isDark }: { isDark: boolean }) {
  const c = isDark ? GT.wallColor.dark : GT.wallColor.light;
  const h = 1.9; const t = 0.18;
  return (
    <group>
      {([
        [-9,h/2,-8,  24,h,t],
        [-9,h/2, 12, 24,h,t],
        [-21,h/2,2,  t,h,20],
        [14, h/2,2,  t,h,20],
        [-3, h/2,-2, t,h,12],
        [7.8,h/2,0,  t,h,8 ],
        [5.5,h/2,-3, 4,h,t  ],
      ] as [number,number,number,number,number,number][]).map(([x,y,z,w,wh,d],i)=>(
        <mesh key={i} position={[x,y,z]} castShadow receiveShadow>
          <boxGeometry args={[w,wh,d]} />
          <meshStandardMaterial color={c} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

// ── Scene Inner ───────────────────────────────────────────────────────────
function SceneInner({ onAgentClick, selectedAgentId, isDark }: ThreeOfficeSceneProps) {
  const { camera } = useThree();
  useEffect(()=>{ camera.position.set(12,16,18); camera.lookAt(0,0,2); },[camera]);

  const ambColor  = isDark ? "#1a3a6a" : "#d0e8ff";
  const ambInt    = isDark ? 0.45 : 1.0;
  const dirInt    = isDark ? 1.2  : 1.8;
  const floorCol  = isDark ? GT.floorBase.dark : GT.floorBase.light;
  const gridCol1  = isDark ? "#1e2a42" : "#C8BEA8";
  const gridCol2  = isDark ? "#151e30" : "#D8D0C0";

  return (
    <>
      <ambientLight intensity={ambInt} color={ambColor} />
      <directionalLight castShadow position={[10,20,10]} intensity={dirInt} color="#ffffff"
        shadow-mapSize={[2048,2048]} shadow-camera-far={60}
        shadow-camera-left={-22} shadow-camera-right={22}
        shadow-camera-top={22}   shadow-camera-bottom={-22}
      />
      <pointLight position={[-10,5,-5]} intensity={0.5} color="#3B82F6" />
      <pointLight position={[8,5,8]}   intensity={0.4} color="#10B981" />
      <pointLight position={[-5,5,8]}  intensity={0.3} color="#A855F7" />

      {/* Main floor */}
      <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0,-0.1,2]}>
        <planeGeometry args={[44,32]} />
        <meshStandardMaterial color={floorCol} roughness={0.95} />
      </mesh>
      <gridHelper args={[44,44,gridCol1,gridCol2]} position={[0,-0.09,2]} />

      {/* Rooms */}
      {GT.rooms.map(r=><RoomTile key={r.id} room={r} isDark={isDark} />)}
      {GT.rooms.map(r=><RoomLabel key={`l${r.id}`} room={r} isDark={isDark} />)}

      {/* Walls */}
      <Walls isDark={isDark} />

      {/* Furniture */}
      <Furniture isDark={isDark} />

      {/* Agents */}
      {AGENTS.map(a=>(
        <AgentAvatar key={a.id} agent={a} selected={selectedAgentId===a.id} onClick={()=>onAgentClick(a)} isDark={isDark} />
      ))}

      <OrbitControls enablePan enableZoom enableRotate
        minDistance={6} maxDistance={32}
        maxPolarAngle={Math.PI/2.1}
        target={[0,0,2]}
        mouseButtons={{ LEFT:THREE.MOUSE.ROTATE, MIDDLE:THREE.MOUSE.DOLLY, RIGHT:THREE.MOUSE.PAN }}
      />
    </>
  );
}

// ── Export ────────────────────────────────────────────────────────────────
export function ThreeOfficeScene({ onAgentClick, selectedAgentId, isDark }: ThreeOfficeSceneProps) {
  const bg = isDark ? "#060c1a" : "#f0ebe0";
  return (
    <Canvas shadows camera={{ position:[12,16,18], fov:45 }} gl={{ antialias:true, alpha:false }} style={{ background: bg }}>
      <SceneInner onAgentClick={onAgentClick} selectedAgentId={selectedAgentId} isDark={isDark} />
    </Canvas>
  );
}
