"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Filter,
  MapPin,
  Package,
  RefreshCw,
  ScanLine,
  Search,
  User,
  X,
  ZoomIn,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScanLog {
  _id: string;
  rtscan_id?: number;
  stop_id?: string;
  status: "success" | "error";
  full_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  full_address?: string;
  rx_pharma_id?: string;
  barcode_value?: string;
  client_location?: string;
  type?: string;
  scanned_by?: string;
  source?: string;
  image_url?: string;
  spoke_delivery_id?: string;
  collect_payment?: boolean;
  collect_amount?: number;
  signature_required?: boolean;
  error_message?: string | null;
  created_at?: string;
}

interface Stats {
  today_total: number;
  today_success: number;
  today_error: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, message }: { status: "success" | "error"; message?: string | null }) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-[10px] text-emerald-700">
        <CheckCircle2 className="h-2.5 w-2.5" />
        Created
      </span>
    );
  }
  return (
    <span
      title={message || "Stop creation failed"}
      className="inline-flex cursor-help items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-[10px] text-rose-700"
    >
      <AlertTriangle className="h-2.5 w-2.5" />
      Failed
    </span>
  );
}

// ── Image Preview ─────────────────────────────────────────────────────────────
function ImagePreview({ url, name, rx }: { url: string; name?: string; rx?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="group relative flex h-10 w-10 shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/40 transition-all hover:border-primary/40 hover:shadow-md"
      >
        {/* biome-ignore lint/performance/noImgElement: label thumbnail */}
        <img src={url} alt="Label" className="h-full w-full object-cover transition-transform group-hover:scale-110" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/30">
          <ZoomIn className="h-3 w-3 text-white opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="overflow-hidden rounded-2xl bg-black/95 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="font-semibold text-sm text-white capitalize">{name?.toLowerCase()}</p>
                <p className="font-mono text-[11px] text-white/50">{rx}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="h-7 w-7 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-3">
              {/* biome-ignore lint/performance/noImgElement: fullscreen label */}
              <img src={url} alt="Label" className="w-full rounded-xl" />
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Table Row ─────────────────────────────────────────────────────────────────
function ScanRow({ scan, selected, onClick }: { scan: ScanLog; selected: boolean; onClick: () => void }) {
  return (
    <motion.tr
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={cn(
        "group cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/30",
        selected && "bg-primary/5 hover:bg-primary/5",
      )}
    >
      {/* Status */}
      <td className="py-3 pl-4 pr-2">
        <StatusBadge status={scan.status} message={scan.error_message} />
      </td>

      {/* Image */}
      <td className="px-2 py-3">
        {scan.image_url ? (
          <ImagePreview url={scan.image_url} name={scan.full_name} rx={scan.rx_pharma_id} />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-border/40 bg-muted/20">
            <Camera className="h-3.5 w-3.5 text-muted-foreground/30" />
          </div>
        )}
      </td>

      {/* Recipient */}
      <td className="min-w-[160px] px-2 py-3">
        <p className="font-semibold text-xs capitalize leading-tight">{scan.full_name?.toLowerCase() || "—"}</p>
        <p className="font-mono text-[10px] text-muted-foreground">{scan.rx_pharma_id || "No Rx"}</p>
      </td>

      {/* Address */}
      <td className="max-w-[200px] px-2 py-3">
        <p className="truncate text-[11px] text-muted-foreground">
          <MapPin className="mr-0.5 inline h-2.5 w-2.5 opacity-50" />
          {scan.full_address || [scan.address, scan.city, scan.state].filter(Boolean).join(", ") || "—"}
        </p>
      </td>

      {/* Stop ID */}
      <td className="px-2 py-3">
        {scan.stop_id ? (
          <a
            href={`/dashboard/stops?search=${scan.stop_id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
          >
            {scan.stop_id}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        ) : (
          <span className="text-[10px] text-muted-foreground/50">—</span>
        )}
      </td>

      {/* Location */}
      <td className="px-2 py-3">
        {scan.client_location ? (
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-[10px] text-slate-600">
            {scan.client_location}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Scanned by */}
      <td className="px-2 py-3">
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <User className="h-2.5 w-2.5" />
          {scan.scanned_by || "IVY"}
        </span>
      </td>

      {/* Time */}
      <td className="px-2 py-3 pr-4 text-right">
        <p className="text-[11px] text-muted-foreground">{fmt(scan.created_at)}</p>
      </td>
    </motion.tr>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ scan, onClose }: { scan: ScanLog; onClose: () => void }) {
  return (
    <motion.div
      key={scan._id}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.2 }}
      className="flex h-full flex-col overflow-hidden"
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-start justify-between gap-2 border-b px-4 py-3",
          scan.status === "success" ? "bg-emerald-50/50" : "bg-rose-50/50",
        )}
      >
        <div>
          <div className="mb-1 flex items-center gap-2">
            <StatusBadge status={scan.status} message={scan.error_message} />
            <span className="font-mono text-[10px] text-muted-foreground">#{scan.rtscan_id}</span>
          </div>
          <p className="font-bold text-sm capitalize">{scan.full_name?.toLowerCase() || "Unknown"}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Error box */}
        {scan.status === "error" && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
            <p className="mb-1 font-semibold text-[11px] text-rose-700">Error Details</p>
            <p className="text-[11px] text-rose-600 leading-relaxed">
              {scan.error_message || "Stop was not created — label may be unreadable or API failed."}
            </p>
          </div>
        )}

        {/* Label image */}
        {scan.image_url && (
          <div>
            <p className="mb-1.5 font-bold text-[10px] uppercase tracking-widest text-muted-foreground/60">
              Label Image
            </p>
            <div className="overflow-hidden rounded-xl border">
              {/* biome-ignore lint/performance/noImgElement: label detail */}
              <img src={scan.image_url} alt="Label" className="w-full object-cover" />
            </div>
          </div>
        )}

        <Section title="Patient">
          <Row label="Name" value={scan.full_name} />
          <Row label="Rx #" value={scan.rx_pharma_id} mono />
          <Row label="Barcode" value={scan.barcode_value} mono />
        </Section>

        <Section title="Address">
          <Row
            label="Address"
            value={scan.full_address || [scan.address, scan.city, scan.state, scan.zipcode].filter(Boolean).join(", ")}
          />
          <Row label="Location" value={scan.client_location} />
        </Section>

        <Section title="Stop">
          <Row label="Stop ID" value={scan.stop_id} mono />
          <Row label="Spoke Delivery" value={scan.spoke_delivery_id} mono />
          <Row label="Type" value={scan.type} />
          <Row label="Source" value={scan.source} />
        </Section>

        <Section title="Scan Info">
          <Row label="Scanned by" value={scan.scanned_by} />
          <Row label="Scan ID" value={String(scan.rtscan_id || "")} mono />
          <Row
            label="Time (ET)"
            value={
              scan.created_at
                ? new Date(scan.created_at).toLocaleString("en-US", {
                    timeZone: "America/New_York",
                  })
                : undefined
            }
          />
        </Section>
      </div>

      {/* Footer */}
      {scan.stop_id && (
        <div className="border-t bg-muted/10 px-4 py-3">
          <Button size="sm" variant="outline" className="h-8 w-full text-xs" asChild>
            <a href={`/dashboard/stops?search=${scan.stop_id}`}>
              <ExternalLink className="mr-1.5 h-3 w-3" />
              View Stop {scan.stop_id}
            </a>
          </Button>
        </div>
      )}
    </motion.div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1.5 font-bold text-[10px] uppercase tracking-widest text-muted-foreground/60">{title}</p>
      <div className="divide-y overflow-hidden rounded-xl border bg-muted/20">{children}</div>
    </section>
  );
}

function Row({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("max-w-[180px] truncate text-right text-[11px] font-medium", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-white p-3 shadow-sm transition-shadow hover:shadow-md", color)}>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/40" />
      </div>
      <p className="font-black text-2xl tabular-nums">{value}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ScanLogsPage() {
  const [data, setData] = useState<ScanLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ScanLog | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const LIMIT = 50;

  const fetchData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams({
          tenant_id: "1",
          limit: String(LIMIT),
          page: String(page),
          status,
          ...(search && { search }),
        });
        const res = await fetch(`/api/data/package-scans?${params}`);
        const json = await res.json();

        const shaped: ScanLog[] = (json.list || []).map((d: Record<string, unknown>) => ({
          _id: String(d._id),
          rtscan_id: d.rtscan_id as number,
          stop_id: (d.stop_id as string) || "",
          status: d.stop_id ? "success" : ("error" as const),
          full_name: d.full_name as string,
          address: d.address as string,
          city: d.city as string,
          state: d.state as string,
          zipcode: d.zipcode as string,
          full_address: d.full_address as string,
          rx_pharma_id: d.rx_pharma_id as string,
          barcode_value: d.barcode_value as string,
          client_location: d.client_location as string,
          type: d.type as string,
          scanned_by: d.scanned_by as string,
          source: d.source as string,
          image_url: d.image_url as string,
          spoke_delivery_id: d.spoke_delivery_id as string,
          collect_payment: d.collect_payment as boolean,
          collect_amount: d.collect_amount as number,
          signature_required: d.signature_required as boolean,
          error_message: (d.error_message as string) || null,
          created_at: d.created_at as string,
        }));

        setData(shaped);
        setTotal(json.total ?? shaped.length);
        setPages(json.pages ?? 1);
        if (json.stats) setStats(json.stats);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [page, status, search],
  );

  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      fetchData(false);
    } else {
      fetchData(true);
    }
  }, [fetchData]);

  // Reset page on filter change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset
  useEffect(() => {
    setPage(1);
  }, [status, search]);

  const successCount = useMemo(() => data.filter((s) => s.status === "success").length, [data]);
  const errorCount = useMemo(() => data.filter((s) => s.status === "error").length, [data]);

  const exportCsv = () => {
    const h = ["Status", "Name", "Rx", "Address", "Stop ID", "Location", "Scanned By", "Date (ET)"];
    const rows = data.map((s) => [
      s.status,
      s.full_name,
      s.rx_pharma_id,
      s.full_address,
      s.stop_id,
      s.client_location,
      s.scanned_by,
      s.created_at
        ? new Date(s.created_at).toLocaleString("en-US", {
            timeZone: "America/New_York",
          })
        : "",
    ]);
    const csv = [h, ...rows].map((r) => r.map((c) => `"${c ?? ""}"`).join(",")).join("\n");
    Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `scan-logs-${new Date().toISOString().slice(0, 10)}.csv`,
    }).click();
  };

  return (
    <div
      className={cn(
        "h-[calc(100vh-5rem)] overflow-hidden rounded-xl border bg-background shadow-sm",
        selected ? "grid grid-cols-[1fr_320px]" : "flex flex-col",
      )}
    >
      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col overflow-hidden">
        {/* Header */}
        <div className="space-y-3 border-b bg-muted/10 px-5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-2 font-bold text-sm">
                <ScanLine className="h-4 w-4 text-primary" />
                Scan Logs
              </h1>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                IVY label scan history · success & error tracking
              </p>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                type="button"
                whileTap={{ rotate: 180 }}
                onClick={() => fetchData(true)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </motion.button>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={exportCsv}>
                <Download className="h-3 w-3" />
                Export
              </Button>
            </div>
          </div>

          {/* KPI row */}
          {stats && (
            <div className="grid grid-cols-3 gap-2">
              <KpiCard label="Today Total" value={stats.today_total} icon={ScanLine} color="border-slate-200" />
              <KpiCard
                label="Today Success"
                value={stats.today_success}
                icon={CheckCircle2}
                color="border-emerald-200 bg-emerald-50/30"
              />
              <KpiCard
                label="Today Errors"
                value={stats.today_error}
                icon={AlertTriangle}
                color="border-rose-200 bg-rose-50/30"
              />
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, Rx, address, stop ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 pr-7 text-xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-36 gap-1 text-xs">
                <Filter className="h-3 w-3 shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scans</SelectItem>
                <SelectItem value="success">✅ Success</SelectItem>
                <SelectItem value="error">❌ Errors only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Count pills */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-semibold text-[10px] text-emerald-700">
              <CheckCircle2 className="h-2.5 w-2.5" />
              {successCount} success
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 font-semibold text-[10px] text-rose-700">
              <AlertTriangle className="h-2.5 w-2.5" />
              {errorCount} errors
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">{total.toLocaleString()} total records</span>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: loading skeleton
                <Skeleton key={i} className="h-14 w-full rounded-xl" style={{ opacity: 1 - i * 0.1 }} />
              ))}
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-20 text-muted-foreground">
              <Package className="h-12 w-12 opacity-10" />
              <p className="font-medium text-sm">No scan logs found</p>
              <p className="text-xs opacity-60">Try adjusting your filters or check back after the next scan</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 border-b bg-muted/40 text-left">
                <tr>
                  <th className="py-2 pl-4 pr-2 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">
                    Status
                  </th>
                  <th className="px-2 py-2 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">
                    Label
                  </th>
                  <th className="px-2 py-2 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">
                    Recipient
                  </th>
                  <th className="px-2 py-2 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">
                    Address
                  </th>
                  <th className="px-2 py-2 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">
                    Stop ID
                  </th>
                  <th className="px-2 py-2 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">
                    Location
                  </th>
                  <th className="px-2 py-2 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">
                    By
                  </th>
                  <th className="px-2 py-2 pr-4 text-right font-bold text-[10px] uppercase tracking-widest text-muted-foreground">
                    Time (ET)
                  </th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {data.map((scan) => (
                    <ScanRow
                      key={scan._id}
                      scan={scan}
                      selected={selected?._id === scan._id}
                      onClick={() => setSelected(selected?._id === scan._id ? null : scan)}
                    />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t bg-muted/10 px-4 py-2.5">
            <span className="text-[11px] text-muted-foreground">
              Page {page} of {pages} · {total.toLocaleString()} records
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail Panel ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <div className="overflow-hidden border-l">
            <DetailPanel scan={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
