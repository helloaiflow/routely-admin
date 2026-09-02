"use client";

import { useMemo, useState } from "react";

import { useUser } from "@clerk/nextjs";
import { LayoutDashboard, PackageOpen, Plus } from "lucide-react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { DateRangePicker, todayRange, type DateRange } from "@/components/ui/date-range-picker";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInternalPackageStore } from "@/stores/internal-package/internal-package-store";

import type { InternalPackagesResponse } from "./_types";
import { InternalOverview } from "./internal-overview";
import { InternalPackagesTable } from "./internal-packages-table";

const fetcher = async (url: string): Promise<InternalPackagesResponse> => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

type Tab = "overview" | "packages";

/* ── Internal Packages — standalone module (CEO, 2026-09-01) ────────────────
 * The ONLY operational surface an internal-role user ever sees. Reads
 * exclusively from /api/client/internal-packages (whitelisted shape, no
 * medical data) and creates through the global New Internal Package modal.
 * ─────────────────────────────────────────────────────────────────────────── */
export function InternalPackagesShell() {
  const [tab, setTab] = useState<Tab>("overview");
  const [dateRange, setDateRange] = useState<DateRange>(todayRange);
  const { user } = useUser();
  const openInternalPackage = useInternalPackageStore((s) => s.openInternalPackage);

  const { data, error, isLoading, mutate } = useSWR<InternalPackagesResponse>(
    "/api/client/internal-packages",
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true, keepPreviousData: true },
  );
  const loading = isLoading && !data;
  const myEmail = user?.emailAddresses?.[0]?.emailAddress ?? null;

  // Every card and the table read the SAME filtered set (range coherence —
  // the Operations Dashboard rule). Filter by created_at calendar day.
  const filtered = useMemo(() => {
    if (!data) return undefined;
    const from = new Date(dateRange.from);
    from.setHours(0, 0, 0, 0);
    const to = new Date(dateRange.to);
    to.setHours(23, 59, 59, 999);
    return { ...data, packages: data.packages.filter((p) => {
      const t = new Date(p.created_at).getTime();
      return t >= from.getTime() && t <= to.getTime();
    }) };
  }, [data, dateRange]);

  const counts = useMemo(() => filtered?.packages.length ?? 0, [filtered?.packages]);

  return (
    <div className="@container/main flex flex-1 flex-col gap-3 p-3 md:gap-4 md:p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="type-page-title text-foreground">Internal Packages</h1>
          <p className="hidden text-muted-foreground text-xs sm:block">
            Company shipments between offices and staff — separate from medical operations.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <Button size="sm" className="h-8 gap-1.5 font-medium text-xs" onClick={openInternalPackage}>
            <Plus className="size-3.5" />
            New Internal Package
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="w-max">
          <TabsTrigger value="overview" className="gap-1.5 px-2.5 text-[13px] sm:px-3 sm:text-sm">
            <LayoutDashboard className="size-3.5" aria-hidden="true" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="packages" className="gap-1.5 px-2.5 text-[13px] sm:px-3 sm:text-sm">
            <PackageOpen className="size-3.5" aria-hidden="true" />
            Packages
            {counts > 0 && (
              <span className="ml-0.5 rounded-full bg-muted px-1.5 font-medium text-[10px] tabular-nums">
                {counts}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {error && !data && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-xs dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
          Couldn&apos;t load internal packages —{" "}
          <button type="button" className="font-medium underline" onClick={() => mutate()}>
            try again
          </button>
        </div>
      )}

      {tab === "overview" ? (
        <InternalOverview
          data={filtered}
          allPackages={data?.packages}
          loading={loading}
          myEmail={myEmail}
          range={dateRange}
          onGoToPackages={() => setTab("packages")}
        />
      ) : (
        <InternalPackagesTable data={filtered} loading={loading} myEmail={myEmail} />
      )}
    </div>
  );
}
