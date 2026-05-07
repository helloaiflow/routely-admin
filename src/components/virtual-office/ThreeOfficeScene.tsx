"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Billboard } from "@react-three/drei";
import * as THREE from "three";
import { AGENTS, Agent, PROVIDER_COLORS, STATUS_COLORS } from "@/lib/virtual-office/agents";

// ── Types ──────────────────────────────────────────────────────────────────
interface ThreeOfficeSceneProps {
  onAgentClick: (agent: Agent) => void;
  selectedAgentId: string | null;
}

// ── Room definitions (x, z, w, d) in world units ─────────────────────────
const ROOMS = [
  { id: "main_hall",   label: "Ops Floor",       x: -8,  z: -2,  w: 10, d: 10, color: "#1a2744", border: "#2563EB" },
  { id: "reception",   label: "Reception",        x: -14, z:  5,  w:  5, d:  5, color: "#1a1f35", border: "#7C3AED" },
  { id: "lounge",      label: "Lounge",           x: -8,  z:  5,  w:  5, d:  5, color: "#1a1f35", border: "#6D28D9" },
  { id: "boss_cabin",  label: "Command Center",   x:  4,  z: -6,  w:  7, d:  6, color: "#0f1f3d", border: "#0EA5E9" },
  { id: "accounts",    label: "Finance & QA",     x:  4,  z:  1,  w:  7, d:  5, color: "#0f2219", border: "#059669" },
  { id: "staff_room",  label: "Comms",            x:  4,  z:  6,  w:  4, d:  4, color: "#0f1a2e", border: "#0167FF" },
  { id: "centre_head", label: "Analytics",        x:  4,  z: 10,  w:  4, d:  3, color: "#0f1a2e", border: "#0167FF" },
  { id: "counsellor",  label: "Support",          x:  9,  z:  6,  w:  4, d:  7, color: "#0f221a", border: "#10A37F" },
];

// ── Agent world positions per room ─────────────────────────────────────────
const ROOM_WAYPOINTS: Record<string, [number, number][]> = {
  main_hall:   [[-10,0],[-9,-1],[-8,1],[-7,-2],[-6,0],[-9,2],[-8,-3],[-7,1]],
  reception:   [[-14,5],[-13,6],[-15,4]],
  lounge:      [[-8,5],[-7,6],[-9,4]],
  boss_cabin:  [[5,-6],[6,-5],[7,-7]],
  accounts:    [[5,1],[6,2],[7,0],[5,3]],
  staff_room:  [[4,6],[5,7],[6,6]],
  centre_head: [[4,10],[5,10],[6,11]],
  counsellor:  [[9,6],[10,7],[11,6],[10,8]],
};

// ── Floor tile ─────────────────────────────────────────────────────────────
function FloorTile({ x, z, w, d, color, border }: { x: number; z: number; w: number; d: number; color: string; border: string }) {
  return (
    <group position={[x, 0, z]}>
      {/* Floor */}
      <mesh receiveShadow position={[0, -0.05, 0]}>
        <boxGeometry args={[w, 0.1, d]} />
        <meshStandardMaterial color={color} roughness={0.8} metalness={0.1} />
      </mesh>
      {/* Border glow strips */}
      {[[-w/2, 0, 0, 0.08, d], [w/2, 0, 0, 0.08, d], [0, 0, -d/2, w, 0.08], [0, 0, d/2, w, 0.08]].map(([bx, by, bz, bw, bd], i) => (
        <mesh key={i} position={[bx as number, 0.01, bz as number]}>
          <boxGeometry args={[bw as number, 0.02, bd as number]} />
          <meshStandardMaterial color={border} emissive={border} emissiveIntensity={0.6} transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
}

// ── Desk ───────────────────────────────────────────────────────────────────
function Desk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Desk surface */}
      <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[1.2, 0.06, 0.7]} />
        <meshStandardMaterial color="#8B6914" roughness={0.4} metalness={0.1} />
      </mesh>
      {/* Legs */}
      {[[-0.5, 0, -0.28], [0.5, 0, -0.28], [-0.5, 0, 0.28], [0.5, 0, 0.28]].map(([lx, ly, lz], i) => (
        <mesh key={i} position={[lx, 0.2, lz]}>
          <boxGeometry args={[0.05, 0.4, 0.05]} />
          <meshStandardMaterial color="#5a4010" roughness={0.6} />
        </mesh>
      ))}
      {/* Monitor */}
      <mesh castShadow position={[0, 0.72, -0.2]}>
        <boxGeometry args={[0.6, 0.4, 0.03]} />
        <meshStandardMaterial color="#111827" roughness={0.3} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.72, -0.19]}>
        <boxGeometry args={[0.55, 0.35, 0.01]} />
        <meshStandardMaterial color="#1d4ed8" emissive="#2563eb" emissiveIntensity={0.4} />
      </mesh>
      {/* Monitor stand */}
      <mesh position={[0, 0.47, -0.2]}>
        <boxGeometry args={[0.05, 0.06, 0.05]} />
        <meshStandardMaterial color="#374151" metalness={0.6} />
      </mesh>
      {/* Keyboard */}
      <mesh position={[0, 0.44, 0.05]}>
        <boxGeometry args={[0.5, 0.02, 0.2]} />
        <meshStandardMaterial color="#1f2937" roughness={0.8} />
      </mesh>
    </group>
  );
}

// ── Chair ──────────────────────────────────────────────────────────────────
function Chair({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[0.5, 0.06, 0.5]} />
        <meshStandardMaterial color="#1e3a5f" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 0.55, -0.22]}>
        <boxGeometry args={[0.5, 0.5, 0.06]} />
        <meshStandardMaterial color="#1e3a5f" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.25]} />
        <meshStandardMaterial color="#374151" metalness={0.8} />
      </mesh>
    </group>
  );
}

// ── Plant ──────────────────────────────────────────────────────────────────
function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.12, 0.1, 0.3, 8]} />
        <meshStandardMaterial color="#92400e" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.45, 0]}>
        <sphereGeometry args={[0.22, 8, 8]} />
        <meshStandardMaterial color="#15803d" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0.1, 0.55, 0.1]}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial color="#16a34a" roughness={0.8} />
      </mesh>
    </group>
  );
}

// ── Sofa ───────────────────────────────────────────────────────────────────
function Sofa({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow position={[0, 0.2, 0]}>
        <boxGeometry args={[1.2, 0.3, 0.5]} />
        <meshStandardMaterial color="#1e3a5f" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.45, -0.22]}>
        <boxGeometry args={[1.2, 0.4, 0.08]} />
        <meshStandardMaterial color="#1e3a5f" roughness={0.5} />
      </mesh>
      {[-0.55, 0.55].map((ox, i) => (
        <mesh key={i} castShadow position={[ox, 0.4, 0]}>
          <boxGeometry args={[0.1, 0.35, 0.5]} />
          <meshStandardMaterial color="#1e40af" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

// ── Wall ───────────────────────────────────────────────────────────────────
function Wall({ position, args }: { position: [number, number, number]; args: [number, number, number] }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color="#0d1526" roughness={0.9} metalness={0.05} />
    </mesh>
  );
}

// ── Room Label ─────────────────────────────────────────────────────────────
function RoomLabel({ position, label, color }: { position: [number, number, number]; label: string; color: string }) {
  return (
    <Billboard position={position}>
      <Text fontSize={0.22} color={color} anchorX="center" anchorY="middle" font={undefined}>
        {label.toUpperCase()}
      </Text>
    </Billboard>
  );
}

// ── Agent Avatar ───────────────────────────────────────────────────────────
function AgentAvatar({
  agent, selected, onClick,
}: {
  agent: Agent;
  selected: boolean;
  onClick: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  // Find initial room waypoint
  const waypoints = ROOM_WAYPOINTS[agent.room] || [[0, 0]];
  const startPt = waypoints[Math.floor(Math.random() * waypoints.length)];

  const posRef = useRef<[number, number]>([startPt[0], startPt[1]]);
  const targetRef = useRef<[number, number]>([startPt[0], startPt[1]]);
  const timerRef = useRef(Math.random() * 4);

  const providerColor = PROVIDER_COLORS[agent.provider];
  const statusColor = STATUS_COLORS[agent.status];

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    timerRef.current -= delta;
    if (timerRef.current <= 0) {
      const pts = ROOM_WAYPOINTS[agent.room] || [[0, 0]];
      const next = pts[Math.floor(Math.random() * pts.length)];
      targetRef.current = [next[0], next[1]];
      timerRef.current = 3 + Math.random() * 4;
    }

    // Smooth movement
    const speed = 1.5;
    const dx = targetRef.current[0] - posRef.current[0];
    const dz = targetRef.current[1] - posRef.current[1];
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.05) {
      posRef.current[0] += (dx / dist) * speed * delta;
      posRef.current[1] += (dz / dist) * speed * delta;
      // Face direction of movement
      groupRef.current.rotation.y = Math.atan2(dx, dz);
    }

    groupRef.current.position.x = posRef.current[0];
    groupRef.current.position.z = posRef.current[1];

    // Idle bounce
    groupRef.current.position.y = Math.sin(Date.now() * 0.003 + agent.id.charCodeAt(0)) * 0.04;

    // Glow pulse
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.4 + Math.sin(Date.now() * 0.004) * 0.3;
      glowRef.current.scale.setScalar(1 + Math.sin(Date.now() * 0.003) * 0.08);
    }
  });

  return (
    <group ref={groupRef} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {/* Glow ring on ground */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.25, 0.35, 32]} />
        <meshStandardMaterial
          color={providerColor.primary}
          emissive={providerColor.primary}
          emissiveIntensity={0.5}
          transparent opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Body */}
      <mesh castShadow position={[0, 0.45, 0]}>
        <capsuleGeometry args={[0.18, 0.35, 8, 16]} />
        <meshStandardMaterial
          color={providerColor.primary}
          roughness={0.3}
          metalness={0.2}
          emissive={providerColor.primary}
          emissiveIntensity={selected ? 0.4 : 0.1}
        />
      </mesh>

      {/* Head */}
      <mesh castShadow position={[0, 0.9, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial
          color={providerColor.glow}
          roughness={0.2}
          metalness={0.3}
          emissive={providerColor.glow}
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* Eyes */}
      {[-0.07, 0.07].map((ex, i) => (
        <mesh key={i} position={[ex, 0.93, 0.17]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} />
        </mesh>
      ))}

      {/* Status dot */}
      <mesh position={[0.18, 1.0, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={1} />
      </mesh>

      {/* Selected highlight ring */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.38, 0.46, 32]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Name label */}
      <Billboard position={[0, 1.35, 0]}>
        <Text fontSize={0.18} color="#ffffff" anchorX="center" anchorY="middle">
          {agent.name}
        </Text>
      </Billboard>

      {/* Task bubble */}
      <Billboard position={[0, 1.65, 0]}>
        <Text
          fontSize={0.11}
          color={providerColor.glow}
          anchorX="center"
          anchorY="middle"
          maxWidth={2}
        >
          {agent.currentTask.slice(0, 32) + (agent.currentTask.length > 32 ? "…" : "")}
        </Text>
      </Billboard>
    </group>
  );
}

// ── Office Furniture Layout ────────────────────────────────────────────────
function OfficeFurniture() {
  return (
    <group>
      {/* Main Hall desks */}
      {[[-11,0,-3],[-9,0,-3],[-7,0,-3],[-11,0,0],[-9,0,0],[-7,0,0],[-11,0,3],[-9,0,3],[-7,0,3]].map(([x,y,z], i) => (
        <Desk key={`desk-${i}`} position={[x, y, z]} />
      ))}
      {[[-11,0,-2],[-9,0,-2],[-7,0,-2],[-11,0,1],[-9,0,1],[-7,0,1],[-11,0,4],[-9,0,4],[-7,0,4]].map(([x,y,z], i) => (
        <Chair key={`chair-main-${i}`} position={[x, y, z]} rotation={Math.PI} />
      ))}

      {/* Reception sofas */}
      <Sofa position={[-14, 0, 4]} rotation={Math.PI / 2} />
      <Sofa position={[-14, 0, 6]} rotation={Math.PI / 2} />
      <Desk position={[-13, 0, 5]} />

      {/* Lounge */}
      <Sofa position={[-8, 0, 5]} />
      <Sofa position={[-8, 0, 7]} rotation={Math.PI} />

      {/* Command Center */}
      <Desk position={[5, 0, -6]} />
      <Desk position={[7, 0, -6]} />
      <Chair position={[5, 0, -5]} rotation={Math.PI} />
      <Chair position={[7, 0, -5]} rotation={Math.PI} />

      {/* Finance & QA desks */}
      <Desk position={[5, 0, 1]} />
      <Desk position={[7, 0, 1]} />
      <Chair position={[5, 0, 2]} rotation={Math.PI} />
      <Chair position={[7, 0, 2]} rotation={Math.PI} />

      {/* Support Room */}
      <Desk position={[10, 0, 7]} />
      <Chair position={[10, 0, 8]} rotation={Math.PI} />
      <Sofa position={[9, 0, 6]} rotation={-Math.PI / 2} />

      {/* Plants scattered */}
      <Plant position={[-13, 0, 3]} />
      <Plant position={[-6, 0, -6]} />
      <Plant position={[3, 0, -4]} />
      <Plant position={[3, 0, 4]} />
      <Plant position={[12, 0, 4]} />
      <Plant position={[-6, 0, 10]} />
    </group>
  );
}

// ── Walls Layout ───────────────────────────────────────────────────────────
function OfficeWalls() {
  const wallH = 1.8;
  const wallT = 0.15;
  return (
    <group>
      {/* Outer boundary */}
      <Wall position={[-9, wallH/2, -8]}  args={[24, wallH, wallT]} />
      <Wall position={[-9, wallH/2,  12]} args={[24, wallH, wallT]} />
      <Wall position={[-21, wallH/2, 2]}  args={[wallT, wallH, 20]} />
      <Wall position={[ 14, wallH/2, 2]}  args={[wallT, wallH, 20]} />

      {/* Internal room dividers */}
      <Wall position={[-3, wallH/2, -2]}  args={[wallT, wallH, 12]} />
      <Wall position={[ 3, wallH/2, -8]}  args={[wallT, wallH,  0.5]} />
      <Wall position={[-3, wallH/2,  4]}  args={[wallT, wallH, 0.15]} />

      {/* Command center walls */}
      <Wall position={[ 7.5, wallH/2, -3]} args={[wallT, wallH, 6]} />
      <Wall position={[ 5.5, wallH/2, -3]} args={[4, wallH, wallT]} />
    </group>
  );
}

// ── Main Floor (grass/carpet base) ─────────────────────────────────────────
function MainFloor() {
  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 2]}>
      <planeGeometry args={[40, 30, 20, 20]} />
      <meshStandardMaterial color="#0a1628" roughness={0.9} metalness={0.0} wireframe={false} />
    </mesh>
  );
}

// ── Grid overlay ───────────────────────────────────────────────────────────
function GridFloor() {
  return (
    <gridHelper
      args={[40, 40, "#1e3a5f", "#0f1f3d"]}
      position={[0, -0.09, 2]}
    />
  );
}

// ── Scene inner ────────────────────────────────────────────────────────────
function SceneInner({ onAgentClick, selectedAgentId }: ThreeOfficeSceneProps) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(12, 16, 18);
    camera.lookAt(0, 0, 2);
  }, [camera]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} color="#1a3a6a" />
      <directionalLight
        castShadow
        position={[10, 20, 10]}
        intensity={1.2}
        color="#ffffff"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={60}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <pointLight position={[-10, 5, -5]} intensity={0.6} color="#2563eb" />
      <pointLight position={[8, 5, 8]}   intensity={0.5} color="#059669" />
      <pointLight position={[-5, 5, 8]}  intensity={0.4} color="#7c3aed" />

      {/* Base */}
      <MainFloor />
      <GridFloor />

      {/* Rooms */}
      {ROOMS.map(r => (
        <FloorTile key={r.id} x={r.x} z={r.z} w={r.w} d={r.d} color={r.color} border={r.border} />
      ))}

      {/* Room labels */}
      {ROOMS.map(r => (
        <RoomLabel key={`lbl-${r.id}`} position={[r.x, 1.6, r.z - r.d / 2 + 0.4]} label={r.label} color={r.border} />
      ))}

      {/* Walls */}
      <OfficeWalls />

      {/* Furniture */}
      <OfficeFurniture />

      {/* Agents */}
      {AGENTS.map(agent => (
        <AgentAvatar
          key={agent.id}
          agent={agent}
          selected={selectedAgentId === agent.id}
          onClick={() => onAgentClick(agent)}
        />
      ))}

      {/* Camera controls */}
      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={6}
        maxDistance={35}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 0, 2]}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />
    </>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export function ThreeOfficeScene({ onAgentClick, selectedAgentId }: ThreeOfficeSceneProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [12, 16, 18], fov: 45 }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: "#060c1a" }}
    >
      <SceneInner onAgentClick={onAgentClick} selectedAgentId={selectedAgentId} />
    </Canvas>
  );
}
