"use client";

import { useState } from "react";

import { Activity, LayoutDashboard, Table2 } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ApplicantDetailSheet } from "./applicant-detail-sheet";
import { ApplicantsActivity } from "./applicants-activity";
import { ApplicantsOverview } from "./applicants-overview";
import { ApplicantsTable } from "./applicants-table";

type Tab = "overview" | "applications" | "activity";

/* ── Driver Applicants — A01 Overview / A02 Applications / A04 Activity ──────
 * A03 (detail) is a Sheet overlay opened from either tab, keyed by
 * application_ref — the skeleton's own pattern, kept for M1 so there's one
 * detail implementation instead of a duplicated route + sheet. Admin-only —
 * see page.tsx and app-sidebar.tsx for the two gates in front of this. */
export function DriverApplicantsShell() {
  const [tab, setTab] = useState<Tab>("applications");
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="@container/main w-full space-y-4 px-4 py-3 sm:px-4">
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
        <ApplicantsOverview refreshToken={refreshKey} onOpenApplications={() => setTab("applications")} />
      )}
      {tab === "applications" && <ApplicantsTable refreshToken={refreshKey} onSelect={setSelected} />}
      {tab === "activity" && <ApplicantsActivity refreshToken={refreshKey} onSelect={setSelected} />}

      <ApplicantDetailSheet applicantKey={selected} onClose={() => setSelected(null)} onChanged={bump} />
    </div>
  );
}
