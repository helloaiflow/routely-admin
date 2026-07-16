"use client";

import { useEffect, useState } from "react";
import { Truck, Clock, FileText, CheckCircle2, X } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { statusLabel, formatDate, formatTime, toTitleCase } from "./_helpers";
import type { SearchResult } from "./_types";

const PAGE_SIZE = 25;

interface Props { results: SearchResult[]; loading: boolean; onSelect: (r: SearchResult) => void; }

type Kind = "delivered" | "in_transit" | "failed" | "pending" | "draft";
const KIND: Record<Kind, { bg: string; badge: string; Icon: React.ComponentType<{ className?: string }> }> = {
  delivered:  { bg: "bg-emerald-500", badge: "bg-emerald-500 text-white", Icon: CheckCircle2 },
  in_transit: { bg: "bg-primary",     badge: "bg-primary text-white",     Icon: Truck },
  failed:     { bg: "bg-rose-500",    badge: "bg-rose-500 text-white",    Icon: X },
  pending:    { bg: "bg-amber-400",   badge: "bg-amber-400 text-white",   Icon: Clock },
  draft:      { bg: "bg-muted-foreground", badge: "bg-muted-foreground text-background", Icon: FileText },
};

function statusKind(r: SearchResult): Kind {
  const s = r.status;
  if (["delivered","completed","picked_up"].includes(s)) return "delivered";
  if (["in_transit","out_for_delivery","dispatched","assigned"].includes(s)) return "in_transit";
  if (["failed","attempted","cancelled","failed_not_home"].includes(s)) return "failed";
  if (r.source === "draft" && ["draft","created","pending","approved","paid"].includes(s)) return "draft";
  return "pending";
}

function displayDate(r: SearchResult): string {
  const eventSt = ["delivered","completed","picked_up","failed","attempted","cancelled","in_transit","out_for_delivery","dispatched","assigned"];
  if (eventSt.includes(r.status) && r.eta_at) return `${formatDate(r.eta_at)} · ${formatTime(r.eta_at)}`;
  if (r.delivery_date) return formatDate(r.delivery_date);
  return formatDate(r.created_at);
}

export function ResultsMobile({ results, loading, onSelect }: Props) {
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Reset visible window when the result set changes
  useEffect(() => { setVisible(PAGE_SIZE); }, [results]);

  if (loading) return (
    <div className="divide-y divide-border/20">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <div className="size-5 shrink-0 animate-pulse rounded-full bg-muted/50" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted/50" />
            <div className="h-3 w-full animate-pulse rounded bg-muted/30" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted/20" />
          </div>
        </div>
      ))}
    </div>
  );

  if (results.length === 0) return (
    <div className="py-10 text-center text-sm text-muted-foreground/50">No results</div>
  );

  const shown = results.slice(0, visible);

  return (
    <div>
      <div className="divide-y divide-border/20">
        {shown.map((r) => {
          const kind = statusKind(r);
          const { bg, badge, Icon } = KIND[kind];
          const tid = r.stop_id ?? r.id;
          return (
            <button key={r.id} type="button" onClick={() => onSelect(r)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-muted/40">
              <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full", bg)}>
                <Icon className="size-3 text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{toTitleCase(r.recipient_name) || "—"}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{tid.length > 18 ? "…" + tid.slice(-15) : tid}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{[r.delivery_address, r.delivery_city].filter(Boolean).join(", ") || "—"}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground/70">{r.package_type ?? "RX"}</span>
                  {r.route_title && <span className="max-w-[120px] truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{r.route_title}</span>}
                  {r.driver_name && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="flex size-3.5 items-center justify-center rounded-full bg-primary/10 text-[7.5px] font-bold text-primary">{getInitials(r.driver_name)}</span>
                      {toTitleCase(r.driver_name)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">{displayDate(r)}</span>
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", badge)}>{statusLabel(r.status)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {visible < results.length && (
        <button type="button" onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="mt-2 w-full rounded-lg border border-border/50 bg-card py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">
          Load more ({results.length - visible} remaining)
        </button>
      )}
    </div>
  );
}
