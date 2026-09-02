"use client";

import { useMemo, useState } from "react";

import { ArrowDownLeft, ArrowUpRight, Search } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import type { Direction, InternalPackage, InternalPackagesResponse } from "./_types";
import { directionOf } from "./_types";
import { InternalPackageDetailSheet } from "./internal-package-detail-sheet";
import { statusBadgeCls, statusLabelOf } from "./internal-status";

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtEta(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function InternalPackagesTable({
  data,
  loading,
  myEmail,
}: {
  data?: InternalPackagesResponse;
  loading: boolean;
  myEmail: string | null;
}) {
  const [dir, setDir] = useState<Direction | "all">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<InternalPackage | null>(null);

  const uid = data?.caller_user_id ?? "";
  const rows = useMemo(() => {
    let pkgs = data?.packages ?? [];
    if (dir !== "all") pkgs = pkgs.filter((p) => directionOf(p, uid, myEmail) === dir);
    const needle = q.trim().toLowerCase();
    if (needle) {
      pkgs = pkgs.filter((p) =>
        [p.stop_id, p.recipient_name, p.delivery_address, p.delivery_city, p.pickup_name, p.driver_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle)),
      );
    }
    return pkgs;
  }, [data?.packages, dir, q, uid, myEmail]);

  return (
    <Card size="sm" className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="font-semibold text-sm tracking-tight">Packages</CardTitle>
            <CardDescription className="text-xs">
              {data?.visibility === "own"
                ? "Packages you sent or will receive"
                : "All internal packages of your company"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={dir} onValueChange={(v) => setDir(v as Direction | "all")}>
              <TabsList className="h-7">
                <TabsTrigger value="all" className="px-2.5 text-xs">
                  All
                </TabsTrigger>
                <TabsTrigger value="outgoing" className="gap-1 px-2.5 text-xs">
                  <ArrowUpRight className="size-3" aria-hidden="true" /> Outgoing
                </TabsTrigger>
                <TabsTrigger value="incoming" className="gap-1 px-2.5 text-xs">
                  <ArrowDownLeft className="size-3" aria-hidden="true" /> Incoming
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="-translate-y-1/2 absolute top-1/2 left-2 size-3.5 text-muted-foreground/50" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search tracking, recipient, driver…"
                className="h-7 w-52 pl-7 text-xs"
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        {loading && !data ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full rounded" />
            <Skeleton className="h-9 w-full rounded" />
            <Skeleton className="h-9 w-full rounded" />
            <Skeleton className="h-9 w-full rounded" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-10 text-center">
            <p className="font-medium text-muted-foreground text-sm">
              {q ? "No packages match your search" : "No internal packages here yet"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-border/50 border-b text-[11px] text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Tracking</th>
                  <th className="py-2 pr-3 font-medium">Direction</th>
                  <th className="py-2 pr-3 font-medium">From</th>
                  <th className="py-2 pr-3 font-medium">Recipient</th>
                  <th className="hidden py-2 pr-3 font-medium md:table-cell">Address</th>
                  <th className="hidden py-2 pr-3 font-medium lg:table-cell">Created</th>
                  <th className="py-2 pr-3 font-medium">ETA</th>
                  <th className="hidden py-2 pr-3 font-medium md:table-cell">Driver</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.map((p) => {
                  const d = directionOf(p, uid, myEmail);
                  return (
                    <tr
                      key={p.id}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                      onClick={() => setSelected(p)}
                    >
                      <td className="py-2 pr-3">
                        <span className="font-mono font-semibold text-[11px] text-primary">
                          {p.stop_id ?? p.id.slice(-10).toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]",
                            d === "outgoing"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-violet-500/10 text-violet-600 dark:text-violet-400",
                          )}
                        >
                          {d === "outgoing" ? (
                            <ArrowUpRight className="size-2.5" />
                          ) : (
                            <ArrowDownLeft className="size-2.5" />
                          )}
                          {d === "outgoing" ? "Outgoing" : "Incoming"}
                        </span>
                      </td>
                      <td className="max-w-[130px] truncate py-2 pr-3 text-muted-foreground">{p.pickup_name ?? "—"}</td>
                      <td className="max-w-[150px] truncate py-2 pr-3 font-medium text-foreground">
                        {p.recipient_name}
                      </td>
                      <td className="hidden max-w-[220px] truncate py-2 pr-3 text-muted-foreground md:table-cell">
                        {[p.delivery_address, p.delivery_city].filter(Boolean).join(", ")}
                      </td>
                      <td className="hidden py-2 pr-3 text-muted-foreground tabular-nums lg:table-cell">
                        {fmtDate(p.created_at)}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground tabular-nums">{fmtEta(p.eta_at)}</td>
                      <td className="hidden max-w-[120px] truncate py-2 pr-3 text-muted-foreground md:table-cell">
                        {p.driver_name ?? "—"}
                      </td>
                      <td className="py-2">
                        <span
                          className={cn("rounded-full px-2 py-0.5 font-semibold text-[10px]", statusBadgeCls(p))}
                        >
                          {statusLabelOf(p)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <p className="mt-2 border-border/40 border-t pt-2 text-[11px] text-muted-foreground">
            Showing {rows.length} internal package{rows.length === 1 ? "" : "s"}
          </p>
        )}
      </CardContent>

      <InternalPackageDetailSheet pkg={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}
