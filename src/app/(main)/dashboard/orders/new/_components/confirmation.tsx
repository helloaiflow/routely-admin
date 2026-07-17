"use client";

import { useEffect, useRef } from "react";

import Link from "next/link";

import JsBarcode from "jsbarcode";
import { Check, Plus, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export type ConfirmationData = {
  tracking_number: string;
  rtscan_id: number;
  dispatch_status: string;
  miles: number;
  total: number;
  delivery_date: string;
  delivery_type: string;
  label_url?: string;
};

function TrackingBarcode({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!svgRef.current || !value || value === "PENDING") return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        displayValue: false,
        height: 48,
        margin: 4,
        background: "transparent",
        lineColor: "#000000",
      });
    } catch {
      /* ignore */
    }
  }, [value]);
  if (value === "PENDING") return null;
  return <svg ref={svgRef} className="mx-auto mt-2 w-full max-w-[280px]" />;
}

export function ConfirmationScreen({ data, onNewOrder }: { data: ConfirmationData; onNewOrder: () => void }) {
  const etaLabel =
    data.delivery_type === "same_day"
      ? "Delivered today"
      : `Scheduled for ${data.delivery_date || "next available day"}`;
  const isDispatched = data.dispatch_status === "dispatched";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl md:p-8">
        <div className="text-center">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500">
              <Check className="size-7 text-white" strokeWidth={3} />
            </div>
          </div>
          <h1 className="mb-1 type-page-title">Order confirmed</h1>
          <p className="mb-8 text-muted-foreground text-sm">
            {isDispatched ? "Your package is ready for pickup" : "We\u2019re processing your order"}
          </p>
          <div className="mb-6 rounded-2xl border border-border bg-card p-6">
            <p className="mb-2 text-muted-foreground text-xs uppercase tracking-wide">Tracking number</p>
            <p className="select-all font-mono font-semibold text-3xl tabular-nums tracking-tight md:text-4xl">
              {data.tracking_number}
            </p>
            <TrackingBarcode value={data.tracking_number} />
          </div>
          <div className="mb-8 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Distance</p>
              <p className="mt-1 font-semibold text-sm">{data.miles.toFixed(1)} mi</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
              <p className="mt-1 font-semibold text-sm tabular-nums">${data.total.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</p>
              <p className="mt-1 font-semibold text-emerald-600 text-sm capitalize">
                {data.dispatch_status.replace("_", " ")}
              </p>
            </div>
          </div>
          <p className="mb-6 text-muted-foreground text-sm">{etaLabel}</p>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                const now = new Date();
                const ts = `${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
                const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Label</title><style>@page{size:4in 2in;margin:0}*{margin:0;padding:0;box-sizing:border-box}body{width:4in;height:2in;font-family:Arial,sans-serif;padding:.15in;display:flex;flex-direction:column}.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:.5pt solid #ccc;padding-bottom:4px;margin-bottom:4px}.logo{font-size:10pt;font-weight:900;letter-spacing:-.5px}.ts{font-size:6pt;color:#666;text-align:right}.sl{font-size:5.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#888;margin-bottom:1px}.nm{font-size:9pt;font-weight:700;font-family:'Geist Mono',ui-monospace,monospace}.ad{font-size:7pt;color:#333}.dv{border-top:.5pt solid #eee;margin:4px 0}.ft{display:flex;gap:8px;align-items:center;margin-top:auto;font-size:6.5pt}.bg{border:.5pt solid #333;padding:1px 4px;border-radius:2px;font-size:6pt;font-weight:700;text-transform:uppercase}</style></head><body><div class="hdr"><div class="logo">ROUTELY</div><div class="ts">${ts}</div></div><div style="display:flex;gap:12px;flex:1"><div style="flex:1"><div class="sl">Tracking</div><div class="nm">${data.tracking_number}</div><div class="ad">${data.delivery_date} &middot; ${data.miles.toFixed(1)} mi</div></div></div><div class="dv"></div><div class="ft"><span>${data.dispatch_status.replace("_", " ")}</span><span style="margin-left:auto">$${data.total.toFixed(2)}</span></div></body></html>`;
                const w = window.open("", "_blank", "width=500,height=300");
                if (w) {
                  w.document.write(html);
                  w.document.close();
                  w.focus();
                  w.print();
                  w.onafterprint = () => w.close();
                }
              }}
            >
              <Printer className="size-4" />
              Print label
            </Button>
            <Button onClick={onNewOrder} className="w-full gap-2">
              <Plus className="size-4" />
              Create another order
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/dashboard/orders">Go to orders list</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
