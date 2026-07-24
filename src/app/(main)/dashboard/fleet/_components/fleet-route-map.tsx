"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { Loader2, MapPin, Truck } from "lucide-react";

import { BRAND_PRIMARY } from "@/lib/brand";

/*
 * FleetRouteMap — a self-contained clone of the working interactive map from
 * the Stops page (src/app/(main)/dashboard/stops/page.tsx). It renders an
 * @vis.gl/react-google-maps <Map> and either:
 *   • draws a driving route A→B (origin + destination addresses), or
 *   • centers on a single geocoded point (single marker, no route).
 *
 * Deliberately trimmed vs. Stops: no Street-View popups, proof photos,
 * rush-hour toast, COD, or satellite controls. Kept: <APIProvider>+<Map>,
 * dark-mode basemap (via the mapId colorScheme switch), the A→B route line,
 * markers, fit-bounds, and a compact route-summary tooltip.
 *
 * Copied — NOT extracted — so Stops carries zero risk from this file.
 */

const GMAP_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const ROUTE_MAP_ID = "80ba5f15e5846750fb260767"; // routely-draft-map (same cloud-styled basemap as Stops)

type RouteResult = {
  miles: number;
  mins: number;
  dist: string;
  time: string;
  viewport?: { low: { latitude: number; longitude: number }; high: { latitude: number; longitude: number } };
  midpoint?: { lat: number; lng: number };
};

/* ── Two-point route layer: geocode + route A→B via the Routes API ────────── */
function RouteLayer({
  originAddr,
  destinationAddr,
  onResult,
  onFail,
}: {
  originAddr: string;
  destinationAddr: string;
  onResult: (r: RouteResult | null) => void;
  onFail: () => void;
}) {
  const map = useMap();
  const geometryLib = useMapsLibrary("geometry");
  const glowRef = useRef<google.maps.Polyline | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const altPolylineRef = useRef<google.maps.Polyline | null>(null);
  const [markers, setMarkers] = useState<{
    origin: { lat: number; lng: number } | null;
    destination: { lat: number; lng: number } | null;
  }>({ origin: null, destination: null });

  useEffect(() => {
    if (!map || !geometryLib || !originAddr || !destinationAddr) return;

    // Clear previous polylines
    glowRef.current?.setMap(null);
    polylineRef.current?.setMap(null);
    altPolylineRef.current?.setMap(null);
    glowRef.current = null;
    polylineRef.current = null;
    altPolylineRef.current = null;
    setMarkers({ origin: null, destination: null });

    let cancelled = false;

    fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GMAP_KEY,
        "X-Goog-FieldMask": [
          "routes.distanceMeters",
          "routes.duration",
          "routes.polyline.encodedPolyline",
          "routes.viewport",
        ].join(","),
      },
      body: JSON.stringify({
        origin: { address: originAddr },
        destination: { address: destinationAddr },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        computeAlternativeRoutes: true,
      }),
    })
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        if (cancelled) return;
        const routes = (data.routes as Record<string, unknown>[]) ?? [];
        if (routes.length === 0) {
          onResult(null);
          onFail();
          return;
        }

        const primary = routes[0];
        const encodedPolyline = (primary.polyline as Record<string, string>)?.encodedPolyline;
        if (!encodedPolyline) {
          onResult(null);
          onFail();
          return;
        }

        const path = geometryLib.encoding.decodePath(encodedPolyline);
        const midIdx = Math.floor(path.length / 2);
        const midPt = path[midIdx];
        const midpoint = midPt ? { lat: midPt.lat(), lng: midPt.lng() } : undefined;

        // Glow underlay (brand blue, drawn first)
        glowRef.current = new google.maps.Polyline({
          path,
          map,
          strokeColor: BRAND_PRIMARY,
          strokeWeight: 12,
          strokeOpacity: 0.22,
          zIndex: 8,
        });

        // Main route line
        polylineRef.current = new google.maps.Polyline({
          path,
          map,
          strokeColor: BRAND_PRIMARY,
          strokeWeight: 5,
          strokeOpacity: 0.95,
          zIndex: 10,
        });

        // Alternate route (subtle gray) when present
        if (routes.length > 1) {
          const altEncoded = (routes[1].polyline as Record<string, string>)?.encodedPolyline;
          if (altEncoded) {
            const altPath = geometryLib.encoding.decodePath(altEncoded);
            altPolylineRef.current = new google.maps.Polyline({
              path: altPath,
              map,
              strokeColor: "#94A3B8",
              strokeWeight: 4,
              strokeOpacity: 0.5,
              zIndex: 5,
            });
          }
        }

        const startPt = path[0];
        const endPt = path[path.length - 1];
        if (startPt && endPt) {
          setMarkers({
            origin: { lat: startPt.lat(), lng: startPt.lng() },
            destination: { lat: endPt.lat(), lng: endPt.lng() },
          });
        }

        const vp = primary.viewport as Record<string, Record<string, number>> | undefined;
        if (vp?.low && vp?.high) {
          map.fitBounds(
            new google.maps.LatLngBounds(
              { lat: vp.low.latitude, lng: vp.low.longitude },
              { lat: vp.high.latitude, lng: vp.high.longitude },
            ),
            { top: 60, bottom: 50, left: 50, right: 50 },
          );
        }

        const distM = (primary.distanceMeters as number) ?? 0;
        const miles = distM / 1609.34;
        const durStr = (primary.duration as string) ?? "0s";
        const durS = parseInt(durStr.replace("s", ""), 10) || 0;
        const mins = Math.round(durS / 60);

        onResult({
          miles,
          mins,
          dist: `${miles.toFixed(1)} mi`,
          time: mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} hr ${mins % 60} min`,
          viewport: vp?.low && vp?.high ? (vp as RouteResult["viewport"]) : undefined,
          midpoint,
        });
      })
      .catch(() => {
        if (cancelled) return;
        onResult(null);
        onFail();
      });

    return () => {
      cancelled = true;
      glowRef.current?.setMap(null);
      polylineRef.current?.setMap(null);
      altPolylineRef.current?.setMap(null);
    };
  }, [map, geometryLib, originAddr, destinationAddr, onResult, onFail]);

  return (
    <>
      {markers.origin && (
        <AdvancedMarker position={markers.origin} zIndex={20}>
          <div style={{ filter: "drop-shadow(0 4px 12px var(--primary-glow-strong))" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--primary)",
                  border: "3px solid white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 900,
                  color: "white",
                  lineHeight: 1,
                }}
              >
                A
              </div>
              <div style={{ width: 2, height: 8, background: "var(--primary)", opacity: 0.7 }} />
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--primary)", opacity: 0.5 }} />
            </div>
          </div>
        </AdvancedMarker>
      )}
      {markers.destination && (
        <AdvancedMarker position={markers.destination} zIndex={20}>
          <div style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.25))" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--destructive)",
                  border: "3px solid white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 900,
                  color: "white",
                  lineHeight: 1,
                }}
              >
                B
              </div>
              <div style={{ width: 2, height: 8, background: "var(--destructive)", opacity: 0.7 }} />
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--destructive)", opacity: 0.5 }} />
            </div>
          </div>
        </AdvancedMarker>
      )}
    </>
  );
}

/* ── Single-point layer: geocode one address, drop one marker, no route ───── */
function SinglePointLayer({
  address,
  onDone,
  onFail,
}: {
  address: string;
  onDone: () => void;
  onFail: () => void;
}) {
  const map = useMap();
  const geocodingLib = useMapsLibrary("geocoding");
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!map || !geocodingLib || !address) return;
    let cancelled = false;
    const geocoder = new geocodingLib.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      if (cancelled) return;
      if (status === "OK" && results && results[0]) {
        const loc = results[0].geometry.location;
        const p = { lat: loc.lat(), lng: loc.lng() };
        setPos(p);
        map.setCenter(p);
        map.setZoom(14);
        onDone();
      } else {
        onFail();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [map, geocodingLib, address, onDone, onFail]);

  if (!pos) return null;
  return (
    <AdvancedMarker position={pos} zIndex={20} anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER}>
      <div style={{ filter: "drop-shadow(0 4px 12px var(--primary-glow-strong))" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50% 50% 50% 0",
              transform: "rotate(-45deg)",
              background: "var(--primary)",
              border: "3px solid white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "white" }} />
          </div>
        </div>
      </div>
    </AdvancedMarker>
  );
}

/* ── Graceful placeholder (no key / no address / geocode or route failure) ── */
function MapFallback({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/60">
      <MapPin className="size-5 text-muted-foreground/25" aria-hidden="true" />
      <p className="max-w-[200px] px-3 text-center text-[11px] leading-snug text-muted-foreground/55">{text}</p>
    </div>
  );
}

export function FleetRouteMap({
  originAddr,
  destinationAddr,
  originName,
  destinationName,
  singlePoint,
}: {
  originAddr?: string;
  destinationAddr: string;
  originName?: string;
  destinationName?: string;
  singlePoint?: boolean;
}) {
  const [result, setResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // A→B route only when both endpoints are present and single-point isn't forced.
  const twoPoint = !singlePoint && Boolean(originAddr) && Boolean(destinationAddr);

  const onResult = useCallback((r: RouteResult | null) => {
    setResult(r);
    setLoading(false);
  }, []);
  const onFail = useCallback(() => {
    setFailed(true);
    setLoading(false);
  }, []);
  const onDone = useCallback(() => setLoading(false), []);

  // Reset transient state when the addresses / mode change.
  useEffect(() => {
    setResult(null);
    setLoading(true);
    setFailed(false);
  }, [originAddr, destinationAddr, singlePoint]);

  // Dark-mode watcher — feeds the mapId colorScheme switch (canonical dark/light
  // mechanism on a cloud-styled mapId map; legacy `styles` arrays are ignored).
  const [mapDark, setMapDark] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setMapDark(document.documentElement.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Hard fallbacks — no map at all.
  if (!GMAP_KEY) return <MapFallback text="Map preview unavailable — no Maps API key configured." />;
  if (!destinationAddr) return <MapFallback text="No address on file to map yet." />;

  const fallbackText = twoPoint
    ? [originName, destinationName].filter(Boolean).join(" → ") || destinationAddr
    : destinationName || destinationAddr;

  return (
    <div className="relative h-full w-full" title={[originName, destinationName].filter(Boolean).join(" → ")}>
      {/* Failure overlay — geocoding or routing came back empty */}
      {failed && (
        <div className="absolute inset-0 z-30">
          <MapFallback text={fallbackText} />
        </div>
      )}

      {/* Loading overlay */}
      {loading && !failed && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-2.5 rounded-2xl bg-card px-6 py-4 shadow-xl ring-1 ring-border/60">
            <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
            <p className="font-semibold text-[11px] text-muted-foreground">
              {twoPoint ? "Calculating route…" : "Locating…"}
            </p>
          </div>
        </div>
      )}

      <APIProvider apiKey={GMAP_KEY}>
        <Map
          defaultCenter={{ lat: 26.3, lng: -80.15 }}
          defaultZoom={twoPoint ? 8 : 12}
          mapId={ROUTE_MAP_ID}
          colorScheme={mapDark ? "DARK" : "LIGHT"}
          key={mapDark ? "dark" : "light"}
          disableDefaultUI={true}
          clickableIcons={false}
          gestureHandling="cooperative"
          style={{ width: "100%", height: "100%" }}
        >
          {twoPoint ? (
            <RouteLayer
              originAddr={originAddr as string}
              destinationAddr={destinationAddr}
              onResult={onResult}
              onFail={onFail}
            />
          ) : (
            <SinglePointLayer address={destinationAddr} onDone={onDone} onFail={onFail} />
          )}

          {/* Compact route-summary tooltip anchored at the route midpoint */}
          {twoPoint && result?.midpoint && (
            <AdvancedMarker
              position={result.midpoint}
              zIndex={15}
              anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER}
            >
              <div
                style={{
                  marginBottom: 12,
                  filter: "drop-shadow(0 8px 32px color-mix(in srgb, var(--primary) 40%, transparent))",
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    borderRadius: 14,
                    background: "color-mix(in srgb, var(--primary) 95%, transparent)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    padding: "10px 14px",
                    minWidth: 150,
                    border: "1px solid rgba(255,255,255,0.18)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Truck style={{ width: 13, height: 13, color: "rgba(255,255,255,0.7)", flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 900, color: "white", lineHeight: 1 }}>{result.time}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Distance</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "white" }}>{result.dist}</span>
                  </div>
                </div>
                <div
                  style={{
                    margin: "0 auto",
                    width: 0,
                    height: 0,
                    borderLeft: "7px solid transparent",
                    borderRight: "7px solid transparent",
                    borderTop: "7px solid color-mix(in srgb, var(--primary) 95%, transparent)",
                  }}
                />
              </div>
            </AdvancedMarker>
          )}
        </Map>
      </APIProvider>
    </div>
  );
}
