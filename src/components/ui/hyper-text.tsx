"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const CHARS = "0123456789";

interface HyperTextProps {
  children: string;
  className?: string;
  duration?: number;   // ms per character scramble
  delay?: number;      // ms before start
  as?: React.ElementType;
}

export function HyperText({
  children,
  className,
  duration = 600,
  delay = 0,
  as: Tag = "span",
}: HyperTextProps) {
  const [display, setDisplay] = useState(children);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iterRef     = useRef(0);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      const iters = Math.max(children.length * 3, 18);

      intervalRef.current = setInterval(() => {
        iterRef.current += 1;

        setDisplay(
          children
            .split("")
            .map((char, i) => {
              if (char === " " || char === "," || char === ".") return char;
              // Reveal left-to-right progressively
              const revealAt = Math.floor((iterRef.current / iters) * children.length);
              if (i < revealAt) return char;
              // Scramble unrevealed chars
              return CHARS[Math.floor(Math.random() * CHARS.length)];
            })
            .join(""),
        );

        if (iterRef.current >= iters) {
          setDisplay(children);
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }, duration / iters);
    }, delay);

    return () => {
      if (timeoutRef.current)  clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [children, duration, delay]);

  return (
    <Tag className={cn("tabular-nums", className)}>
      {display}
    </Tag>
  );
}
