"use client";

import { useMemo, useState } from "react";

import { Cpu, ExternalLink, Layers, Search, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { fmtMs, type LinkedScan, relTime, STATUS_META } from "./types";

export function OcrScans({ scans, loading }: { scans: LinkedScan[]; loading: boolean }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return scans;
    return scans.filter((s) =>
      [s.recipient_name, s.delivery_line, s.scan_id, s.stop_id ?? "", s.provider]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [scans, q]);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {/* Toolbar lives inside the card so the search doesn't float in the gray. */}
      <div className="flex items-center gap-2 border-b bg-card px-4 py-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search recipient, address, tracking…"
            className="h-9 border-border bg-muted/40 pl-8"
          />
        </div>
      </div>

      {loading && scans.length === 0 ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={`sk-${i}`} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Layers className="size-6" aria-hidden="true" />
          </span>
          <p className="font-medium text-sm">{scans.length === 0 ? "No scans in this window" : "No matches"}</p>
          <p className="max-w-sm text-muted-foreground text-xs">
            {scans.length === 0
              ? "Scans appear here in real time, joined to the recipient & address they created."
              : "Try a different search term."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="type-label">Status</TableHead>
                    <TableHead className="type-label">Recipient</TableHead>
                    <TableHead className="type-label">Address</TableHead>
                    <TableHead className="type-label">Provider</TableHead>
                    <TableHead className="type-label text-right">Latency</TableHead>
                    <TableHead className="type-label text-center">Score</TableHead>
                    <TableHead className="type-label text-right">Time</TableHead>
                    <TableHead className="type-label">Stop</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => {
                    const meta = STATUS_META[s.status];
                    return (
                      <TableRow key={s.scan_id}>
                        <TableCell>
                          <Badge variant="outline" className={cn("gap-1.5 capitalize", meta.cls)}>
                            <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden="true" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {s.recipient_name ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-sm">
                              <User className="size-3.5 text-muted-foreground" aria-hidden="true" />
                              {s.recipient_name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              {s.draft_id ? "—" : "unlinked"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <span className="block truncate text-muted-foreground text-sm" title={s.delivery_line}>
                            {s.delivery_line || "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <Cpu className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            <span className="uppercase">{s.provider}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{fmtMs(s.latency_ms)}</TableCell>
                        <TableCell className="text-center">
                          {s.critical_score != null ? (
                            <span
                              className={cn(
                                "font-medium text-sm tabular-nums",
                                s.critical_score >= 0.8 ? "text-success" : s.critical_score >= 0.5 ? "text-warning" : "text-destructive",
                              )}
                            >
                              {Math.round(s.critical_score * 100)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm whitespace-nowrap">
                          {relTime(s.created_at)}
                        </TableCell>
                        <TableCell>
                          {s.stop_id ? (
                            <a
                              href={`/dashboard/stops?q=${encodeURIComponent(s.stop_id)}`}
                              className="inline-flex items-center gap-1 font-mono text-primary text-xs tabular-nums hover:underline"
                            >
                              {s.stop_id.slice(-8)}
                              <ExternalLink className="size-3" aria-hidden="true" />
                            </a>
                          ) : s.draft_id ? (
                            <span className="text-muted-foreground text-xs">draft</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
        </div>
      )}
    </Card>
  );
}
