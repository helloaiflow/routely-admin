"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { Building2, Users } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { DriversTab } from "./drivers-tab";
import { HubsTab } from "./hubs-tab";

type FleetTab = "hubs" | "drivers";

const TABS: Array<{ key: FleetTab; label: string; icon: React.ElementType }> = [
  { key: "hubs", label: "Hubs", icon: Building2 },
  { key: "drivers", label: "Drivers", icon: Users },
];

const VALID_TABS = new Set<FleetTab>(TABS.map((t) => t.key));

export function FleetShell() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlTab = searchParams.get("tab") as FleetTab | null;
  const initialTab: FleetTab = urlTab && VALID_TABS.has(urlTab) ? urlTab : "hubs";
  const [tab, setTab] = useState<FleetTab>(initialTab);

  // Keep local state in sync when the URL ?tab= changes (sidebar deep links).
  useEffect(() => {
    if (urlTab && VALID_TABS.has(urlTab) && urlTab !== tab) setTab(urlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab]);

  const selectTab = useCallback(
    (next: FleetTab) => {
      setTab(next);
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set("tab", next);
      router.replace(`/dashboard/fleet?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const activeTab = useMemo(() => (VALID_TABS.has(tab) ? tab : "hubs"), [tab]);

  return (
    <div className="@container/main w-full space-y-5 px-4 py-4 sm:px-6">
      {/* ── Cinematic header band (mirrors Settings) ── */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/12 via-primary/[0.04] to-background p-6 ring-1 ring-primary/10 md:p-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card via-card/85 to-card/30"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-28 left-1/3 size-56 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative flex flex-col gap-1">
          <span className="type-label text-primary">Command Center</span>
          <h1 className="type-page-title">Fleet</h1>
          <p className="max-w-xl text-muted-foreground text-sm">
            Routely&apos;s hubs and drivers — the operational fleet.
          </p>
        </div>
      </div>

      {/* ── Tab nav — shadcn Tabs (same pattern as Settings) ── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => selectTab(v as FleetTab)}
        className="-mx-0.5 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <TabsList className="w-max">
          {TABS.map(({ key, label, icon: Icon }) => (
            <TabsTrigger
              key={key}
              value={key}
              className="group shrink-0 gap-1.5 px-2.5 text-[13px] sm:px-3 sm:text-sm"
            >
              <Icon className="size-3.5 sm:size-4" aria-hidden="true" />
              <span className="whitespace-nowrap">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* ── Active tab ── */}
      <div className="min-h-[400px]">
        {activeTab === "hubs" && <HubsTab />}
        {activeTab === "drivers" && <DriversTab />}
      </div>
    </div>
  );
}
