"use client";

import {
  AlertTriangle,
  CalendarClock,
  Download,
  ExternalLink,
  FilePlus2,
  Mail,
  MapPin,
  Printer,
  RotateCcw,
  ShoppingCart,
  Truck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { CarrierChip, printLabelPng, StatusBadge } from "./labels-table";
import {
  estArrivalLabel,
  fullDate,
  type LabelAddress,
  type LabelOrder,
  money,
  PACKAGE_TYPE_LABELS,
  relTime,
} from "./types";

function AddressBlock({ label, a }: { label: string; a?: LabelAddress }) {
  if (!a) return null;
  return (
    <div className="min-w-0">
      <p className="type-label mb-1 text-muted-foreground">{label}</p>
      <p className="truncate font-medium text-[13px]">{a.name ?? "—"}</p>
      <p className="truncate text-[11px] text-muted-foreground">{[a.street1, a.street2].filter(Boolean).join(", ")}</p>
      <p className="truncate text-[11px] text-muted-foreground">
        {[a.city, a.state, a.zip].filter(Boolean).join(", ")}
      </p>
      {a.email && <p className="truncate text-[11px] text-muted-foreground">{a.email}</p>}
    </div>
  );
}

/** Status timeline derived strictly from stored timestamps — nothing invented. */
function Timeline({ order }: { order: LabelOrder }) {
  const events: {
    label: string;
    at?: string;
    tone: "success" | "destructive" | "info" | "muted";
    icon: React.ElementType;
  }[] = [{ label: "Order created", at: order.created_at, tone: "muted", icon: FilePlus2 }];
  if (order.purchased_at)
    events.push({ label: "Label purchased", at: order.purchased_at, tone: "success", icon: ShoppingCart });
  if (order.recipient_notified_at)
    events.push({
      label: `Recipient notified${order.to_address?.email ? ` (${order.to_address.email})` : ""}`,
      at: order.recipient_notified_at,
      tone: "info",
      icon: Mail,
    });
  if (order.status === "refunded" || order.status === "refund_failed")
    events.push({
      label: order.status === "refunded" ? "Refund issued" : "Refund FAILED — needs attention",
      tone: "destructive",
      icon: RotateCcw,
    });
  if (order.status === "failed") events.push({ label: "Purchase failed", tone: "destructive", icon: AlertTriangle });

  const eta = estArrivalLabel(order);

  const TONE: Record<string, string> = {
    success: "bg-success/10 text-success ring-success/25",
    destructive: "bg-destructive/10 text-destructive ring-destructive/25",
    info: "bg-info/10 text-info ring-info/25",
    muted: "bg-muted text-muted-foreground ring-border/60",
  };

  return (
    <ol className="relative space-y-0">
      {events.map((e, i) => {
        const last = i === events.length - 1;
        return (
          <li key={e.label} className="relative flex gap-3 pb-4 last:pb-0">
            {/* connector — spans down to the next node */}
            {!last && <span className="absolute top-7 bottom-0 left-[13px] w-px bg-border/70" aria-hidden="true" />}
            <span
              className={cn(
                "relative z-10 grid size-7 shrink-0 place-items-center rounded-full ring-1",
                TONE[e.tone],
                last && "ring-2",
              )}
            >
              <e.icon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span className={cn("block text-[13px]", last ? "font-semibold" : "font-medium")}>{e.label}</span>
              {e.at && (
                <span className="block text-[11px] text-muted-foreground">
                  {relTime(e.at)} · {fullDate(e.at)}
                </span>
              )}
            </span>
          </li>
        );
      })}
      {/* Estimated arrival — derived from rate.days (business days), clearly an estimate */}
      {eta && order.status === "purchased" && (
        <li className="relative mt-1 flex gap-3 border-border/60 border-t pt-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/25">
            <CalendarClock className="size-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 pt-0.5">
            <span className="block font-medium text-[13px]">Estimated arrival</span>
            <span className="block text-[11px] text-muted-foreground">Est. {eta} · based on carrier transit days</span>
          </span>
        </li>
      )}
    </ol>
  );
}

export function LabelDetailSheet({
  order,
  onOpenChange,
}: {
  order: LabelOrder | null;
  onOpenChange: (open: boolean) => void;
}) {
  const o = order;
  const canAct = o?.status === "purchased" && o.shippo?.label_url;
  return (
    <Sheet open={!!o} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {o && (
          <>
            <SheetHeader className="border-border/60 border-b px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <SheetTitle className="font-mono text-[13px] text-primary tabular-nums">{o.order_id}</SheetTitle>
                <StatusBadge status={o.status} />
              </div>
              <SheetDescription className="flex items-center gap-2 text-[13px]">
                <CarrierChip provider={o.rate?.provider} />
                {o.rate?.provider} {o.rate?.service}
                {o.rate?.days != null && <span className="text-muted-foreground">· {o.rate.days}d</span>}
                <span className="ml-auto font-semibold text-foreground tabular-nums">
                  {money(o.rate?.client_price)}
                </span>
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 px-4 py-4">
              {/* Error surface for refunded/failed */}
              {(o.status === "failed" || o.status === "refunded" || o.status === "refund_failed") && (
                <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5" role="alert">
                  <p className="font-medium text-[13px] text-destructive">
                    {o.status === "refunded"
                      ? "Purchase failed — payment auto-refunded."
                      : o.status === "refund_failed"
                        ? "Purchase AND refund failed — contact support."
                        : "Purchase failed."}
                  </p>
                  {o.error && <p className="mt-1 break-words text-[11px] text-destructive/80">{o.error}</p>}
                  {o.payment?.refund_id && (
                    <p className="mt-1 font-mono text-[11px] text-destructive/80 tabular-nums">
                      Refund: {o.payment.refund_id}
                    </p>
                  )}
                </div>
              )}

              {/* From / To */}
              <div className="grid grid-cols-2 gap-3">
                <AddressBlock label="From" a={o.from_address} />
                <AddressBlock label="To" a={o.to_address} />
              </div>

              <Separator className="bg-border/60" />

              {/* Package + payment */}
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <p className="type-label mb-1 text-muted-foreground">Package</p>
                  <p>{PACKAGE_TYPE_LABELS[o.package_type ?? ""] ?? "—"}</p>
                </div>
                <div>
                  <p className="type-label mb-1 text-muted-foreground">Payment</p>
                  <p>
                    {o.payment?.type === "postpay"
                      ? "Invoice"
                      : o.payment?.card_last4
                        ? `${(o.payment.card_brand ?? "Card").replace(/^\w/, (c) => c.toUpperCase())} ···· ${o.payment.card_last4}`
                        : o.payment?.type === "card"
                          ? "Card"
                          : "—"}
                  </p>
                </div>
              </div>

              {/* Tracking */}
              {o.shippo?.tracking_number && (
                <div>
                  <p className="type-label mb-1 text-muted-foreground">Tracking</p>
                  <p className="select-all break-all font-mono text-[13px] tabular-nums">{o.shippo.tracking_number}</p>
                </div>
              )}

              <Separator className="bg-border/60" />

              <div>
                <p className="type-label mb-2 text-muted-foreground">Timeline</p>
                <Timeline order={o} />
              </div>

              {/* Label preview */}
              {canAct && (
                <a
                  href={o.shippo?.label_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mx-auto block max-w-[240px] overflow-hidden rounded-xl border border-border/60 shadow-sm transition-shadow hover:shadow-md"
                >
                  {/* biome-ignore lint/performance/noImgElement: remote label PNG, natural size varies */}
                  <img src={o.shippo?.label_url} alt="Shipping label — open full size" className="w-full" />
                </a>
              )}
            </div>

            {/* Actions — sticky bottom, thumb-reachable on mobile */}
            <div
              className="sticky bottom-0 flex gap-2 border-border/60 border-t bg-card/95 px-4 pt-3 backdrop-blur"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
            >
              {canAct ? (
                <>
                  <Button
                    onClick={() => printLabelPng(o.shippo?.label_url, `Label ${o.order_id}`)}
                    className="h-10 flex-1 gap-1.5 bg-primary font-semibold text-white hover:bg-primary/90"
                  >
                    <Printer className="size-4" aria-hidden="true" />
                    Print
                  </Button>
                  <Button asChild variant="outline" className="h-10 gap-1.5 border-border/60">
                    <a href={o.shippo?.label_url} target="_blank" rel="noreferrer" download>
                      <Download className="size-4" aria-hidden="true" />
                      PNG
                    </a>
                  </Button>
                  {o.shippo?.tracking_url && (
                    <Button asChild variant="outline" className="h-10 gap-1.5 border-border/60">
                      <a href={o.shippo.tracking_url} target="_blank" rel="noreferrer">
                        <Truck className="size-4" aria-hidden="true" />
                        Track
                      </a>
                    </Button>
                  )}
                </>
              ) : o.shippo?.tracking_url ? (
                <Button asChild variant="outline" className="h-10 flex-1 gap-1.5 border-border/60">
                  <a href={o.shippo.tracking_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-4" aria-hidden="true" />
                    Check status on carrier site
                  </a>
                </Button>
              ) : (
                <p className="flex h-10 flex-1 items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  No label actions available
                </p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
