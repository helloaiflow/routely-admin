"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { ChargeDetailPanel, type ChargeRow } from "./charge-detail-panel";

export type { ChargeRow };

/* Single detail drawer, shared by Overview's Recent Activity, the Charges
 * grid (mobile — desktop uses inline expansion instead), and the stop detail
 * page's own Billing section — clicking a charge anywhere in the app opens
 * THIS component (wrapping the same ChargeDetailPanel every other surface
 * uses), never a duplicate. */
export function ChargeDetailDrawer({
  charge,
  onOpenChange,
}: {
  charge: ChargeRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={!!charge} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Charge detail</SheetTitle>
          <SheetDescription className="sr-only">Full breakdown for this ledger charge</SheetDescription>
        </SheetHeader>
        {charge && (
          <div className="px-4 pb-6">
            <ChargeDetailPanel charge={charge} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
