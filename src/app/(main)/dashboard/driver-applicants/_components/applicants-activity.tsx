"use client";

import { useEffect } from "react";

import { FileSearch, Gavel } from "lucide-react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { fmt, type GlobalEvent } from "./_types";

type EventsResponse = { events: GlobalEvent[]; next_before: number | null };

const fetcher = async (url: string): Promise<EventsResponse> => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

const DECISION_EVENT_TYPES = new Set([
  "application.approved",
  "application.waitlisted",
  "application.rejected",
  "application.changes_requested",
]);

/** A04 — cross-applicant activity feed: every decision + every document-access
 *  event, across ALL applicants, newest first. Backed by a new, read-only
 *  Next.js proxy (/api/client/driver-applicants/events) that queries
 *  applicant_events directly — the same "read straight from Supabase" pattern
 *  the list/detail routes already use. There is no FastAPI endpoint for this
 *  (every onboarding route is scoped to one application at a time); see that
 *  route's header comment for the full gap note. */
export function ApplicantsActivity({
  onSelect,
  refreshToken,
}: {
  onSelect: (ref: string) => void;
  refreshToken: number;
}) {
  const { data, error, isLoading, mutate } = useSWR<EventsResponse>(
    "/api/client/driver-applicants/events?pageSize=100",
    fetcher,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch only when refreshToken bumps; mutate is stable from useSWR
  useEffect(() => {
    void mutate();
  }, [refreshToken]);

  const events = data?.events ?? [];

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">Could not load activity ({error.message}).</p>}
      {isLoading && !data ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : events.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No activity recorded yet.
        </p>
      ) : (
        <Card size="sm" className="border-border/60 shadow-sm">
          <CardContent className="divide-y divide-border/40 pb-3">
            {events.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => e.application_ref && onSelect(e.application_ref)}
                className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-muted/30"
              >
                <span className="mt-0.5 shrink-0 text-muted-foreground">
                  {e.event_type === "document.accessed" ? (
                    <FileSearch className="size-4" aria-hidden="true" />
                  ) : DECISION_EVENT_TYPES.has(e.event_type) ? (
                    <Gavel className="size-4" aria-hidden="true" />
                  ) : (
                    <span className="inline-block size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                    <span className="font-mono text-primary/80">{e.application_ref ?? "—"}</span>
                    <span className="font-medium">{e.event_type}</span>
                    {e.from_state || e.to_state ? (
                      <span className="text-muted-foreground">
                        {e.from_state ?? "—"} → {e.to_state ?? "—"}
                      </span>
                    ) : null}
                    {DECISION_EVENT_TYPES.has(e.event_type) && <Badge variant="outline">decision</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {fmt(e.occurred_at)} · by {e.actor} ({e.actor_type}){e.reason ? ` — ${e.reason}` : ""}
                  </p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
