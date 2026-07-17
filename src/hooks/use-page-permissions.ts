"use client";

import { useEffect, useState } from "react";

import { useUser } from "@clerk/nextjs";

/* ── usePagePermissions ──────────────────────────────────────────────────────
 * Client-side view of the member-system page permissions (Phase 4).
 * Owners (and legacy users without tenant_role) resolve instantly to full
 * access without a network call; members fetch their tenant_members
 * permissions. UI-only — every gated API enforces server-side regardless.
 * ─────────────────────────────────────────────────────────────────────────── */

export type PagePermissions = {
  orders: boolean;
  billing: boolean;
  reports: boolean;
  settings: boolean;
};

const FULL: PagePermissions = { orders: true, billing: true, reports: true, settings: true };
const NONE: PagePermissions = { orders: false, billing: false, reports: false, settings: false };

export function usePagePermissions(): {
  isMember: boolean;
  loaded: boolean;
  permissions: PagePermissions;
} {
  const { user, isLoaded } = useUser();
  const isMember = (user?.publicMetadata as Record<string, unknown> | undefined)?.tenant_role === "member";

  const [fetched, setFetched] = useState<PagePermissions | null>(null);
  const [fetchDone, setFetchDone] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isMember) return;
    let cancelled = false;
    fetch("/api/client/me/permissions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setFetched(data?.active ? (data.permissions as PagePermissions) : NONE);
        setFetchDone(true);
      })
      .catch(() => {
        if (cancelled) return;
        setFetched(NONE);
        setFetchDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isMember]);

  if (!isMember) return { isMember: false, loaded: isLoaded, permissions: FULL };
  return { isMember: true, loaded: fetchDone, permissions: fetched ?? NONE };
}
