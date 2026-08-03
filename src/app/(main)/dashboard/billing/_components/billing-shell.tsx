"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { FileText, LayoutDashboard, Receipt } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ChargesTab } from "./charges-tab";
import { InvoicesTab } from "./invoices-tab";
import { OverviewTab } from "./overview-tab";

type BillingTabKey = "overview" | "charges" | "invoices";
const TABS: Array<{ key: BillingTabKey; label: string; icon: React.ElementType }> = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "charges", label: "Charges", icon: Receipt },
  { key: "invoices", label: "Invoices", icon: FileText },
];
const VALID_TABS = new Set<BillingTabKey>(TABS.map((t) => t.key));

export function BillingShell() {
  const router = useRouter();
  const searchParams = useSearchParams();

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
      <div className="flex flex-col gap-1">
        <span className="type-label text-primary">Finance</span>
        <h1 className="type-page-title">Billing</h1>
        <p className="max-w-xl text-muted-foreground text-sm">
          Delivery charges, shipping labels, and every receipt, statement, and invoice — one ledger, one source of
          truth.
        </p>
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
      </div>
    </div>
  );
}
