/* Real QR / Code 128 generators for shipping labels.
 * Client-side only (jsbarcode + qrcode both need a DOM / return SVG strings).
 * Extracted so the Internal Package wizard's live label preview and the
 * print flow derive BOTH codes from the same tracking value — the codes are
 * display artifacts, never the canonical tracking store (CEO spec 2026-09-01). */

import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

export function trackingUrl(trackingId: string): string {
  if (!trackingId || trackingId === "Tracking Pending") return "Tracking Pending";
  return `https://app.routelypro.com/track/${encodeURIComponent(trackingId)}`;
}

/** Code 128 SVG string. Quiet zones preserved (margin 10 module-units) so a
 *  203 DPI thermal print still locks — same settings the stops label uses. */
export function generateBarcodeSvg(value: string): string {
  if (typeof window === "undefined" || !value || value === "Tracking Pending") return "";
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: "CODE128",
      width: 2,
      height: 80,
      displayValue: false,
      margin: 10,
      background: "#ffffff",
      lineColor: "#000000",
    });
    const w = svg.getAttribute("width");
    const h = svg.getAttribute("height");
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", "none");
    return svg.outerHTML;
  } catch {
    return "";
  }
}

/** QR SVG string encoding the public tracking URL (square, margin 0 — the
 *  container provides the quiet zone). */
export async function generateQrSvg(trackingId: string): Promise<string> {
  const payload = trackingUrl(trackingId);
  if (!payload || payload === "Tracking Pending") return "";
  try {
    return await QRCode.toString(payload, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    return "";
  }
}
