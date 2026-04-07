"use client";

import { useCallback, useEffect, useState } from "react";

import { RoutelyChart } from "./_components/chart-area-interactive";
import { RecentStopsTable } from "./_components/recent-stops-table";
import { RoutelySectionCards } from "./_components/section-cards";

export default function Page() {
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

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <RoutelySectionCards stats={stats} loading={loading} range={range} onRangeChange={setRange} />
      <RoutelyChart stats={stats} loading={loading} />
      <RecentStopsTable data={stats?.recentStops ?? []} />
    </div>
  );
}
