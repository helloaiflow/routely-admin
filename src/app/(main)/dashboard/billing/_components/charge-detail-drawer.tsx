"use client";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type ChargeRow = {
  id: number;
  stop_id: string;
  resolved_type: string;
  resolved_via: string;
  outcome: string;
  disposition: string | null;
  attempt_seq: number | null;
  /** "RTL-1785789728 — Attempt 2 — Failed: no one home" — computed once by
   * routely-api's attempt_label() and reused verbatim everywhere a charge is
   * shown (this drawer, the Charges grid, Recent Activity, the invoice/PDF)
   * so the wording can never drift between surfaces (billing v4 Part C). */
  charge_label: string;
  units: number | null;
  amount_cents: number | null;
  routely_cents: number | null;
  driver_cents: number | null;
  flag: string | null;
  flag_reason: string | null;
  attempted_at: string;
  documented_at: string | null;
  document_id: number | null;
  document_number: string | null;
  document_status: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  package: "Package",
  miles: "Miles",
  on_demand: "On-Demand",
  prepaid_label: "Label",
};
const OUTCOME_DOT: Record<string, string> = { delivered: "bg-success", failed: "bg-destructive" };
const centsToUsd = (c: number | null | undefined) => `$${((c ?? 0) / 100).toFixed(2)}`;

/* Single detail drawer, shared by the Overview activity feed and the Charges
 * grid — clicking a charge anywhere in the app opens THIS component, never a
 * duplicate. */
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
          <div className="space-y-4 px-4 pb-6">
            <div className="flex items-center gap-2">
              <span
                className={cn("size-2 shrink-0 rounded-full", OUTCOME_DOT[charge.outcome] ?? "bg-muted-foreground")}
              />
              <p className="min-w-0 flex-1 font-medium text-13">{charge.charge_label}</p>
              <span className="shrink-0 font-bold text-lg tabular-nums">{centsToUsd(charge.amount_cents)}</span>
            </div>
            <div className="flex items-center justify-between">
              <Badge variant="outline">{TYPE_LABEL[charge.resolved_type] ?? charge.resolved_type}</Badge>
              {charge.attempt_seq != null && (
                <Badge variant="secondary" className="text-10">
                  Attempt {charge.attempt_seq}
                </Badge>
              )}
            </div>

            <Row label="Stop" value={<span className="font-mono text-12">{charge.stop_id}</span>} />
            <Row label="Attempted" value={new Date(charge.attempted_at).toLocaleString()} />
            <Row label="Resolved via" value={charge.resolved_via} />
            {charge.units != null && (
              <Row
                label="Quantity"
                value={charge.resolved_type === "miles" ? `${charge.units} mi` : `${charge.units}`}
              />
            )}
            {charge.routely_cents != null && <Row label="Routely share" value={centsToUsd(charge.routely_cents)} />}
            {charge.driver_cents != null && <Row label="Driver share" value={centsToUsd(charge.driver_cents)} />}
            {charge.flag && (
              <Row
                label="Flag"
                value={
                  <span className="text-destructive">
                    {charge.flag} — {charge.flag_reason}
                  </span>
                }
              />
            )}
            <Row
              label="Document"
              value={
                charge.document_number ? (
                  <span>
                    {charge.document_number}{" "}
                    <Badge variant="secondary" className="ml-1 text-10">
                      {charge.document_status}
                    </Badge>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Unbilled — not yet in a cycle close</span>
                )
              }
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-border/60 border-b pb-2 text-13">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
