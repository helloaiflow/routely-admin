"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Printer, Tag, Package as PackageIcon, AlertTriangle } from "lucide-react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Public image — copied from media/LabelLogo.png so Next can serve it.
 *  Path uses the on-disk casing (lowercase 'l') so Vercel's case-sensitive
 *  Linux filesystem resolves it correctly in production. */
const LABEL_LOGO_SRC = "/img/labelLogo.png";

/* ───────────────────────────────────────────────────────────────────────────
 * Modes & printer routing
 *
 *   Rx       — 2 × 1 in (Zebra ZD410 Rx stock). Driver controls orientation.
 *   Shipping — 4 × 6 in portrait (JADENS 268BT). All content lives inside
 *              a 3.45 × 5.05 in safe canvas (top 0.18 in, h-centered) so
 *              no zone prints past the driver-reserved edges.
 * ─────────────────────────────────────────────────────────────────────────── */
type LabelMode = "rx2x1" | "shipping4x6";
type PrinterId = "zebra-zd410" | "jadens-268bt" | "system";

const PAPER: Record<LabelMode, {
  w: number; h: number; label: string; orient: "landscape" | "portrait";
}> = {
  rx2x1:       { w: 2.25, h: 1.25, label: "2.25 × 1.25 in", orient: "landscape" },
  // 4 × 6 in shipping stock. The 1fr BARCODE row in the grid absorbs the
  // height change so the layout reflows automatically (no row math to redo).
  shipping4x6: { w: 4, h: 6, label: "4 × 6 in", orient: "portrait" },
};

const PRINTER_TO_MODE: Record<PrinterId, LabelMode | null> = {
  "zebra-zd410":  "rx2x1",
  "jadens-268bt": "shipping4x6",
  "system":       null,
};
const MODE_TO_PRINTER: Record<LabelMode, PrinterId> = {
  "rx2x1":       "zebra-zd410",
  "shipping4x6": "jadens-268bt",
};
// Customer-facing names are by LABEL SIZE, not printer model (models confuse
// non-technical clients). The underlying ids stay the same so size pairing
// keeps working; only the displayed text changes.
const PRINTER_LABELS: Record<PrinterId, string> = {
  "zebra-zd410":  "Label · 2.25 × 1.25 in",
  "jadens-268bt": "Shipping · 4 × 6 in",
  "system":       "Other / system printer",
};

/* ───────────────────────────────────────────────────────────────────────────
 * Label data
 * ─────────────────────────────────────────────────────────────────────────── */
type LabelData = {
  trackingId:        string;       // "RTL-XXXXXXXX" or "Tracking Pending"
  recipient:         string;       // UPPERCASED
  recipientAddress?: string;       // "STREET, CITY, ST ZIP" UPPERCASED
  recipientPhone?:   string;
  fromName:          string;       // tenant.company_name uppercased
  fromAddress?:      string;
  serviceType:       string;       // "Delivery" | "DropOff" | "Pickup" | "Return"
  serviceDate:       string;
  packageType?:      string;
  requiresSignature: boolean;
  coldChain:         boolean;
  collectCod:        boolean;
  codAmount:         string;
  notes?:            string;
};

/* ───────────────────────────────────────────────────────────────────────────
 * Real barcode / QR generators
 *
 * Both run client-side only (the dialog is "use client") and produce SVG
 * STRINGS so the React preview and the print popup can render the exact
 * same artifact via dangerouslySetInnerHTML / .innerHTML.
 *
 * Barcode  — jsbarcode, format CODE128, displayValue:false. We strip the
 *            width/height attrs and replace with viewBox + preserveAspect
 *            so the bars scale to whatever container we render into.
 * QR       — qrcode, type "svg", margin 0, errorCorrection M. Payload is
 *            a real public tracking URL so a phone camera resolves to a
 *            usable page. Fallback: bare RTL.
 * ─────────────────────────────────────────────────────────────────────────── */
function trackingUrl(trackingId: string): string {
  if (!trackingId || trackingId === "Tracking Pending") return "Tracking Pending";
  return `https://app.routelypro.com/track/${encodeURIComponent(trackingId)}`;
}

function generateBarcodeSvg(value: string): string {
  if (typeof window === "undefined" || !value || value === "Tracking Pending") return "";
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: "CODE128",
      width: 2,
      height: 80,
      displayValue: false,
      // QUIET ZONE — the white margin each side of a 1-D barcode is REQUIRED
      // for scanners to lock onto the start/stop patterns. margin:0 reads fine
      // on a backlit screen but fails on thermal print where the bars sit flush
      // to the label edge. 10 module-units each side is the safe minimum.
      margin: 10,
      background: "#ffffff",
      lineColor: "#000000",
    });
    // Promote jsbarcode's px width/height to a viewBox so the SVG scales
    // cleanly. preserveAspectRatio="none" lets it FILL the cell: the X axis
    // scales every module by the SAME factor → bar-width RATIOS are preserved
    // (still a valid CODE128); only the harmless vertical axis stretches.
    // Filling the width keeps the printed modules as WIDE as possible —
    // critical on the small 2.25in label so each bar prints at several thermal
    // dots instead of sub-dot slivers that merge into an unreadable blob.
    const wAttr = parseFloat(svg.getAttribute("width") || "0");
    const hAttr = parseFloat(svg.getAttribute("height") || "0");
    if (wAttr > 0 && hAttr > 0) svg.setAttribute("viewBox", `0 0 ${wAttr} ${hAttr}`);
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("style", "width:100%;height:100%;display:block");
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return "";
  }
}

async function generateQrSvg(text: string): Promise<string> {
  if (typeof window === "undefined" || !text) return "";
  try {
    const raw = await QRCode.toString(text, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
    // qrcode's SVG ships with fixed width/height — strip so it scales.
    return raw
      .replace(/<svg([^>]*)\swidth="[^"]*"/i, '<svg$1')
      .replace(/<svg([^>]*)\sheight="[^"]*"/i, '<svg$1')
      .replace(/<svg([^>]*)>/i,
               '<svg$1 preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block">');
  } catch {
    return "";
  }
}

/* ───────────────────────────────────────────────────────────────────────────
 * Short date formatter — ISO "YYYY-MM-DD" → "MM/DD/YY". Pass-through for
 * anything that doesn't match the ISO shape so already-formatted strings
 * survive.
 * ─────────────────────────────────────────────────────────────────────────── */
function fmtShortDate(s: string): string {
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}/${m[3]}/${m[1].slice(2)}`;
  return s;
}

/* ───────────────────────────────────────────────────────────────────────────
 * splitAddress — "STREET, CITY, ST ZIP" → { street, locality }
 * ─────────────────────────────────────────────────────────────────────────── */
function splitAddress(addr?: string): { street: string; locality: string } {
  if (!addr) return { street: "", locality: "" };
  const parts = addr.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length <= 1) return { street: parts[0] || "", locality: "" };
  return { street: parts[0], locality: parts.slice(1).join(", ") };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * RxLabel2x1 — 2.225 × 1.25 in landscape.
 *
 * Grid math (padding 0.03in × 2 → inner 2.19 × 1.19in) — tighter margins +
 * a taller barcode for more reliable thermal scanning:
 *   0.24  HEADER   logo (0.22in) | MM/DD/YY · PKG (no "Delivery" text)
 *   0.28  BARCODE  real Code 128 — taller bars (was 0.20)
 *   0.14  RTL      mono 12pt 900
 *   0.07  FROM     <tenant company>       (border-top divider)
 *   0.01  spacer   visual gap between FROM and TO block
 *   0.10  TO       <RECIPIENT NAME>
 *   0.09  street   (indented under "TO:")
 *   0.09  city, state zip
 *   0.09  phone
 *   Σ = 1.11in + 8 × 0.01 row gap = 1.19in inside 1.19in inner. ✓
 * ═══════════════════════════════════════════════════════════════════════════ */
function RxLabel2x1({ data, barcodeSvg }: { data: LabelData; barcodeSvg: string }) {
  const { street, locality } = splitAddress(data.recipientAddress);
  const metaText = `${fmtShortDate(data.serviceDate)}${
    data.packageType ? ` · ${data.packageType.toUpperCase()}` : ""
  }`;
  return (
    <div style={{
      width: "2.25in", height: "1.25in", background: "#fff", color: "#000",
      boxSizing: "border-box", padding: "0.03in",
      display: "grid",
      gridTemplateRows: "0.24in 0.28in 0.14in 0.07in 0.01in 0.10in 0.09in 0.09in 0.09in",
      rowGap: "0.01in",
      fontFamily: '-apple-system,BlinkMacSystemFont,"Inter",Arial,sans-serif',
      overflow: "hidden",
    }}>
      {/* HEADER — logo + MM/DD/YY · PKG (no service-type text) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LABEL_LOGO_SRC} alt="Routely"
             style={{ height: "0.22in", width: "auto", display: "block" }} />
        {metaText && (
          <div style={{
            textAlign: "right", lineHeight: 1.1, flexShrink: 0,
            fontSize: "7pt", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
          }}>{metaText}</div>
        )}
      </div>
      {/* BARCODE */}
      <div style={{ display: "flex", alignItems: "stretch", justifyContent: "center", overflow: "hidden" }}
           dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
      {/* RTL — dominant */}
      <div style={{
        textAlign: "center",
        fontFamily: '"Geist Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
        fontSize: "12pt", fontWeight: 900, letterSpacing: "0.03em", lineHeight: 1,
      }}>
        {data.trackingId}
      </div>
      {/* FROM */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.04in",
        fontSize: "6pt", lineHeight: 1.1, overflow: "hidden",
        borderTop: "0.005in solid #000", paddingTop: "0.01in",
      }}>
        <span style={{ fontWeight: 800, flexShrink: 0 }}>FROM:</span>
        <span style={{ fontWeight: 600, textTransform: "uppercase",
                       overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {data.fromName}
        </span>
      </div>
      {/* SPACER — visual gap between FROM and TO block */}
      <div />
      {/* TO name */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.04in",
        fontSize: "7pt", lineHeight: 1.1, overflow: "hidden",
      }}>
        <span style={{ fontWeight: 800, flexShrink: 0 }}>TO:</span>
        <span style={{ fontWeight: 700, textTransform: "uppercase",
                       overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {data.recipient}
        </span>
      </div>
      {/* street */}
      <div style={{
        fontSize: "6pt", lineHeight: 1.1, fontWeight: 600, textTransform: "uppercase",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        paddingLeft: "0.16in",
      }}>{street || "—"}</div>
      {/* city, state zip */}
      <div style={{
        fontSize: "6pt", lineHeight: 1.1, fontWeight: 600, textTransform: "uppercase",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        paddingLeft: "0.16in",
      }}>{locality || ""}</div>
      {/* phone */}
      <div style={{
        fontSize: "6pt", lineHeight: 1.1, fontWeight: 700,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        paddingLeft: "0.16in",
      }}>{data.recipientPhone ? `☎ ${data.recipientPhone}` : ""}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ShippingLabel4x6V2 — fills the FULL 4 × 6 in page. No safe-canvas
 * wrapper, no bottom blank buffer. The grid sums to exactly the page
 * height (with the BARCODE row as `1fr` so it absorbs any slack and
 * the footer is guaranteed to sit at the bottom).
 *
 * Math (height = 6in):
 *   padding 0.10in × 2 (top + bottom)          = 0.20in
 *   row-gap 0.05in × 5                          = 0.25in
 *   fixed rows: 0.50 + 1.50 + 0.55 + 0.80 + 0.50 = 3.85in
 *   BARCODE (1fr) absorbs:  6 − 0.20 − 0.25 − 3.85 = 1.70in
 *   Σ check: 0.20 + 0.25 + 3.85 + 1.70 = 6.00in ✓
 *
 * Section order:
 *   HEADER     (0.50)   logo image | SERVICE · DATE
 *   SHIP TO    (1.50)   inverted chip · 15pt 900 name · street · 12pt CITY/ST/ZIP · phone
 *   ROUTE      (0.55)   primary inverted chip + COLD/SIG/COD/pkg flags
 *   QR + RTL   (0.80)   0.70in real QR  |  17pt mono RTL · FROM line
 *   BARCODE    (1fr)    full-width real Code 128 + 9pt mono caption
 *   FOOTER     (0.50)   ROUTELYPRO.COM · Scan QR for tracking | chip
 * ═══════════════════════════════════════════════════════════════════════════ */
function ShippingLabel4x6V2({ data, barcodeSvg, qrSvg }: {
  data: LabelData; barcodeSvg: string; qrSvg: string;
}) {
  const { street, locality } = splitAddress(data.recipientAddress);
  const opChips: string[] = [data.serviceType.toUpperCase()];
  if (data.coldChain)         opChips.push("COLD CHAIN");
  if (data.requiresSignature) opChips.push("SIGNATURE");
  if (data.collectCod && parseFloat(data.codAmount || "0") > 0)
                              opChips.push(`COD $${data.codAmount}`);
  if (data.packageType)       opChips.push(data.packageType.toUpperCase());
  return (
    <div style={{
      // 4 × 6 in shipping label.
      width: "4in", height: "6in", background: "#fff", color: "#000",
      boxSizing: "border-box", padding: "0.06in",
      display: "grid",
      // BARCODE row is 1fr → absorbs the height automatically.
      //   fixed 3.85 + padding 0.20 + gaps 0.25 = 4.30in
      //   BARCODE (1fr) = 6 − 4.30 = 1.70in. Σ = 6.00in ✓
      gridTemplateRows: "0.50in 1.50in 0.55in 0.80in 1fr 0.50in",
      rowGap: "0.05in",
      overflow: "hidden",
      fontFamily: '-apple-system,BlinkMacSystemFont,"Inter",Arial,sans-serif',
    }}>
      {/* HEADER */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: "0.014in solid #000", paddingBottom: "0.05in",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LABEL_LOGO_SRC} alt="Routely"
             style={{ height: "0.40in", width: "auto", display: "block" }} />
        <div style={{ textAlign: "right", lineHeight: 1.1 }}>
          <div style={{ fontSize: "10pt", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {data.serviceType}
          </div>
          {data.serviceDate && (
            <div style={{ fontSize: "8pt", fontWeight: 600 }}>{data.serviceDate}</div>
          )}
        </div>
      </div>

      {/* SHIP TO */}
      <div style={{
        padding: "0.06in 0", borderBottom: "0.014in solid #000",
        display: "flex", flexDirection: "column", minHeight: 0,
      }}>
        <span style={{
          alignSelf: "flex-start",
          fontSize: "7pt", fontWeight: 900, letterSpacing: "0.20em",
          padding: "0.015in 0.07in", background: "#000", color: "#fff",
        }}>SHIP TO</span>
        <div style={{
          fontSize: "15pt", fontWeight: 900, textTransform: "uppercase",
          marginTop: "0.06in", lineHeight: 1.1,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>{data.recipient}</div>
        {street && (
          <div style={{
            fontSize: "10.5pt", fontWeight: 600, textTransform: "uppercase",
            marginTop: "0.04in", lineHeight: 1.2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{street}</div>
        )}
        {locality && (
          <div style={{
            fontSize: "12pt", fontWeight: 800, textTransform: "uppercase",
            marginTop: "0.02in", lineHeight: 1.1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{locality}</div>
        )}
        {data.recipientPhone && (
          <div style={{ fontSize: "9pt", fontWeight: 700, marginTop: "auto" }}>
            ☎ {data.recipientPhone}
          </div>
        )}
      </div>

      {/* ROUTE · HANDLING */}
      <div style={{
        padding: "0.04in 0", borderBottom: "0.014in solid #000",
        display: "flex", flexDirection: "column", gap: "0.04in", minHeight: 0,
      }}>
        <span style={{ fontSize: "6.5pt", fontWeight: 800, letterSpacing: "0.20em" }}>
          ROUTE · HANDLING
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.04in",
                      alignContent: "flex-start" }}>
          {opChips.map((c, i) => (
            <span key={`${c}-${i}`} style={{
              fontSize: "8.5pt", fontWeight: 900, textTransform: "uppercase",
              letterSpacing: "0.04em",
              border: "0.012in solid #000", padding: "0.02in 0.07in",
              background: i === 0 ? "#000" : "#fff",
              color:      i === 0 ? "#fff" : "#000",
            }}>{c}</span>
          ))}
        </div>
      </div>

      {/* QR + RTL */}
      <div style={{
        padding: "0.05in 0", borderBottom: "0.014in solid #000",
        display: "grid", gridTemplateColumns: "0.70in 1fr",
        columnGap: "0.12in", alignItems: "center", minHeight: 0,
      }}>
        <div style={{ width: "0.70in", height: "0.70in" }}
             dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1, minWidth: 0 }}>
          <span style={{ fontSize: "6.5pt", fontWeight: 800, letterSpacing: "0.20em" }}>
            TRACKING #
          </span>
          <span style={{
            marginTop: "0.04in",
            fontFamily: '"Geist Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
            fontSize: "17pt", fontWeight: 900, letterSpacing: "0.04em",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{data.trackingId}</span>
          {data.fromName && (
            <span style={{
              marginTop: "0.04in", fontSize: "7.5pt", fontWeight: 600, textTransform: "uppercase",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              <span style={{ fontWeight: 800 }}>FROM: </span>{data.fromName}
            </span>
          )}
        </div>
      </div>

      {/* BARCODE (1fr — absorbs slack so footer hugs the bottom) */}
      <div style={{
        padding: "0.05in 0", borderBottom: "0.014in solid #000",
        display: "flex", flexDirection: "column", minHeight: 0,
      }}>
        <span style={{ fontSize: "6.5pt", fontWeight: 800, letterSpacing: "0.20em" }}>
          BARCODE · CODE 128
        </span>
        <div style={{ flex: 1, minHeight: 0, marginTop: "0.04in" }}
             dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
        <div style={{
          textAlign: "center", marginTop: "0.03in",
          fontFamily: '"Geist Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
          fontSize: "9pt", fontWeight: 800, letterSpacing: "0.10em", lineHeight: 1,
        }}>
          {data.trackingId}
        </div>
      </div>

      {/* FOOTER — sits at the very bottom of the 6in page */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <span style={{ fontSize: "8pt", fontWeight: 800, letterSpacing: "0.10em" }}>
            ROUTELYPRO.COM
          </span>
          <span style={{ fontSize: "6.5pt", fontWeight: 500, marginTop: "0.02in" }}>
            Scan QR for tracking
          </span>
        </div>
        <span style={{
          fontSize: "6.5pt", fontWeight: 700, letterSpacing: "0.10em",
          border: "0.008in solid #000", padding: "0.015in 0.06in",
        }}>ROUTELY · {data.serviceType.toUpperCase()}</span>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * ScaledPreview — outer takes the SCALED size, inner stays at natural inch
 * size with transform: scale(...). Prevents preview overflow.
 * ─────────────────────────────────────────────────────────────────────────── */
function ScaledPreview({ widthIn, heightIn, scale, children }: {
  widthIn: number; heightIn: number; scale: number; children: React.ReactNode;
}) {
  const naturalWpx = widthIn  * 96;
  const naturalHpx = heightIn * 96;
  return (
    <div style={{
      width:  naturalWpx * scale,
      height: naturalHpx * scale,
      overflow: "hidden",
      flexShrink: 0,
    }}>
      <div style={{
        width: naturalWpx, height: naturalHpx,
        transform: `scale(${scale})`, transformOrigin: "top left",
      }}>
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PRINT POPUPS — exact paper size, single label root, script in <head>,
 * no extra body nodes, no preview transforms.
 *
 *   - Body contains exactly ONE element: .label-print-root.
 *   - <script> lives in <head> so its source text can never be a body
 *     text node that pushes height past @page (the original double-print
 *     root cause).
 *   - .label-print-root is overflow:hidden + page-break-after:avoid so
 *     even if a future zone grows it can't spill onto a second page.
 *   - All sizes are real inch units; no transforms.
 * ═══════════════════════════════════════════════════════════════════════════ */
function rxLabelHtml(data: LabelData, logoSrc: string, barcodeSvg: string): string {
  const W = PAPER.rx2x1.w, H = PAPER.rx2x1.h;
  const { street, locality } = splitAddress(data.recipientAddress);
  const meta = `${fmtShortDate(data.serviceDate)}${
    data.packageType ? ` · ${data.packageType.toUpperCase()}` : ""
  }`;
  const dataPayload = { ...data, street, locality, meta };
  return `<!doctype html><html><head><meta charset="utf-8"><title>Rx Label</title><style>
  @page { size: ${W}in ${H}in; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000;
               font-family: -apple-system,BlinkMacSystemFont,"Inter",Arial,sans-serif;
               -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { width: ${W}in; height: ${H}in; overflow: hidden; }
  .label-print-root { width: ${W}in; height: ${H}in; padding: 0.03in;
         box-sizing: border-box;
         display: grid;
         /* HEADER · BARCODE · RTL · FROM · spacer · TO · street · city · phone */
         grid-template-rows: 0.24in 0.28in 0.14in 0.07in 0.01in 0.10in 0.09in 0.09in 0.09in;
         row-gap: 0.01in;
         page-break-after: avoid; break-after: avoid-page; overflow: hidden; }
  .brand { display: flex; align-items: center; justify-content: space-between; }
  .logo  { height: 0.22in; width: auto; display: block; }
  .meta  { text-align: right; line-height: 1.1; flex-shrink: 0;
           font-size: 7pt; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; }
  .bc    { display: flex; align-items: stretch; justify-content: center; overflow: hidden; }
  .bc svg { width: 100%; height: 100%; display: block; }
  .tid   { text-align: center; font-family: "Geist Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
           font-size: 12pt; font-weight: 900; letter-spacing: 0.03em; line-height: 1; }
  .ln    { display: flex; align-items: center; gap: 0.04in; overflow: hidden; line-height: 1.1; }
  .fr    { font-size: 6pt; border-top: 0.005in solid #000; padding-top: 0.01in; }
  .toln  { font-size: 7pt; }
  .k     { font-weight: 800; flex-shrink: 0; }
  .v     { font-weight: 600; text-transform: uppercase;
           overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vname { font-weight: 700; }
  .row   { font-size: 6pt; line-height: 1.1; font-weight: 600;
           text-transform: uppercase; overflow: hidden;
           text-overflow: ellipsis; white-space: nowrap; padding-left: 0.16in; }
  .ph    { font-weight: 700; }
  .spacer{ /* empty grid cell — provides the visual gap between FROM and TO */ }
  </style><script>
  window.addEventListener('DOMContentLoaded', function () {
    var data    = ${JSON.stringify(dataPayload)};
    var logoUrl = ${JSON.stringify(logoSrc)};
    var bcSvg   = ${JSON.stringify(barcodeSvg)};
    document.getElementById('tid').textContent    = data.trackingId;
    document.getElementById('to').textContent     = data.recipient;
    document.getElementById('from').textContent   = data.fromName;
    document.getElementById('meta').textContent   = data.meta || '';
    document.getElementById('street').textContent = data.street || '\\u2014';
    document.getElementById('city').textContent   = data.locality || '';
    document.getElementById('ph').textContent     = data.recipientPhone ? ('\\u260E ' + data.recipientPhone) : '';
    document.getElementById('bc').innerHTML       = bcSvg;
    document.getElementById('logo').src           = logoUrl;
    var img = document.getElementById('logo');
    function fire() { setTimeout(function () { window.print(); }, 80); }
    if (img.complete) fire(); else { img.onload = fire; img.onerror = fire; }
    window.onafterprint = function () { window.close(); };
  });
  </script></head><body><div class="label-print-root"><div class="brand"><img id="logo" class="logo" alt=""/><div class="meta" id="meta"></div></div><div class="bc" id="bc"></div><div class="tid" id="tid"></div><div class="ln fr"><span class="k">FROM:</span><span class="v" id="from"></span></div><div class="spacer"></div><div class="ln toln"><span class="k">TO:</span><span class="v vname" id="to"></span></div><div class="row" id="street"></div><div class="row" id="city"></div><div class="row ph" id="ph"></div></body></html>`;
}

function shippingLabelHtml(data: LabelData, logoSrc: string, barcodeSvg: string, qrSvg: string): string {
  const W = PAPER.shipping4x6.w, H = PAPER.shipping4x6.h;
  const opChips: string[] = [data.serviceType.toUpperCase()];
  if (data.coldChain)         opChips.push("COLD CHAIN");
  if (data.requiresSignature) opChips.push("SIGNATURE");
  if (data.collectCod && parseFloat(data.codAmount || "0") > 0)
                              opChips.push(`COD $${data.codAmount}`);
  if (data.packageType)       opChips.push(data.packageType.toUpperCase());
  const chipsHtml = opChips.map((c, i) =>
    `<span class="chip${i === 0 ? " primary" : ""}">${escapeHtml(c)}</span>`
  ).join("");
  const { street, locality } = splitAddress(data.recipientAddress);
  const streetHtml   = street   ? `<div class="d-street">${escapeHtml(street)}</div>` : "";
  const localityHtml = locality ? `<div class="d-locality">${escapeHtml(locality)}</div>` : "";
  const phoneHtml    = data.recipientPhone
    ? `<div class="d-phone">☎ ${escapeHtml(data.recipientPhone)}</div>` : "";
  const fromHtml     = data.fromName
    ? `<span class="qr-from"><span class="qr-from-k">FROM: </span>${escapeHtml(data.fromName)}</span>` : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>Shipping Label</title><style>
  @page { size: ${W}in ${H}in; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000;
               font-family: -apple-system,BlinkMacSystemFont,"Inter",Arial,sans-serif;
               -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { width: ${W}in; height: ${H}in; overflow: hidden; }
  /* .label-print-root IS the 4×6 label — no separate safe canvas. The
     grid fills the entire page (BARCODE row is 1fr so it absorbs slack
     and the footer hugs the bottom — no trailing blank area). */
  .label-print-root {
    width: ${W}in; height: ${H}in; padding: 0.06in;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: 0.50in 1.50in 0.55in 0.80in 1fr 0.50in;
    row-gap: 0.05in;
    overflow: hidden;
    page-break-after: avoid; break-after: avoid-page;
  }
  .hdr { display: flex; align-items: center; justify-content: space-between;
         padding-bottom: 0.05in; border-bottom: 0.014in solid #000; }
  .hdr-logo { height: 0.40in; width: auto; display: block; }
  .hdr-right { text-align: right; line-height: 1.1; }
  .hdr-svc   { font-size: 10pt; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
  .hdr-date  { font-size: 8pt; font-weight: 600; }
  .dest { padding: 0.06in 0; border-bottom: 0.014in solid #000;
          display: flex; flex-direction: column; min-height: 0; }
  .dest-chip { align-self: flex-start; font-size: 7pt; font-weight: 900; letter-spacing: 0.20em;
               padding: 0.015in 0.07in; background: #000; color: #fff; }
  .d-name    { font-size: 15pt; font-weight: 900; text-transform: uppercase; margin-top: 0.06in;
               line-height: 1.1; overflow: hidden;
               display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .d-street  { font-size: 10.5pt; font-weight: 600; text-transform: uppercase;
               margin-top: 0.04in; line-height: 1.2;
               overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .d-locality{ font-size: 12pt; font-weight: 800; text-transform: uppercase;
               margin-top: 0.02in; line-height: 1.1;
               overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .d-phone   { font-size: 9pt; font-weight: 700; margin-top: auto; }
  .route { padding: 0.04in 0; border-bottom: 0.014in solid #000;
           display: flex; flex-direction: column; gap: 0.04in; min-height: 0; }
  .route-h { font-size: 6.5pt; font-weight: 800; letter-spacing: 0.20em; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.04in; align-content: flex-start; }
  .chip  { font-size: 8.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em;
           border: 0.012in solid #000; padding: 0.02in 0.07in; background: #fff; color: #000; }
  .chip.primary { background: #000; color: #fff; }
  .qr { padding: 0.05in 0; border-bottom: 0.014in solid #000;
        display: grid; grid-template-columns: 0.70in 1fr; column-gap: 0.12in;
        align-items: center; min-height: 0; }
  .qr-img { width: 0.70in; height: 0.70in; }
  .qr-img svg { width: 100%; height: 100%; display: block; }
  .qr-right { display: flex; flex-direction: column; line-height: 1; min-width: 0; }
  .qr-h    { font-size: 6.5pt; font-weight: 800; letter-spacing: 0.20em; }
  .qr-tid  { margin-top: 0.04in;
             font-family: "Geist Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
             font-size: 17pt; font-weight: 900; letter-spacing: 0.04em;
             overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qr-from { margin-top: 0.04in; font-size: 7.5pt; font-weight: 600; text-transform: uppercase;
             overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qr-from-k { font-weight: 800; }
  .barzone { padding: 0.05in 0; border-bottom: 0.014in solid #000;
             display: flex; flex-direction: column; min-height: 0; }
  .barzone-h { font-size: 6.5pt; font-weight: 800; letter-spacing: 0.20em; }
  .bar { flex: 1; min-height: 0; margin-top: 0.04in; }
  .bar svg { width: 100%; height: 100%; display: block; }
  .bar-tid { text-align: center; margin-top: 0.03in;
             font-family: "Geist Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
             font-size: 9pt; font-weight: 800; letter-spacing: 0.10em; line-height: 1; }
  .foot { display: flex; justify-content: space-between; align-items: center; }
  .foot-l { display: flex; flex-direction: column; line-height: 1.15; }
  .foot-l .d { font-size: 8pt; font-weight: 800; letter-spacing: 0.10em; }
  .foot-l .h { font-size: 6.5pt; font-weight: 500; margin-top: 0.02in; }
  .foot-r { font-size: 6.5pt; font-weight: 700; letter-spacing: 0.10em;
            border: 0.008in solid #000; padding: 0.015in 0.06in; }
  </style><script>
  window.addEventListener('DOMContentLoaded', function () {
    var data    = ${JSON.stringify(data)};
    var logoUrl = ${JSON.stringify(logoSrc)};
    var bcSvg   = ${JSON.stringify(barcodeSvg)};
    var qrSvg   = ${JSON.stringify(qrSvg)};
    document.getElementById('hdrSvc').textContent  = data.serviceType;
    document.getElementById('hdrDate').textContent = data.serviceDate || '';
    document.getElementById('dName').textContent   = data.recipient;
    document.getElementById('barTid').textContent  = data.trackingId;
    document.getElementById('qrTid').textContent   = data.trackingId;
    document.getElementById('footR').textContent   = 'ROUTELY \\u00B7 ' + data.serviceType.toUpperCase();
    document.getElementById('bar').innerHTML       = bcSvg;
    document.getElementById('qrImg').innerHTML     = qrSvg;
    document.getElementById('logo').src            = logoUrl;
    var img = document.getElementById('logo');
    function fire() { setTimeout(function () { window.print(); }, 80); }
    if (img.complete) fire(); else { img.onload = fire; img.onerror = fire; }
    window.onafterprint = function () { window.close(); };
  });
  </script></head><body><div class="label-print-root"><div class="hdr"><img id="logo" class="hdr-logo" alt=""/><div class="hdr-right"><div class="hdr-svc" id="hdrSvc"></div><div class="hdr-date" id="hdrDate"></div></div></div><div class="dest"><span class="dest-chip">SHIP TO</span><div class="d-name" id="dName"></div>${streetHtml}${localityHtml}${phoneHtml}</div><div class="route"><span class="route-h">ROUTE · HANDLING</span><div class="chips">${chipsHtml}</div></div><div class="qr"><div class="qr-img" id="qrImg"></div><div class="qr-right"><span class="qr-h">TRACKING #</span><span class="qr-tid" id="qrTid"></span>${fromHtml}</div></div><div class="barzone"><span class="barzone-h">BARCODE · CODE 128</span><div class="bar" id="bar"></div><div class="bar-tid" id="barTid"></div></div><div class="foot"><div class="foot-l"><span class="d">ROUTELYPRO.COM</span><span class="h">Scan QR for tracking</span></div><span class="foot-r" id="footR"></span></div></div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === '"' ? "&quot;" : "&#39;"
  ));
}

/* ───────────────────────────────────────────────────────────────────────────
 * PrintLabelDialog
 * ─────────────────────────────────────────────────────────────────────────── */
export function PrintLabelDialog({
  open, onOpenChange, trackingId, recipientName,
  recipientAddress, recipientPhone,
  fromName, fromAddress,
  serviceType, serviceDate, packageType,
  requiresSignature, coldChain, collectCod, codAmount, notes,
  isDraft,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trackingId: string;
  recipientName: string;
  recipientAddress?: string;
  recipientPhone?: string;
  fromName?: string;
  fromAddress?: string;
  serviceType?: string;
  serviceDate?: string;
  packageType?: string;
  requiresSignature?: boolean;
  coldChain?: boolean;
  collectCod?: boolean;
  codAmount?: string;
  notes?: string;
  isDraft?: boolean;
}) {
  const [mode, setMode]       = useState<LabelMode>("rx2x1");
  const [printer, setPrinter] = useState<PrinterId>("zebra-zd410");
  useEffect(() => { if (open) { setMode("rx2x1"); setPrinter("zebra-zd410"); } }, [open]);

  function pickMode(m: LabelMode) { setMode(m); setPrinter(MODE_TO_PRINTER[m]); }
  function pickPrinter(p: PrinterId) {
    setPrinter(p);
    const native = PRINTER_TO_MODE[p];
    if (native) setMode(native);
  }

  const hasTracking = Boolean(trackingId) && !trackingId.startsWith("draft_");
  const canPrint    = hasTracking && !isDraft;

  const data: LabelData = useMemo(() => ({
    trackingId:        hasTracking ? trackingId : "Tracking Pending",
    recipient:         (recipientName || "Recipient").toUpperCase(),
    recipientAddress:  recipientAddress ? recipientAddress.toUpperCase() : undefined,
    recipientPhone:    recipientPhone || undefined,
    fromName:          (fromName || "Routely").trim().toUpperCase() || "ROUTELY",
    fromAddress:       fromAddress || undefined,
    serviceType:       prettyServiceType(serviceType),
    serviceDate:       serviceDate || "",
    packageType:       packageType ? prettyPackageType(packageType) : undefined,
    requiresSignature: Boolean(requiresSignature),
    coldChain:         Boolean(coldChain),
    collectCod:        Boolean(collectCod),
    codAmount:         codAmount || "0",
    notes:             notes || undefined,
  }), [
    hasTracking, trackingId, recipientName, recipientAddress, recipientPhone,
    fromName, fromAddress, serviceType, serviceDate, packageType,
    requiresSignature, coldChain, collectCod, codAmount, notes,
  ]);

  // Real barcode + QR SVG strings — regenerate when the tracking id
  // changes. Both are reused by the preview AND injected into the
  // print popup so what users see is exactly what prints.
  const [barcodeSvg, setBarcodeSvg] = useState("");
  const [qrSvg, setQrSvg]           = useState("");
  useEffect(() => {
    let cancelled = false;
    const bc = generateBarcodeSvg(hasTracking ? trackingId : "");
    if (!cancelled) setBarcodeSvg(bc);
    generateQrSvg(trackingUrl(hasTracking ? trackingId : "")).then(svg => {
      if (!cancelled) setQrSvg(svg);
    });
    return () => { cancelled = true; };
  }, [hasTracking, trackingId]);

  // Preview scale is computed dynamically from the surface's actual width
  // so the modal works on mobile (where the column can be < 360px) just
  // as well as on desktop (where it's ~580px). ResizeObserver watches the
  // preview surface; the label scales to fit minus a small inner border.
  const paper = PAPER[mode];
  const previewSurfaceRef = useRef<HTMLDivElement>(null);
  const [surfaceW, setSurfaceW] = useState(0);
  useEffect(() => {
    if (!open) return;
    const el = previewSurfaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      setSurfaceW(w);
    });
    ro.observe(el);
    setSurfaceW(el.clientWidth);
    return () => ro.disconnect();
  }, [open]);

  // Visual cap so labels don't blow up huge on wide desktop monitors.
  const desktopMaxW = mode === "rx2x1" ? 560 : 380;
  const naturalWpx  = paper.w * 96;
  // Minus 16px inner padding on each side of the bordered surface.
  const availableW  = Math.max(0, surfaceW - 32);
  const previewScale = surfaceW > 0
    ? Math.max(0.4, Math.min(desktopMaxW, availableW) / naturalWpx)
    : (mode === "rx2x1" ? 2.5 : 0.92);
  const previewHeight = paper.h * 96 * previewScale;

  const popupSizeRef = useRef<{ w: number; h: number }>({ w: 560, h: 320 });
  popupSizeRef.current = mode === "rx2x1"
    ? { w: 560, h: 320 }
    : { w: 480, h: 740 };

  function handlePrint() {
    if (!canPrint) return;
    const { w: pw, h: ph } = popupSizeRef.current;
    const w = window.open("", "_blank", `width=${pw},height=${ph}`);
    if (!w) return;
    const absLogo = typeof window !== "undefined"
      ? new URL(LABEL_LOGO_SRC, window.location.origin).toString()
      : LABEL_LOGO_SRC;
    const html  = mode === "rx2x1"
      ? rxLabelHtml(data, absLogo, barcodeSvg)
      : shippingLabelHtml(data, absLogo, barcodeSvg, qrSvg);
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Mobile-first: nearly full width with a small margin; expand
          // to the desktop max on sm+. max-h-[90dvh] keeps the modal
          // inside the viewport on phones where browser chrome eats
          // height; flex/overflow lets the body scroll internally.
          "w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-0 p-0",
          "sm:w-auto sm:max-w-4xl",
          "max-h-[90dvh] flex flex-col overflow-hidden",
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 pt-4 pb-3 sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Printer className="size-4" /> Print Label
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable body — banner, mode toggle, preview, controls.
            Sticky header/footer stay visible while the middle scrolls
            on shorter viewports. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 sm:px-5">
          {!canPrint && (
            <div className="mb-3 flex items-start gap-2.5 rounded-md border border-amber-200/70 bg-amber-500/10 px-3 py-2.5
                            text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="text-xs leading-relaxed">
                <p className="font-semibold">Drafts can&apos;t be printed yet.</p>
                <p className="mt-0.5 text-[11px]">
                  This stop is still a draft, so it doesn&apos;t have a real RTL tracking number yet.
                  Submit (approve) the draft to create a tracked stop — then come back here to print its label.
                </p>
              </div>
            </div>
          )}

          {/* Mode toggle — wraps on very narrow screens; size hint hides
              under sm so the two buttons fit on a 320px viewport. */}
          <div className="mb-4 flex justify-center">
            <div className="inline-flex w-full max-w-full items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 sm:w-auto">
              {([
                { id: "rx2x1"       as const, label: "Rx Label",       size: "2.25 × 1.25 in", Icon: Tag },
                { id: "shipping4x6" as const, label: "Shipping Label", size: "4 × 6 in",       Icon: PackageIcon },
              ]).map(({ id, label, size, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => pickMode(id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors sm:flex-none sm:gap-2 sm:px-3.5",
                    mode === id
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span>{label}</span>
                  <span className={cn(
                    "hidden text-[10px] font-medium sm:inline",
                    mode === id ? "text-muted-foreground" : "text-muted-foreground/70"
                  )}>{size}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_260px] sm:gap-5">
            {/* Preview column — surface ref drives ResizeObserver so the
                label always fits its actual rendered width. */}
            <div className="flex min-w-0 flex-col items-center justify-start gap-2">
              <div
                ref={previewSurfaceRef}
                className="flex w-full max-w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-[hsl(0_0%_96%)] p-3 dark:bg-[hsl(0_0%_12%)] sm:p-4"
                style={{ minHeight: previewHeight + 24 }}
              >
                <ScaledPreview widthIn={paper.w} heightIn={paper.h} scale={previewScale}>
                  {mode === "rx2x1"
                    ? <RxLabel2x1 data={data} barcodeSvg={barcodeSvg} />
                    : <ShippingLabel4x6V2 data={data} barcodeSvg={barcodeSvg} qrSvg={qrSvg} />}
                </ScaledPreview>
              </div>
              <p className="text-center text-[10px] text-muted-foreground/80">
                Preview · {paper.label} {paper.orient} · thermal
              </p>
              <p className="text-center text-[10px] text-muted-foreground/60">
                {paper.w * 96} × {paper.h * 96} px @ 96 dpi · scale {previewScale.toFixed(2)}×
              </p>
            </div>

            {/* Controls column */}
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Label size
                </label>
                <Select value={printer} onValueChange={v => pickPrinter(v as PrinterId)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRINTER_LABELS) as PrinterId[]).map(id => (
                      <SelectItem key={id} value={id} className="text-xs">{PRINTER_LABELS[id]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground/70">
                  Pick the label size, then choose your printer in the print dialog. Set your thermal printer
                  as the default and the dialog opens ready — orientation is handled by the driver.
                </p>
              </div>

              <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Page setup
                </p>
                <p className="mt-1 break-all text-[11px] font-mono text-foreground/80">
                  @page {`{ size: ${paper.w}in ${paper.h}in; margin: 0 }`}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground/70">
                  Real physical size · single root · driver controls orientation.
                </p>
              </div>

              <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Codes
                </p>
                <p className="mt-1 break-all text-[11px] text-foreground/85">
                  Real Code 128 barcode · QR encodes <span className="font-mono">app.routelypro.com/track/RTL-…</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer — sticky bottom; full-width buttons on mobile so they
            stay tappable; horizontal on sm+. */}
        <DialogFooter className="shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:px-5">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={!canPrint}
            title={canPrint ? "Print this label" : "Drafts must be submitted before they can be printed"}
            className="w-full gap-1.5 text-white sm:w-auto"
            style={{ backgroundColor: "var(--primary)" }}
          >
            <Printer className="size-3.5" /> Print {mode === "rx2x1" ? "Rx Label" : "Shipping Label"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function prettyServiceType(s?: string): string {
  const v = (s || "delivery").toLowerCase();
  if (v === "dropoff" || v === "drop_off" || v === "drop-off") return "DropOff";
  if (v === "delivery")                                         return "Delivery";
  if (v === "pickup")                                           return "Pickup";
  if (v === "return")                                           return "Return";
  if (v === "same_day" || v === "express")                      return "Express";
  return v.charAt(0).toUpperCase() + v.slice(1);
}
function prettyPackageType(s: string): string {
  const v = s.toLowerCase();
  if (v === "rx")      return "Rx";
  if (v === "cold")    return "Cold";
  if (v === "regular") return "Regular";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
