"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import {
  AlertTriangle,
  Car,
  CheckCircle,
  Clock,
  DollarSign,
  MapPin,
  Package,
  PenLine,
  RefreshCw,
  Route,
  Snowflake,
  Truck,
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const C = {
  blue: "hsl(217 91% 60%)",
  green: "hsl(142 71% 45%)",
  amber: "hsl(38 92% 50%)",
  violet: "hsl(263 70% 50%)",
  teal: "hsl(172 66% 50%)",
  red: "hsl(0 84% 60%)",
  indigo: "hsl(239 84% 67%)",
};

const cfgRoute: ChartConfig = { stops: { label: "Stops", color: C.blue } };
const cfgPie: ChartConfig = {
  Match: { label: "Match", color: C.green },
  Unmatch: { label: "Unmatch", color: C.amber },
  Human: { label: "Human", color: C.violet },
};
const cfgTrend: ChartConfig = { stops: { label: "Stops", color: C.blue } };

function etaLabel(epoch: number): string {
  if (!epoch) return "";
  return new Date(epoch * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });
}

function minutesUntil(epoch: number): number {
  return Math.round((epoch * 1000 - Date.now()) / 60000);
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [range, setRange] = useState("today");
  const [tenantId, setTenantId] = useState("1");
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stats?range=${range}&tenant_id=${tenantId}`);
      setStats(await res.json());
    } finally {
      setLoading(false);
    }
  }, [range, tenantId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const kpi = (stats?.kpi ?? {}) as Record<string, number>;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const routeData = Object.entries((stats?.byRoute ?? {}) as Record<string, number>)
    .map(([name, value]) => ({ name, stops: value }))
    .sort((a, b) => b.stops - a.stops)
    .slice(0, 8);

  const pieData = Object.entries((stats?.byStatus ?? {}) as Record<string, number>).map(([name, value]) => ({
    name,
    value,
  }));
  const pieColors = [C.green, C.amber, C.violet];
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const trendData = ((stats?.trend ?? []) as number[]).map((v, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { day: d.toLocaleDateString("en-US", { weekday: "short" }), stops: v };
  });

  const pipeline = (stats?.pipeline ?? {}) as Record<string, number>;
  const pipeTotal = pipeline.allocated || 1;
  const pipeStages = [
    { label: "Allocated", count: pipeline.allocated || 0, color: C.blue, icon: Package },
    { label: "Out for Delivery", count: pipeline.outForDelivery || 0, color: C.indigo, icon: Truck },
    { label: "Attempted", count: pipeline.attempted || 0, color: C.amber, icon: AlertTriangle },
    { label: "Delivered", count: pipeline.delivered || 0, color: C.green, icon: CheckCircle },
    { label: "Failed", count: pipeline.failed || 0, color: C.red, icon: AlertTriangle },
  ];

  const actionItems = [
    {
      desc: `${kpi.unmatched || 0} stops need matching`,
      priority: "High",
      icon: AlertTriangle,
      href: "/dashboard/stops?status=Unmatch",
    },
    {
      desc: `${((stats?.collectQueue ?? []) as unknown[]).length} collect payments pending`,
      priority: "Medium",
      icon: DollarSign,
      href: "/dashboard/scans?collect=true",
    },
    {
      desc: `${((stats?.coldPackages ?? []) as unknown[]).length} cold packages in transit`,
      priority: "Low",
      icon: Snowflake,
      href: "/dashboard/scans?cold=true",
    },
    {
      desc: `${kpi.withSignature || 0} signatures required`,
      priority: "Medium",
      icon: PenLine,
      href: "/dashboard/scans?sig=true",
    },
  ];

  if (loading && !stats)
    return (
      <div className="@container/main flex flex-col gap-6 p-6">
        <Skeleton className="h-12 rounded-xl" />
        <div className="grid grid-cols-2 gap-4 @5xl/main:grid-cols-6 @xl/main:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={`sk-${i}`} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-3">
          <Skeleton className="col-span-2 h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );

  return (
    <div className="@container/main flex flex-col gap-6 p-6">
      {/* HEADER */}
      <div className="flex flex-col gap-2 @3xl/main:flex-row @3xl/main:items-center @3xl/main:justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Operations Dashboard</h1>
          <p className="text-muted-foreground text-sm">{today}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {((stats?.tenants ?? []) as { tenant_id: number; company_name: string }[]).length > 1 && (
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Tenant" />
              </SelectTrigger>
              <SelectContent>
                {((stats?.tenants ?? []) as { tenant_id: number; company_name: string }[]).map((t) => (
                  <SelectItem key={t.tenant_id} value={String(t.tenant_id)}>
                    {t.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Tabs value={range} onValueChange={setRange}>
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="last30">Last 30</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="icon" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 gap-4 @3xl/main:grid-cols-3 @5xl/main:grid-cols-6 *:data-[slot=card]:shadow-xs">
        <Card>
          <CardHeader>
            <CardDescription>Total Stops</CardDescription>
            <CardTitle className="font-semibold text-2xl tabular-nums">
              {(pipeline.allocated ?? 0).toLocaleString()}
            </CardTitle>
            <CardAction>
              <Badge variant="outline" className="text-blue-600">
                <Package className="mr-1 h-3 w-3" />
                Active
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="text-muted-foreground text-xs">Stops today</CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Delivered</CardDescription>
            <CardTitle className="font-semibold text-2xl tabular-nums">
              {(kpi.delivered ?? 0).toLocaleString()}
            </CardTitle>
            <CardAction>
              <Badge variant="outline" className="text-green-600">
                <CheckCircle className="mr-1 h-3 w-3" />
                Done
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="text-muted-foreground text-xs">Successful deliveries</CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Unmatched</CardDescription>
            <CardTitle className="font-semibold text-2xl tabular-nums">
              {(kpi.unmatched ?? 0).toLocaleString()}
            </CardTitle>
            <CardAction>
              <Badge variant="outline" className="text-amber-600">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Review
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="text-muted-foreground text-xs">Needs manual match</CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Collections</CardDescription>
            <CardTitle className="font-semibold text-2xl tabular-nums">
              ${(kpi.collectTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </CardTitle>
            <CardAction>
              <Badge variant="outline" className="text-green-600">
                <DollarSign className="mr-1 h-3 w-3" />
                Total
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="text-muted-foreground text-xs">Collect payments</CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Route Miles</CardDescription>
            <CardTitle className="font-semibold text-2xl tabular-nums">{kpi.totalDistanceMi ?? 0} mi</CardTitle>
            <CardAction>
              <Badge variant="outline" className="text-teal-600">
                <Route className="mr-1 h-3 w-3" />
                Est.
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="text-muted-foreground text-xs">Estimated total</CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active Drivers</CardDescription>
            <CardTitle className="font-semibold text-2xl tabular-nums">{kpi.activeDrivers ?? 0}</CardTitle>
            <CardAction>
              <Badge variant="outline" className="text-indigo-600">
                <Car className="mr-1 h-3 w-3" />
                On Route
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="text-muted-foreground text-xs">Drivers with stops</CardFooter>
        </Card>
      </div>

      {/* PIPELINE */}
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Delivery Pipeline</CardTitle>
          <CardDescription>Real-time delivery stage progression</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 @2xl/main:grid-cols-5">
            {pipeStages.map((s) => (
              <div key={s.label} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <s.icon className="h-4 w-4" style={{ color: s.color }} />
                  <span className="text-sm font-medium">{s.label}</span>
                </div>
                <span className="font-semibold text-2xl tabular-nums">{Math.max(0, s.count)}</span>
                <Progress value={pipeTotal > 0 ? (Math.max(0, s.count) / pipeTotal) * 100 : 0} className="h-2" />
                <span className="text-muted-foreground text-xs">
                  {pipeTotal > 0 ? Math.round((Math.max(0, s.count) / pipeTotal) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* CHARTS */}
      <div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-3">
        <Card className="@4xl/main:col-span-2">
          <CardHeader>
            <CardTitle>Stops by Route</CardTitle>
            <CardDescription>Distribution for selected period</CardDescription>
            <CardAction>
              <Button variant="link" size="sm" asChild>
                <Link href="/dashboard/stops">View All</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ChartContainer config={cfgRoute} className="h-64 w-full">
              <BarChart data={routeData} layout="vertical" accessibilityLayer margin={{ left: 10 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={130} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="stops" fill="var(--color-stops)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Label Status</CardTitle>
            <CardDescription>Match distribution</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <ChartContainer config={cfgPie} className="mx-auto h-44 w-44">
              <PieChart accessibilityLayer>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} strokeWidth={2}>
                  {pieData.map((_, i) => (
                    <Cell key={`pie-${i}`} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="w-full space-y-1.5">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: pieColors[i] }} />
                    <span>{d.name}</span>
                  </div>
                  <span className="text-muted-foreground tabular-nums">
                    {d.value} ({pieTotal > 0 ? Math.round((d.value / pieTotal) * 100) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* UPCOMING + ACTIONS */}
      <div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-3">
        <Card className="@4xl/main:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Next Deliveries by ETA
            </CardTitle>
            <CardDescription>Upcoming stops sorted by estimated arrival</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {((stats?.upcomingStops ?? []) as Record<string, unknown>[]).length === 0 ? (
              <p className="p-4 text-muted-foreground text-sm">No upcoming stops</p>
            ) : (
              <div className="divide-y">
                {((stats?.upcomingStops ?? []) as Record<string, unknown>[]).map((stop, i) => {
                  const mins = minutesUntil(stop.eta_at as number);
                  const isUrgent = mins <= 30 && mins >= 0;
                  const isPast = mins < 0;
                  return (
                    <div
                      key={`eta-${i}`}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 ${isUrgent ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${isPast ? "bg-red-100 text-red-700" : isUrgent ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-700"}`}
                      >
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{stop.recipient_name as string}</p>
                        <p className="truncate text-muted-foreground text-xs">{stop.full_address as string}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`text-sm font-semibold tabular-nums ${isPast ? "text-red-600" : isUrgent ? "text-amber-600" : ""}`}
                        >
                          {(stop.eta_arrival as string) || etaLabel(stop.eta_at as number)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {isPast ? `${Math.abs(mins)}m ago` : `in ${mins}m`}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge
                          variant={
                            (stop.label_status as string) === "Match"
                              ? "default"
                              : (stop.label_status as string) === "Human"
                                ? "secondary"
                                : "outline"
                          }
                          className="text-[10px]"
                        >
                          {stop.label_status as string}
                        </Badge>
                        {(stop.tracking_link as string) && (
                          <a
                            href={stop.tracking_link as string}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-blue-500 hover:underline"
                          >
                            Track
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Action Items</CardTitle>
            <CardDescription>Tasks requiring attention</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {actionItems.map((item) => (
              <div key={item.desc} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{item.desc}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge
                    variant={
                      item.priority === "High" ? "destructive" : item.priority === "Medium" ? "default" : "secondary"
                    }
                    className="text-xs"
                  >
                    {item.priority}
                  </Badge>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={item.href}>View</Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* BOTTOM ROW */}
      <div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Collect Queue</CardTitle>
            <CardDescription>Pending collect payments</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {((stats?.collectQueue ?? []) as Record<string, unknown>[]).length === 0 ? (
              <p className="text-muted-foreground text-sm">No pending collections</p>
            ) : (
              ((stats?.collectQueue ?? []) as Record<string, unknown>[]).map((item, i) => (
                <div key={`cq-${i}`} className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-blue-100 text-blue-700 text-xs">
                      {((item.name as string) || "?")
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name as string}</p>
                    {(item.route as string) && (
                      <Badge variant="outline" className="text-xs">
                        {item.route as string}
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    ${((item.amount as number) ?? 0).toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
          <CardFooter className="flex items-center justify-between border-t pt-4">
            <span className="text-sm font-medium">
              Total: $
              {((stats?.collectQueue ?? []) as { amount?: number }[])
                .reduce((s, i) => s + (i.amount || 0), 0)
                .toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/scans?collect=true">View All</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Snowflake className="h-4 w-4 text-cyan-500" />
              Cold Packages
            </CardTitle>
            <CardDescription>Temperature-sensitive</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {((stats?.coldPackages ?? []) as Record<string, unknown>[]).length === 0 ? (
              <p className="text-muted-foreground text-sm">No cold packages</p>
            ) : (
              ((stats?.coldPackages ?? []) as Record<string, unknown>[]).map((item, i) => (
                <div key={`cold-${i}`} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50">
                    <Snowflake className="h-4 w-4 text-cyan-500" />
                  </div>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.name as string}</p>
                  {(item.route as string) && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {item.route as string}
                    </Badge>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7-Day Trend</CardTitle>
            <CardDescription>Daily stop volume</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={cfgTrend} className="h-48 w-full">
              <AreaChart data={trendData} accessibilityLayer>
                <defs>
                  <linearGradient id="fillStops" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.blue} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area dataKey="stops" type="monotone" fill="url(#fillStops)" stroke={C.blue} strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
