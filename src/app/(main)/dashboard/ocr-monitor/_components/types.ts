/** OCR scan monitor — types + helpers. Data: GET /api/client/ocr-scan-logs
 *  (collection ocr_scan_logs). Each record is one OCR attempt; a "scan" groups
 *  attempts by correlation.batch_id (single scans stand alone by _id). */

import { etAddDays, etDayKey } from "@/lib/et-time";

export type FieldsSummary = {
  critical_score?: number;
  missing?: string[];
  name?: boolean;
  phone?: boolean;
  street?: boolean;
  city?: boolean;
  state?: boolean;
  zip?: boolean;
  dob?: boolean;
  order_ids_count?: number;
  number_of_items?: boolean;
};

export type ScanRecord = {
  _id?: string;
  provider?: string;
  scan_preference?: string;
  ok?: boolean;
  status_code?: number;
  error_code?: string | null;
  error_message?: string | null;
  latency_ms?: number;
  actor?: string | null;
  model?: string | null;
  primary_image?: { mime?: string | null; approx_bytes?: number } | null;
  retry_image?: { mime?: string | null; approx_bytes?: number } | null;
  used_retry?: boolean;
  used_second_pass?: boolean;
  fields?: FieldsSummary | null;
  correlation?: { batch_id?: string | null } | null;
  created_at?: string;
};

export type ScanLogsResponse = {
  count: number;
  rollup?: { total: number; ok: number; failed: number; qwen: number; openai: number };
  logs: ScanRecord[];
};

export type ScanStatus = "processed" | "failed" | "error" | "inprocess";

/** IVY DataEntry scan (package_scans) — GET /api/client/ivy-scans. */
export type IvyStatus = "success" | "failed" | "processing";
export type IvyScan = {
  rtscan_id: number;
  status: IvyStatus;
  stage: string;
  error_stage: string;
  error_message: string;
  recipient: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  rx_pharma_id: string;
  stop_id: string;
  spoke_delivery_id: string;
  route: string;
  image_url: string;
  started_at: string;
  completed_at: string;
  processing_time_ms: number;
};
export type IvyResponse = {
  count: number;
  totals: {
    total: number;
    success: number;
    failed: number;
    processing: number;
    successRate: number;
    avgMs: number;
    failuresByStage: Record<string, number>;
  };
  scans: IvyScan[];
};

/** Linked scan (permanent ocr_scans + joined draft recipient/address) —
 *  GET /api/client/ocr-scans. Lets the grid show/search "what was scanned". */
export type LinkedScan = {
  scan_id: string;
  created_at: string;
  source: string;
  provider: string;
  status: ScanStatus;
  latency_ms: number;
  model: string | null;
  fields_captured: number;
  critical_score: number | null;
  draft_id: string | null;
  stop_id: string | null;
  image_status: string;
  recipient_name: string;
  delivery_line: string;
};

/** Long-term rollup stats — GET /api/client/ocr-scan-daily (Supabase). */
export type OcrDailyStats = {
  days: number;
  series: { date: string; scans: number; ok: number; failed: number; latency: number; qwen: number; openai: number }[];
  totals: {
    total: number;
    ok: number;
    failed: number;
    errors: number;
    successRate: number;
    errorRate: number;
    avgLatency: number;
    p50: number;
    p95: number;
    retries: number;
    secondPass: number;
    fieldsAvg: number;
    scoreAvg: number | null;
    qwen: { count: number; avg: number };
    openai: { count: number; avg: number };
    buckets: number[];
  };
  errorsByCode: Record<string, number>;
};

export const FIELD_KEYS: (keyof FieldsSummary)[] = ["name", "phone", "street", "city", "state", "zip", "dob"];
export const FIELDS_TOTAL = FIELD_KEYS.length;

export type Scan = {
  id: string;
  batchId: string | null;
  events: ScanRecord[];
  startedAt: string;
  endedAt: string;
  provider: string;
  model: string | null;
  status: ScanStatus;
  totalLatencyMs: number;
  avgLatencyMs: number;
  passes: number;
  okCount: number;
  failCount: number;
  retries: number;
  usedSecondPass: boolean;
  score: number | null;
  fieldsCaptured: number;
  orderIds: number;
  imageBytes: number;
  statusCode: number | null;
  actor: string | null;
};

export const STATUS_META: Record<ScanStatus, { label: string; cls: string; dot: string }> = {
  processed: { label: "Processed", cls: "bg-success/10 text-success border-success/25", dot: "bg-success" },
  failed: {
    label: "Failed",
    cls: "bg-warning/15 text-warning-foreground border-warning/30 dark:text-warning",
    dot: "bg-warning",
  },
  error: { label: "Error", cls: "bg-destructive/10 text-destructive border-destructive/25", dot: "bg-destructive" },
  inprocess: { label: "In process", cls: "bg-info/10 text-info border-info/25", dot: "bg-info" },
};

export function eventStatus(r: ScanRecord): ScanStatus {
  if (r.ok === true) return "processed";
  if ((r.status_code ?? 0) >= 500) return "error";
  return "failed";
}

/** Each ocr_scan_logs record IS one label scan (retry/second-pass are captured
 *  as flags on the same record — not separate rows). So one record = one scan.
 *  The batch_id only correlates a burst; it must NOT collapse distinct labels. */
export function groupScans(records: ScanRecord[]): Scan[] {
  return records
    .map((r, i) => {
      const status = eventStatus(r);
      const lat = r.latency_ms ?? 0;
      const passes = 1 + (r.used_retry ? 1 : 0) + (r.used_second_pass ? 1 : 0);
      const f = r.fields ?? null;
      return {
        id: String(r._id ?? `${r.created_at ?? ""}-${i}`),
        batchId: r.correlation?.batch_id ?? null,
        events: [r],
        startedAt: r.created_at ?? "",
        endedAt: r.created_at ?? "",
        provider: r.provider ?? "—",
        model: r.model ?? null,
        status,
        totalLatencyMs: lat,
        avgLatencyMs: lat,
        passes,
        okCount: r.ok ? 1 : 0,
        failCount: r.ok ? 0 : 1,
        retries: r.used_retry ? 1 : 0,
        usedSecondPass: r.used_second_pass ?? false,
        score: typeof f?.critical_score === "number" ? f.critical_score : null,
        fieldsCaptured: f ? FIELD_KEYS.filter((k) => Boolean(f[k])).length : 0,
        orderIds: typeof f?.order_ids_count === "number" ? f.order_ids_count : 0,
        imageBytes: r.primary_image?.approx_bytes ?? 0,
        statusCode: r.status_code ?? null,
        actor: r.actor ?? null,
      } satisfies Scan;
    })
    .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
}

export const fmtMs = (ms?: number | null) =>
  ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s` : `${Math.round(ms)}ms`;

export const fmtBytes = (b?: number) => {
  if (!b) return "—";
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
};

export const fmtTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

export const fmtDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

export function relTime(iso?: string): string {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** Bucket events into a fixed number of time slots for the trend chart. */
export function bucketByTime(records: ScanRecord[], buckets = 24): {
  label: string;
  scans: number;
  ok: number;
  failed: number;
  latency: number;
}[] {
  if (records.length === 0) return [];
  const times = records.map((r) => new Date(r.created_at ?? 0).getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(max - min, 1);
  const size = span / buckets;
  const slots = Array.from({ length: buckets }, (_, i) => ({
    start: min + i * size,
    scans: 0,
    ok: 0,
    failed: 0,
    latSum: 0,
    latN: 0,
  }));
  for (const r of records) {
    const t = new Date(r.created_at ?? 0).getTime();
    let idx = Math.floor((t - min) / size);
    if (idx >= buckets) idx = buckets - 1;
    if (idx < 0) idx = 0;
    const s = slots[idx];
    s.scans += 1;
    if (r.ok === true) s.ok += 1;
    else s.failed += 1;
    if (r.latency_ms != null) {
      s.latSum += r.latency_ms;
      s.latN += 1;
    }
  }
  return slots.map((s) => ({
    label: new Date(s.start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    scans: s.scans,
    ok: s.ok,
    failed: s.failed,
    latency: s.latN ? Math.round(s.latSum / s.latN) : 0,
  }));
}

export type DayPoint = { date: string; scans: number; ok: number; failed: number; latency: number };

/** Continuous daily series across the selected window — every day is present
 *  (empty days = 0) so the bar chart always shows the full range, shadcn-style.
 *  Day bucketing is pinned to Eastern Time so raw ranges match the ET-anchored
 *  `ocr_scan_daily` rollup. `date` is a noon-UTC anchor of the ET day so the
 *  tickFormatter renders on the right ET calendar day. */
export function dailySeries(records: ScanRecord[], sinceMinutes: number): DayPoint[] {
  const now = new Date();
  const endKey = etDayKey(now);
  const startKey = etDayKey(new Date(now.getTime() - sinceMinutes * 60_000));

  const agg = new Map<string, { scans: number; ok: number; failed: number; latSum: number; latN: number }>();
  for (const r of records) {
    const d = new Date(r.created_at ?? 0);
    if (Number.isNaN(d.getTime())) continue;
    const key = etDayKey(d);
    let slot = agg.get(key);
    if (!slot) {
      slot = { scans: 0, ok: 0, failed: 0, latSum: 0, latN: 0 };
      agg.set(key, slot);
    }
    slot.scans += 1;
    if (r.ok === true) slot.ok += 1;
    else slot.failed += 1;
    if (r.latency_ms != null) {
      slot.latSum += r.latency_ms;
      slot.latN += 1;
    }
  }

  const out: DayPoint[] = [];
  let key = startKey;
  // Guard against pathological ranges (cap at 120 days).
  for (let i = 0; key <= endKey && i < 120; i++) {
    const a = agg.get(key);
    out.push({
      date: `${key}T12:00:00.000Z`,
      scans: a?.scans ?? 0,
      ok: a?.ok ?? 0,
      failed: a?.failed ?? 0,
      latency: a && a.latN ? Math.round(a.latSum / a.latN) : 0,
    });
    key = etAddDays(key, 1);
  }
  return out;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}
