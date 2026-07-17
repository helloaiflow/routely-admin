"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { buildTrackingId, type LabelData } from "./shipping-label";

// ── Niimbot B1 — 50×30mm label ────────────────────────────────────────────
// Physical: 50mm wide × 30mm tall
// Niimbot B1 is a portable Bluetooth thermal label printer
// 203 DPI, max width ~50mm
// Same paper size as Zebra 50×30mm but optimized for Niimbot font rendering

function BCNiimbot({ value, height = 24 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: "CODE128", width: 1.1, height,
      displayValue: false, margin: 1,
      background: "transparent", lineColor: "#000",
    });
  }, [value, height]);
  return <svg ref={ref} style={{ width: "100%", display: "block" }} />;
}

export function ShippingLabelNiimbot({ data }: { data: LabelData }) {
  const trackingId = buildTrackingId(data.date, data.stop_id);
  const FONT = "system-ui, -apple-system, sans-serif";
  const BK = "#000";

  const isSameDay = data.is_same_day;
  const isCold    = data.package_type === "cold";
  const isRx      = data.package_type === "rx";
  const hasCod    = data.collect_cod && data.collect_amount;
  const hasSig    = data.requires_signature;

  const serviceStr = isSameDay ? "⚡ XPRESS" : "📅 NEXT DAY";
  const typeStr    = isRx ? "RX" : isCold ? "❄ COLD" : "STD";

  return (
    <div style={{
      // 50mm × 30mm at 96dpi = 189px × 113px
      width: "189px", height: "113px",
      fontFamily: FONT, color: BK,
      backgroundColor: "#fff",
      border: "1px solid #000",
      borderRadius: "2px",
      overflow: "hidden",
      boxSizing: "border-box",
      display: "flex", flexDirection: "column",
    }}>

      {/* ── HEADER: bold top bar ── */}
      <div style={{
        background: BK, color: "#fff",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "2px 5px", flexShrink: 0,
      }}>
        <span style={{ fontSize: "6.5pt", fontWeight: 900, letterSpacing: "-0.3px" }}>ROUTELY</span>
        <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
          <span style={{ fontSize: "5pt", fontWeight: 700 }}>{serviceStr}</span>
          {(hasSig || hasCod || isCold) && (
            <span style={{ fontSize: "5pt", padding: "0 2px", border: "0.5px solid rgba(255,255,255,0.6)", borderRadius: "2px" }}>
              {hasSig ? "✍" : ""}{hasCod ? "COD" : ""}{isCold ? "❄" : ""}
            </span>
          )}
        </div>
      </div>

      {/* ── TYPE + DATE row ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "1px 5px", borderBottom: "0.5px solid #ccc", flexShrink: 0,
        background: "#f8f8f8",
      }}>
        <span style={{ fontSize: "5.5pt", fontWeight: 900 }}>{typeStr}</span>
        <span style={{ fontSize: "5pt", color: "#666" }}>{data.date}</span>
      </div>

      {/* ── FROM compact ── */}
      <div style={{ padding: "1px 5px", borderBottom: "0.5px solid #eee", flexShrink: 0 }}>
        <span style={{ fontSize: "4.5pt", color: "#888", fontWeight: 700 }}>FROM: </span>
        <span style={{ fontSize: "4.5pt", color: "#444" }}>{data.from_name}</span>
      </div>

      {/* ── TO: recipient — main focal point ── */}
      <div style={{ padding: "2px 5px", flexShrink: 0 }}>
        <div style={{ fontSize: "4pt", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px" }}>Deliver to</div>
        <div style={{ fontSize: "8.5pt", fontWeight: 900, lineHeight: 1.05 }}>{data.recipient_name}</div>
        <div style={{ fontSize: "5pt", color: "#333", lineHeight: 1.3 }}>
          {data.delivery_address}<br />
          {data.delivery_city}, {data.delivery_state} {data.delivery_zip}
        </div>
      </div>

      {/* ── Barcode ── */}
      <div style={{ flex: 1, padding: "0 4px 1px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <BCNiimbot value={trackingId} height={20} />
        <div style={{ fontSize: "4pt", textAlign: "center", fontWeight: 900, fontFamily: '"Geist Mono",ui-monospace,monospace', color: "#222", marginTop: "0" }}>
          {trackingId}
        </div>
      </div>

    </div>
  );
}
