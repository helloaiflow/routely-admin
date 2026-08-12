"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { Activity, CalendarDays, ChevronDown, Download, FileText, LayoutDashboard, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { computeCyclePeriod, formatPeriodLabel } from "./billing-cycle";
import { ChargesTab } from "./charges-tab";
import { InvoicesTab } from "./invoices-tab";
import { OverviewTab } from "./overview-tab";
import { RecentActivityTab } from "./recent-activity-tab";

type HeaderData = {
  cycle: {
    cadence: string;
    anchor_day: number;
    timezone: string;
    last_closed_at: string | null;
    next_close_at: string | null;
  } | null;
  last_document: { id: number } | null;
};

export type BillingTabKey = "overview" | "charges" | "invoices" | "recent_activity";
const TABS: Array<{ key: BillingTabKey; label: string; icon: React.ElementType }> = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "charges", label: "Charges", icon: Receipt },
  { key: "invoices", label: "Invoices", icon: FileText },
  { key: "recent_activity", label: "Recent Activity", icon: Activity },
];
const VALID_TABS = new Set<BillingTabKey>(TABS.map((t) => t.key));

export function BillingShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [header, setHeader] = useState<HeaderData | null>(null);

  useEffect(() => {
    fetch("/api/client/billing/overview")
      .then((r) => r.json())
      .then((d) => setHeader({ cycle: d.cycle ?? null, last_document: d.last_document ?? null }))
      .catch(() => {
        /* best-effort — header controls degrade to their disabled/placeholder state */
      });
  }, []);

  const period = header ? computeCyclePeriod(header.cycle) : null;
  const lastDocId = header?.last_document?.id ?? null;

  const urlTab = searchParams.get("tab") as BillingTabKey | null;
  const initialTab: BillingTabKey = urlTab && VALID_TABS.has(urlTab) ? urlTab : "overview";
  const [tab, setTab] = useState<BillingTabKey>(initialTab);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-syncs only on urlTab changes (adding `tab` would re-run this effect every time setTab fires, including from selectTab's own optimistic update)
  useEffect(() => {
    if (urlTab && VALID_TABS.has(urlTab) && urlTab !== tab) setTab(urlTab);
  }, [urlTab]);

  const selectTab = useCallback(
    (next: BillingTabKey) => {
      setTab(next);
      router.replace(`/dashboard/billing?tab=${next}`, { scroll: false });
    },
    [router],
  );

  return (
    <div className="@container/main w-full space-y-5 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="type-label text-primary">Finance</span>
          <h1 className="type-page-title">Billing</h1>
          <p className="max-w-xl text-muted-foreground text-sm">
            Delivery charges, shipping labels, and every receipt, statement, and invoice — one ledger, one source of
            truth.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-13" disabled>
                  <CalendarDays className="size-3.5" />
                  {period ? `Billing period · ${formatPeriodLabel(period)}` : "Billing period"}
                  <ChevronDown className="size-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Showing the current billing period — browse past periods in Invoices.</TooltipContent>
          </Tooltip>
          {lastDocId ? (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-13" asChild>
              <a href={`/api/client/billing/documents/${lastDocId}/pdf`} target="_blank" rel="noreferrer">
                <Download className="size-3.5" /> Download statement
              </a>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-13" disabled>
                    <Download className="size-3.5" /> Download statement
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>No statement or invoice exists yet for this tenant.</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => selectTab(v as BillingTabKey)}
        className="-mx-0.5 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <TabsList className="w-max">
          {TABS.map(({ key, label, icon: Icon }) => (
            <TabsTrigger key={key} value={key} className="group shrink-0 gap-1.5 px-2.5 text-13 sm:px-3 sm:text-sm">
              <Icon className="size-3.5 sm:size-4" aria-hidden="true" />
              <span className="whitespace-nowrap">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="min-h-[400px]">
        {tab === "overview" && <OverviewTab onNavigateTab={selectTab} />}
        {tab === "charges" && <ChargesTab />}
        {tab === "invoices" && <InvoicesTab />}
        {tab === "recent_activity" && <RecentActivityTab />}
      </div>
    </div>
  );
}
