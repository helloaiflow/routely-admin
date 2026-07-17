"use client";

/**
 * PrintPoolLabelsDialog — Phase 1 (PRINT ONLY, no Mongo writes)
 * ─────────────────────────────────────────────────────────────────────────
 * Prints a sheet of pre-generated tracking labels from the shared
 * `tracking_pool` onto a pre-cut adhesive label sheet.
 *
 *   Paper:  8.5 × 11 in
 *   Label:  1 × 0.375 in — CODE128 barcode of the RTL + the RTL text
 *   Batch:  25 / 50 / 75 / 100 / 125
 *
 * Pre-cut sheets always need per-printer calibration, so the grid geometry
 * (columns, rows, top/left margin, column/row gaps) is live-editable in an
 * "Alignment" panel and persisted to localStorage. Print a test sheet, lay it
 * over the physical labels, nudge until it lines up.
 *
 * PHASE 1 SCOPE: we only READ the next N `available` IDs and print them. We do
 * NOT write to Mongo here — printing and pool-consumption are decoupled so we
 * can perfect alignment without burning IDs. The "mark as printed" write
 * (printed_by / printed_at / printed_tenant_id / printed) lands in Phase 2 and
 * will only ADD fields — never touch status/tenant_id/assigned_* (FastAPI owns
 * those, and intake keeps finding the labels as "available").
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Printer, Loader2, AlertTriangle, Barcode, SlidersHorizontal, RotateCcw } from "lucide-react";
import JsBarcode from "jsbarcode";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/* ── Fixed paper + label size ────────────────────────────────────────────── */
const SHEET_W = 8.5;
const SHEET_H = 11;
const LABEL_W = 1.0;
const LABEL_H = 0.375;

const BATCHES = [25, 50, 75, 100, 125] as const;

/* ── Calibration (per-printer; persisted) ────────────────────────────────────
 * Specified the way label sheets are: count + top/left origin + pitch (gaps).
 * Defaults spread the columns across the full sheet width (the common
 * complaint with contiguous grids is that they cluster in the middle). */
type Cal = {
  cols: number;
  rows: number;
  marginTop: number;
  marginLeft: number;
  colGap: number;
  rowGap: number;
};
const DEFAULT_CAL: Cal = {
  cols: 7,
  rows: 24,
  marginTop: 0.55,
  marginLeft: 0.3,
  colGap: 0.15,
  rowGap: 0.05,
};
const CAL_KEY = "routely:pool-label-cal-v1";

function clampNum(n: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function sanitizeCal(c: Partial<Cal>): Cal {
  return {
    cols: Math.round(clampNum(Number(c.cols), 1, 12, DEFAULT_CAL.cols)),
    rows: Math.round(clampNum(Number(c.rows), 1, 40, DEFAULT_CAL.rows)),
    marginTop: clampNum(Number(c.marginTop), 0, 3, DEFAULT_CAL.marginTop),
    marginLeft: clampNum(Number(c.marginLeft), 0, 3, DEFAULT_CAL.marginLeft),
    colGap: clampNum(Number(c.colGap), 0, 1, DEFAULT_CAL.colGap),
    rowGap: clampNum(Number(c.rowGap), 0, 1, DEFAULT_CAL.rowGap),
  };
}

/* ── Barcode generator (same approach as PrintLabelDialog) ───────────────── */
function genBarcodeSvg(value: string): string {
  if (typeof window === "undefined" || !value) return "";
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: "CODE128",
      width: 2,
      height: 60,
      displayValue: false,
      // Quiet zone — required so scanners lock the start/stop patterns. The
      // labels print at 1in wide, so the quiet zone protects readability.
      margin: 10,
      background: "#ffffff",
      lineColor: "#000000",
    });
    const wAttr = parseFloat(svg.getAttribute("width") || "0");
    const hAttr = parseFloat(svg.getAttribute("height") || "0");
    if (wAttr > 0 && hAttr > 0) svg.setAttribute("viewBox", `0 0 ${wAttr} ${hAttr}`);
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    // Fill the cell width: X scales uniformly (module ratios preserved → valid
    // CODE128); only the harmless vertical axis stretches. Wide modules =
    // better scan reliability on these sub-inch stickers.
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("style", "width:100%;height:100%;display:block");
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return "";
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

/* ── One label cell — barcode + RTL text, NO border (inline styles so the
 *    preview renders identically to print) ──────────────────────────────── */
function cellHtml(id: string, svg: string): string {
  return (
    `<div style="width:${LABEL_W}in;height:${LABEL_H}in;box-sizing:border-box;` +
    `padding:0.015in 0.02in;display:flex;flex-direction:column;overflow:hidden;">` +
    `<div style="flex:1;min-height:0;">${svg}</div>` +
    `<div style="text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;` +
    `font-size:5pt;font-weight:700;line-height:1;letter-spacing:0.01em;margin-top:0.008in;` +
    `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(id)}</div>` +
    `</div>`
  );
}

/* ── One sheet div (origin-anchored grid via top/left padding + gaps) ────── */
function sheetHtml(pageItems: { id: string; svg: string }[], cal: Cal, pageBreak: boolean): string {
  const gridW = cal.cols * LABEL_W + (cal.cols - 1) * cal.colGap;
  const cells = pageItems.map((it) => cellHtml(it.id, it.svg)).join("");
  return (
    `<div style="width:${SHEET_W}in;height:${SHEET_H}in;box-sizing:border-box;` +
    `padding-top:${cal.marginTop}in;padding-left:${cal.marginLeft}in;background:#fff;` +
    `${pageBreak ? "page-break-after:always;break-after:page;" : ""}">` +
    `<div style="display:grid;grid-template-columns:repeat(${cal.cols},${LABEL_W}in);` +
    `column-gap:${cal.colGap}in;row-gap:${cal.rowGap}in;width:${gridW}in;">${cells}</div>` +
    `</div>`
  );
}

/* ── Chunk fetched IDs into pages of (cols × rows) ───────────────────────── */
function paginate(items: { id: string; svg: string }[], cal: Cal): { id: string; svg: string }[][] {
  const cap = Math.max(1, cal.cols * cal.rows);
  const pages: { id: string; svg: string }[][] = [];
  for (let i = 0; i < items.length; i += cap) pages.push(items.slice(i, i + cap));
  return pages.length ? pages : [[]];
}

/* ── Print popup ─────────────────────────────────────────────────────────── */
function printSheets(pages: { id: string; svg: string }[][], cal: Cal) {
  const w = window.open("", "_blank", "width=850,height=1100");
  if (!w) return;
  const body = pages.map((pg, i) => sheetHtml(pg, cal, i < pages.length - 1)).join("");
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>Tracking Labels</title>` +
    `<style>@page{size:${SHEET_W}in ${SHEET_H}in;margin:0}` +
    `html,body{margin:0;padding:0;background:#fff;` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `svg{width:100%;height:100%;display:block}</style>` +
    `<script>window.addEventListener('DOMContentLoaded',function(){` +
    `setTimeout(function(){window.print();},150);` +
    `window.onafterprint=function(){window.close();};});</script>` +
    `</head><body>${body}</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}

/* ── Scaled preview of a single sheet ────────────────────────────────────── */
function ScaledSheet({ scale, html }: { scale: number; html: string }) {
  const naturalW = SHEET_W * 96;
  const naturalH = SHEET_H * 96;
  return (
    <div style={{ width: naturalW * scale, height: naturalH * scale, overflow: "hidden", flexShrink: 0 }}>
      <div
        style={{ width: naturalW, height: naturalH, transform: `scale(${scale})`, transformOrigin: "top left" }}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted, locally-built sheet markup
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

/* ── A labeled inch input for the alignment panel ────────────────────────── */
function CalField({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}

/* ── Dialog ──────────────────────────────────────────────────────────────── */
export function PrintPoolLabelsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [count, setCount] = useState<number>(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [availableTotal, setAvailableTotal] = useState<number | null>(null);

  const [cal, setCal] = useState<Cal>(DEFAULT_CAL);
  const [showCal, setShowCal] = useState(false);

  // Load persisted calibration once.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CAL_KEY);
      if (raw) setCal(sanitizeCal(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, []);
  // Persist calibration on change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CAL_KEY, JSON.stringify(cal));
    } catch {
      /* ignore */
    }
  }, [cal]);
  function setCalField<K extends keyof Cal>(k: K, v: number) {
    setCal((prev) => sanitizeCal({ ...prev, [k]: v }));
  }

  // Fetch the next N available IDs whenever the dialog opens or count changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await fetch(`/api/client/tracking-pool/available?count=${count}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        setIds(Array.isArray(data.tracking_ids) ? data.tracking_ids.map(String) : []);
        setAvailableTotal(typeof data.available_total === "number" ? data.available_total : null);
      } catch {
        if (!cancelled) setError("Couldn't load available tracking IDs. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, count]);

  // Barcodes for the fetched IDs — memoized.
  const items = useMemo(() => ids.map((id) => ({ id, svg: genBarcodeSvg(id) })), [ids]);
  const pages = useMemo(() => paginate(items, cal), [items, cal]);

  // Preview scales to the surface width.
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [surfaceW, setSurfaceW] = useState(0);
  useEffect(() => {
    if (!open) return;
    const el = surfaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setSurfaceW(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    setSurfaceW(el.clientWidth);
    return () => ro.disconnect();
  }, [open, showCal]);

  const availableW = Math.max(0, surfaceW - 24);
  const scale = surfaceW > 0 ? Math.min(0.9, availableW / (SHEET_W * 96)) : 0.55;

  const returned = ids.length;
  const shortfall = returned < count;
  const capacity = cal.cols * cal.rows;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-0 p-0",
          "sm:w-auto sm:max-w-3xl",
          "max-h-[90dvh] flex flex-col overflow-hidden",
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 pt-4 pb-3 sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Barcode className="size-4" /> Print Tracking Labels
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 sm:px-5">
          {/* Batch selector + alignment toggle */}
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                How many labels
              </span>
              <button
                type="button"
                onClick={() => setShowCal((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  showCal ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <SlidersHorizontal className="size-3" /> Alignment
              </button>
            </div>
            <div className="inline-flex w-full max-w-full items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {BATCHES.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setCount(b)}
                  className={cn(
                    "flex flex-1 items-center justify-center rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
                    count === b
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
              {availableTotal != null
                ? `${availableTotal.toLocaleString()} labels available in the pool · ${capacity} fit per sheet.`
                : `${capacity} labels fit per sheet.`}
            </p>
            {shortfall && !loading && availableTotal != null && (
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                <AlertTriangle className="size-3.5 shrink-0" />
                Only {returned} available — printing {returned} instead of {count}.
              </p>
            )}
          </div>

          {/* Alignment panel */}
          {showCal && (
            <div className="mb-3 rounded-lg border border-border/70 bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-foreground">Sheet alignment (inches)</p>
                <button
                  type="button"
                  onClick={() => setCal(DEFAULT_CAL)}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <RotateCcw className="size-3" /> Reset
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <CalField label="Columns" value={cal.cols} step={1} min={1} max={12} onChange={(n) => setCalField("cols", n)} />
                <CalField label="Rows" value={cal.rows} step={1} min={1} max={40} onChange={(n) => setCalField("rows", n)} />
                <div />
                <CalField label="Top margin" value={cal.marginTop} step={0.01} min={0} max={3} onChange={(n) => setCalField("marginTop", n)} />
                <CalField label="Left margin" value={cal.marginLeft} step={0.01} min={0} max={3} onChange={(n) => setCalField("marginLeft", n)} />
                <div />
                <CalField label="Col gap" value={cal.colGap} step={0.01} min={0} max={1} onChange={(n) => setCalField("colGap", n)} />
                <CalField label="Row gap" value={cal.rowGap} step={0.01} min={0} max={1} onChange={(n) => setCalField("rowGap", n)} />
                <div />
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/70">
                Print one sheet, lay it over your label sheet, and nudge these until the barcodes sit on the labels.
                Saved automatically on this device.
              </p>
            </div>
          )}

          {/* Preview */}
          <div
            ref={surfaceRef}
            className="flex w-full max-w-full flex-col items-center gap-3 overflow-y-auto rounded-lg border border-border bg-[hsl(0_0%_96%)] p-3 dark:bg-[hsl(0_0%_12%)]"
            style={{ maxHeight: 420 }}
          >
            {loading ? (
              <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                <span className="text-[13px]">Loading labels…</span>
              </div>
            ) : error ? (
              <div className="flex h-40 max-w-[320px] flex-col items-center justify-center gap-2 text-center">
                <AlertTriangle className="size-6 text-destructive" />
                <p className="text-xs text-muted-foreground">{error}</p>
              </div>
            ) : returned === 0 ? (
              <div className="flex h-40 max-w-[320px] flex-col items-center justify-center gap-2 text-center">
                <Barcode className="size-6 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">No available tracking IDs in the pool.</p>
              </div>
            ) : (
              pages.map((pg, i) => (
                <ScaledSheet key={i} scale={scale} html={sheetHtml(pg, cal, false)} />
              ))
            )}
          </div>
          <p className="mt-2 text-center text-[10px] text-muted-foreground/70">
            Preview · {SHEET_W} × {SHEET_H} in · {cal.cols} × {cal.rows} grid · each label {LABEL_W} × {LABEL_H} in
            {pages.length > 1 ? ` · ${pages.length} sheets` : ""}
          </p>
        </div>

        <DialogFooter className="shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:px-5">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={() => returned > 0 && printSheets(pages, cal)}
            disabled={loading || returned === 0 || Boolean(error)}
            className="w-full gap-1.5 text-white sm:w-auto"
            style={{ backgroundColor: "var(--primary)" }}
          >
            <Printer className="size-3.5" /> Print {returned > 0 ? `${returned} label${returned === 1 ? "" : "s"}` : "labels"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Self-contained trigger ─────────────────────────────────────────────────
 * Owns its open state + renders the dialog. Styled as a primary icon button
 * (shadcn variant="default" size="icon") to match the neighboring Settings
 * button; keeps the barcode icon. Drop <PrintPoolLabelsButton /> anywhere. */
export function PrintPoolLabelsButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              onClick={() => setOpen(true)}
              aria-label="Print tracking labels"
              className={className}
            >
              <Barcode />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[11px]">
            Print labels
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PrintPoolLabelsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export default PrintPoolLabelsDialog;
