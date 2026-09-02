"use client";

/* ShippingLabel4x6 — the REAL 4 × 6 in internal-delivery label.
 * One component renders both the on-screen preview (scaled via transform)
 * and the print node (physical inches, @page 4in 6in margin 0) so preview,
 * PDF and print can never drift apart (CEO spec, 2026-09-01).
 * Black & white only; safe margins ~0.2in; fonts sized for 203 DPI thermal. */

import { useEffect, useState } from "react";

import { generateBarcodeSvg } from "@/lib/labels/label-codes";

export type ShippingLabelData = {
  trackingId: string; // real RTL id, or "" pre-dispatch
  date: string; // "SEP 01 2026"
  routeFrom: string; // origin office name
  routeTo: string; // destination city/office name
  senderName: string;
  senderCompany: string; // "MCM HEALTHCARE · CUTLER BAY"
  senderAddress1: string;
  senderAddress2: string; // "CUTLER BAY, FL 33157"
  recipientName: string;
  recipientAddress1: string;
  recipientAddress2: string; // "BOYNTON BEACH, FL 33426"
  recipientPhone: string;
  tags: string[]; // ["DOCUMENTS", "SIGNATURE REQUIRED", "STANDARD"]
  includeSenderContact?: boolean;
};

const U = (s: string) => (s || "").toUpperCase();

const mono: React.CSSProperties = { fontFamily: "'SF Mono','Roboto Mono',Menlo,Consolas,monospace" };
const sans: React.CSSProperties = {
  fontFamily: "'Helvetica Neue',Arial,sans-serif",
  color: "#000000",
  background: "#ffffff",
};

function Rule({ weight = 2 }: { weight?: number }) {
  return <div style={{ borderTop: `${weight}px solid #000000` }} />;
}

function InverseTag({ children }: { children: string }) {
  return (
    <span
      style={{
        background: "#000000",
        color: "#ffffff",
        padding: "0.02in 0.08in",
        fontSize: "0.11in",
        fontWeight: 800,
        letterSpacing: "0.02in",
      }}
    >
      {children}
    </span>
  );
}

export function ShippingLabel4x6({ data }: { data: ShippingLabelData }) {
  const [barcode, setBarcode] = useState("");
  const tracking = data.trackingId || "";
  const pending = !tracking;

  useEffect(() => {
    if (pending) {
      setBarcode("");
      return;
    }
    setBarcode(generateBarcodeSvg(tracking));
  }, [tracking, pending]);

  const includeSender = data.includeSenderContact !== false;

  return (
    <div
      className="shipping-label-4x6"
      style={{
        ...sans,
        width: "4in",
        height: "6in",
        padding: "0.2in",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "0.07in",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: "0.34in", fontWeight: 900, letterSpacing: "-0.015in", lineHeight: 1 }}>Routely</div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.15in", fontWeight: 900, letterSpacing: "0.01in" }}>INTERNAL DELIVERY</div>
          <div style={{ fontSize: "0.12in", fontWeight: 700 }}>{data.date}</div>
        </div>
      </div>
      <Rule weight={3} />

      {/* Route band */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.12in", fontSize: "0.17in", fontWeight: 800, letterSpacing: "0.015in" }}>
        <span>{U(data.routeFrom)}</span>
        <span style={{ fontWeight: 400 }}>→</span>
        <span>{U(data.routeTo)}</span>
      </div>
      <Rule />

      {/* FROM */}
      {includeSender && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.03in" }}>
            <div>
              <InverseTag>FROM</InverseTag>
            </div>
            <div style={{ fontSize: "0.2in", fontWeight: 900, lineHeight: 1.1 }}>{U(data.senderName)}</div>
            <div style={{ fontSize: "0.13in", fontWeight: 700, lineHeight: 1.25 }}>
              {U(data.senderCompany)}
              <br />
              {U(data.senderAddress1)}
              <br />
              {U(data.senderAddress2)}
            </div>
          </div>
          <Rule />
        </>
      )}

      {/* SHIP TO — strongest block on the label */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.03in" }}>
        <div>
          <InverseTag>SHIP TO</InverseTag>
        </div>
        <div style={{ fontSize: "0.27in", fontWeight: 900, lineHeight: 1.05, overflowWrap: "anywhere" }}>
          {U(data.recipientName)}
        </div>
        <div style={{ fontSize: "0.15in", fontWeight: 700, lineHeight: 1.25, overflowWrap: "anywhere" }}>
          {U(data.recipientAddress1)}
        </div>
        <div style={{ fontSize: "0.2in", fontWeight: 900, lineHeight: 1.1 }}>{U(data.recipientAddress2)}</div>
        {data.recipientPhone && <div style={{ fontSize: "0.15in", fontWeight: 700 }}>{data.recipientPhone}</div>}
      </div>
      <Rule />

      {/* Handling tags */}
      {data.tags.length > 0 && (
        <div style={{ display: "flex", gap: "0.06in", flexWrap: "wrap" }}>
          {data.tags.map((t) => (
            <span
              key={t}
              style={{
                border: "1.5px solid #000000",
                padding: "0.025in 0.07in",
                fontSize: "0.11in",
                fontWeight: 800,
                letterSpacing: "0.008in",
                whiteSpace: "nowrap",
              }}
            >
              {U(t)}
            </span>
          ))}
        </div>
      )}
      {data.tags.length > 0 && <Rule />}

      {/* Spacer absorbs leftover height so the tracking block can NEVER be
          squeezed under the barcode (CEO-reported overlap, 2026-09-01). */}
      <div style={{ flex: 1, minHeight: "0.05in" }} />

      {/* Tracking + Code 128 — one harmonious centered block: heading,
          number, then a SMALLER barcode with its human-readable id below. */}
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "0.05in" }}>
        <div>
          <div style={{ fontSize: "0.11in", fontWeight: 800, letterSpacing: "0.015in" }}>TRACKING NUMBER</div>
          <div style={{ ...mono, fontSize: pending ? "0.16in" : "0.23in", fontWeight: 800, letterSpacing: "0.01in", lineHeight: 1.15 }}>
            {pending ? "Generated after dispatch" : tracking}
          </div>
        </div>
        {barcode ? (
          // eslint-disable-next-line react/no-danger
          <div style={{ width: "82%", height: "0.42in", margin: "0 auto" }} dangerouslySetInnerHTML={{ __html: barcode }} />
        ) : (
          <div style={{ width: "82%", height: "0.42in", margin: "0 auto", border: "1.5px solid #000000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.1in", fontWeight: 700 }}>
            CODE 128 — generated after dispatch
          </div>
        )}
        {!pending && (
          <div style={{ ...mono, fontSize: "0.11in", fontWeight: 700, letterSpacing: "0.03in" }}>{tracking}</div>
        )}
      </div>

      {/* Footer */}
      <Rule weight={3} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "0.12in", fontWeight: 800, letterSpacing: "0.012in" }}>ROUTELYPRO.COM/TRACK</div>
        <div style={{ border: "1.5px solid #000000", padding: "0.02in 0.07in", fontSize: "0.1in", fontWeight: 800, letterSpacing: "0.01in" }}>
          ROUTELY · INTERNAL
        </div>
      </div>
    </div>
  );
}

/** Scaled on-screen preview. The inner node keeps its physical 4×6in size;
 *  only the wrapper transform changes, so what you see IS what prints. */
export function ShippingLabelPreview({ data, widthPx = 300 }: { data: ShippingLabelData; widthPx?: number }) {
  const scale = widthPx / 384; // 4in @ 96dpi = 384px
  return (
    <div
      style={{ width: widthPx, height: 576 * scale, overflow: "hidden" }}
      className="rounded-md border border-border shadow-sm"
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <ShippingLabel4x6 data={data} />
      </div>
    </div>
  );
}
