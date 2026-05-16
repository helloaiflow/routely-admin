"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  RotateCcw,
  ScanLine,
  Search,
  User,
  X,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
type SortField = "created_at" | "full_name" | "status" | "client_location" | "scanned_by" | "route";
type SortDir = "asc" | "desc";
type DatePreset = "all" | "today" | "yesterday" | "7d" | "30d" | "custom";

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
  route?: string;
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
  new_client?: boolean;
  package_vip?: boolean;
  tenant_id?: number;
}

interface Tenant {
  tenant_id: number;
  company_name?: string;
}

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
  return new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" });
}
function normalizeStatus(s: ScanStatus): "success" | "error" | "processing" {
  const u = String(s).toUpperCase();
  if (u === "SUCCESS" || u === "SPOKE_OK") return "success"; // SPOKE_OK = stop ya creado = success
  if (u === "ERROR") return "error";
  return "processing"; // solo PROCESSING real
}
function buildMapsUrl(scan: ScanLog) {
  const parts = [scan.address, scan.city, scan.state, scan.zipcode].filter(Boolean).join(" ");
  if (!parts.trim()) return "";
  return `https://maps.google.com/?q=${encodeURIComponent(parts)}`;
}
function getDateRange(preset: DatePreset, start?: string, end?: string): { from?: Date; to?: Date } {
  const now = new Date();
  const sod = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  };
  if (preset === "today") return { from: sod(now), to: now };
  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: sod(y), to: new Date(y.setHours(23, 59, 59, 999)) };
  }
  if (preset === "7d") {
    const f = new Date(now);
    f.setDate(f.getDate() - 7);
    return { from: f, to: now };
  }
  if (preset === "30d") {
    const f = new Date(now);
    f.setDate(f.getDate() - 30);
    return { from: f, to: now };
  }
  if (preset === "custom" && start) return { from: new Date(start), to: end ? new Date(`${end}T23:59:59`) : now };
  return {};
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ScanStatus }) {
  const norm = normalizeStatus(status);
  if (norm === "success")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 font-semibold text-[10px] text-white shadow-emerald-200 shadow-sm">
        <CheckCircle2 className="h-2.5 w-2.5" /> Success
      </span>
    );
  if (norm === "error")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 font-semibold text-[10px] text-white shadow-red-200 shadow-sm">
        <AlertTriangle className="h-2.5 w-2.5" /> Error
      </span>
    );
  // processing — solo scans realmente en vuelo
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500 px-2.5 py-1 font-semibold text-[10px] text-white shadow-blue-200 shadow-sm">
      <Clock className="h-2.5 w-2.5" /> Processing
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
        {/* biome-ignore lint/performance/noImgElement: telegram CDN */}
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
        "cursor-pointer select-none py-2.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-widest transition-colors hover:text-foreground",
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
// Column order: Status | Label | Recipient | Address | Route | Tenant | Location | Stop ID | By | Date
function ScanRow({
  scan,
  selected,
  onClick,
  tenantName,
}: {
  scan: ScanLog;
  selected: boolean;
  onClick: () => void;
  tenantName?: string;
}) {
  return (
    <motion.tr
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={cn(
        "cursor-pointer border-border/40 border-b transition-colors hover:bg-muted/25",
        selected && "bg-primary/5 hover:bg-primary/5",
      )}
    >
      <td className="py-3 pl-4 pr-2">
        <StatusBadge status={scan.status} />
      </td>

      <td className="w-12 px-1 py-3">
        {scan.image_url ? (
          <ImagePreview url={scan.image_url} name={scan.full_name} rx={scan.rx_pharma_id} />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/40 border-dashed bg-muted/20">
            <Camera className="h-3.5 w-3.5 text-muted-foreground/30" />
          </div>
        )}
      </td>

      <td className="px-3 py-3">
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

      <td className="px-3 py-3">
        <p className="truncate text-[11px] leading-tight">{scan.address || "—"}</p>
        {(scan.city || scan.state) && (
          <p className="text-[10px] text-muted-foreground/60">{[scan.city, scan.state].filter(Boolean).join(", ")}</p>
        )}
      </td>

      {/* Route */}
      <td className="px-3 py-3">
        {scan.route ? (
          <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-medium text-[10px] text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            {scan.route}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/30">—</span>
        )}
      </td>

      {/* Tenant — right of Route */}
      {tenantName !== undefined && (
        <td className="px-3 py-3">
          <span className="truncate text-[11px] text-muted-foreground">{tenantName || `T${scan.tenant_id}`}</span>
        </td>
      )}

      {/* Location */}
      <td className="px-3 py-3">
        {scan.client_location ? (
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {scan.client_location}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/30">—</span>
        )}
      </td>

      <td className="px-3 py-3">
        {scan.stop_id ? (
          <a
            href={`/dashboard/stops?search=${scan.stop_id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
          >
            {scan.stop_id.slice(0, 8)}…<ExternalLink className="h-2 w-2" />
          </a>
        ) : (
          <span className="text-[10px] text-muted-foreground/30">—</span>
        )}
      </td>

      <td className="px-3 py-3">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <User className="h-2.5 w-2.5 shrink-0 opacity-50" />
          {scan.scanned_by?.split(" ")[0] || "IVY"}
        </span>
      </td>

      <td className="py-3 pl-3 pr-4 text-right">
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
      <div className="shrink-0 pt-0.5">
        {scan.image_url ? (
          <ImagePreview url={scan.image_url} name={scan.full_name} rx={scan.rx_pharma_id} />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/40 border-dashed bg-muted/20">
            <Camera className="h-3.5 w-3.5 text-muted-foreground/30" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2">
          <StatusBadge status={scan.status} />
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {fmtTime(scan.created_at || scan.started_at)}
          </span>
        </div>
        <p className="truncate font-semibold text-sm capitalize leading-tight">
          {scan.full_name?.toLowerCase() || "Unknown"}
        </p>
        {scan.address && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {scan.address}
            {scan.city ? `, ${scan.city}` : ""}
            {scan.state ? ` ${scan.state}` : ""}
          </p>
        )}
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
          {scan.route && (
            <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400">{scan.route}</span>
          )}
        </div>
        {normalizeStatus(scan.status) === "error" && scan.error_stage && (
          <p className="mt-1 truncate text-[10px] text-red-500">⚠ {scan.error_stage.replace(/_/g, " ")}</p>
        )}
      </div>
      <ChevronRight className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
    </motion.button>
  );
}

// ── Repost Confirm ────────────────────────────────────────────────────────────
function RepostDialog({
  open,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Repost this scan?</AlertDialogTitle>
          <AlertDialogDescription>
            This image already has a successful stop match. Reposting may create duplicate processing or update the
            existing stop. Are you sure you want to continue?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={loading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Proceed
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ scan, onClose }: { scan: ScanLog; onClose: () => void }) {
  const norm = normalizeStatus(scan.status);
  const [repostLoading, setRepostLoading] = useState(false);
  const [showWarn, setShowWarn] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mapsUrl = buildMapsUrl(scan);

  const executeRepost = async () => {
    setRepostLoading(true);
    try {
      const res = await fetch("/api/scans/repost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtscan_id: scan.rtscan_id }),
      });
      const data = await res.json();
      if (res.ok && data.success)
        toast.success("Repost submitted", { description: `New scan ID: ${data.new_rtscan_id}` });
      else toast.error("Repost failed", { description: data.error ?? "Unknown error" });
    } catch {
      toast.error("Repost failed", { description: "Network error" });
    } finally {
      setRepostLoading(false);
      setShowWarn(false);
    }
  };

  const handleCamera = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = (reader.result as string).split(",")[1];
        const res = await fetch("/api/scans/repost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rtscan_id: scan.rtscan_id,
            image_override_base64: base64,
            image_override_media_type: file.type,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success)
          toast.success("Photo repost submitted", { description: `Scan ID: ${data.new_rtscan_id}` });
        else toast.error("Photo repost failed", { description: data.error ?? "Unknown error" });
      } catch {
        toast.error("Photo repost failed");
      } finally {
        setCameraLoading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <TooltipProvider>
      <motion.div
        key={scan._id}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 24 }}
        transition={{ duration: 0.18 }}
        className="flex h-full flex-col overflow-hidden"
      >
        <div
          className={cn(
            "flex items-start justify-between gap-2 border-b px-4 py-3",
            norm === "success" && "bg-emerald-50/60 dark:bg-emerald-950/20",
            norm === "error" && "bg-red-50/60 dark:bg-red-950/20",
            norm === "processing" && "bg-blue-50/40 dark:bg-blue-950/10",
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

        {scan.image_url && (
          <div className="mx-4 mt-3 overflow-hidden rounded-xl border">
            {/* biome-ignore lint/performance/noImgElement: telegram CDN */}
            <img src={scan.image_url} alt="Label" className="max-h-48 w-full object-contain bg-black/5" />
          </div>
        )}

        <div className="space-y-2 border-b px-4 py-3">
          <Button
            className="w-full gap-2"
            size="sm"
            onClick={() => (norm === "success" ? setShowWarn(true) : executeRepost())}
            disabled={repostLoading || !scan.rtscan_id}
          >
            {repostLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Repost
          </Button>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={!mapsUrl}
                  onClick={() => mapsUrl && window.open(mapsUrl, "_blank")}
                >
                  <MapPin className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{mapsUrl ? "Open in Google Maps" : "No address available"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={norm !== "success" || !scan.stop_id}
                  onClick={() => scan.stop_id && window.open(`/dashboard/stops?search=${scan.stop_id}`, "_blank")}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {norm !== "success" ? "Only for successful stops" : !scan.stop_id ? "No stop ID" : "View stop"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={cameraLoading}
                  onClick={() => fileRef.current?.click()}
                >
                  {cameraLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Upload new image and repost</TooltipContent>
            </Tooltip>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleCamera} />
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {norm === "error" && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
              <p className="mb-1 flex items-center gap-1 font-semibold text-[11px] text-red-700 dark:text-red-400">
                <AlertTriangle className="h-3 w-3" /> Error details
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
          <Section title="Patient">
            <Row label="Name" value={scan.full_name} />
            <Row label="Phone" value={scan.phone} />
            <Row label="Rx #" value={scan.rx_pharma_id} mono />
            <Row label="Barcode" value={scan.barcode_value} mono />
          </Section>
          <Section title="Address">
            <Row label="Street" value={scan.address} />
            <Row label="City / State" value={[scan.city, scan.state].filter(Boolean).join(", ")} />
            <Row label="ZIP" value={scan.zipcode} />
            <Row label="Location" value={scan.client_location} />
            <Row label="Route" value={scan.route} />
            <Row label="Gate code" value={scan.gate_code} />
          </Section>
          <Section title="Stop">
            <Row label="Stop ID" value={scan.stop_id} mono />
            <Row label="Spoke delivery" value={scan.spoke_delivery_id} mono />
            <Row label="Type" value={scan.type} />
            <Row label="Cold chain" value={scan.is_cold ? "Yes ❄️" : undefined} />
            <Row label="VIP" value={scan.package_vip ? "Yes ⭐" : undefined} />
            <Row label="New client" value={scan.new_client ? "Yes" : undefined} />
          </Section>
          <Section title="Scan info">
            <Row label="Scanned by" value={scan.scanned_by} />
            <Row label="Scan ID" value={String(scan.rtscan_id || "")} mono />
            <Row label="Stage" value={scan.stage?.replace(/_/g, " ")} />
            <Row
              label="Processing time"
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
                View stop {scan.stop_id}
              </a>
            </Button>
          </div>
        )}
        <RepostDialog
          open={showWarn}
          onConfirm={executeRepost}
          onCancel={() => setShowWarn(false)}
          loading={repostLoading}
        />
      </motion.div>
    </TooltipProvider>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1.5 font-semibold text-[10px] text-muted-foreground/60 uppercase tracking-widest">{title}</p>
      <div className="divide-y overflow-hidden rounded-xl border bg-card">{children}</div>
    </section>
  );
}

function Row({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span
        className={cn("max-w-[180px] truncate text-right font-medium text-[11px]", mono && "font-mono text-[10px]")}
      >
        {value}
      </span>
    </div>
  );
}

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
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ScanLog | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("today"); // default: today
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
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
          limit: String(LIMIT),
          page: String(page),
          ...(tenantFilter !== "all" && { tenant_id: tenantFilter }),
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
          route: d.route as string,
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
          new_client: d.new_client as boolean,
          package_vip: d.package_vip as boolean,
          tenant_id: d.tenant_id as number,
        }));
        setData(shaped);
        setTotal(json.total ?? shaped.length);
        setPages(json.pages ?? 1);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [page, statusFilter, search, tenantFilter],
  );

  const fetchTenants = useCallback(async () => {
    try {
      const res = await fetch("/api/tenants");
      if (res.ok) {
        const json = await res.json();
        setTenants(json.list ?? []);
      }
    } catch {
      /* silent */
    }
  }, []);

  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      fetchData(false);
      fetchTenants();
    } else fetchData(true);
  }, [fetchData, fetchTenants]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, tenantFilter, datePreset, dateStart, dateEnd]);

  const tenantMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of tenants) m.set(t.tenant_id, t.company_name || `Tenant ${t.tenant_id}`);
    return m;
  }, [tenants]);

  // Tenant siempre visible si hay datos de tenants
  const showTenantCol = tenants.length > 0;

  // Client-side date filter + sort
  const sorted = useMemo(() => {
    const { from, to } = getDateRange(datePreset, dateStart, dateEnd);
    const base = from
      ? data.filter((s) => {
          const d = new Date(s.created_at || s.started_at || "");
          return d >= from && (!to || d <= to);
        })
      : data;
    return [...base].sort((a, b) => {
      let av: string | number = "",
        bv: string | number = "";
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
      } else if (sortField === "route") {
        av = a.route || "";
        bv = b.route || "";
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortField, sortDir, datePreset, dateStart, dateEnd]);

  // Stats basadas en el grid filtrado y ordenado
  const stats = useMemo(
    () => ({
      total: sorted.length,
      success: sorted.filter((s) => normalizeStatus(s.status) === "success").length,
      error: sorted.filter((s) => normalizeStatus(s.status) === "error").length,
      processing: sorted.filter((s) => normalizeStatus(s.status) === "processing").length,
    }),
    [sorted],
  );

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(f);
      setSortDir(f === "created_at" ? "desc" : "asc");
    }
  };

  const exportCsv = () => {
    const h = [
      "Status",
      "Stage",
      "Name",
      "Phone",
      "Rx",
      "Address",
      "Route",
      "Tenant",
      "Location",
      "Stop ID",
      "Scanned By",
      "Date (ET)",
    ];
    const rows = sorted.map((s) => [
      s.status,
      s.stage,
      s.full_name,
      s.phone,
      s.rx_pharma_id,
      s.address,
      s.route,
      tenantMap.get(s.tenant_id ?? 0) ?? "",
      s.client_location,
      s.stop_id,
      s.scanned_by,
      s.created_at ? new Date(s.created_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "",
    ]);
    const csv = [h, ...rows].map((r) => r.map((c) => `"${c ?? ""}"`).join(",")).join("\n");
    Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `scan-logs-${new Date().toISOString().slice(0, 10)}.csv`,
    }).click();
  };

  const hasDateFilter = datePreset !== "all";
  const showPanel = !!selected;

  return (
    <div
      className={cn(
        "flex h-[calc(100vh-4.5rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-sm",
        "md:flex-row",
      )}
    >
      <div className={cn("flex min-w-0 flex-1 flex-col overflow-hidden", showPanel && "hidden md:flex")}>
        {/* Header */}
        <div className="space-y-3 border-b bg-background px-4 py-3">
          {/* Title */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-2 font-bold text-sm">
                <ScanLine className="h-4 w-4 text-primary" />
                Scan logs
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

          {/* Stat Cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard
              label="Total"
              value={stats.total}
              icon={ScanLine}
              accent="bg-card text-slate-700 dark:text-slate-300 border-border"
              onClick={() => setStatusFilter("all")}
              active={statusFilter === "all"}
            />
            <StatCard
              label="Success"
              value={stats.success}
              icon={CheckCircle2}
              accent="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
              onClick={() => setStatusFilter("success")}
              active={statusFilter === "success"}
            />
            <StatCard
              label="Errors"
              value={stats.error}
              icon={AlertTriangle}
              accent="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800"
              onClick={() => setStatusFilter("error")}
              active={statusFilter === "error"}
            />
            <StatCard
              label="Processing"
              value={stats.processing}
              icon={Clock}
              accent="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800"
              onClick={() => setStatusFilter("processing")}
              active={statusFilter === "processing"}
            />
          </div>

          {/* All filters — single compact row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Search — compact fixed width */}
            <div className="relative w-44 shrink-0">
              <Search className="absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pr-7 pl-7 text-xs"
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

            {/* Status */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[118px] gap-1 text-xs">
                <Filter className="h-3 w-3 shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="success">✅ Success</SelectItem>
                <SelectItem value="error">❌ Error</SelectItem>
                <SelectItem value="processing">🔵 Processing</SelectItem>
                <SelectItem value="spoke_ok">🔵 Spoke OK</SelectItem>
              </SelectContent>
            </Select>

            {/* Tenant */}
            {tenants.length > 0 && (
              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger className="h-8 w-[118px] text-xs">
                  <SelectValue placeholder="All tenants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tenants</SelectItem>
                  {tenants.map((t) => (
                    <SelectItem key={t.tenant_id} value={String(t.tenant_id)}>
                      {t.company_name || `T${t.tenant_id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Date preset */}
            <Select
              value={datePreset}
              onValueChange={(v) => {
                setDatePreset(v as DatePreset);
                if (v !== "custom") {
                  setDateStart("");
                  setDateEnd("");
                }
              }}
            >
              <SelectTrigger className="h-8 w-[118px] text-xs">
                <SelectValue placeholder="All dates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dates</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
            </Select>

            {/* Custom date range */}
            {datePreset === "custom" && (
              <>
                <Input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="h-8 w-[122px] text-xs"
                />
                <span className="text-[11px] text-muted-foreground">–</span>
                <Input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="h-8 w-[122px] text-xs"
                />
              </>
            )}

            {/* Clear */}
            {(tenantFilter !== "all" || hasDateFilter || search) && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setTenantFilter("all");
                  setDatePreset("all");
                  setDateStart("");
                  setDateEnd("");
                }}
                className="flex h-8 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-2.5 w-2.5" /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Content */}
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
                <colgroup>
                  <col className="w-[110px]" />
                  {/* Status */}
                  <col className="w-12" />
                  {/* Label */}
                  <col className="w-[165px]" />
                  {/* Recipient */}
                  <col className="w-[175px]" />
                  {/* Address */}
                  <col className="w-[90px]" />
                  {/* Route */}
                  {showTenantCol && <col className="w-[110px]" />}
                  {/* Tenant */}
                  <col className="w-[80px]" />
                  {/* Location */}
                  <col className="w-[100px]" />
                  {/* Stop ID */}
                  <col className="w-[70px]" />
                  {/* By */}
                  <col className="w-[110px]" />
                  {/* Date */}
                </colgroup>
                <thead className="sticky top-0 z-10 border-b bg-background text-left">
                  <tr>
                    <SortHeader
                      field="status"
                      label="Status"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      className="pl-4 pr-2"
                    />
                    <th className="px-1 py-2.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
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
                      field="route"
                      label="Route"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      className="px-3"
                    />
                    {showTenantCol && (
                      <th className="px-3 py-2.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
                        Tenant
                      </th>
                    )}
                    <SortHeader
                      field="client_location"
                      label="Location"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      className="px-3"
                    />
                    <th className="px-3 py-2.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
                      Stop ID
                    </th>
                    <SortHeader
                      field="scanned_by"
                      label="By"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      className="px-3"
                    />
                    <SortHeader
                      field="created_at"
                      label="Date/Time"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      className="px-3 pr-4 text-right"
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
                        tenantName={showTenantCol ? (tenantMap.get(scan.tenant_id ?? 0) ?? "—") : undefined}
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

      {/* Detail Panel */}
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
