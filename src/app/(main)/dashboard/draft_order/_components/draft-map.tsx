"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Navigation2 } from "lucide-react";
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { cn } from "@/lib/utils";
import type { DraftOrder } from "../_lib/helpers";

const GMAP_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const FLORIDA = { lat: 26.45, lng: -80.25 };

function estimateEta(miles: number) {
  return Math.max(15, Math.round(miles * 2.5 + 10));
}

function Pin({ label, color }: { label: "A" | "B"; color: "green" | "blue" }) {
  const bg = color === "green" ? "#22c55e" : "#2563eb";
  return (
    <div style={{ background: bg }}
      className="flex size-6 items-center justify-center rounded-full border-2 border-white shadow-md">
      <span className="font-bold text-[10px] text-white">{label}</span>
    </div>
  );
}

// Inner component that has access to the map instance
function RouteLayer({ draft }: { draft: DraftOrder }) {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  const [routeMinutes, setRouteMinutes] = useState<number | null>(null);
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null);

  const pLat = draft?.pickup_lat;
  const pLng = draft?.pickup_lng;
  const dLat = draft?.delivery_lat;
  const dLng = draft?.delivery_lng;
  const hasBoth = pLat != null && pLng != null && dLat != null && dLng != null;

  useEffect(() => {
    if (!map || !routesLib || !hasBoth) return;

    const service = new routesLib.DirectionsService();

    // Clean up previous renderer
    if (rendererRef.current) rendererRef.current.setMap(null);

    const renderer = new routesLib.DirectionsRenderer({
      map,
      suppressMarkers: true, // we use custom markers
      polylineOptions: {
        strokeColor: "#2563eb",
        strokeWeight: 4,
        strokeOpacity: 0.85,
      },
    });
    rendererRef.current = renderer;

    service.route({
      origin: { lat: pLat!, lng: pLng! },
      destination: { lat: dLat!, lng: dLng! },
      travelMode: google.maps.TravelMode.DRIVING,
      drivingOptions: {
        departureTime: new Date(),
        trafficModel: google.maps.TrafficModel.BEST_GUESS,
      },
    }, (result, status) => {
      if (status === "OK" && result) {
        renderer.setDirections(result);
        const leg = result.routes[0]?.legs[0];
        if (leg?.duration_in_traffic) {
          setRouteMinutes(Math.round(leg.duration_in_traffic.value / 60));
        } else if (leg?.duration) {
          setRouteMinutes(Math.round(leg.duration.value / 60));
        }
        // Fit bounds to route
        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: pLat!, lng: pLng! });
        bounds.extend({ lat: dLat!, lng: dLng! });
        map.fitBounds(bounds, 56);
      }
    });

    return () => { renderer.setMap(null); };
  }, [map, routesLib, hasBoth, pLat, pLng, dLat, dLng]);

  return null;
}

export function DraftMap({ draft }: { draft: DraftOrder | null }) {
  const pLat = draft?.pickup_lat;
  const pLng = draft?.pickup_lng;
  const dLat = draft?.delivery_lat;
  const dLng = draft?.delivery_lng;
  const hasBoth = pLat != null && pLng != null && dLat != null && dLng != null;

  const miles = draft?.estimated_miles ?? 0;
  const total = draft?.carrier_price ?? draft?.estimated_cost ?? 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* HEADER */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <div>
          <p className="font-semibold text-xs">Route Preview</p>
          <p className="text-[10px] text-muted-foreground">Google Maps · Real-time traffic</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 font-bold text-[10px] text-white">A</span>
          <span className="text-[10px] text-muted-foreground">Pickup</span>
          <span className="flex size-4 items-center justify-center rounded-full bg-blue-600 font-bold text-[10px] text-white">B</span>
          <span className="text-[10px] text-muted-foreground">Delivery</span>
        </div>
      </div>

      {/* MAP */}
      <div className="relative flex-1 overflow-hidden">
        {!draft ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted/20 text-muted-foreground">
            <Navigation2 className="size-8 opacity-30" />
            <p className="text-xs">Select a stop to preview the route</p>
          </div>
        ) : (
          <APIProvider apiKey={GMAP_KEY}>
            <Map
              defaultCenter={FLORIDA}
              defaultZoom={9}
              mapId="routely-draft-map"
              disableDefaultUI={true}
              gestureHandling="cooperative"
              style={{ width: "100%", height: "100%" }}
            >
              {hasBoth && <RouteLayer draft={draft} />}
              {pLat != null && pLng != null && (
                <AdvancedMarker position={{ lat: pLat, lng: pLng }}>
                  <Pin label="A" color="green" />
                </AdvancedMarker>
              )}
              {dLat != null && dLng != null && (
                <AdvancedMarker position={{ lat: dLat, lng: dLng }}>
                  <Pin label="B" color="blue" />
                </AdvancedMarker>
              )}
            </Map>
          </APIProvider>
        )}
        {draft && !hasBoth && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-muted/30">
            <p className="rounded-md bg-background/80 px-3 py-1.5 text-[10px] text-muted-foreground shadow-sm">
              Enter pickup & delivery addresses to see the route
            </p>
          </div>
        )}
      </div>

      {/* FOOTER STATS */}
      <div className={cn("flex shrink-0 items-center justify-end gap-4 border-t px-4 py-2.5", !draft && "opacity-40")}>
        <div className="text-right">
          <p className={cn("font-semibold text-base tabular-nums", miles > 0 ? "text-foreground" : "text-muted-foreground/40")}>
            {miles > 0 ? miles.toFixed(1) : "—"}
          </p>
          <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">Miles</p>
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="text-right">
          <p className={cn("font-semibold text-base tabular-nums", total > 0 ? "text-foreground" : "text-muted-foreground/40")}>
            {total > 0 ? `$${total.toFixed(2)}` : "—"}
          </p>
          <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">Total</p>
        </div>
      </div>
    </div>
  );
}
