"use client";

import { useInactivityTimeout } from "@/hooks/use-inactivity-timeout";

export function InactivityGuard() {
  useInactivityTimeout();
  return null;
}
