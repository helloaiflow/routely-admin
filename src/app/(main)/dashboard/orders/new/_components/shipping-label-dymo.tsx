"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { buildTrackingId, type LabelData } from "./shipping-label";

// DYMO LabelWriter 450 — 2-1/8" × 4"
// Design inspired by clean B&W label standard — NO COLOR

function BC450({ value, height = 30 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: "CODE128", width: 1.3, height,
      displayValue: false, margin: 2,
      background: "transparent", lineColor: "#000",
    });
  }, [value, height]);
  return <svg ref={ref} style={{ width: "100%", display: "block" }} />;
}

function QR450({ value }: { value: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(value)}&color=000000&bgcolor=ffffff&qzone=0`}
      alt="QR" width={64} height={64}
      style={{ display: "block", flexShrink: 0 }}
    />
  );
}

export function ShippingLabelDymo({ data }: { data: LabelData }) {
  const trackingId = buildTrackingId(data.date, data.stop_id);
  const FONT = "'Arial Narrow', Arial, sans-serif";
  const BK = "#000";

  const isSameDay = data.is_same_day;
  const isRx      = data.package_type === "rx";
  const isCold     = data.package_type === "cold";
  const hasCod     = data.collect_cod && data.collect_amount;
  const hasSig     = (data as { requires_signature?: boolean }).requires_signature;

  const typeStr    = isRx ? "RX / MEDICATION" : isCold ? "COLD CHAIN" : "STANDARD";
  const serviceStr = isSameDay ? "XPRESS" : "NEXT DAY";

  return (
    <div style={{
      width: "2.125in", height: "4in",
      fontFamily: FONT, color: BK,
      backgroundColor: "#fff",
      border: "1.5px solid #000",
      borderRadius: "6px",
      overflow: "hidden",
      boxSizing: "border-box",
      display: "flex", flexDirection: "column",
    }}>

      {/* ── HEADER BAR (black) ─── */}
      <div style={{
        background: BK, color: "#fff",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "4px 7px", flexShrink: 0,
      }}>
        <img src="/img/routelyLogoBlack.svg" alt="Routely" style={{ height: "13px", width: "auto", filter: "brightness(0) invert(1)" }} />
        <span style={{ fontSize: "7.5pt", fontWeight: 700 }}>{data.date}</span>
        <span style={{ fontSize: "7.5pt", fontWeight: 900, letterSpacing: "0.5px" }}>{serviceStr}</span>
      </div>

      {/* ── RTL TRACKING ─── */}
      <div style={{ padding: "4px 7px 3px", borderBottom: "1px solid #ccc", flexShrink: 0 }}>
        <div style={{ fontSize: "5.5pt", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "1px" }}>Routely Tracking</div>
        <div style={{ fontSize: "12.5pt", fontWeight: 900, letterSpacing: "-0.5px", lineHeight: 1, fontFamily: '"Geist Mono",ui-monospace,monospace' }}>{trackingId}</div>
      </div>

      {/* ── TO + QR side by side ─── */}
      <div style={{ padding: "4px 7px", borderBottom: "1px solid #ccc", flexShrink: 0, display: "flex", gap: "5px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "5.5pt", color: "#666", fontWeight: 700, textTransform: "uppercase", marginBottom: "2px" }}>TO / RECIPIENT</div>
          <div style={{ fontSize: "10pt", fontWeight: 900, lineHeight: 1.2, marginBottom: "2px" }}>{data.recipient_name}</div>
          <div style={{ fontSize: "7pt", lineHeight: 1.55 }}>
            {data.delivery_address}<br />
            {data.delivery_city}, {data.delivery_state} {data.delivery_zip}
          </div>
          <div style={{ fontSize: "7pt", marginTop: "2px" }}>Phone: {data.recipient_phone}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
          <QR450 value={`https://app.routelypro.com/track/${trackingId}`} />
          <div style={{ fontSize: "4.5pt", color: "#888", marginTop: "1px" }}>SCAN RTL</div>
        </div>
      </div>

      {/* ── FROM ─── */}
      <div style={{ padding: "4px 7px", borderBottom: "1px solid #ccc", flexShrink: 0 }}>
        <div style={{ fontSize: "5.5pt", color: "#666", fontWeight: 700, textTransform: "uppercase", marginBottom: "2px" }}>FROM / TENANT</div>
        <div style={{ fontSize: "8.5pt", fontWeight: 900, lineHeight: 1.2, marginBottom: "2px" }}>{data.from_name}</div>
        <div style={{ fontSize: "7pt", lineHeight: 1.55 }}>
          {data.from_address}<br />
          {data.from_city}, {data.from_state} {data.from_zip}
        </div>
        <div style={{ fontSize: "7pt", marginTop: "2px" }}>Phone: {data.from_phone || "_______________"}</div>
      </div>

      {/* ── DELIVERY REQUIREMENTS ─── */}
      <div style={{ flexShrink: 0 }}>
        <div style={{
          background: BK, color: "#fff",
          fontSize: "6pt", fontWeight: 900, textTransform: "uppercase",
          textAlign: "center", padding: "2px 0", letterSpacing: "0.5px",
        }}>
          Delivery Requirements
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "3px 7px", gap: "1px 8px", fontSize: "6pt" }}>
          {[
            { label: "SIGNATURE",  value: hasSig ? "REQUIRED" : "NO" },
            { label: "COD",        value: hasCod ? "YES" : "NO" },
            { label: "COD AMOUNT", value: hasCod ? `$${data.collect_amount}` : "$0.00" },
            { label: "SAME DAY",   value: isSameDay ? "YES" : "NO" },
            { label: "TYPE",       value: typeStr },
            { label: "SERVICE",    value: serviceStr },
          ].map((r) => (
            <div key={r.label} style={{ lineHeight: 1 }}>
              <div style={{ color: "#888", fontSize: "5pt", textTransform: "uppercase" }}>{r.label}</div>
              <div style={{ fontWeight: 900, fontSize: "7.5pt" }}>{r.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FOOTER BAR (black) ─── */}
      <div style={{
        marginTop: "auto",
        background: BK, color: "#fff",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "3px 7px", flexShrink: 0,
      }}>
        <span style={{ fontSize: "6.5pt", fontWeight: 700 }}>STOP / ROUTE</span>
        <span style={{ fontSize: "10pt", fontWeight: 900, fontFamily: '"Geist Mono",ui-monospace,monospace', letterSpacing: "-0.3px" }}>{trackingId.split("-").slice(1).join("-")}</span>
      </div>

    </div>
  );
}
