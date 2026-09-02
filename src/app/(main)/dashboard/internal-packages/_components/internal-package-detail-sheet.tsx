"use client";

/* Detail + tracking for ONE internal package. Deliberately minimal: sender
 * office, recipient, status, driver/ETA and the public tracking link — no
 * medical operational detail ever renders here (CEO, 2026-09-01).
 * v2 (CEO same day): wider sheet, FROM/SHIP TO styled like the 4×6 label
 * (inverse chips, full origin address), and a Codes card — Code 128 and
 * tracking QR side by side, generated from the same lib the label uses. */

import { useEffect, useState } from "react";

import { ExternalLink, MapPin, Phone, StickyNote, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { generateBarcodeSvg, generateQrSvg, trackingUrl } from "@/lib/labels/label-codes";
import { cn } from "@/lib/utils";

import type { InternalPackage } from "./_types";
import { statusBadgeCls, statusLabelOf } from "./internal-status";

function InverseChip({ children }: { children: string }) {
  return (
    <span className="inline-block bg-foreground px-1.5 py-0.5 font-bold text-[10px] text-background uppercase tracking-[0.08em]">
      {children}
    </span>
  );
}

export function InternalPackageDetailSheet({
  pkg,
  onClose,
}: {
  pkg: InternalPackage | null;
  onClose: () => void;
}) {
  const tracking = pkg?.stop_id ?? "";
  const [barcode, setBarcode] = useState("");
  const [qr, setQr] = useState("");
  useEffect(() => {
    let alive = true;
    if (!tracking) {
      setBarcode("");
      setQr("");
      return;
    }
    setBarcode(generateBarcodeSvg(tracking));
    void generateQrSvg(tracking).then((svg) => {
      if (alive) setQr(svg);
    });
    return () => {
      alive = false;
    };
  }, [tracking]);

  const fromAddress = pkg
    ? [pkg.pickup_address, pkg.pickup_city, [pkg.pickup_state, pkg.pickup_zip].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <Sheet open={pkg !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[560px]">
        {pkg && (
          <>
            <SheetHeader className="pb-1">
              <div className="flex items-center justify-between gap-2 pr-6">
                <SheetTitle className="font-mono text-base text-primary">
                  {pkg.stop_id ?? pkg.id.slice(-10).toUpperCase()}
                </SheetTitle>
                <span className={cn("rounded-full px-2 py-0.5 font-semibold text-[11px]", statusBadgeCls(pkg))}>
                  {statusLabelOf(pkg)}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                Internal Package · created{" "}
                {new Date(pkg.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </SheetHeader>

            <div className="flex flex-col gap-3 px-4 pb-6">
              {/* Route card — FROM / SHIP TO in the label's visual language */}
              <section className="rounded-lg border border-border/60">
                <div className="border-b border-border/60 p-3">
                  <InverseChip>From</InverseChip>
                  <p className="mt-1.5 font-bold text-foreground text-sm uppercase tracking-tight">
                    {pkg.pickup_name ?? "—"}
                  </p>
                  {fromAddress && <p className="text-muted-foreground text-xs uppercase">{fromAddress}</p>}
                </div>
                <div className="p-3">
                  <InverseChip>Ship to</InverseChip>
                  <p className="mt-1.5 font-bold text-foreground text-sm uppercase tracking-tight">
                    {pkg.recipient_name}
                  </p>
                  <p className="flex items-start gap-1 text-muted-foreground text-xs uppercase">
                    <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                    {[pkg.delivery_address, pkg.delivery_city, [pkg.delivery_state, pkg.delivery_zip].filter(Boolean).join(" ")]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {(pkg.recipient_phone || pkg.recipient_email) && (
                    <p className="mt-1 flex items-center gap-1 text-muted-foreground text-xs">
                      {pkg.recipient_phone && (
                        <>
                          <Phone className="size-3 shrink-0" aria-hidden="true" /> {pkg.recipient_phone}
                        </>
                      )}
                      {pkg.recipient_phone && pkg.recipient_email && <span aria-hidden="true"> · </span>}
                      {pkg.recipient_email}
                    </p>
                  )}
                </div>
              </section>

              {/* Logistics */}
              <section className="rounded-lg border border-border/60 p-3">
                <h3 className="mb-1.5 flex items-center gap-1.5 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                  <Truck className="size-3.5" aria-hidden="true" /> Delivery
                </h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Driver</dt>
                  <dd className="text-right font-medium text-foreground">{pkg.driver_name ?? "Not assigned yet"}</dd>
                  <dt className="text-muted-foreground">ETA</dt>
                  <dd className="text-right font-medium text-foreground tabular-nums">
                    {pkg.eta_at
                      ? new Date(pkg.eta_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                      : "—"}
                  </dd>
                  <dt className="text-muted-foreground">Scheduled</dt>
                  <dd className="text-right font-medium text-foreground tabular-nums">{pkg.delivery_date ?? "—"}</dd>
                </dl>
              </section>

              {pkg.notes && (
                <section className="rounded-lg border border-border/60 p-3">
                  <h3 className="mb-1.5 flex items-center gap-1.5 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                    <StickyNote className="size-3.5" aria-hidden="true" /> Package note
                  </h3>
                  <p className="whitespace-pre-wrap text-foreground text-xs">{pkg.notes}</p>
                </section>
              )}

              {/* Codes — Code 128 + tracking QR side by side */}
              {tracking && (
                <section className="rounded-lg border border-border/60 p-3">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-4">
                    <div className="min-w-0">
                      {barcode ? (
                        <div
                          className="h-14 w-full [&_svg]:h-full [&_svg]:w-full"
                          // eslint-disable-next-line react/no-danger
                          dangerouslySetInnerHTML={{ __html: barcode }}
                        />
                      ) : (
                        <div className="h-14 w-full animate-pulse rounded bg-muted" />
                      )}
                      <p className="mt-1 text-center font-mono text-[11px] text-foreground tracking-[0.08em]">
                        {tracking}
                      </p>
                    </div>
                    <a
                      href={trackingUrl(tracking)}
                      target="_blank"
                      rel="noreferrer"
                      title="Open public tracking"
                      className="shrink-0 transition-transform hover:scale-[1.03]"
                    >
                      {qr ? (
                        <div
                          style={{ background: "#ffffff" }}
                          className="size-[88px] overflow-hidden rounded-sm border border-border p-1 [&_svg]:size-full"
                          // eslint-disable-next-line react/no-danger
                          dangerouslySetInnerHTML={{ __html: qr }}
                        />
                      ) : (
                        <div className="size-[88px] animate-pulse rounded-sm bg-muted" />
                      )}
                    </a>
                  </div>
                </section>
              )}

              {pkg.tracking_link && (
                <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                  <a href={pkg.tracking_link} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    Open public tracking
                  </a>
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
