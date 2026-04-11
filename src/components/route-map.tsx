"use client";

import { useEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { Clock, LocateFixed, MapPin, Navigation } from "lucide-react";

const DEPOT_ADDRESS = "12156 West Sample Road, Coral Springs, FL 33065";
const DEPOT_NAME = "MedFlorida Pharmacy";

const ROUTE_COLORS: Record<string, string> = {
  "CENTRAL FL": "#c0006a",
  "SOUTH FL": "#7a7200",
  "DEERFIELD FL": "#0079a8",
  "NORTH FL": "#007a4a",
};

function getRouteColor(route?: string): string {
  if (!route) return "#2563EB";
  const up = route.toUpperCase();
  for (const [k, v] of Object.entries(ROUTE_COLORS)) {
    if (up.includes(k)) return v;
  }
  return "#2563EB";
}

interface RouteInfo {
  distance: string;
  duration: string;
  durationValue: number;
}

interface RouteMapProps {
  destinationAddress: string;
  patientName?: string;
  route?: string;
}

declare global {
  interface Window {
    google: typeof google;
  }
}

export function RouteMap({ destinationAddress, patientName, route }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const initializedRef = useRef(false);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const routeColor = getRouteColor(route);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !destinationAddress) return;

    // Reset state when destination changes
    setLoading(true);
    setError(false);
    setRouteInfo(null);

    const buildRoute = () => {
      if (!mapRef.current) return;

      // Only create map instance once
      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
          zoom: 11,
          center: { lat: 26.2, lng: -80.25 },
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          styles: [
            { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
            { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9e8f5" }] },
            { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f8f9fa" }] },
          ],
        });
      }

      const map = mapInstanceRef.current;

      const directionsService = new window.google.maps.DirectionsService();
      const directionsRenderer = new window.google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: routeColor,
          strokeWeight: 5,
          strokeOpacity: 0.9,
        },
      });
      directionsRenderer.setMap(map);

      directionsService.route(
        {
          origin: DEPOT_ADDRESS,
          destination: destinationAddress,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          setLoading(false);
          if (status === "OK" && result) {
            directionsRenderer.setDirections(result);
            const leg = result.routes[0]?.legs[0];
            if (leg) {
              setRouteInfo({
                distance: leg.distance?.text || "",
                duration: leg.duration?.text || "",
                durationValue: leg.duration?.value || 0,
              });

              // Depot marker — blue circle
              new window.google.maps.Marker({
                position: leg.start_location,
                map,
                icon: {
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 11,
                  fillColor: "#2563EB",
                  fillOpacity: 1,
                  strokeColor: "#ffffff",
                  strokeWeight: 3,
                },
                title: DEPOT_NAME,
                zIndex: 10,
              });

              // Patient marker — route color pin
              new window.google.maps.Marker({
                position: leg.end_location,
                map,
                icon: {
                  path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
                  scale: 1.8,
                  fillColor: routeColor,
                  fillOpacity: 1,
                  strokeColor: "#ff",
                  strokeWeight: 2.5,
                  anchor: new window.google.maps.Point(12, 22),
                },
                title: patientName,
                zIndex: 20,
              });
            }
          } else {
            setError(true);
          }
        },
      );
    };

    const loadAndBuild = () => {
      if (window.google?.maps) {
        buildRoute();
        return;
      }
      if (!document.getElementById("gmap-script")) {
        const script = document.createElement("script");
        script.id = "gmap-script";
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
        script.async = true;
        script.defer = true;
        script.onload = buildRoute;
        script.onerror = () => {
          setLoading(false);
          setError(true);
        };
        document.head.appendChild(script);
      } else {
        const interval = setInterval(() => {
          if (window.google?.maps) {
            clearInterval(interval);
            buildRoute();
          }
        }, 100);
        return () => clearInterval(interval);
      }
    };

    loadAndBuild();
  }, [destinationAddress, routeColor, patientName]);

  const urgencyCls = routeInfo
    ? routeInfo.durationValue < 1800
      ? "text-green-600 bg-green-50 border-green-200"
      : routeInfo.durationValue < 3600
        ? "text-amber-600 bg-amber-50 border-amber-200"
        : "text-rose-600 bg-rose-50 border-rose-200"
    : "";

  return (
    <div className="absolute inset-0 overflow-hidden rounded-xl" style={{ contain: "layout" }}>
      {/* Map canvas */}
      <div ref={mapRef} className="absolute inset-0" />

      {/* Loading overlay */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm"
          >
            <div className="relative">
              <Navigation className="h-10 w-10 opacity-20" style={{ color: routeColor }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="h-5 w-5 animate-spin rounded-full border-2 border-transparent"
                  style={{ borderTopColor: routeColor }}
                />
              </div>
            </div>
            <p className="text-xs font-medium text-muted-foreground">Calculating route...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/90 text-muted-foreground">
          <MapPin className="h-8 w-8 opacity-20" />
          <p className="text-xs">Could not calculate route</p>
        </div>
      )}

      {/* Route info card */}
      <AnimatePresence>
        {routeInfo && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-3 left-3 z-20 overflow-hidden rounded-2xl border bg-background/96 shadow-xl backdrop-blur-md"
            style={{ minWidth: 200 }}
          >
            {/* Depot */}
            <div className="flex items-center gap-2.5 border-b px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100">
                <div className="h-3 w-3 rounded-full bg-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[9px] uppercase tracking-wider text-blue-600">Depot</p>
                <p className="truncate text-[10px] text-muted-foreground">{DEPOT_NAME}</p>
              </div>
            </div>
            {/* Stats */}
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="flex items-center gap-1">
                <Navigation className="h-3 w-3 text-muted-foreground" />
                <span className="font-bold text-xs">{routeInfo.distance}</span>
              </div>
              <div className="h-3 w-px bg-border" />
              <div className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 ${urgencyCls}`}>
                <Clock className="h-3 w-3" />
                <span className="font-bold text-xs">{routeInfo.duration}</span>
              </div>
            </div>
            {/* Patient */}
            <div className="flex items-center gap-2.5 border-t px-3 py-2">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{ background: `${routeColor}20` }}
              >
                <MapPin className="h-3.5 w-3.5" style={{ color: routeColor }} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[9px] uppercase tracking-wider" style={{ color: routeColor }}>
                  Patient
                </p>
                <p className="truncate text-[10px] text-muted-foreground capitalize">{patientName?.toLowerCase()}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset zoom */}
      <button
        type="button"
        onClick={() => mapInstanceRef.current?.setZoom(11)}
        className="absolute bottom-3 right-3 z-20 flex h-8 w-8 items-center justify-center rounded-xl border bg-background/95 shadow-md backdrop-blur-md transition-colors hover:bg-muted"
        title="Reset zoom"
      >
        <LocateFixed className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
