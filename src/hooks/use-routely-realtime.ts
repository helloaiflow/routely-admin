"use client";

import { useEffect, useMemo, useRef } from "react";

import { useUser } from "@clerk/nextjs";

import { useSupabaseBrowser } from "@/lib/supabase-browser";

type RealtimeTable = "stops" | "draft_stops";

type UseRoutelyRealtimeOptions = {
  channelName: string;
  tables: readonly RealtimeTable[];
  onChange: () => void;
  debounceMs?: number;
  enabled?: boolean;
  refreshOnVisible?: boolean;
  /** Row filter for the postgres_changes binding. Defaults to tenant scoping
   *  (`tenant_id=eq.<tenant>`); pass e.g. `stop_id=eq.RTL-123` for a
   *  single-row subscription (detail panels). RLS still applies either way. */
  filter?: string;
};

function tenantIdFromMetadata(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(value);
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return null;
}

export function useRoutelyRealtime({
  channelName,
  tables,
  onChange,
  debounceMs = 350,
  enabled = true,
  refreshOnVisible = true,
  filter,
}: UseRoutelyRealtimeOptions) {
  const supabase = useSupabaseBrowser();
  const { user } = useUser();
  const onChangeRef = useRef(onChange);
  const tablesKey = useMemo(() => tables.join(","), [tables]);
  const tenantId = tenantIdFromMetadata(user?.publicMetadata?.tenant_id);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || !supabase || !tenantId || tablesKey.length === 0) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attemptReset: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;
    let joinedOnce = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => onChangeRef.current(), debounceMs);
    };

    // (Re)create the channel from scratch. Supabase Realtime closes channels
    // server-side (phx_close) when the short-lived Clerk JWT expires in the
    // race window between heartbeat token pushes — and supabase-js does NOT
    // rejoin a server-closed channel. Without this, realtime silently dies
    // after the first hiccup and never recovers until a full page reload.
    const subscribe = () => {
      if (disposed || !supabase) return;
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
      // Push a FRESH Clerk token to the realtime socket before (re)joining.
      // The join payload reuses the socket's cached access token, which only
      // refreshes on heartbeat — so after the 60s Clerk JWT expired, every
      // rejoin was rejected with "InvalidJWTToken: Token has expired" in a
      // loop. setAuth() (no args) pulls a fresh token via the accessToken
      // callback and updates the join payload, so the rejoin succeeds.
      void supabase.realtime
        .setAuth()
        .catch(() => {
          /* offline/Clerk hiccup — join will fail and backoff will retry */
        })
        .then(() => {
          if (disposed) return;
          join();
        });
    };

    const join = () => {
      if (!supabase) return;
      const ch = supabase.channel(`${channelName}-${tenantId}`);
      channel = ch; // set BEFORE subscribe so the stale-guard never races
      const rowFilter = filter ?? `tenant_id=eq.${tenantId}`;
      for (const table of tablesKey.split(",") as RealtimeTable[]) {
        ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: rowFilter },
          schedule,
        );
      }
      ch.subscribe((status, err) => {
        // Stale-channel guard: our own removeChannel() during a resubscribe
        // fires CLOSED on the OLD channel — without this check that callback
        // scheduled yet another resubscribe, looping forever (~1/s) and
        // hammering the API with refetches.
        if (disposed || ch !== channel) return;
        if (status === "SUBSCRIBED") {
          // Reset backoff only after the channel proves stable for a while;
          // resetting immediately let a join-then-die cycle retry at 1s forever.
          if (attemptReset) clearTimeout(attemptReset);
          attemptReset = setTimeout(() => {
            attempt = 0;
          }, 15_000);
          // Catch up on anything missed while the channel was DOWN — but only
          // on REsubscribes. The first join lands ~2s after mount, when the
          // page's own initial load is already in flight; scheduling here too
          // duplicated every list fetch on every page open (4 extra API calls,
          // 2-3s each) for nothing.
          if (joinedOnce) schedule();
          joinedOnce = true;
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn("[routely-realtime] subscription issue — resubscribing", {
            channelName,
            status,
            err,
          });
          if (attemptReset) clearTimeout(attemptReset);
          const delay = Math.min(30_000, 1_000 * 2 ** attempt);
          attempt += 1;
          if (retry) clearTimeout(retry);
          retry = setTimeout(subscribe, delay);
        }
      });
    };

    subscribe();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (refreshOnVisible) onChangeRef.current();
      // Mobile browsers suspend the socket in the background; if the channel
      // died while hidden, bring it back immediately instead of waiting.
      if (channel && channel.state !== "joined" && channel.state !== "joining") {
        subscribe();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      if (debounce) clearTimeout(debounce);
      if (retry) clearTimeout(retry);
      if (attemptReset) clearTimeout(attemptReset);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [channelName, debounceMs, enabled, filter, refreshOnVisible, supabase, tablesKey, tenantId]);
}
