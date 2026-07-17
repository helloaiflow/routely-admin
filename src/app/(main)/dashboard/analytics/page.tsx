"use client";

import { ChevronsUpDown, Download, Filter, MapPin, Package, TrendingUp, Truck, Users } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SPARKLINE_DATA = Array.from({ length: 14 }, (_, i) => ({
  day: `D${i + 1}`,
  stops: 0,
}));

const PERFORMANCE_DATA = Array.from({ length: 12 }, (_, i) => ({
  period: `W${i + 1}`,
  completion: 0,
  target: 100,
}));

const ZONE_BREAKDOWN = [
  { zone: "South Florida", stops: 0, pct: 0 },
  { zone: "Central Florida", stops: 0, pct: 0 },
  { zone: "North Florida", stops: 0, pct: 0 },
];

const DRIVERS = [
  { name: "Miguel Rodriguez", route: "Route South FL", status: "Active" as const },
  { name: "Antonio Delgado", route: "Route Central FL", status: "Standby" as const },
  { name: "Unassigned", route: "—", status: "Available" as const },
];

const sparklineConfig = {
  stops: { label: "Stops", color: "var(--chart-1)" },
} satisfies ChartConfig;

const performanceConfig = {
  completion: { label: "Completion %", color: "var(--chart-1)" },
  target: { label: "Target", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

export default function AnalyticsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 bg-muted/40 p-4 md:gap-6 md:p-6">
      {/* Top toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select defaultValue="route">
            <SelectTrigger className="w-44">
              <div className="flex items-center gap-2">
                <span
                  className="size-2 rounded-full bg-primary"
                  style={{ boxShadow: "0 0 8px color-mix(in oklab, var(--primary) 50%, transparent)" }}
                />
                <SelectValue />
              </div>
              <ChevronsUpDown className="size-4 opacity-50" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="route">Route View</SelectItem>
              <SelectItem value="zone">Zone View</SelectItem>
              <SelectItem value="driver">Driver View</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Filter className="size-4" />
            Filters
            <Badge variant="secondary" className="tabular-nums">
              0
            </Badge>
          </Button>
          <span className="text-muted-foreground text-sm">
            Showing: <span className="font-medium">South Florida</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline">
            <span className="text-sm">01 Apr 2026 — 29 Apr 2026</span>
          </Button>
          <Button variant="secondary">
            <Download className="size-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        {/* Left main (2/3) */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Deliveries summary card */}
          <Card className="bg-card shadow-xs ring-1 ring-foreground/10">
            <CardHeader>
              <CardTitle>Deliveries</CardTitle>
              <CardDescription>Stop volume for the selected range</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="font-semibold text-3xl tabular-nums tracking-tight sm:text-4xl">0 stops</div>
                <Badge variant="secondary">+0%</Badge>
                <Badge variant="secondary">+0 vs prev</Badge>
              </div>
              <div className="text-muted-foreground text-sm">Previous period: 0</div>
              <ChartContainer config={sparklineConfig} className="h-12 w-full rounded-md border">
                <AreaChart data={SPARKLINE_DATA} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                  <XAxis dataKey="day" hide />
                  <YAxis hide domain={[0, 1]} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Area
                    dataKey="stops"
                    type="natural"
                    fill="var(--color-stops)"
                    fillOpacity={0.14}
                    stroke="var(--color-stops)"
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* On-Time Rate vs Target chart */}
          <Card className="bg-card shadow-xs ring-1 ring-foreground/10">
            <CardHeader>
              <CardTitle>On-Time Rate vs Target</CardTitle>
              <CardDescription>12-week trend with completion context</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MetricChip label="Completion Rate" value="0%" note="vs 100% target" />
                <MetricChip label="Active Stops" value="0" note="currently in route" />
                <MetricChip label="Avg Miles" value="0.0 mi" note="per delivery" />
              </div>
              <ChartContainer config={performanceConfig} className="h-64 w-full">
                <BarChart data={PERFORMANCE_DATA} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.25} />
                  <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={10} />
                  <YAxis
                    tickFormatter={(value) => `${Math.round(value)}%`}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={44}
                    domain={[0, 120]}
                    ticks={[0, 50, 100]}
                  />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <ReferenceLine y={100} stroke="var(--color-target)" strokeWidth={2} strokeDasharray="6 5" />
                  <Bar
                    dataKey="completion"
                    fill="var(--color-completion)"
                    fillOpacity={0.22}
                    stroke="var(--color-completion)"
                    strokeOpacity={0.35}
                    radius={[5, 5, 0, 0]}
                    barSize={14}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Route Coverage */}
          <Card className="bg-card shadow-xs ring-1 ring-foreground/10">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Route Coverage</CardTitle>
                  <CardDescription>Zone performance for this cycle</CardDescription>
                </div>
                <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400">
                  On Track
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MetricChip label="Stops" value="+0" note="completed this cycle" />
                <MetricChip label="Efficiency" value="+0%" note="vs target" />
                <MetricChip label="Failed" value="-0" note="exceptions logged" />
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground text-xs">
              <span>
                <span className="font-medium text-foreground">Owner:</span> Routely Local
              </span>
              <span>
                <span className="font-medium text-foreground">Focus:</span> South Florida routes
              </span>
              <span>
                <span className="font-medium text-foreground">Due:</span> End of month
              </span>
            </CardFooter>
          </Card>
        </div>

        {/* Right sidebar (1/3) */}
        <div className="flex flex-col gap-4">
          {/* Delivery Summary */}
          <Card className="bg-card shadow-xs ring-1 ring-foreground/10">
            <CardHeader>
              <CardTitle>Delivery Summary</CardTitle>
              <CardDescription>Core delivery signals vs previous period</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <SummaryCell icon={Package} label="Pending Stops" value="0" />
                <SummaryCell icon={MapPin} label="Miles Today" value="0.0" />
                <SummaryCell icon={TrendingUp} label="Success Rate" value="0%" />
                <SummaryCell icon={Truck} label="Failed Today" value="0" />
              </div>
              <div className="space-y-2">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">By Zone</p>
                <div className="space-y-1.5">
                  {ZONE_BREAKDOWN.map((z) => (
                    <div key={z.zone} className="flex items-center justify-between text-sm">
                      <span>{z.zone}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {z.stops} stops · {z.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Driver Queue */}
          <Card className="bg-card shadow-xs ring-1 ring-foreground/10">
            <CardHeader>
              <CardTitle>Driver Queue</CardTitle>
              <CardDescription>Active drivers and their current status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {DRIVERS.map((d) => (
                <div key={d.name} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Users className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{d.name}</p>
                    <p className="truncate text-muted-foreground text-xs">
                      {d.route} · {d.status}
                    </p>
                  </div>
                  <Button size="sm" variant="outline">
                    Assign
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricChip({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-md border bg-muted/35 px-3 py-2.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold text-lg tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{note}</p>
    </div>
  );
}

function SummaryCell({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">{label}</p>
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <p className="mt-1 font-semibold text-xl tabular-nums">{value}</p>
    </div>
  );
}
