import { notFound } from "next/navigation";

import { getTenantContext } from "@/lib/tenant";

import { PayoutsShell } from "./_components/payouts-shell";

/** Drivers → Payouts ("A09", R26a Part B). Staff-only, same page-level gate
 * pattern as the Applications page (src/app/(main)/dashboard/driver-applicants/page.tsx):
 * every API route under /api/client/payouts/* independently re-checks
 * ctx.isAdmin server-side — this is defense in depth for a guessed/bookmarked
 * URL, not the real gate. */
export default async function PayoutsPage() {
  const ctx = await getTenantContext();
  if (!ctx?.isAdmin) notFound();
  return <PayoutsShell />;
}
