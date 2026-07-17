"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export type LabelData = {
  stop_id: string;
  date: string;
  service: string;
  recipient_name: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  recipient_phone: string;
  from_name: string;
  from_address: string;
  from_city: string;
  from_state: string;
  from_zip: string;
  from_phone: string;
  from_email?: string;
  weight?: string;
  package_type?: string;
  notes?: string;
  carrier?: string;
  is_same_day?: boolean;
  collect_cod?: boolean;
  collect_amount?: string;
  delivery_date?: string;
  requires_signature?: boolean;
};

export function buildTrackingId(date: string, stopId: string): string {
  const parts = date.split("/");
  const yy = (parts[2] ?? "24").slice(2);
  const mm = parts[0] ?? "01";
  const dd = parts[1] ?? "01";
  const num = stopId.replace("DRF-", "").padStart(4, "0");
  return `RTL-${yy}${mm}${dd}-${num}`;
}

function QR({ value, size }: { value: string; size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&color=000000&bgcolor=ffffff&qzone=0`}
      alt="QR" width={size} height={size}
      style={{ display: "block", flexShrink: 0 }}
    />
  );
}

function BC({ value, height = 48 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: "CODE128", width: 2, height,
      displayValue: false, margin: 4,
      background: "transparent", lineColor: "#000",
    });
  }, [value, height]);
  return <svg ref={ref} style={{ width: "100%", display: "block" }} />;
}

export function ShippingLabel({ data }: { data: LabelData }) {
  const trackingId = buildTrackingId(data.date, data.stop_id);
  const FONT = "'Arial Narrow', Arial, Helvetica, sans-serif";
  const BK = "#000";

  const isSameDay = data.is_same_day;
  const isRx      = data.package_type === "rx";
  const isCold     = data.package_type === "cold";
  const hasCod     = data.collect_cod && data.collect_amount;
  const hasSig     = data.requires_signature;

  const typeStr    = isRx ? "RX / MEDICATION" : isCold ? "COLD CHAIN" : "STANDARD";
  const serviceStr = isSameDay ? "XPRESS PRIORITY" : "NEXT DAY";

  return (
    <div style={{
      width: "4in", height: "6in",
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
        padding: "5px 12px", flexShrink: 0,
      }}>
        <img src="/img/routelyLogoBlack.svg" alt="Routely" style={{ height: "16px", width: "auto", filter: "brightness(0) invert(1)" }} />
        <span style={{ fontSize: "9pt", fontWeight: 700 }}>{data.date}</span>
        <span style={{ fontSize: "9.5pt", fontWeight: 900, letterSpacing: "0.5px" }}>{serviceStr}</span>
      </div>

      {/* ── HIGH-CONTRAST FLAGS: only shows if any flag is active ── */}
      {(isSameDay || hasCod || hasSig || isCold) && (
        <div style={{
          display: "flex", gap: "5px", flexWrap: "wrap",
          padding: "5px 12px", borderBottom: "1px solid #000",
          alignItems: "center", flexShrink: 0, background: "#000",
        }}>
          {isSameDay && <span style={{ border: "2px solid #fff", padding: "2px 8px", fontSize: "7.5pt", fontWeight: 900, background: "#fff", color: "#000", letterSpacing: "0.5px" }}>⚡ SAME DAY</span>}
          {hasSig &&   <span style={{ border: "2px solid #fff", padding: "2px 8px", fontSize: "7.5pt", fontWeight: 900, color: "#fff", letterSpacing: "0.5px" }}>✍ SIGNATURE</span>}
          {hasCod &&   <span style={{ border: "2px solid #fff", padding: "2px 8px", fontSize: "7.5pt", fontWeight: 900, color: "#fff", letterSpacing: "0.5px" }}>COD ${data.collect_amount}</span>}
          {isCold &&   <span style={{ border: "2px solid #fff", padding: "2px 8px", fontSize: "7.5pt", fontWeight: 900, color: "#fff", letterSpacing: "0.5px" }}>❄ COLD CHAIN</span>}
        </div>
      )}

      {/* ── RTL TRACKING + BARCODE ── */}
      <div style={{ padding: "7px 12px 5px", borderBottom: "1px solid #ccc", flexShrink: 0, textAlign: "center" }}>
        <div style={{ fontSize: "6.5pt", color: "#666", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "2px" }}>Routely Tracking</div>
        <div style={{ fontSize: "21pt", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1, fontFamily: '"Geist Mono",ui-monospace,monospace', marginBottom: "4px" }}>{trackingId}</div>
        <BC value={trackingId} height={44} />
      </div>

      {/* ── TO + QR ─── */}
      <div style={{ padding: "7px 12px", borderBottom: "1px solid #ccc", flexShrink: 0, display: "flex", gap: "8px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "6.5pt", color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: "3px" }}>TO / RECIPIENT</div>
          <div style={{ fontSize: "15pt", fontWeight: 900, lineHeight: 1.15, marginBottom: "4px" }}>{data.recipient_name}</div>
          <div style={{ fontSize: "9pt", lineHeight: 1.65 }}>
            {data.delivery_address}<br />
            {data.delivery_city}, {data.delivery_state} {data.delivery_zip}
          </div>
          <div style={{ fontSize: "8.5pt", marginTop: "4px" }}>Phone: {data.recipient_phone}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: "18px" }}>
          <QR value={`https://app.routelypro.com/track/${trackingId}`} size={80} />
          <div style={{ fontSize: "5.5pt", color: "#888", marginTop: "2px", textAlign: "center" }}>SCAN RTL</div>
        </div>
      </div>

      {/* ── FROM ─── */}
      <div style={{ padding: "7px 12px", borderBottom: "1px solid #ccc", flexShrink: 0 }}>
        <div style={{ fontSize: "6.5pt", color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: "3px" }}>FROM / TENANT</div>
        <div style={{ fontSize: "11pt", fontWeight: 900, lineHeight: 1.2, marginBottom: "3px" }}>{data.from_name}</div>
        <div style={{ fontSize: "9pt", lineHeight: 1.65 }}>
          {data.from_address}<br />
          {data.from_city}, {data.from_state} {data.from_zip}
        </div>
        <div style={{ fontSize: "8.5pt", marginTop: "3px" }}>Phone: {data.from_phone || "_______________"}</div>
        {data.notes && (
          <div style={{ fontSize: "7.5pt", color: "#555", marginTop: "3px", fontStyle: "italic" }}>Note: {data.notes}</div>
        )}
      </div>

      {/* ── DELIVERY REQUIREMENTS ─── */}
      <div style={{ flexShrink: 0 }}>
        <div style={{
          background: BK, color: "#fff",
          fontSize: "7pt", fontWeight: 900, textTransform: "uppercase",
          textAlign: "center", padding: "3px 0", letterSpacing: "1px",
        }}>
          Delivery Requirements
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "6px 12px", gap: "4px 12px" }}>
          {[
            { label: "SIGNATURE",  value: hasSig ? "REQUIRED" : "NO" },
            { label: "COD",        value: hasCod ? "YES" : "NO" },
            { label: "COD AMOUNT", value: hasCod ? `$${data.collect_amount}` : "$0.00" },
            { label: "SAME DAY",   value: isSameDay ? "YES" : "NO" },
            { label: "TYPE",       value: typeStr },
            { label: "SERVICE",    value: serviceStr },
          ].map((r) => (
            <div key={r.label}>
              <div style={{ fontSize: "5.5pt", color: "#888", textTransform: "uppercase", lineHeight: 1 }}>{r.label}</div>
              <div style={{ fontSize: "9pt", fontWeight: 900, lineHeight: 1.3 }}>{r.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FOOTER BAR (black) ─── */}
      <div style={{
        marginTop: "auto",
        background: BK, color: "#fff", flexShrink: 0,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "5px 12px",
        }}>
          <span style={{ fontSize: "7.5pt", fontWeight: 700 }}>STOP / ROUTE</span>
          <span style={{ fontSize: "14pt", fontWeight: 900, fontFamily: '"Geist Mono",ui-monospace,monospace', letterSpacing: "-0.5px" }}>{trackingId.split("-").slice(1).join("-")}</span>
        </div>
        {hasSig && (
          <div style={{ textAlign: "center", fontSize: "6.5pt", fontWeight: 700, borderTop: "1px solid #444", padding: "2px 0", letterSpacing: "0.5px" }}>
            PROOF OF DELIVERY REQUIRED
          </div>
        )}
      </div>

    </div>
  );
}
