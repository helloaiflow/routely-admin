"use client";

import { useMemo } from "react";

import { AdvancedMarker, APIProvider, Map as GoogleMap } from "@vis.gl/react-google-maps";
import { motion } from "framer-motion";
import { MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

import type { DashboardStop } from "./_types";

const GMAP_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const MIAMI = { lat: 25.7617, lng: -80.1918 };
const MAP_H = "h-[180px]";

export function NextStopMap({ stop }: { stop: DashboardStop | null }) {
  const hasCoords = stop?.delivery_lat != null && stop?.delivery_lng != null;
  const lat = hasCoords ? (stop?.delivery_lat ?? MIAMI.lat) : MIAMI.lat;
  const lng = hasCoords ? (stop?.delivery_lng ?? MIAMI.lng) : MIAMI.lng;
  const center = useMemo(() => ({ lat, lng }), [lat, lng]);

  if (!stop) {
    return (
      <div className={cn("relative w-full overflow-hidden bg-muted", MAP_H)}>
        <BackgroundGrid />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <MapPin className="size-6 text-muted-foreground/50 opacity-50" />
          <span className="font-medium text-muted-foreground/70 text-xs">No upcoming stops</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full overflow-hidden", MAP_H)}>
      <APIProvider apiKey={GMAP_KEY}>
        <GoogleMap
          key={`${stop.id}-${lat}-${lng}`}
          defaultCenter={center}
          defaultZoom={hasCoords ? 14 : 9}
          mapId="routely-nextstop-map"
          disableDefaultUI={true}
          gestureHandling="none"
          style={{ width: "100%", height: "100%" }}
        >
          {hasCoords && (
            <AdvancedMarker position={center}>
              <motion.div
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="relative flex flex-col items-center"
              >
                <div className="relative flex size-7 items-center justify-center rounded-full bg-primary shadow-lg ring-2 ring-white">
                  <MapPin className="size-3.5 text-white" />
                  <motion.span
                    className="absolute inset-0 rounded-full bg-primary"
                    animate={{ scale: [1, 1.7, 1], opacity: [0.45, 0, 0.45] }}
                    transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeOut" }}
                  />
                </div>
              </motion.div>
            </AdvancedMarker>
          )}
        </GoogleMap>
      </APIProvider>
      <GradientOverlay />
    </div>
  );
}

function GradientOverlay() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card/50 to-transparent" />
  );
}

function BackgroundGrid() {
  return (
    <svg
      className={cn("absolute inset-0 size-full opacity-25")}
      xmlns="http://www.w3.org/2000/svg"
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <pattern id="next-stop-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#next-stop-grid)" className="text-muted-foreground/50" />
    </svg>
  );
}
