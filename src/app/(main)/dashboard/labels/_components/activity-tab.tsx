"use client";

import { useMemo } from "react";

import { AlertTriangle, Mail, RotateCcw, ShoppingCart, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

import { type LabelOrder, money, relTime } from "./types";

type FeedEvent = {
  key: string;
  at: string;
  icon: React.ElementType;
  iconCls: string;
  title: string;
  sub?: string;
};

/** Chronological feed derived STRICTLY from stored order fields. */
function buildFeed(orders: LabelOrder[]): FeedEvent[] {
  const events: FeedEvent[] = [];
  for (const o of orders) {
    const to = o.to_address?.name ?? "recipient";
    if (o.purchased_at ?? o.status === "purchased") {
      events.push({
        key: `${o.order_id}-purchased`,
        at: o.purchased_at ?? o.created_at,
        icon: ShoppingCart,
        iconCls: "bg-success/10 text-success",
        title: `Label purchased ${o.order_id} → ${to}`,
        sub: `${o.rate?.provider ?? ""} ${o.rate?.service ?? ""} · ${money(o.rate?.client_price)}`,
      });
    }
    if (o.recipient_notified_at) {
      events.push({
        key: `${o.order_id}-notified`,
        at: o.recipient_notified_at,
        icon: Mail,
        iconCls: "bg-info/10 text-info",
        title: `Recipient notified${o.to_address?.email ? ` (${o.to_address.email})` : ""}`,
        sub: o.order_id,
      });
    }
    if (o.status === "refunded" || o.status === "refund_failed") {
      events.push({
        key: `${o.order_id}-refund`,
        at: o.created_at,
        icon: RotateCcw,
        iconCls: "bg-destructive/10 text-destructive",
        title: o.status === "refunded" ? `Refund issued for ${o.order_id}` : `Refund FAILED for ${o.order_id}`,
        sub: o.error ?? undefined,
      });
    }
    if (o.status === "failed") {
      events.push({
        key: `${o.order_id}-failed`,
        at: o.created_at,
        icon: AlertTriangle,
        iconCls: "bg-destructive/10 text-destructive",
        title: `Purchase failed ${o.order_id}`,
        sub: o.error ?? undefined,
      });
    }
  }
  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function ActivityTab({ orders }: { orders: LabelOrder[] }) {
  const feed = useMemo(() => buildFeed(orders), [orders]);

  if (feed.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 border-dashed bg-card px-6 py-14 text-center">
        <Sparkles className="size-5 text-muted-foreground/60" aria-hidden="true" />
        <p className="type-desc">Activity will appear here as you buy labels and recipients get notified.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <ol className="divide-y divide-border/40">
        {feed.map((e) => (
          <li key={e.key} className="flex items-start gap-3 px-4 py-3">
            <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", e.iconCls)}>
              <e.icon className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px]">{e.title}</p>
              {e.sub && (
                <p
                  className={
                    e.sub.startsWith("LBL-")
                      ? "truncate font-mono text-[11px] text-muted-foreground tabular-nums"
                      : "truncate text-[11px] text-muted-foreground"
                  }
                >
                  {e.sub}
                </p>
              )}
            </div>
            <time className="shrink-0 text-[11px] text-muted-foreground tabular-nums" dateTime={e.at}>
              {relTime(e.at)}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}
