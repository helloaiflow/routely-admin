"use client";

import { useState } from "react";

import { Activity, LayoutDashboard, Table2 } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ApplicantDetailPanel } from "./applicant-detail-panel";
import { ApplicantsActivity } from "./applicants-activity";
import { ApplicantsList } from "./applicants-list";
import { ApplicantsOverview } from "./applicants-overview";

type Tab = "overview" | "applications" | "activity";

/* ── Driver Applicants — A01 Overview / A02+A03 Applications / A04 Activity ──
 * R29 (2026-10-22): Applications is now a persistent 2-column list/detail
 * layout (Stops-style), replacing the old data-table + Sheet-overlay pattern
 * -- ApplicantsList (left) + ApplicantDetailPanel (center, tabs + expandable
 * panels). Overview/Activity are unchanged (not in scope for this round's
 * layout addenda). Admin-only — see page.tsx and app-sidebar.tsx for the two
 * gates in front of this. */
export function DriverApplicantsShell() {
  const [tab, setTab] = useState<Tab>("applications");
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  // The detail panel only renders inside the Applications tab's grid (no more global Sheet
  // overlay) -- selecting a row from Activity needs to jump there too, or the selection would be
  // invisible.
  function selectAndShow(ref: string) {
    setSelected(ref);
    setTab("applications");
  }

  return (
    <div className="@container/main flex h-[calc(100vh-3.5rem)] w-full flex-col space-y-3 px-4 py-3 sm:px-4">
      <div>
        <h1 className="font-semibold text-xl tracking-tight md:text-2xl">Driver Applicants</h1>
        <p className="text-sm text-muted-foreground">
          People applying to become Routely drivers — moving through onboarding to the Approved Applicants pool.
          Separate from the Drivers (fleet) page: approving here never creates a driver record.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="w-max">
          <TabsTrigger value="overview" className="gap-1.5 px-2.5 text-[13px] sm:px-3 sm:text-sm">
            <LayoutDashboard className="size-3.5" aria-hidden="true" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="applications" className="gap-1.5 px-2.5 text-[13px] sm:px-3 sm:text-sm">
            <Table2 className="size-3.5" aria-hidden="true" />
            Applications
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5 px-2.5 text-[13px] sm:px-3 sm:text-sm">
            <Activity className="size-3.5" aria-hidden="true" />
            Activity
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "overview" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ApplicantsOverview refreshToken={refreshKey} onOpenApplications={() => setTab("applications")} />
        </div>
      )}

      {tab === "applications" && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[22rem_1fr]">
          <div className="min-h-0 overflow-hidden rounded-lg border">
            <ApplicantsList onSelect={setSelected} selectedKey={selected} refreshToken={refreshKey} />
          </div>
          {/* Responsive per the mission's own <1280px breakpoint (Tailwind `xl`): the detail panel
           * stacks below the list instead of a 3rd visualizer column that doesn't exist yet (see
           * R29B, split off for the full Document Visualizer) -- it's always reachable, never
           * hidden entirely. */}
          <div className="min-h-[24rem] overflow-hidden rounded-lg border xl:min-h-0">
            <ApplicantDetailPanel applicantKey={selected} onClose={() => setSelected(null)} onChanged={bump} />
          </div>
        </div>
      )}

      {tab === "activity" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ApplicantsActivity refreshToken={refreshKey} onSelect={selectAndShow} />
        </div>
      )}
    </div>
  );
}
