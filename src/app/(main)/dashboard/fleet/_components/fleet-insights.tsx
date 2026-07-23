"use client";

import { useEffect, useMemo, useState } from "react";

import Image from "next/image";

import { Activity, CheckCircle2, Clock3, MapPin, Route, Target, Users, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type StopSnapshot = {
  id: string;
  stop_id: string | null;
  status: string;
  recipient_name: string;
  delivery_city: string;
  delivery_zip: string;
  delivery_date: string | null;
  driver_id: string | null;
  driver_name: string | null;
  route_id: string | null;
  route_title: string | null;
  pickup_location_id: string | null;
  pickup_name: string | null;
  eta_at: string | number | null;
  estimated_duration_s: number | null;
  last_event_at: string | null;
  created_at: string;
  delivery_succeeded: boolean | null;
};

export type InsightDriver = {
  id: string;
  name: string;
  external_circuit_id: string | null;
};

export type InsightHub = {
  id: string;
  name: string;
  external_circuit_id: string | null;
  route_defaults?: {
    max_stops?: number;
    start_time?: string;
    end_time?: string;
  } | null;
};

const deliveredStatuses = new Set(["delivered", "completed", "picked_up"]);
const failedStatuses = new Set(["failed", "attempted", "cancelled", "failed_not_home"]);

function outcome(stop: StopSnapshot): "success" | "failed" | "open" {
  if (stop.delivery_succeeded === true) return "success";
  if (stop.delivery_succeeded === false) return "failed";
  const status = stop.status.toLowerCase();
  if (deliveredStatuses.has(status)) return "success";
  if (failedStatuses.has(status)) return "failed";
  return "open";
}

function stopDay(stop: StopSnapshot): string {
  return stop.delivery_date || stop.last_event_at?.slice(0, 10) || stop.created_at.slice(0, 10);
}

function recentTime(stop: StopSnapshot): number {
  return new Date(stop.last_event_at || stop.created_at || 0).getTime();
}

function toTimestamp(value: string | number | null): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value < 10_000_000_000 ? value * 1000 : value;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function lastNDays(days: number) {
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - (days - 1 - index));
    return {
      key: date.toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
      label: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      }),
    };
  });
}

function useOperationalStops() {
  const [stops, setStops] = useState<StopSnapshot[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/client/stops?filter=all&limit=200", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => setStops((data.stops ?? []) as StopSnapshot[]))
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") setStops([]);
      });
    return () => controller.abort();
  }, []);

  return stops;
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  icon: React.ElementType;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div className="min-w-0 px-3 py-3 first:pl-0 last:pr-0">
      <div className="mb-2 flex items-center gap-1.5 text-muted-foreground">
        <Icon
          className={cn("size-3.5", tone === "success" && "text-success", tone === "danger" && "text-destructive")}
          aria-hidden="true"
        />
        <span className="type-caption truncate">{label}</span>
      </div>
      <p className="font-semibold text-xl tabular-nums tracking-tight">{value}</p>
      {detail && <p className="type-caption mt-0.5 truncate">{detail}</p>}
    </div>
  );
}

function PanelTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="font-semibold text-sm">{title}</h3>
      <p className="type-caption mt-0.5">{description}</p>
    </div>
  );
}

function EmptyInsights({ subject }: { subject: string }) {
  return (
    <div className="grid min-h-80 place-items-center px-6 text-center">
      <div>
        <span className="mx-auto grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Activity className="size-4" aria-hidden="true" />
        </span>
        <p className="mt-3 font-medium text-sm">Select a {subject}</p>
        <p className="type-caption mx-auto mt-1 max-w-56">Performance and recent activity will appear here.</p>
      </div>
    </div>
  );
}

function RecentStops({ stops }: { stops: StopSnapshot[] }) {
  if (stops.length === 0) {
    return <p className="type-caption py-8 text-center">No completed stops in this view yet.</p>;
  }

  return (
    <div className="divide-y divide-border/60">
      {stops.slice(0, 10).map((stop) => {
        const result = outcome(stop);
        return (
          <div key={stop.id} className="flex items-center gap-2.5 py-2.5">
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-lg",
                result === "success" && "bg-success/10 text-success",
                result === "failed" && "bg-destructive/10 text-destructive",
                result === "open" && "bg-muted text-muted-foreground",
              )}
            >
              {result === "success" ? (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              ) : result === "failed" ? (
                <XCircle className="size-3.5" aria-hidden="true" />
              ) : (
                <Clock3 className="size-3.5" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="type-body-sm truncate font-medium">{stop.recipient_name || stop.stop_id || "Stop"}</p>
              <p className="type-caption truncate">
                {[stop.delivery_city, stop.delivery_zip].filter(Boolean).join(" · ") ||
                  stop.route_title ||
                  "Location unavailable"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="type-caption font-medium text-foreground">
                {new Date(stop.last_event_at || stop.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </p>
              <p
                className={cn(
                  "type-label normal-case tracking-normal",
                  result === "success" && "text-success",
                  result === "failed" && "text-destructive",
                  result === "open" && "text-muted-foreground",
                )}
              >
                {result === "success" ? "Success" : result === "failed" ? "Failed" : "Open"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const driverChartConfig = {
  success: { label: "Successful", color: "var(--success)" },
  failed: { label: "Failed", color: "var(--destructive)" },
} satisfies ChartConfig;

export function DriverInsights({ driver }: { driver: InsightDriver | null }) {
  const stops = useOperationalStops();

  const driverStops = useMemo(() => {
    if (!driver || !stops) return [];
    const ids = new Set([driver.id, driver.external_circuit_id].filter(Boolean));
    const name = driver.name.trim().toLowerCase();
    return stops.filter(
      (stop) => (stop.driver_id != null && ids.has(stop.driver_id)) || stop.driver_name?.trim().toLowerCase() === name,
    );
  }, [driver, stops]);

  const days = useMemo(() => {
    const buckets = new Map(lastNDays(30).map((day) => [day.key, { ...day, success: 0, failed: 0 }]));
    for (const stop of driverStops) {
      const bucket = buckets.get(stopDay(stop));
      if (!bucket) continue;
      const result = outcome(stop);
      if (result === "success") bucket.success += 1;
      if (result === "failed") bucket.failed += 1;
    }
    return Array.from(buckets.values());
  }, [driverStops]);

  if (!driver) return <EmptyInsights subject="driver" />;
  if (stops == null) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  const successes = driverStops.filter((stop) => outcome(stop) === "success");
  const failures = driverStops.filter((stop) => outcome(stop) === "failed");
  const terminal = successes.length + failures.length;
  const successRate = terminal ? Math.round((successes.length / terminal) * 100) : 0;
  const routes = new Set(driverStops.map((stop) => stop.route_id).filter(Boolean)).size;
  const timed = driverStops
    .map((stop) => stop.estimated_duration_s)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const avgStopMinutes = timed.length
    ? Math.round(timed.reduce((total, value) => total + value, 0) / timed.length / 60)
    : null;
  const punctual = successes.filter((stop) => {
    const eta = toTimestamp(stop.eta_at);
    const completed = toTimestamp(stop.last_event_at);
    return eta != null && completed != null && completed <= eta;
  }).length;
  const etaMeasured = successes.filter(
    (stop) => toTimestamp(stop.eta_at) != null && toTimestamp(stop.last_event_at) != null,
  ).length;
  const onTimeRate = etaMeasured ? Math.round((punctual / etaMeasured) * 100) : null;
  const recent = [...driverStops].sort((a, b) => recentTime(b) - recentTime(a));

  return (
    <div className="divide-y divide-border/60">
      <section className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <PanelTitle title="Driver performance" description="Live operational record, last 30 days" />
          <span className="type-label rounded-md bg-primary/10 px-2 py-1 text-primary">30 days</span>
        </div>
        <div className="mt-3 grid grid-cols-4 divide-x divide-border/60">
          <Metric label="Routes" value={String(routes)} icon={Route} />
          <Metric label="Success" value={String(successes.length)} icon={CheckCircle2} tone="success" />
          <Metric label="Failed" value={String(failures.length)} icon={XCircle} tone="danger" />
          <Metric label="Success rate" value={`${successRate}%`} icon={Target} />
        </div>
      </section>

      <section className="px-4 py-4">
        <PanelTitle title="Delivery outcomes" description="Successful and failed stops by day" />
        <ChartContainer config={driverChartConfig} className="mt-3 aspect-auto h-44 w-full">
          <BarChart accessibilityLayer data={days} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="success" fill="var(--color-success)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="failed" fill="var(--color-failed)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </section>

      <section className="grid grid-cols-2 divide-x divide-border/60 px-4 py-3">
        <Metric
          label="Avg. time per stop"
          value={avgStopMinutes == null ? "N/A" : `${avgStopMinutes}m`}
          detail={timed.length ? `${timed.length} measured stops` : "No duration samples"}
          icon={Clock3}
        />
        <Metric
          label="On-time arrival"
          value={onTimeRate == null ? "N/A" : `${onTimeRate}%`}
          detail={etaMeasured ? `${etaMeasured} ETA comparisons` : "No ETA comparisons"}
          icon={Target}
        />
      </section>

      <section className="px-4 py-4">
        <PanelTitle title="Latest stops" description="The 10 most recent assignments" />
        <div className="mt-2">
          <RecentStops stops={recent} />
        </div>
      </section>
    </div>
  );
}

const hubChartConfig = {
  routes: { label: "Routes", color: "var(--primary)" },
  stops: { label: "Stops", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function HubInsights({ hub, assignedDrivers }: { hub: InsightHub | null; assignedDrivers: number }) {
  const stops = useOperationalStops();

  const hubStops = useMemo(() => {
    if (!hub || !stops) return [];
    const ids = new Set([hub.id, hub.external_circuit_id].filter(Boolean));
    const name = hub.name.trim().toLowerCase();
    return stops.filter(
      (stop) =>
        (stop.pickup_location_id != null && ids.has(stop.pickup_location_id)) ||
        stop.pickup_name?.trim().toLowerCase() === name,
    );
  }, [hub, stops]);

  const days = useMemo(() => {
    const buckets = new Map(
      lastNDays(7).map((day) => [day.key, { ...day, stops: 0, routeIds: new Set<string>(), routes: 0 }]),
    );
    for (const stop of hubStops) {
      const bucket = buckets.get(stopDay(stop));
      if (!bucket) continue;
      bucket.stops += 1;
      if (stop.route_id) bucket.routeIds.add(stop.route_id);
    }
    return Array.from(buckets.values()).map(({ routeIds, ...day }) => ({
      ...day,
      routes: routeIds.size,
    }));
  }, [hubStops]);

  if (!hub) return <EmptyInsights subject="hub" />;
  if (stops == null) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  const routes = new Set(hubStops.map((stop) => stop.route_id).filter(Boolean));
  const successful = hubStops.filter((stop) => outcome(stop) === "success").length;
  const failed = hubStops.filter((stop) => outcome(stop) === "failed").length;
  const terminal = successful + failed;
  const successRate = terminal ? Math.round((successful / terminal) * 100) : 0;
  const recent = [...hubStops].sort((a, b) => recentTime(b) - recentTime(a));
  const routeCounts = new Map<string, { name: string; stops: number }>();
  for (const stop of hubStops) {
    if (!stop.route_id) continue;
    const current = routeCounts.get(stop.route_id) ?? {
      name: stop.route_title || stop.route_id,
      stops: 0,
    };
    current.stops += 1;
    routeCounts.set(stop.route_id, current);
  }
  const recentRoutes = Array.from(routeCounts.values())
    .sort((a, b) => b.stops - a.stops)
    .slice(0, 5);

  return (
    <div className="divide-y divide-border/60">
      <div className="relative h-24 overflow-hidden bg-muted">
        <Image
          src="/img/routely-hubs-isometric-v2.png"
          alt="Isometric Routely hub network across Florida"
          fill
          priority
          sizes="(min-width: 1280px) 34vw, 100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-card via-card/80 to-transparent px-4 pt-8 pb-2.5">
          <div>
            <p className="type-label text-primary">Florida network</p>
            <p className="type-caption text-foreground">Medical courier coverage</p>
          </div>
          <span className="type-caption rounded-md bg-card/90 px-2 py-1 font-medium shadow-xs">Live operations</span>
        </div>
      </div>
      <section className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <PanelTitle title="Hub operations" description="Current network activity and capacity" />
          <span className="type-label rounded-md bg-primary/10 px-2 py-1 text-primary">7 days</span>
        </div>
        <div className="mt-3 grid grid-cols-4 divide-x divide-border/60">
          <Metric label="Routes" value={String(routes.size)} icon={Route} />
          <Metric label="Stops" value={String(hubStops.length)} icon={MapPin} />
          <Metric label="Drivers" value={String(assignedDrivers)} icon={Users} />
          <Metric label="Success" value={`${successRate}%`} icon={Target} />
        </div>
      </section>

      <section className="px-4 py-4">
        <PanelTitle title="Daily volume" description="Routes and stops leaving this hub" />
        <ChartContainer config={hubChartConfig} className="mt-3 aspect-auto h-44 w-full">
          <BarChart accessibilityLayer data={days} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="routes" fill="var(--color-routes)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="stops" fill="var(--color-stops)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </section>

      <section className="grid grid-cols-2 divide-x divide-border/60 px-4 py-3">
        <Metric
          label="Route window"
          value={
            hub.route_defaults?.start_time || hub.route_defaults?.end_time
              ? `${hub.route_defaults?.start_time || "N/A"}–${hub.route_defaults?.end_time || "N/A"}`
              : "N/A"
          }
          detail="Default operating hours"
          icon={Clock3}
        />
        <Metric
          label="Stop capacity"
          value={hub.route_defaults?.max_stops ? String(hub.route_defaults.max_stops) : "∞"}
          detail="Default maximum per route"
          icon={Activity}
        />
      </section>

      <section className="px-4 py-4">
        <PanelTitle title="Top routes" description="Highest stop volume in the current sample" />
        <div className="mt-3 space-y-2">
          {recentRoutes.length ? (
            recentRoutes.map((route, index) => (
              <div key={route.name} className="flex items-center gap-2.5">
                <span className="type-caption grid size-6 place-items-center rounded-md bg-muted font-medium text-foreground">
                  {index + 1}
                </span>
                <p className="type-body-sm min-w-0 flex-1 truncate font-medium">{route.name}</p>
                <span className="type-caption tabular-nums">{route.stops} stops</span>
              </div>
            ))
          ) : (
            <p className="type-caption py-5 text-center">No routed stops for this hub yet.</p>
          )}
        </div>
      </section>

      <section className="px-4 py-4">
        <PanelTitle title="Latest stops" description="Recent activity from this hub" />
        <div className="mt-2">
          <RecentStops stops={recent} />
        </div>
      </section>
    </div>
  );
}
