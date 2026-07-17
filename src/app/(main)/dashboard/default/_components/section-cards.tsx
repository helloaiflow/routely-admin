"use client";

import { useEffect, useState } from "react";

import { TrendingUp } from "lucide-react";

import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface Stats {
  todayTotal: number;
  inTransit: number;
  deliveredToday: number;
  monthTotal: number;
}

export function SectionCards() {
  const [data, setData] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {
        /* swallow */
      });
  }, []);

  const cards = [
    {
      label: "Today's Stops",
      value: data?.todayTotal ?? 0,
      trend: "+0%",
      footer: "Dispatched today",
      sub: "Stop volume for today",
    },
    {
      label: "In Transit",
      value: data?.inTransit ?? 0,
      trend: "Live",
      footer: "Currently active",
      sub: "Being delivered right now",
    },
    {
      label: "Delivered Today",
      value: data?.deliveredToday ?? 0,
      trend: "+0%",
      footer: "Completed today",
      sub: "On-time delivery rate",
    },
    {
      label: "This Month",
      value: data?.monthTotal ?? 0,
      trend: "+0%",
      footer: "Strong volume growth",
      sub: "Total stops this month",
    },
  ];

  return (
    <div className="grid @5xl/main:grid-cols-4 @xl/main:grid-cols-2 grid-cols-1 gap-4">
      {cards.map((card) => (
        <Card
          key={card.label}
          className="@container/card border-0 bg-gradient-to-t from-primary/5 to-card shadow-xs ring-1 ring-foreground/10"
        >
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="font-semibold text-2xl tabular-nums">
              {data ? card.value.toLocaleString() : "—"}
            </CardTitle>
            <CardAction>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-600 text-xs dark:bg-emerald-950/30 dark:text-emerald-400">
                <TrendingUp className="size-3" />
                {card.trend}
              </span>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              {card.footer} <TrendingUp className="size-4" />
            </div>
            <div className="text-muted-foreground">{card.sub}</div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
