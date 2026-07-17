"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { buildTrackingId, type LabelData } from "./shipping-label";

// ── ZEBRA ZD410 — 2.25" × 1.25" LANDSCAPE ────────────────────────────────
// Driver settings: Width 2.25" / Height 1.25" / Rotation 90° Landscape
// Print: printViaIframe("...", "2.25in", "1.25in")
// Screen preview at 96dpi: 216px × 120px

function BCZebra({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: "CODE128",
      width: 1.2,
      height: 28,
      displayValue: false,
      margin: 1,
      background: "transparent",
      lineColor: "#000",
    });
  }, [value]);
  return <svg ref={ref} style={{ width: "100%", display: "block" }} />;
}

export function ShippingLabelZebra({ data }: { data: LabelData }) {
  const trackingId = buildTrackingId(data.date, data.stop_id);
  const FONT = "'Arial Narrow', Arial, sans-serif";

  const isSameDay = data.is_same_day;
  const isRx      = data.package_type === "rx";
  const isCold    = data.package_type === "cold";
  const hasCod    = data.collect_cod && data.collect_amount;
  const hasSig    = data.requires_signature;
  const serviceStr = isSameDay ? "XPRESS" : "NEXT DAY";
  const typeStr    = isRx ? "RX" : isCold ? "❄COLD" : "STD";

  return (
    <div style={{
      width:         "216px",
      height:        "120px",
      fontFamily:    FONT,
      color:         "#000",
      background:    "#fff",
      overflow:      "hidden",
      boxSizing:     "border-box",
      display:       "flex",
      flexDirection: "column",
    }}>

      {/* Header */}
      <div style={{
        background: "#000", color: "#fff",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "1.5px 5px", flexShrink: 0,
      }}>
        <span style={{ fontSize: "6.5pt", fontWeight: 900 }}>ROUTELY</span>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {(hasSig || hasCod || isCold || isSameDay) && (
            <span style={{ fontSize: "5pt", fontWeight: 900, border: "0.5px solid #fff", padding: "0 2px" }}>
              {isSameDay ? "⚡" : ""}{isCold ? "❄" : ""}{hasSig ? "✍" : ""}{hasCod ? "$" : ""}
            </span>
          )}
          <span style={{ fontSize: "5.5pt", fontWeight: 700 }}>{serviceStr} · {typeStr}</span>
        </div>
      </div>

      {/* FROM */}
      <div style={{
        padding: "1px 5px",
        borderBottom: "0.5px solid #ddd",
        flexShrink: 0,
        display: "flex", alignItems: "center", gap: "3px",
      }}>
        <span style={{ fontSize: "4.5pt", color: "#555", fontWeight: 700 }}>FROM:</span>
        <span style={{ fontSize: "4.5pt", color: "#333" }}>
          {data.from_name} · {data.from_city}, {data.from_state}
        </span>
        <span style={{ marginLeft: "auto", fontSize: "4.5pt", color: "#888" }}>{data.date}</span>
      </div>

      {/* TO */}
      <div style={{ padding: "2px 5px", flexShrink: 0, borderBottom: "0.5px solid #ddd" }}>
        <div style={{ fontSize: "4pt", color: "#666", fontWeight: 700, textTransform: "uppercase", lineHeight: 1 }}>DELIVER TO</div>
        <div style={{ fontSize: "8.5pt", fontWeight: 900, lineHeight: 1.05, marginTop: "0.5px" }}>{data.recipient_name}</div>
        <div style={{ fontSize: "5pt", color: "#222", lineHeight: 1.3, marginTop: "0.5px" }}>
          {data.delivery_address}, {data.delivery_city} {data.delivery_zip}
        </div>
      </div>

      {/* Barcode */}
      <div style={{ flex: 1, padding: "1px 4px 1px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <BCZebra value={trackingId} />
        <div style={{ fontSize: "4pt", textAlign: "center", fontWeight: 900, fontFamily: '"Geist Mono",ui-monospace,monospace', letterSpacing: "-0.2px" }}>
          {trackingId}
        </div>
      </div>
    </div>
  );
}
