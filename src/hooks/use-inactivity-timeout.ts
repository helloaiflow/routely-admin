"use client";

import { useCallback, useEffect, useRef } from "react";

import { useClerk } from "@clerk/nextjs";

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function useInactivityTimeout() {
  const { signOut } = useClerk();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      console.log("[Routely] Signing out due to inactivity");
      signOut({ redirectUrl: "/login?reason=timeout" });
    }, TIMEOUT_MS);
  }, [signOut]);

  useEffect(() => {
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];
    for (const e of events) window.addEventListener(e, resetTimer, { passive: true });
    resetTimer();
    return () => {
      for (const e of events) window.removeEventListener(e, resetTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);
}
