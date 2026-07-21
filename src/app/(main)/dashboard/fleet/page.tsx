import { Suspense } from "react";

import { FleetShell } from "./_components/fleet-shell";

/** Fleet — Routely's operational hubs (dispatch origins) and drivers. Full-width,
 *  tabbed shell that deep-links via ?tab=. Server wrapper adds the Suspense
 *  boundary needed by the client shell's useSearchParams. Admin-only (ops surface). */
export default function FleetPage() {
  return (
    <Suspense fallback={null}>
      <FleetShell />
    </Suspense>
  );
}
