"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { useUser } from "@clerk/nextjs";
import { Bell, CreditCard, FileText, Layers, MapPin, User, Users } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AccountTab } from "./account-tab";
import { BillingTab } from "./billing-tab";
import { InvoicesTab } from "./invoices-tab";
import { NotificationsTab } from "./notifications-tab";
import { PickupTab } from "./pickup-tab";
import { PlansTab } from "./plans-tab";
import { TeamSection } from "./team-section";
import { type BillingData, type SettingsTab } from "./settings-types";

const TABS: Array<{ key: SettingsTab; label: string; icon: React.ElementType }> = [
  { key: "account", label: "Account", icon: User },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "plans", label: "Plans", icon: Layers },
  { key: "pickup", label: "Pickup Locations", icon: MapPin },
  { key: "invoices", label: "Invoices", icon: FileText },
  { key: "team", label: "Team", icon: Users },
];

// Members see only their own account (server-side guards enforce the rest).
const MEMBER_VISIBLE_TABS: SettingsTab[] = ["account"];
const VALID_TABS = new Set<SettingsTab>(TABS.map((t) => t.key));

export function SettingsShell() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isMember = (user?.publicMetadata as Record<string, unknown> | undefined)?.tenant_role === "member";
  const visibleTabs = useMemo(
    () => (isMember ? TABS.filter((t) => MEMBER_VISIBLE_TABS.includes(t.key)) : TABS),
    [isMember],
  );

  const urlTab = searchParams.get("tab") as SettingsTab | null;
  const initialTab: SettingsTab = urlTab && VALID_TABS.has(urlTab) ? urlTab : "account";
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  const [billing, setBilling] = useState<BillingData | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);

  // Keep local state in sync when the URL ?tab= changes (sidebar deep links).
  useEffect(() => {
    if (urlTab && VALID_TABS.has(urlTab) && urlTab !== tab) setTab(urlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab]);

  useEffect(() => {
    setBillingLoading(true);
    fetch("/api/billing")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setBilling(d);
      })
      .catch(() => {})
      .finally(() => setBillingLoading(false));
  }, []);

  const selectTab = useCallback(
    (next: SettingsTab) => {
      setTab(next);
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set("tab", next);
      router.replace(`/dashboard/settings?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : "account";

  const plan = (user?.publicMetadata?.plan as string) || "free";
  const companyName = (user?.publicMetadata?.companyName as string) || "";

  return (
    <div className="@container/main w-full space-y-5 px-4 py-4 sm:px-6">
      {/* ── Cinematic header band (Higgsfield hero + gradient overlay) ── */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/12 via-primary/[0.04] to-background p-6 ring-1 ring-primary/10 md:p-7">
        {/* Higgsfield-generated decorative hero — sits behind the gradient so
            the header still looks premium if the asset fails to load. */}
        <img
          src="https://d8j0ntlcm91z4.cloudfront.net/user_3Dn72s7Msj5B471KtgexW8rmiSS/hf_20260714_071737_c8893ea3-fb6c-4b6f-8c59-38848c12703d_min.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="pointer-events-none absolute inset-0 size-full object-cover opacity-[0.18] dark:opacity-[0.12]"
        />
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
          <span className="type-label text-primary">Workspace</span>
          <h1 className="type-page-title">Settings</h1>
          <p className="max-w-xl text-muted-foreground text-sm">
            {companyName ? `Manage ${companyName}'s account, billing, pickups and team.` : "Manage your account, billing, pickups and team."}
          </p>
        </div>
      </div>

      {/* ── Tab nav — shadcn Tabs (same pattern as the dashboards) ── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => selectTab(v as SettingsTab)}
        className="-mx-0.5 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <TabsList className="w-max">
          {visibleTabs.map(({ key, label, icon: Icon }) => (
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
        {activeTab === "account" && <AccountTab />}
        {activeTab === "billing" && (
          <BillingTab billing={billing} billingLoading={billingLoading} plan={billing?.plan ?? plan} />
        )}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "plans" && <PlansTab plan={billing?.plan ?? plan} />}
        {activeTab === "pickup" && <PickupTab />}
        {activeTab === "invoices" && <InvoicesTab />}
        {activeTab === "team" && !isMember && <TeamSection />}
      </div>
    </div>
  );
}
