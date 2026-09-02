"use client";

/* RouteMap — live A→B office route preview for the wizard's Route step.
 * Uses the same @vis.gl/react-google-maps setup as next-stop-map. Offices
 * carry no coordinates, so we geocode client-side, then try the Directions
 * service for the real driving polyline; if either fails we degrade
 * gracefully (straight line, or no map) — route preview must NEVER block
 * the wizard (CEO spec). */

import { useEffect, useState } from "react";

import { AdvancedMarker, APIProvider, Map as GoogleMap, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";

import { BRAND_PRIMARY } from "@/lib/brand";

const GMAP_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

type LatLng = { lat: number; lng: number };

function Pin({ label, dark }: { label: string; dark?: boolean }) {
  return (
    <div
      className={
        dark
          ? "flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background shadow-md ring-2 ring-background"
          : "flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-md ring-2 ring-background"
      }
    >
      {label}
    </div>
  );
}

function RouteLayer({ from, to }: { from: string; to: string }) {
  const map = useMap();
  const geocoding = useMapsLibrary("geocoding");
  const routes = useMapsLibrary("routes");
  const [a, setA] = useState<LatLng | null>(null);
  const [b, setB] = useState<LatLng | null>(null);

  // Geocode both offices (best-effort).
  useEffect(() => {
    if (!geocoding) return;
    let alive = true;
    const geocoder = new geocoding.Geocoder();
    setA(null);
    setB(null);
    geocoder
      .geocode({ address: from })
      .then((r) => {
        const loc = r.results[0]?.geometry.location;
        if (alive && loc) setA({ lat: loc.lat(), lng: loc.lng() });
      })
      .catch(() => {});
    geocoder
      .geocode({ address: to })
      .then((r) => {
        const loc = r.results[0]?.geometry.location;
        if (alive && loc) setB({ lat: loc.lat(), lng: loc.lng() });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [geocoding, from, to]);

  // Fit both pins, then try the real driving polyline (fallback: straight line).
  useEffect(() => {
    if (!map || !a || !b) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(a);
    bounds.extend(b);
    map.fitBounds(bounds, 28);

    let renderer: google.maps.DirectionsRenderer | null = null;
    let fallback: google.maps.Polyline | null = null;
    const drawFallback = () => {
      fallback = new google.maps.Polyline({
        map,
        path: [a, b],
        strokeOpacity: 0.85,
        strokeWeight: 3,
        strokeColor: BRAND_PRIMARY,
      });
    };
    if (routes) {
      const svc = new routes.DirectionsService();
      renderer = new routes.DirectionsRenderer({ map, suppressMarkers: true, preserveViewport: true });
      svc
        .route({ origin: a, destination: b, travelMode: google.maps.TravelMode.DRIVING })
        .then((res) => renderer?.setDirections(res))
        .catch(drawFallback);
    } else {
      drawFallback();
    }
    return () => {
      renderer?.setMap(null);
      fallback?.setMap(null);
    };
  }, [map, routes, a, b]);

  return (
    <>
      {a && (
        <AdvancedMarker position={a}>
          <Pin label="A" />
        </AdvancedMarker>
      )}
      {b && (
        <AdvancedMarker position={b}>
          <Pin label="B" dark />
        </AdvancedMarker>
      )}
    </>
  );
}

export function RouteMap({ from, to, heightClass = "h-[200px]" }: { from: string; to: string; heightClass?: string }) {
  if (!GMAP_KEY) return null;
  return (
    <div className={`${heightClass} w-full overflow-hidden rounded-lg border border-border`}>
      <APIProvider apiKey={GMAP_KEY}>
        <GoogleMap
          defaultCenter={{ lat: 27.5, lng: -81.5 }}
          defaultZoom={7}
          mapId="routely-internal-route-map"
          disableDefaultUI
          gestureHandling="none"
          clickableIcons={false}
          style={{ width: "100%", height: "100%" }}
        >
          <RouteLayer from={from} to={to} />
        </GoogleMap>
      </APIProvider>
    </div>
  );
}
