"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSearchParams } from "next/navigation";

import { Info, RefreshCw, ScanText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type DateRange, DateRangePicker } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { IvyMonitor } from "./ivy-monitor";
import { OcrActivity } from "./ocr-activity";
import { OcrDetailSheet } from "./ocr-detail-sheet";
import { OcrOverview } from "./ocr-overview";
import { OcrScans } from "./ocr-scans";
import {
  groupScans,
  type LinkedScan,
  type OcrDailyStats,
  type Scan,
  type ScanLogsResponse,
  type ScanRecord,
} from "./types";

const RAW_CAP_MIN = 2880; // raw ocr_scan_logs retention (48h)

const sod = (d: Date) => {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
};
/** Default filter window — last 30 days. */
const defaultRange = (): DateRange => {
  const to = sod(new Date());
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from, to, label: "Last 30 Days" };
};

export function OcrMonitorShell() {
  const searchParams = useSearchParams();
  const source = searchParams.get("source"); // "ivy" | null

  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange);
  const [live, setLive] = useState(true);
  const [selected, setSelected] = useState<Scan | null>(null);
  const [lastSync, setLastSync] = useState<number>(Date.now());
  const [history, setHistory] = useState<OcrDailyStats | null>(null);
  const [linkedScans, setLinkedScans] = useState<LinkedScan[]>([]);

  // The OCR raw + rollup pipeline is anchored to "now" via a minutes window, so
  // derive minutes from the picker's start date. (Ranges effectively run
  // from → now; the picker still gives day-level control over the start.)
  const rangeMinutes = Math.min(
    Math.max(Math.ceil((Date.now() - dateRange.from.getTime()) / 60_000), 1),
    525600,
  );
  const range = { minutes: rangeMinutes, label: dateRange.label };
  const isHistory = range.minutes > RAW_CAP_MIN;

  const load = useCallback(
    async (quiet = false) => {
      if (source === "ivy") {
        setLoading(false);
        return; // IVY view self-fetches from package_scans.
      }
      if (!quiet) setLoading(true);
      try {
        // Raw detail is only retained 48h — cap the raw query there.
        const since = Math.min(range.minutes, RAW_CAP_MIN);
        const res = await fetch(`/api/client/ocr-scan-logs?since=${since}&limit=500`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as ScanLogsResponse;
        setRecords(d.logs ?? []);
        setError("");
        setLastSync(Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load scans");
      } finally {
        setLoading(false);
      }
    },
    [range.minutes, source],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // GET the permanent daily rollup (Supabase). Cheap read — safe to poll.
  const fetchHistory = useCallback(async () => {
    if (source === "ivy" || range.minutes <= RAW_CAP_MIN) return;
    const days = Math.ceil(range.minutes / 1440);
    try {
      const r = await fetch(`/api/client/ocr-scan-daily?days=${days}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!d.error) {
        setHistory(d as OcrDailyStats);
        setLastSync(Date.now());
      }
    } catch {
      /* keep last good history */
    }
  }, [range.minutes, source]);

  // Linked scans (permanent ocr_scans joined to draft recipient/address) for
  // the Scans grid — cheap Supabase read, polled + refetched on range change.
  const fetchLinkedScans = useCallback(async () => {
    if (source === "ivy") return;
    try {
      const r = await fetch(`/api/client/ocr-scans?minutes=${range.minutes}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!d.error) setLinkedScans((d.scans ?? []) as LinkedScan[]);
    } catch {
      /* keep last good */
    }
  }, [range.minutes, source]);

  useEffect(() => {
    void fetchLinkedScans();
  }, [fetchLinkedScans]);

  // On range change: reconcile the last 48h from raw once (so the rollup's
  // recent window matches the live detail), then read it.
  useEffect(() => {
    if (source === "ivy" || range.minutes <= RAW_CAP_MIN) {
      setHistory(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/client/ocr-scan-daily", { method: "POST" });
      } catch {
        /* non-fatal */
      }
      if (!cancelled) await fetchHistory();
    })();
    return () => {
      cancelled = true;
    };
  }, [range.minutes, fetchHistory, source]);

  // Real-time polling (5s) while Live is on — refreshes BOTH the raw detail
  // and (in long ranges) the rollup, so the Overview stays live either way.
  const liveRef = useRef(live);
  liveRef.current = live;
  const pollRef = useRef<() => void>(() => {});
  pollRef.current = () => {
    void load(true);
    void fetchHistory();
    void fetchLinkedScans();
  };
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (liveRef.current) pollRef.current();
    }, 5000);
    return () => clearInterval(id);
  }, [live]);

  // NOTE: IVY does not tag its scans yet (actor/source are unset), and the raw
  // + rollup sources have no reliable per-source dimension. Filtering the raw by
  // actor="ivy" matched nothing → empty short ranges while the (source-agnostic)
  // rollup still showed data. Until IVY sends source:"ivy", show ALL scans in
  // both views so every range is consistent.
  const filtered = records;
  const scans = useMemo(() => groupScans(filtered), [filtered]);

  return (
    <div className="@container/main w-full space-y-4 px-4 py-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <ScanText className="size-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="type-page-title">{source === "ivy" ? "IVY Scan Monitor" : "OCR Scan Monitor"}</h1>
            <p className="type-desc mt-0.5">
              {source === "ivy"
                ? "Telegram DataEntry pipeline · OCR → Spoke — success, failures & where they broke"
                : "Real-time Qwen2.5-VL scans · latency, events & field extraction — one record per label"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setLive((v) => !v)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-medium text-xs transition-colors",
            live
              ? "border-success/30 bg-success/10 text-success"
              : "border-border bg-background text-muted-foreground hover:bg-muted",
          )}
          aria-pressed={live}
        >
          <span className={cn("relative flex size-2", live && "text-success")}>
            <span
              className={cn(
                "absolute inline-flex size-full rounded-full opacity-75",
                live && "animate-ping bg-success",
              )}
            />
            <span className={cn("relative inline-flex size-2 rounded-full", live ? "bg-success" : "bg-muted-foreground")} />
          </span>
          {live ? "Live" : "Paused"}
        </button>

        <DateRangePicker value={dateRange} onChange={setDateRange} />

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden="true" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-destructive text-sm">
          {error}
        </div>
      )}

      {source === "ivy" ? (
        <IvyMonitor minutes={range.minutes} live={live} />
      ) : (
        <>
          <Tabs defaultValue="overview">
            <div className="flex items-center justify-between gap-2">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="scans" className="gap-1.5">
                  Scans
                  {linkedScans.length > 0 && (
                    <Badge className="h-4 min-w-4 justify-center rounded-full border-transparent bg-primary px-1 text-[10px] text-white tabular-nums">
                      {linkedScans.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
              <span className="hidden text-muted-foreground text-xs sm:inline">
                Synced{" "}
                {new Date(lastSync).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>

            <TabsContent value="overview" className="mt-3 space-y-3">
              {isHistory && (
                <div className="flex items-start gap-2 rounded-lg border border-info/25 bg-info/[0.06] px-3 py-2 text-info text-xs">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  Charts show long-term stats from the permanent daily rollup. The Scans &amp; Activity tabs list live
                  detail from the last 48 hours only.
                </div>
              )}
              <OcrOverview
                records={filtered}
                scans={scans}
                loading={loading}
                sinceMinutes={Math.min(range.minutes, RAW_CAP_MIN)}
                history={isHistory ? history : null}
              />
            </TabsContent>
            <TabsContent value="scans" className="mt-3">
              <OcrScans scans={linkedScans} loading={loading} />
            </TabsContent>
            <TabsContent value="activity" className="mt-3">
              <OcrActivity scans={scans} loading={loading} onSelect={setSelected} />
            </TabsContent>
          </Tabs>

          <OcrDetailSheet scan={selected} onClose={() => setSelected(null)} />
        </>
      )}
    </div>
  );
}
