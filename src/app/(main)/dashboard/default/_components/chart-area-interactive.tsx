"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

const chartConfig = {
  stops: { label: "Stops", color: "var(--chart-1)" },
} satisfies ChartConfig;

interface Props {
  stats: any;
  loading: boolean;
}

export function RoutelyChart({ stats, loading }: Props) {
  if (loading && !stats) return <Skeleton className="h-64 rounded-xl" />;

  const data = (stats?.trend ?? []).map((v: number, i: number) => ({
    day: `Day ${i + 1}`,
    stops: v,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>7-Day Trend</CardTitle>
        <CardDescription>Stop activity over the last 7 days</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-48 w-full">
          <AreaChart data={data} accessibilityLayer>
            <defs>
              <linearGradient id="fillStops" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-stops)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-stops)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area dataKey="stops" type="natural" fill="url(#fillStops)" stroke="var(--color-stops)" />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
