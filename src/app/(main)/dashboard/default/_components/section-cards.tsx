"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  stats: any;
  loading: boolean;
  range: string;
  onRangeChange: (r: string) => void;
}

export function RoutelySectionCards({ stats, loading, range, onRangeChange }: Props) {
  const kpi = stats?.kpi ?? {};

  if (loading && !stats) {
    return (
      <div className="grid @5xl/main:grid-cols-4 @xl/main:grid-cols-2 grid-cols-1 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Overview</h2>
        <Tabs value={range} onValueChange={onRangeChange}>
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="grid @5xl/main:grid-cols-4 @xl/main:grid-cols-2 grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs">
        <Card>
          <CardHeader>
            <CardDescription>Total Scans</CardDescription>
            <CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">
              {(kpi.scans ?? 0).toLocaleString()}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <TrendingUp />
                Active
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              Packages processed <TrendingUp className="size-4" />
            </div>
            <div className="text-muted-foreground">For the selected period</div>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Matched</CardDescription>
            <CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">
              {(kpi.matched ?? 0).toLocaleString()}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <TrendingUp />+
                {kpi.matched && kpi.matched + kpi.unmatched + kpi.human
                  ? Math.round((kpi.matched / (kpi.matched + kpi.unmatched + kpi.human)) * 100)
                  : 0}
                %
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              Label match rate <TrendingUp className="size-4" />
            </div>
            <div className="text-muted-foreground">Stops matched to scans</div>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Delivered</CardDescription>
            <CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">
              {(kpi.delivered ?? 0).toLocaleString()}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <TrendingUp />
                Completed
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              Successful deliveries <TrendingUp className="size-4" />
            </div>
            <div className="text-muted-foreground">Confirmed by driver</div>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Unmatched</CardDescription>
            <CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">
              {(kpi.unmatched ?? 0).toLocaleString()}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                {(kpi.unmatched ?? 0) > 0 ? (
                  <>
                    <TrendingDown />
                    Needs review
                  </>
                ) : (
                  <>OK</>
                )}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              Stops needing attention {(kpi.unmatched ?? 0) > 0 && <TrendingDown className="size-4" />}
            </div>
            <div className="text-muted-foreground">Requires manual matching</div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
