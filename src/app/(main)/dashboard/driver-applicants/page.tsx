import { notFound } from "next/navigation";

import { getTenantContext } from "@/lib/tenant";

import { DriverApplicantsShell } from "./_components/driver-applicants-shell";

/** Driver onboarding · Applicants — people moving through the pipeline to the
 *  Approved Applicants pool (M1). Routely-STAFF ONLY (internal applicant PII):
 *  every API route under this page independently re-checks ctx.isAdmin (the
 *  real, server-enforced gate — see src/lib/tenant.ts), and the sidebar hides
 *  this entry from non-staff (see app-sidebar.tsx). This page-level check is
 *  defense in depth for anyone who guesses/bookmarks the URL directly. */
export default async function DriverApplicantsPage() {
  const ctx = await getTenantContext();
  if (!ctx?.isAdmin) notFound();
  return <DriverApplicantsShell />;
}
