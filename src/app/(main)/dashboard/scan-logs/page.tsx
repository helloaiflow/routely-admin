"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Image from "next/image";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpDown,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  ExternalLink,
  Filter,
  Loader2,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  ScanLine,
  Search,
  User,
  X,
  ZoomIn,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
type ScanStatus =
  | "SUCCESS"
  | "ERROR"
  | "PROCESSING"
  | "SPOKE_OK"
  | "PENDING"
  | "pending"
  | "success"
  | "error"
  | string;

interface ScanLog {
  _id: string;
  rtscan_id?: number;
  stop_id?: string;
  status: ScanStatus;
  stage?: string;
  full_name?: string;
  phone?: string;
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
  validation_errors?: string[];
  error_stage?: string | null;
  processing_time_ms?: number | null;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
  is_cold?: boolean;
  gate_code?: string;
  route?: string;
  new_client?: boolean;
  package_vip?: boolean;
}

interface Stats {
  today_total: number;
  today_success: number;
  today_error: number;
  today_processing?: number;
}

type SortField = "created_at" | "full_name" | "status" | "client_location" | "scanned_by";
type SortDir = "asc" | "desc";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

function fmtTime(d?: string) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function normalizeStatus(s: ScanStatus): "success" | "error" | "processing" | "pending" {
  const u = String(s).toUpperCase();
  if (u === "SUCCESS") return "success";
  if (u === "ERROR") return "error";
  if (u === "PROCESSING" || u === "SPOKE_OK") return "processing";
  return "pending";
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ScanStatus }) {
  const norm = normalizeStatus(status);

  if (norm === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 font-semibold text-[10px] text-white shadow-emerald-200 shadow-sm">
        <CheckCircle2 className="h-2.5 w-2.5" />
        Success
      </span>
    );
  }
  if (norm === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 font-semibold text-[10px] text-white shadow-red-200 shadow-sm">
        <AlertTriangle className="h-2.5 w-2.5" />
        Error
      </span>
    );
  }
  if (norm === "processing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500 px-2.5 py-1 font-semibold text-[10px] text-white shadow-blue-200 shadow-sm">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        {String(status).toUpperCase() === "SPOKE_OK" ? "Spoke OK" : "Processing"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-400 px-2.5 py-1 font-semibold text-[10px] text-white">
      <Clock className="h-2.5 w-2.5" />
      Pending
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
        {/* biome-ignore lint/performance/noImgElement: telegram CDN, not optimizable by Next */}
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
            <div className="flex items-center justify-between border-white/10 border-b px-4 py-3">
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
              {/* biome-ignore lint/performance/noImgElement: telegram CDN */}
              <img src={url} alt="Label" className="w-full rounded-xl" />
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Sort Header ───────────────────────────────────────────────────────────────
function SortHeader({
  field,
  label,
  current,
  dir,
  onSort,
  className,
}: {
  field: SortField;
  label: string;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const active = current === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={cn(
        "cursor-pointer select-none py-2 font-bold text-[10px] text-muted-foreground uppercase tracking-widest transition-colors hover:text-foreground",
        active && "text-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-1">
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="h-2.5 w-2.5" />
          ) : (
            <ChevronDown className="h-2.5 w-2.5" />
          )
        ) : (
          <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />
        )}
      </div>
    </th>
  );
}

// ── Desktop Table Row ─────────────────────────────────────────────────────────
function ScanRow({ scan, selected, onClick }: { scan: ScanLog; selected: boolean; onClick: () => void }) {
  return (
    <motion.tr
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={cn(
        "group cursor-pointer border-border/40 border-b transition-colors hover:bg-muted/25",
        selected && "bg-primary/5 hover:bg-primary/5",
      )}
    >
      {/* Status — fixed width */}
      <td className="w-[100px] py-3 pr-2 pl-4">
        <StatusBadge status={scan.status} />
      </td>

      {/* Label thumbnail — fixed width */}
      <td className="w-12 px-1 py-3">
        {scan.image_url ? (
          <ImagePreview url={scan.image_url} name={scan.full_name} rx={scan.rx_pharma_id} />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/40 border-dashed bg-muted/20">
            <Camera className="h-3.5 w-3.5 text-muted-foreground/30" />
          </div>
        )}
      </td>

      {/* Recipient — name + rx + phone */}
      <td className="min-w-[160px] max-w-[200px] px-3 py-3">
        <p className="truncate font-semibold text-xs capitalize leading-tight">
          {scan.full_name?.toLowerCase() || "—"}
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">{scan.rx_pharma_id || "No Rx"}</p>
        {scan.phone && (
          <p className="mt-0.5 flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
            <Phone className="h-2 w-2" />
            {scan.phone}
          </p>
        )}
      </td>

      {/* Address — street only */}
      <td className="max-w-[160px] px-3 py-3">
        <p className="truncate text-[11px] text-muted-foreground">
          {scan.address || scan.full_address?.split(",")[0] || "—"}
        </p>
        {(scan.city || scan.state) && (
          <p className="text-[10px] text-muted-foreground/50">{[scan.city, scan.state].filter(Boolean).join(", ")}</p>
        )}
      </td>

      {/* Location badge */}
      <td className="w-[90px] px-3 py-3">
        {scan.client_location ? (
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {scan.client_location}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/30">—</span>
        )}
      </td>

      {/* Stop ID — compact */}
      <td className="w-[100px] px-3 py-3">
        {scan.stop_id ? (
          <a
            href={`/dashboard/stops?search=${scan.stop_id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
          >
            {scan.stop_id.slice(0, 8)}…
            <ExternalLink className="h-2 w-2" />
          </a>
        ) : (
          <span className="text-[10px] text-muted-foreground/30">—</span>
        )}
      </td>

      {/* Scanned by */}
      <td className="w-[90px] px-3 py-3">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <User className="h-2.5 w-2.5 shrink-0 opacity-50" />
          {scan.scanned_by?.split(" ")[0] || "IVY"}
        </span>
      </td>

      {/* Date/time — right aligned */}
      <td className="w-[110px] px-3 py-3 pr-4 text-right">
        <p className="font-medium text-[11px] tabular-nums">{fmtDate(scan.created_at || scan.started_at)}</p>
        <p className="text-[10px] text-muted-foreground tabular-nums">{fmtTime(scan.created_at || scan.started_at)}</p>
      </td>
    </motion.tr>
  );
}

// ── Mobile Card ───────────────────────────────────────────────────────────────
function MobileCard({ scan, onClick }: { scan: ScanLog; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="flex w-full cursor-pointer items-start gap-3 border-border/30 border-b px-4 py-3 text-left transition-colors active:bg-muted/40"
    >
      {/* Label thumbnail */}
      <div className="shrink-0 pt-0.5">
        {scan.image_url ? (
          <ImagePreview url={scan.image_url} name={scan.full_name} rx={scan.rx_pharma_id} />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/40 border-dashed bg-muted/20">
            <Camera className="h-3.5 w-3.5 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Status + time */}
        <div className="mb-1 flex items-center justify-between gap-2">
          <StatusBadge status={scan.status} />
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {fmtTime(scan.created_at || scan.started_at)}
          </span>
        </div>

        {/* Name */}
        <p className="truncate font-semibold text-sm capitalize leading-tight">
          {scan.full_name?.toLowerCase() || "Unknown Patient"}
        </p>

        {/* Phone + Location */}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {scan.phone && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <Phone className="h-2.5 w-2.5" />
              {scan.phone}
            </span>
          )}
          {scan.client_location && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <MapPin className="h-2.5 w-2.5" />
              {scan.client_location}
            </span>
          )}
          {scan.rx_pharma_id && (
            <span className="font-mono text-[10px] text-muted-foreground/60">{scan.rx_pharma_id}</span>
          )}
        </div>

        {/* Error stage */}
        {normalizeStatus(scan.status) === "error" && scan.error_stage && (
          <p className="mt-1 truncate text-[10px] text-red-500">⚠ {scan.error_stage.replace(/_/g, " ")}</p>
        )}
      </div>

      <ChevronRight className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
    </motion.button>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ scan, onClose }: { scan: ScanLog; onClose: () => void }) {
  const norm = normalizeStatus(scan.status);
  return (
    <motion.div
      key={scan._id}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.18 }}
      className="flex h-full flex-col overflow-hidden"
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-start justify-between gap-2 border-b px-4 py-3",
          norm === "success" && "bg-emerald-50/60 dark:bg-emerald-950/20",
          norm === "error" && "bg-red-50/60 dark:bg-red-950/20",
          (norm === "processing" || norm === "pending") && "bg-blue-50/40 dark:bg-blue-950/10",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <StatusBadge status={scan.status} />
            <span className="font-mono text-[10px] text-muted-foreground">#{scan.rtscan_id}</span>
          </div>
          <p className="truncate font-bold text-sm capitalize">{scan.full_name?.toLowerCase() || "Unknown"}</p>
          {scan.phone && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Phone className="h-2.5 w-2.5" />
              {scan.phone}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {norm === "error" && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
            <p className="mb-1 flex items-center gap-1 font-semibold text-[11px] text-red-700 dark:text-red-400">
              <AlertTriangle className="h-3 w-3" /> Error Details
            </p>
            <p className="text-[11px] text-red-600 leading-relaxed dark:text-red-400">
              {scan.error_message || scan.error_stage || "Stop was not created."}
            </p>
            {scan.validation_errors && scan.validation_errors.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {scan.validation_errors.map((e, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static list
                  <li key={i} className="text-[11px] text-red-600 dark:text-red-400">
                    • {e}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {scan.image_url && (
          <div>
            <p className="mb-1.5 font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
              Label Image
            </p>
            <div className="overflow-hidden rounded-xl border">
              {/* biome-ignore lint/performance/noImgElement: telegram CDN */}
              <img src={scan.image_url} alt="Label" className="w-full object-cover" />
            </div>
          </div>
        )}

        <Section title="Patient">
          <Row label="Name" value={scan.full_name} />
          <Row label="Phone" value={scan.phone} />
          <Row label="Rx #" value={scan.rx_pharma_id} mono />
          <Row label="Barcode" value={scan.barcode_value} mono />
        </Section>

        <Section title="Address">
          <Row
            label="Address"
            value={scan.full_address || [scan.address, scan.city, scan.state, scan.zipcode].filter(Boolean).join(", ")}
          />
          <Row label="Location" value={scan.client_location} />
          <Row label="Route" value={scan.route} />
          <Row label="Gate Code" value={scan.gate_code} />
        </Section>

        <Section title="Stop">
          <Row label="Stop ID" value={scan.stop_id} mono />
          <Row label="Spoke Delivery" value={scan.spoke_delivery_id} mono />
          <Row label="Type" value={scan.type} />
          <Row label="Cold Chain" value={scan.is_cold ? "Yes ❄️" : undefined} />
          <Row label="VIP" value={scan.package_vip ? "Yes ⭐" : undefined} />
          <Row label="New Client" value={scan.new_client ? "Yes" : undefined} />
        </Section>

        <Section title="Scan Info">
          <Row label="Scanned by" value={scan.scanned_by} />
          <Row label="Scan ID" value={String(scan.rtscan_id || "")} mono />
          <Row label="Stage" value={scan.stage?.replace(/_/g, " ")} />
          <Row
            label="Processing"
            value={scan.processing_time_ms ? `${(scan.processing_time_ms / 1000).toFixed(1)}s` : undefined}
          />
          <Row
            label="Started (ET)"
            value={
              scan.started_at
                ? new Date(scan.started_at).toLocaleString("en-US", { timeZone: "America/New_York" })
                : undefined
            }
          />
          <Row
            label="Completed (ET)"
            value={
              scan.completed_at
                ? new Date(scan.completed_at).toLocaleString("en-US", { timeZone: "America/New_York" })
                : undefined
            }
          />
        </Section>
      </div>

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
      <p className="mb-1.5 font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">{title}</p>
      <div className="divide-y overflow-hidden rounded-xl border bg-muted/20">{children}</div>
    </section>
  );
}

function Row({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("max-w-[180px] truncate text-right font-medium text-[11px]", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  onClick,
  active,
}: {
  label: string;
  value: number | string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  accent: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1 rounded-xl border p-3 text-left transition-all hover:shadow-sm",
        active ? "ring-2 ring-current/20 border-current" : "border-border/60",
        accent,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="font-medium text-[10px] uppercase tracking-wider opacity-70">{label}</p>
        <Icon className="h-3.5 w-3.5 opacity-50" />
      </div>
      <p className="font-black text-2xl tabular-nums leading-none">{value}</p>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ScanLogsPage() {
  const [data, setData] = useState<ScanLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ScanLog | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const LIMIT = 50;

  const fetchData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams({
          tenant_id: "1",
          limit: String(LIMIT),
          page: String(page),
          ...(statusFilter !== "all" && { status: statusFilter }),
          ...(search && { search }),
        });
        const res = await fetch(`/api/data/package-scans?${params}`);
        const json = await res.json();

        const shaped: ScanLog[] = (json.list || []).map((d: Record<string, unknown>) => ({
          _id: String(d._id),
          rtscan_id: d.rtscan_id as number,
          stop_id: (d.stop_id as string) || "",
          status: (d.status as string) || "pending",
          stage: d.stage as string,
          full_name: d.full_name as string,
          phone: d.phone as string,
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
          validation_errors: d.validation_errors as string[],
          error_stage: d.error_stage as string,
          processing_time_ms: d.processing_time_ms as number,
          started_at: d.started_at as string,
          completed_at: d.completed_at as string,
          created_at: d.created_at as string,
          updated_at: d.updated_at as string,
          is_cold: d.is_cold as boolean,
          gate_code: d.gate_code as string,
          route: d.route as string,
          new_client: d.new_client as boolean,
          package_vip: d.package_vip as boolean,
        }));

        setData(shaped);
        setTotal(json.total ?? shaped.length);
        setPages(json.pages ?? 1);
        if (json.stats) {
          setStats(json.stats);
        } else {
          const succ = shaped.filter((s) => normalizeStatus(s.status) === "success").length;
          const err = shaped.filter((s) => normalizeStatus(s.status) === "error").length;
          const proc = shaped.filter(
            (s) => normalizeStatus(s.status) === "processing" || normalizeStatus(s.status) === "pending",
          ).length;
          setStats({ today_total: shaped.length, today_success: succ, today_error: err, today_processing: proc });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [page, statusFilter, search],
  );

  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      fetchData(false);
    } else fetchData(true);
  }, [fetchData]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  // Client-side sort
  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortField === "created_at") {
        av = new Date(a.created_at || a.started_at || "").getTime();
        bv = new Date(b.created_at || b.started_at || "").getTime();
      } else if (sortField === "full_name") {
        av = a.full_name?.toLowerCase() || "";
        bv = b.full_name?.toLowerCase() || "";
      } else if (sortField === "status") {
        av = normalizeStatus(a.status);
        bv = normalizeStatus(b.status);
      } else if (sortField === "client_location") {
        av = a.client_location || "";
        bv = b.client_location || "";
      } else if (sortField === "scanned_by") {
        av = a.scanned_by || "";
        bv = b.scanned_by || "";
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortField, sortDir]);

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(f);
      setSortDir(f === "created_at" ? "desc" : "asc");
    }
  };

  const counts = useMemo(
    () => ({
      processing: data.filter(
        (s) => normalizeStatus(s.status) === "processing" || normalizeStatus(s.status) === "pending",
      ).length,
    }),
    [data],
  );

  const exportCsv = () => {
    const h = ["Status", "Stage", "Name", "Phone", "Rx", "Address", "Stop ID", "Location", "Scanned By", "Date (ET)"];
    const rows = sorted.map((s) => [
      s.status,
      s.stage,
      s.full_name,
      s.phone,
      s.rx_pharma_id,
      s.full_address,
      s.stop_id,
      s.client_location,
      s.scanned_by,
      s.created_at ? new Date(s.created_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "",
    ]);
    const csv = [h, ...rows].map((r) => r.map((c) => `"${c ?? ""}"`).join(",")).join("\n");
    Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `scan-logs-${new Date().toISOString().slice(0, 10)}.csv`,
    }).click();
  };

  const showPanel = !!selected;

  return (
    <div
      className={cn(
        "flex h-[calc(100vh-4.5rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-sm",
        "md:flex-row",
      )}
    >
      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className={cn("flex min-w-0 flex-1 flex-col overflow-hidden", showPanel && "hidden md:flex")}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="space-y-3 border-b bg-muted/10 px-4 py-3">
          {/* Title */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-2 font-bold text-sm">
                <ScanLine className="h-4 w-4 text-primary" />
                Scan Logs
              </h1>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                IVY label scan history — {total.toLocaleString()} records
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => fetchData(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </button>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={exportCsv}>
                <Download className="h-3 w-3" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </div>
          </div>

          {/* ── Stat Cards ─────────────────────────────────────────────── */}
          {stats && (
            <div className="grid grid-cols-4 gap-2">
              <StatCard
                label="Total"
                value={stats.today_total}
                icon={ScanLine}
                accent="text-slate-700 bg-slate-50 dark:bg-slate-900"
                onClick={() => setStatusFilter("all")}
                active={statusFilter === "all"}
              />
              <StatCard
                label="Success"
                value={stats.today_success}
                icon={CheckCircle2}
                accent="text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30"
                onClick={() => setStatusFilter("SUCCESS")}
                active={statusFilter === "SUCCESS"}
              />
              <StatCard
                label="Errors"
                value={stats.today_error}
                icon={AlertTriangle}
                accent="text-red-700 bg-red-50 dark:bg-red-950/30"
                onClick={() => setStatusFilter("ERROR")}
                active={statusFilter === "ERROR"}
              />
              <StatCard
                label="In Progress"
                value={stats.today_processing ?? counts.processing}
                icon={Loader2}
                accent="text-blue-700 bg-blue-50 dark:bg-blue-950/30"
                onClick={() => setStatusFilter("PROCESSING")}
                active={statusFilter === "PROCESSING"}
              />
            </div>
          )}

          {/* Search + filter */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Name, Rx, address, stop ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pr-7 pl-8 text-xs"
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[130px] gap-1 text-xs sm:w-40">
                <Filter className="h-3 w-3 shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="SUCCESS">✅ Success</SelectItem>
                <SelectItem value="ERROR">❌ Error</SelectItem>
                <SelectItem value="PROCESSING">🔵 Processing</SelectItem>
                <SelectItem value="SPOKE_OK">🔵 Spoke OK</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Content ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                <Skeleton key={i} className="h-14 w-full rounded-xl" style={{ opacity: 1 - i * 0.1 }} />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-20 text-muted-foreground">
              <Package className="h-12 w-12 opacity-10" />
              <p className="font-medium text-sm">No scan logs found</p>
              <p className="text-xs opacity-60">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <table className="hidden w-full text-sm md:table">
                <thead className="sticky top-0 z-10 border-b bg-muted/30 text-left">
                  <tr>
                    <SortHeader
                      field="status"
                      label="Status"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      className="w-[100px] pr-2 pl-4"
                    />
                    <th className="w-12 px-1 py-2.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
                      Label
                    </th>
                    <SortHeader
                      field="full_name"
                      label="Recipient"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      className="px-3"
                    />
                    <th className="px-3 py-2.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
                      Address
                    </th>
                    <SortHeader
                      field="client_location"
                      label="Location"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      className="w-[90px] px-3"
                    />
                    <th className="w-[100px] px-3 py-2.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
                      Stop ID
                    </th>
                    <SortHeader
                      field="scanned_by"
                      label="By"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      className="w-[90px] px-3"
                    />
                    <SortHeader
                      field="created_at"
                      label="Date/Time"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      className="w-[110px] px-3 pr-4 text-right"
                    />
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {sorted.map((scan) => (
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

              {/* Mobile cards */}
              <div className="divide-y md:hidden">
                <AnimatePresence>
                  {sorted.map((scan) => (
                    <MobileCard key={scan._id} scan={scan} onClick={() => setSelected(scan)} />
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t bg-muted/10 px-4 py-2">
            <span className="text-[11px] text-muted-foreground">
              Page {page}/{pages} · {total.toLocaleString()} records
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
          <div
            className={cn(
              "overflow-hidden border-l",
              "fixed inset-0 z-50 bg-background md:relative md:inset-auto md:z-auto md:w-[320px] md:shrink-0",
            )}
          >
            <DetailPanel scan={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
