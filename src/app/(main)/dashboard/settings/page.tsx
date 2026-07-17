import { Suspense } from "react";

import { SettingsShell } from "./_components/settings-shell";

/** Settings — account, billing (finance-style), notifications, plans, pickup
 *  locations, invoices (real charge ledger) and team. Full-width, tabbed shell
 *  that deep-links via ?tab=. Server wrapper adds the Suspense boundary needed
 *  by the client shell's useSearchParams. */
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsShell />
    </Suspense>
  );
}
