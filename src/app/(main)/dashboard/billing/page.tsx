import { Suspense } from "react";

import { BillingShell } from "./_components/billing-shell";

/** Billing — standalone financial module (2026-08 billing v3). Three tabs:
 *  Overview (balance, cycle, contextual action, activity feed) · Charges
 *  (server-paginated ledger grid) · Invoices (receipts/statements/invoices).
 *  Migrated out of Settings; ?tab=billing/?tab=invoices there now redirect
 *  here. Server wrapper adds the Suspense boundary the client shell's
 *  useSearchParams needs. */
export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingShell />
    </Suspense>
  );
}
