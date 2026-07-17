"use client";

import { AlertTriangle, Check, Cpu, Image as ImageIcon, Timer, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import {
  eventStatus,
  type FieldsSummary,
  fmtBytes,
  fmtDateTime,
  fmtMs,
  fmtTime,
  type Scan,
  STATUS_META,
} from "./types";

const FIELD_KEYS: (keyof FieldsSummary)[] = ["name", "phone", "street", "city", "state", "zip", "dob"];

export function OcrDetailSheet({ scan, onClose }: { scan: Scan | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(scan)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {scan && (
          <>
            <SheetHeader className="border-b px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <SheetTitle className="font-mono text-sm tabular-nums">scan #{scan.id.slice(-10)}</SheetTitle>
                <Badge variant="outline" className={cn("capitalize", STATUS_META[scan.status].cls)}>
                  {STATUS_META[scan.status].label}
                </Badge>
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1">
                  <Cpu className="size-3" aria-hidden="true" /> {scan.provider.toUpperCase()}
                </span>
                <span>{fmtDateTime(scan.startedAt)}</span>
                {scan.actor && <span>· {scan.actor}</span>}
              </SheetDescription>
            </SheetHeader>

            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-2 border-b p-4">
              <Stat label="Latency" value={fmtMs(scan.avgLatencyMs)} />
              <Stat label="Passes" value={String(scan.passes)} />
              <Stat
                label="Score"
                value={scan.score != null ? `${Math.round(scan.score * 100)}%` : "—"}
                tone={scan.score != null && scan.score < 0.5 ? "warning" : undefined}
              />
              <Stat label="Retries" value={String(scan.retries)} tone={scan.retries > 0 ? "warning" : undefined} />
            </div>

            {/* Passes / event detail */}
            <div className="px-4 py-4">
              <p className="type-label mb-3 text-muted-foreground">Scan detail</p>
              <ol className="relative space-y-0">
                {scan.events.map((r, i) => {
                  const st = eventStatus(r);
                  const meta = STATUS_META[st];
                  const last = i === scan.events.length - 1;
                  const f = r.fields ?? null;
                  return (
                    <li key={r._id ?? i} className="relative flex gap-3 pb-4 last:pb-0">
                      {!last && <span className="absolute top-7 bottom-0 left-[13px] w-px bg-border/70" aria-hidden="true" />}
                      <span className={cn("z-10 grid size-7 shrink-0 place-items-center rounded-full", meta.cls)}>
                        {st === "processed" ? (
                          <Check className="size-3.5" aria-hidden="true" />
                        ) : st === "error" ? (
                          <X className="size-3.5" aria-hidden="true" />
                        ) : (
                          <AlertTriangle className="size-3.5" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm capitalize">
                            {st}
                            {r.used_retry && <span className="ml-1 text-warning text-xs">(retry)</span>}
                            {r.used_second_pass && <span className="ml-1 text-muted-foreground text-xs">(2nd pass)</span>}
                          </span>
                          <span className="text-muted-foreground text-xs tabular-nums">{fmtTime(r.created_at)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                          <span className="inline-flex items-center gap-1">
                            <Timer className="size-3" aria-hidden="true" /> {fmtMs(r.latency_ms)}
                          </span>
                          {r.model && <span>{r.model}</span>}
                          {r.status_code != null && <span>HTTP {r.status_code}</span>}
                          {r.primary_image?.approx_bytes ? (
                            <span className="inline-flex items-center gap-1">
                              <ImageIcon className="size-3" aria-hidden="true" /> {fmtBytes(r.primary_image.approx_bytes)}
                            </span>
                          ) : null}
                        </div>

                        {r.error_code && (
                          <div className="mt-1.5 rounded-md border border-destructive/25 bg-destructive/5 px-2 py-1.5 text-destructive text-xs">
                            <span className="font-medium">{r.error_code}</span>
                            {r.error_message ? ` — ${r.error_message}` : ""}
                          </div>
                        )}

                        {/* Extracted fields */}
                        {f && (
                          <div className="mt-2 space-y-1.5">
                            {typeof f.critical_score === "number" && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground text-xs">Critical score</span>
                                <span
                                  className={cn(
                                    "font-medium text-xs tabular-nums",
                                    f.critical_score >= 0.8 ? "text-success" : f.critical_score >= 0.5 ? "text-warning" : "text-destructive",
                                  )}
                                >
                                  {Math.round(f.critical_score * 100)}%
                                </span>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1">
                              {FIELD_KEYS.map((k) => {
                                const ok = Boolean(f[k]);
                                return (
                                  <span
                                    key={k}
                                    className={cn(
                                      "inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] capitalize",
                                      ok
                                        ? "border-success/25 bg-success/10 text-success"
                                        : "border-border bg-muted/40 text-muted-foreground line-through",
                                    )}
                                  >
                                    {k}
                                  </span>
                                );
                              })}
                              {typeof f.order_ids_count === "number" && f.order_ids_count > 0 && (
                                <span className="inline-flex items-center gap-0.5 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                  {f.order_ids_count} order id{f.order_ids_count === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                            {f.missing && f.missing.length > 0 && (
                              <p className="text-muted-foreground text-xs">Missing: {f.missing.join(", ")}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-lg border bg-gradient-to-br from-muted/30 to-transparent px-2 py-2 text-center">
      <p className="type-label text-muted-foreground">{label}</p>
      <p className={cn("font-semibold text-sm tabular-nums", tone === "warning" && "text-warning")}>{value}</p>
    </div>
  );
}
