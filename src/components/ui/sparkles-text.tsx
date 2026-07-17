"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Sparkle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  angle: number;
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function SparkleIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path
        d="M12 0 L13.8 9.4 L22 12 L13.8 14.6 L12 24 L10.2 14.6 L2 12 L10.2 9.4 Z"
        fill={color}
      />
    </svg>
  );
}

interface SparklesTextProps {
  children: React.ReactNode;
  className?: string;
  sparkleColor?: string;
  sparkleCount?: number;
}

export function SparklesText({
  children,
  className,
  sparkleColor = "var(--primary)",
  sparkleCount = 5,
}: SparklesTextProps) {
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const addSparkle = () => {
      const sparkle: Sparkle = {
        id:      nextId.current++,
        x:       randomBetween(5, 95),
        y:       randomBetween(5, 95),
        size:    randomBetween(6, 14),
        opacity: 1,
        angle:   randomBetween(0, 360),
      };

      setSparkles((prev) => [...prev.slice(-(sparkleCount - 1)), sparkle]);

      // Remove it after animation
      setTimeout(() => {
        setSparkles((prev) => prev.filter((s) => s.id !== sparkle.id));
      }, 700);
    };

    // Initial burst
    for (let i = 0; i < sparkleCount; i++) {
      setTimeout(addSparkle, i * 80);
    }

    // Continuous low rate
    const interval = setInterval(() => {
      addSparkle();
    }, 1200);

    return () => clearInterval(interval);
  }, [sparkleCount]);

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      {sparkles.map((sp) => (
        <span
          key={sp.id}
          aria-hidden="true"
          style={{
            position:  "absolute",
            left:      `${sp.x}%`,
            top:       `${sp.y}%`,
            transform: `translate(-50%, -50%) rotate(${sp.angle}deg)`,
            pointerEvents: "none",
            animation: "sparkle-fade 700ms ease-out forwards",
          }}
        >
          <SparkleIcon size={sp.size} color={sparkleColor} />
        </span>
      ))}
      <span className="relative z-10">{children}</span>

      <style>{`
        @keyframes sparkle-fade {
          0%   { opacity: 1; transform: translate(-50%, -50%) rotate(var(--angle, 0deg)) scale(0.5); }
          50%  { opacity: 1; transform: translate(-50%, -50%) rotate(var(--angle, 0deg)) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--angle, 0deg)) scale(0.8); }
        }
      `}</style>
    </span>
  );
}
