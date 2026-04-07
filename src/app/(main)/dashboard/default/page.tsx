"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import {
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Eye,
  Package,
  PenLine,
  RefreshCw,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const COLORS = {
  blue: "hsl(217 91% 60%)",
  green: "hsl(142 71% 45%)",
  amber: "hsl(38 92% 50%)",
  violet: "hsl(263 70% 50%)",
  teal: "hsl(172 66% 50%)",
  red: "hsl(0 84% 60%)",
  indigo: "hsl(239 84% 67%)",
};

const chartConfigRoute: ChartConfig = {
  stops: { label: "Stops", color: COLORS.blue },
};

const chartConfigPie: ChartConfig = {
  Match: { label: "Match", color: COLORS.green },
  Unmatch: { label: "Unmatch", color: COLORS.amber },
  Human: { label: "Human", color: COLORS.violet },
};

const chartConfigTrend: ChartConfig = {
  scans: { label: "Scans", color: COLORS.blue },
  delivered: { label: "Delivered", color: COLORS.green },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [range, setRange] = useState("today");
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stats?range=${range}`);
      setStats(await res.json());
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const kpi = stats?.kpi ?? {};
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (loading && !stats) {
    return (
      <div className="@container/main flex flex-col gap-6">
        <Skeleton className="h-12 rounded-xl" />
        <div className="grid @5xl/main:grid-cols-6 @xl/main:grid-cols-3 grid-cols-1 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid @4xl/main:grid-cols-3 grid-cols-1 gap-4">
          <Skeleton className="col-span-2 h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  const matchPct = kpi.matched && kpi.scans ? Math.round((kpi.matched / kpi.scans) * 100) : 0;
  const routeData = Object.entries(stats?.byRoute ?? {})
    .map(([name, value]) => ({ name, stops: value as number }))
    .sort((a, b) => b.stops - a.stops)
    .slice(0, 10);

  const pieData = Object.entries(stats?.byStatus ?? {}).map(([name, value]) => ({ name, value: value as number }));
  const pieColors = [COLORS.green, COLORS.amber, COLORS.violet];
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const branchData = Object.entries(stats?.byBranch ?? {})
    .map(([name, value]) => ({ name, count: value as number }))
    .sort((a, b) => b.count - a.count);
  const branchMax = branchData.length > 0 ? branchData[0].count : 1;

  const trendData = (stats?.trend ?? []).map((v: number, i: number) => ({
    day: `Day ${i + 1}`,
    scans: v,
    delivered: Math.round(v * 0.85),
  }));

  const pipeline = stats?.pipeline ?? {};
  const pipelineTotal = pipeline.allocated || 1;
  const pipelineStages = [
    { label: "Allocated", count: pipeline.allocated || 0, color: COLORS.blue, icon: Package },
    { label: "Out for Delivery", count: pipeline.outForDelivery || 0, color: COLORS.indigo, icon: Truck },
    { label: "Attempted", count: pipeline.attempted || 0, color: COLORS.amber, icon: AlertTriangle },
    { label: "Delivered", count: pipeline.delivered || 0, color: COLORS.green, icon: CheckCircle },
    {
      label: "Failed",
      count:
        (pipeline.allocated || 0) -
        (pipeline.delivered || 0) -
        (pipeline.attempted || 0) -
        (pipeline.outForDelivery || 0),
      color: COLORS.red,
      icon: AlertTriangle,
    },
  ];

  const actionItems = [
    {
      desc: `${kpi.unmatched || 0} stops need matching`,
      priority: "High",
      icon: AlertTriangle,
      href: "/dashboard/stops?status=Unmatch",
    },
    {
      desc: `${stats?.collectQueue?.length || 0} collect payments pending`,
      priority: "Medium",
      icon: DollarSign,
      href: "/dashboard/scans?collect=true",
    },
    {
      desc: `${stats?.coldPackages?.length || 0} cold packages in transit`,
      priority: "Low",
      icon: Snowflake,
      href: "/dashboard/scans?cold=true",
    },
    {
      desc: `${stats?.flags?.sig || 0} signatures required`,
      priority: "Medium",
      icon: PenLine,
      href: "/dashboard/scans?sig=true",
    },
  ];

  return (
    <div className="@container/main flex flex-col gap-6">
      {/* SECTION 1 - Header */}
      <div className="flex @3xl/main:flex-row flex-col @3xl/main:items-center @3xl/main:justify-between gap-2">
        <div>
          <h1 className="font-semibold text-2xl">Operations Dashboard</h1>
          <p className="text-muted-foreground text-sm">{today}</p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* SECTION 2 - KPI Cards */}
      <div className="grid @3xl/main:grid-cols-3 @5xl/main:grid-cols-6 @xl/main:grid-cols-2 grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs">
        <Card>
          <CardHeader>
            <CardDescription>Total Scans</CardDescription>
            <CardTitle className="font-semibold text-2xl tabular-nums">{(kpi.scans ?? 0).toLocaleString()}</CardTitle>
            <CardAction>
              <Badge variant="outline" className="text-blue-600">
                <Package className="mr-1 h-3 w-3" />
                Active
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="text-muted-foreground text-xs">Packages processed</CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Matched</CardDescription>
            <CardTitle className="font-semibold text-2xl tabular-nums">{(kpi.matched ?? 0).toLocaleString()}</CardTitle>
            <CardAction>
              <Badge variant="outline" className="text-green-600">
                <CheckCircle className="mr-1 h-3 w-3" />
                {matchPct}%
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="text-muted-foreground text-xs">Label match rate</CardFooter>
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
                Needs review
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="text-muted-foreground text-xs">Requires manual matching</CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Human Review</CardDescription>
            <CardTitle className="font-semibold text-2xl tabular-nums">{(kpi.human ?? 0).toLocaleString()}</CardTitle>
            <CardAction>
              <Badge variant="outline" className="text-violet-600">
                <Eye className="mr-1 h-3 w-3" />
                Pending
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="text-muted-foreground text-xs">Flagged for review</CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Delivered</CardDescription>
            <CardTitle className="font-semibold text-2xl tabular-nums">
              {(kpi.delivered ?? 0).toLocaleString()}
            </CardTitle>
            <CardAction>
              <Badge variant="outline" className="text-teal-600">
                <Truck className="mr-1 h-3 w-3" />
                Confirmed
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="text-muted-foreground text-xs">Successful deliveries</CardFooter>
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
      </div>

      {/* SECTION 3 - Charts Row */}
      <div className="grid @4xl/main:grid-cols-3 grid-cols-1 gap-4">
        <Card className="@4xl/main:col-span-2">
          <CardHeader>
            <CardTitle>Stops by Route</CardTitle>
            <CardDescription>Route distribution for selected period</CardDescription>
            <CardAction>
              <Button variant="link" size="sm" asChild>
                <Link href="/dashboard/routes">View Full Report</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfigRoute} className="h-72 w-full">
              <BarChart data={routeData} layout="vertical" accessibilityLayer margin={{ left: 20 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={120} fontSize={12} />
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
          <CardContent className="flex flex-col items-center gap-4">
            <ChartContainer config={chartConfigPie} className="mx-auto h-48 w-48">
              <PieChart accessibilityLayer>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} strokeWidth={2}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="w-full space-y-2">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ background: pieColors[i] }} />
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

      {/* SECTION 4 - Delivery Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Delivery Pipeline</CardTitle>
          <CardDescription>Delivery stages progression</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid @2xl/main:grid-cols-5 grid-cols-2 gap-4">
            {pipelineStages.map((stage) => (
              <div key={stage.label} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <stage.icon className="h-4 w-4" style={{ color: stage.color }} />
                  <span className="font-medium text-sm">{stage.label}</span>
                </div>
                <span className="font-semibold text-2xl tabular-nums">{Math.max(0, stage.count)}</span>
                <Progress
                  value={pipelineTotal > 0 ? (Math.max(0, stage.count) / pipelineTotal) * 100 : 0}
                  className="h-2"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SECTION 5 - Three Column Row */}
      <div className="grid @4xl/main:grid-cols-3 grid-cols-1 gap-4">
        {/* Branch Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Branch Performance</CardTitle>
            <CardDescription>Scans by branch location</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {branchData.map((b) => (
              <div key={b.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{b.name}</span>
                  <span className="text-muted-foreground tabular-nums">{b.count}</span>
                </div>
                <Progress value={(b.count / branchMax) * 100} className="h-2" />
              </div>
            ))}
            {branchData.length === 0 && <p className="text-muted-foreground text-sm">No branch data</p>}
          </CardContent>
        </Card>

        {/* 7-Day Trend */}
        <Card>
          <CardHeader>
            <CardTitle>7-Day Trend</CardTitle>
            <CardDescription>Scans and deliveries over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfigTrend} className="h-48 w-full">
              <AreaChart data={trendData} accessibilityLayer>
                <defs>
                  <linearGradient id="fillScans" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.blue} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.blue} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fillDelivered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.green} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.green} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area dataKey="scans" type="monotone" fill="url(#fillScans)" stroke={COLORS.blue} />
                <Area dataKey="delivered" type="monotone" fill="url(#fillDelivered)" stroke={COLORS.green} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Action Items */}
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
                <div className="flex shrink-0 items-center gap-2">
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

      {/* SECTION 6 - Bottom Row */}
      <div className="grid @4xl/main:grid-cols-3 grid-cols-1 gap-4">
        {/* Collect Queue */}
        <Card>
          <CardHeader>
            <CardTitle>Collect Queue</CardTitle>
            <CardDescription>Pending collect payments</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(stats?.collectQueue ?? []).map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-blue-100 text-blue-700 text-xs">
                    {(item.name || "?")
                      .split(" ")
                      .map((w: string) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{item.name}</p>
                  {item.route && (
                    <Badge variant="outline" className="text-xs">
                      {item.route}
                    </Badge>
                  )}
                </div>
                <span className="font-semibold text-sm tabular-nums">${(item.amount ?? 0).toFixed(2)}</span>
              </div>
            ))}
            {(stats?.collectQueue ?? []).length === 0 && (
              <p className="text-muted-foreground text-sm">No pending collections</p>
            )}
          </CardContent>
          <CardFooter className="flex items-center justify-between border-t pt-4">
            <span className="font-medium text-sm">
              Total: $
              {(stats?.collectQueue ?? [])
                .reduce((s: number, i: any) => s + (i.amount || 0), 0)
                .toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/scans?collect=true">View All</Link>
            </Button>
          </CardFooter>
        </Card>

        {/* Cold Packages */}
        <Card>
          <CardHeader>
            <CardTitle>Cold Packages</CardTitle>
            <CardDescription>Temperature-sensitive packages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(stats?.coldPackages ?? []).map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <Snowflake className="h-4 w-4 shrink-0 text-cyan-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{item.name}</p>
                </div>
                {item.route && (
                  <Badge variant="outline" className="text-xs">
                    {item.route}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs">
                  In Transit
                </Badge>
              </div>
            ))}
            {(stats?.coldPackages ?? []).length === 0 && (
              <p className="text-muted-foreground text-sm">No cold packages</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest system events</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(stats?.recentActivity ?? []).slice(0, 10).map((event: any, i: number) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm">{event.description}</p>
                  <p className="text-muted-foreground text-xs">
                    {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : ""}
                  </p>
                </div>
              </div>
            ))}
            {(stats?.recentActivity ?? []).length === 0 && (
              <div className="space-y-3">
                {(stats?.recentStops ?? []).slice(0, 6).map((stop: any) => (
                  <div key={stop._id} className="flex items-start gap-3">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    <div className="min-w-0">
                      <p className="truncate text-sm">Stop created for {stop.recipient_name || "Unknown"}</p>
                      <p className="text-muted-foreground text-xs">
                        {stop.created_at ? new Date(stop.created_at).toLocaleTimeString() : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
