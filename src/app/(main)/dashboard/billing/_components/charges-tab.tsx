"use client";

import { useEffect, useState } from "react";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { ChargeDetailDrawer, type ChargeRow } from "./charge-detail-drawer";

const PAGE_SIZE = 25;
const TYPE_LABEL: Record<string, string> = {
  package: "Package",
  miles: "Miles",
  on_demand: "On-Demand",
  prepaid_label: "Label",
};
const OUTCOME_DOT: Record<string, string> = { delivered: "bg-success", failed: "bg-destructive" };
const centsToUsd = (c: number | null) => `$${((c ?? 0) / 100).toFixed(2)}`;
// Strips the leading "STOP_ID — " routely-api's attempt_label() already
// prefixes onto charge_label — the Stop column already shows the ID, so
// repeating it here would be redundant; everything after that prefix
// ("Attempt 2 — Failed: no one home") is exactly the per-attempt context
// this table needs (billing v4 Part C — never two undifferentiated rows).
const attemptContext = (label: string, stopId: string) =>
  label.startsWith(`${stopId} — `) ? label.slice(stopId.length + 3) : label;

export function ChargesTab() {
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ChargeRow | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (type !== "all") params.set("resolved_type", type);
    if (status !== "all") params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/client/billing/ledger?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => {
        /* best-effort — empty grid + no error state is an acceptable degrade */
      })
      .finally(() => setLoading(false));
  }, [offset, type, status, search]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-3">
          <div className="relative min-w-[180px] flex-1">
            <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by stop ID…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              className="h-8 pl-8 text-13"
            />
          </div>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v);
              setOffset(0);
            }}
          >
            <SelectTrigger className="h-8 w-[130px] text-13">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="package">Package</SelectItem>
              <SelectItem value="miles">Miles</SelectItem>
              <SelectItem value="on_demand">On-Demand</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setOffset(0);
            }}
          >
            <SelectTrigger className="h-8 w-[140px] text-13">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="unbilled">Unbilled</SelectItem>
              <SelectItem value="documented">Documented</SelectItem>
            </SelectContent>
          </Select>
          {total > 0 && <span className="ml-auto text-11 text-muted-foreground">{total.toLocaleString()} charges</span>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={`row-${i}`} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground text-13">No charges match these filters.</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-13">
                  <thead>
                    <tr className="border-border/60 border-b text-11 text-muted-foreground">
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-left font-medium">Stop</th>
                      <th className="px-4 py-2 text-left font-medium">Type</th>
                      <th className="px-4 py-2 text-left font-medium">Qty</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                      <th className="px-4 py-2 text-left font-medium">Document</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className="cursor-pointer border-border/40 border-b transition-colors last:border-0 hover:bg-muted/50"
                        onClick={() => setSelected(r)}
                      >
                        <td className="px-4 py-2 text-muted-foreground">
                          {new Date(r.attempted_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-12">{r.stop_id}</span>
                            <span className="flex items-center gap-1 text-10 text-muted-foreground">
                              <span
                                className={cn(
                                  "size-1.5 shrink-0 rounded-full",
                                  OUTCOME_DOT[r.outcome] ?? "bg-muted-foreground",
                                )}
                              />
                              {attemptContext(r.charge_label, r.stop_id)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant="outline" className="text-10">
                            {TYPE_LABEL[r.resolved_type] ?? r.resolved_type}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 tabular-nums">{r.units ?? "—"}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{centsToUsd(r.amount_cents)}</td>
                        <td className="px-4 py-2">
                          <Badge variant={r.document_id ? "secondary" : "outline"} className="text-10">
                            {r.document_number ?? "Unbilled"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <div className="divide-y divide-border/60 sm:hidden">
                {rows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelected(r)}
                    className="flex w-full flex-col gap-1 px-4 py-3 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-12">{r.stop_id}</span>
                      <span className="font-medium tabular-nums">{centsToUsd(r.amount_cents)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-11 text-muted-foreground">
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          OUTCOME_DOT[r.outcome] ?? "bg-muted-foreground",
                        )}
                      />
                      {attemptContext(r.charge_label, r.stop_id)}
                    </div>
                    <div className="flex items-center gap-2 text-11 text-muted-foreground">
                      <span>{new Date(r.attempted_at).toLocaleDateString()}</span>
                      <Badge variant="outline" className="text-10">
                        {TYPE_LABEL[r.resolved_type] ?? r.resolved_type}
                      </Badge>
                      <Badge variant={r.document_id ? "secondary" : "outline"} className="text-10">
                        {r.document_id ? "Invoiced" : "Unbilled"}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-13">
          <span className="text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft className="size-3.5" /> Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      <ChargeDetailDrawer charge={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
