"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyCents as centsToUsd } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

import { ChargeDetailDrawer, type ChargeRow } from "./charge-detail-drawer";
import { OUTCOME_DOT, TYPE_LABEL } from "./charge-detail-panel";

const TEASER_ROWS = 8;

/* Lightweight entry point on Overview (Section 3) — the full filterable
 * list + daily chart now live on their own "Recent Activity" tab; this is
 * just the last few rows with a link in. Reuses ChargeDetailDrawer so
 * clicking a row here opens the exact same detail surface every other
 * billing surface uses. */
export function RecentActivityTeaser({ onViewAll }: { onViewAll: () => void }) {
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ChargeRow | null>(null);

  useEffect(() => {
    fetch(`/api/client/billing/ledger?limit=${TEASER_ROWS}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setRows(d.rows ?? []))
      .catch(() => {
        /* best-effort — empty teaser is an acceptable degrade */
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">Recent activity</CardTitle>
        <button
          type="button"
          onClick={onViewAll}
          className="flex items-center gap-1 text-12 text-muted-foreground hover:text-foreground"
        >
          View all activity →
        </button>
      </CardHeader>
      <CardContent className="divide-y divide-border/60 p-0">
        {loading ? null : rows.length === 0 ? (
          <p className="p-4 text-13 text-muted-foreground">No charges yet.</p>
        ) : (
          rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c)}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 items-center gap-2" title={c.charge_label}>
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", OUTCOME_DOT[c.outcome] ?? "bg-muted-foreground")}
                />
                <span className="truncate font-mono text-12">{c.stop_id}</span>
                {c.attempt_seq != null && (
                  <Badge variant="secondary" className="shrink-0 text-10">
                    Attempt {c.attempt_seq}
                  </Badge>
                )}
                <Badge variant="outline" className="shrink-0 text-10">
                  {TYPE_LABEL[c.resolved_type] ?? c.resolved_type}
                </Badge>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={c.document_id ? "secondary" : "outline"} className="text-10">
                  {c.document_id ? "Invoiced" : "Unbilled"}
                </Badge>
                <span className="w-16 text-right font-medium tabular-nums">{centsToUsd(c.amount_cents ?? 0)}</span>
              </div>
            </button>
          ))
        )}
      </CardContent>
      <ChargeDetailDrawer charge={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </Card>
  );
}
