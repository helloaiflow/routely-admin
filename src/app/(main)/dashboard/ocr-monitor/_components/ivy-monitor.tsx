"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Phone,
  Search,
  Timer,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { fmtMs, type IvyResponse, type IvyScan, type IvyStatus, relTime } from "./types";

const META: Record<IvyStatus, { label: string; cls: string; dot: string; Icon: React.ElementType }> = {
  success: { label: "Success", cls: "bg-success/10 text-success border-success/25", dot: "bg-success", Icon: CheckCircle2 },
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive border-destructive/25", dot: "bg-destructive", Icon: AlertTriangle },
  processing: { label: "Processing", cls: "bg-info/10 text-info border-info/25", dot: "bg-info", Icon: Loader2 },
};

const FILTERS: { key: "" | IvyStatus; label: string }[] = [
  { key: "", label: "All" },
  { key: "success", label: "Success" },
  { key: "failed", label: "Failed" },
  { key: "processing", label: "In process" },
];

export function IvyMonitor({ minutes, live }: { minutes: number; live: boolean }) {
  const [data, setData] = useState<IvyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | IvyStatus>("");

  const fetchData = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const r = await fetch(`/api/client/ivy-scans?minutes=${minutes}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (!d.error) setData(d as IvyResponse);
      } catch {
        /* keep last good */
      } finally {
        setLoading(false);
      }
    },
    [minutes],
  );

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const liveRef = useRef(live);
  liveRef.current = live;
  const fnRef = useRef(fetchData);
  fnRef.current = fetchData;
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (liveRef.current) void fnRef.current(true);
    }, 5000);
    return () => clearInterval(id);
  }, [live]);

  const t = data?.totals;
  const scans = data?.scans ?? [];

  const filtered = useMemo(() => {
    let list = statusFilter ? scans.filter((s) => s.status === statusFilter) : scans;
    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter((s) =>
        [s.recipient, s.address, s.phone, s.stop_id, s.rx_pharma_id, s.error_stage, s.error_message]
          .join(" ")
          .toLowerCase()
          .includes(term),
      );
    }
    return list;
  }, [scans, statusFilter, q]);

  const kpis = [
    { key: "total", label: "IVY scans", value: t ? String(t.total) : "—", icon: User, tone: "primary" as const },
    { key: "success", label: "Success rate", value: t ? `${t.successRate}%` : "—", icon: CheckCircle2, tone: (t && t.successRate >= 90 ? "success" : "warning") as "success" | "warning" },
    { key: "failed", label: "Failed", value: t ? String(t.failed) : "—", icon: AlertTriangle, tone: (t && t.failed > 0 ? "destructive" : "success") as "destructive" | "success" },
    { key: "proc", label: "In process", value: t ? String(t.processing) : "—", icon: Clock, tone: "info" as const },
    { key: "avg", label: "Avg time", value: t ? fmtMs(t.avgMs) : "—", icon: Timer, tone: "primary" as const },
  ];
  const toneCls: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning dark:text-warning",
    info: "bg-info/10 text-info",
    destructive: "bg-destructive/10 text-destructive",
  };

  const failStages = t ? Object.entries(t.failuresByStage).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.key} className="relative overflow-hidden">
            <div aria-hidden="true" className={cn("pointer-events-none absolute -top-8 -right-6 size-20 rounded-full blur-2xl", toneCls[k.tone].split(" ")[0])} />
            <CardContent className="relative space-y-1.5 py-4">
              <div className="flex items-center justify-between gap-2">
                <span className="type-label truncate text-muted-foreground">{k.label}</span>
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", toneCls[k.tone])}>
                  <k.icon className="size-3.5" aria-hidden="true" />
                </span>
              </div>
              {loading && !data ? <Skeleton className="h-7 w-16" /> : <p className="font-semibold text-xl tracking-tight tabular-nums sm:text-2xl">{k.value}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Failure breakdown by stage */}
      {failStages.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/[0.04] px-3 py-2">
          <span className="type-label text-destructive">Failures by stage</span>
          {failStages.map(([stage, n]) => (
            <Badge key={stage} variant="outline" className="border-destructive/25 bg-destructive/10 text-destructive">
              {stage} · {n}
            </Badge>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipient, address, stop, error…" className="h-9 pl-8" />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key || "all"}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                "h-9 rounded-md border px-3 font-medium text-xs transition-colors",
                statusFilter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading && !data ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={`sk-${i}`} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground text-sm">
            {scans.length === 0 ? "No IVY scans in this window." : "No matches for this filter."}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="type-label">Status</TableHead>
                    <TableHead className="type-label">Recipient</TableHead>
                    <TableHead className="type-label">Address</TableHead>
                    <TableHead className="type-label">Phone</TableHead>
                    <TableHead className="type-label">Result</TableHead>
                    <TableHead className="type-label">Stop</TableHead>
                    <TableHead className="type-label text-center">Label</TableHead>
                    <TableHead className="type-label text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <IvyRow key={s.rtscan_id} s={s} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function IvyRow({ s }: { s: IvyScan }) {
  const meta = META[s.status];
  return (
    <TableRow>
      <TableCell>
        <Badge variant="outline" className={cn("gap-1.5 capitalize", meta.cls)}>
          <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden="true" />
          {meta.label}
        </Badge>
      </TableCell>
      <TableCell>
        {s.recipient ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-sm">
            <User className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {s.recipient}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
      <TableCell className="max-w-[240px]">
        <span className="block truncate text-muted-foreground text-sm" title={s.address}>
          {s.address || "—"}
        </span>
      </TableCell>
      <TableCell>
        {s.phone ? (
          <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums">
            <Phone className="size-3 text-muted-foreground" aria-hidden="true" />
            {s.phone}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
      <TableCell className="max-w-[220px]">
        {s.status === "failed" ? (
          <span className="block truncate text-destructive text-xs" title={s.error_message}>
            {s.error_stage ? <span className="font-medium">{s.error_stage}</span> : null}
            {s.error_message ? ` · ${s.error_message}` : s.error_stage ? "" : "failed"}
          </span>
        ) : s.status === "success" ? (
          <span className="text-success text-xs">completed</span>
        ) : (
          <span className="text-muted-foreground text-xs">{s.stage || "in flight"}</span>
        )}
      </TableCell>
      <TableCell>
        {s.stop_id ? (
          <a
            href={`/dashboard/stops?q=${encodeURIComponent(s.stop_id)}`}
            className="inline-flex items-center gap-1 font-mono text-primary text-xs tabular-nums hover:underline"
          >
            {s.stop_id.replace(/^RTL-/, "").slice(-8)}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell className="text-center">
        {s.image_url ? (
          <a
            href={s.image_url}
            target="_blank"
            rel="noreferrer"
            className="inline-grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="View label image"
          >
            <ImageIcon className="size-4" aria-hidden="true" />
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right text-muted-foreground text-sm whitespace-nowrap">{relTime(s.started_at)}</TableCell>
    </TableRow>
  );
}
