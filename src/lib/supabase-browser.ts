"use client";

import { useMemo } from "react";

import { useSession } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Browser Supabase client wired to Clerk via the NATIVE third-party-auth
 * integration (accessToken callback — NOT the legacy JWT template): every
 * request and the realtime socket carry the Clerk session token, which the
 * integration stamps with role:"authenticated" + tenant_id, so Postgres RLS
 * on public.stops applies per tenant.
 *
 * Realtime is an invalidation SIGNAL only — data always comes from our own
 * API routes (/api/client/...), never read directly from Supabase here.
 *
 * Returns null when the NEXT_PUBLIC_SUPABASE_* envs are absent or there is
 * no session yet — callers treat that as "realtime disabled", never a crash.
 */
export function useSupabaseBrowser(): SupabaseClient | null {
  const { session } = useSession();
  // Keyed on the session ID (stable per login), NOT the session object: Clerk
  // hands back a new session ref on every ~60s token refresh, and memoizing on
  // the object recreated the client — and tore down + re-subscribed every
  // realtime channel — once a minute. The accessToken callback still reads the
  // latest token via session.getToken() on each call.
  const sessionId = session?.id ?? null;
  const client = useMemo(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !session) return null;
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      accessToken: async () => (await session.getToken()) ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // DO NOT call client.realtime.setAuth(token) with an explicit token here.
  // In supabase-js >= 2.x, passing a token switches realtime into "manual
  // token" mode (_manuallySetToken = true), which DISABLES the automatic
  // heartbeat refresh (_setAuthSafely only refreshes callback-based tokens).
  // Clerk JWTs live ~60s, so the frozen manual token expired and Supabase
  // closed every channel ("Token has expired") with no rejoin — the silent
  // "realtime dies after a minute" bug. With the accessToken option above,
  // realtime-js already authenticates the socket on connect and re-fetches a
  // fresh Clerk token via the callback on every heartbeat (~25s), so the
  // socket token never goes stale. Verified against realtime-js 2.108.2.

  return client;
}
