"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSearchParams } from "next/navigation";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  Truck,
  X,
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Stop {
  _id: string;
  rtstop_id?: string;
  spoke_stop_id?: string;
  tenant_id?: number;
  recipient_name?: string;
  rx_pharma_id?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  route_title?: string;
  route_id?: string;
  label_status?: string;
  delivery_state?: string;
  stop_position?: number;
  eta?: string;
  created_at?: string;
  updated_at?: string;
  phone?: string;
  dob?: string;
  package_id?: string;
  rx_creation_date?: string;
  stop_notes?: string;
  driver_notes?: string;
  driver_name?: string;
  driver_id?: string;
  event_type?: string;
  latitude?: number | null;
  longitude?: number | null;
  web_app_link?: string;
  signature_url?: string;
  delivery_succeeded?: boolean;
}

interface LinkedScan {
  rtscan_id?: number;
  image_url?: string;
  status?: string;
  stage?: string;
  error_message?: string | null;
}

interface Tenant {
  tenant_id: number;
  company_name?: string;
}

type DatePreset = "today" | "yesterday" | "7d" | "30d" | "custom" | "all";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

function fmtTime(d?: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function fmtEta(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function getDateRange(preset: DatePreset, start?: string, end?: string): { from?: Date; to?: Date } {
  const now = new Date();
  const startOfDay = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  };
  if (preset === "today") return { from: startOfDay(now), to: now };
  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: new Date(y.setHours(23, 59, 59, 999)) };
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

function buildMapsUrl(stop: Stop) {
  const addr = [stop.address, stop.city, stop.state, stop.zipcode].filter(Boolean).join(" ");
  if (!addr.trim()) return "";
  if (stop.latitude && stop.longitude) return `https://maps.google.com/?q=${stop.latitude},${stop.longitude}`;
  return `https://maps.google.com/?q=${encodeURIComponent(addr)}`;
}

// ── Status Badges ─────────────────────────────────────────────────────────────
function LabelBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-[11px] text-muted-foreground/50">—</span>;
  const colorMap: Record<string, string> = {
    Match: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400",
    Unmatch: "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400",
    Human: "bg-violet-500/10 text-violet-700 border-violet-200 dark:text-violet-400",
    Processing: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-[11px]",
        colorMap[status] ?? "border-border bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function DeliveryBadge({ state, succeeded }: { state?: string; succeeded?: boolean }) {
  if (!state) return <span className="text-[11px] text-muted-foreground/50">—</span>;
  const isSuccess = succeeded || state.toLowerCase().includes("success") || state.toLowerCase().includes("delivered");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[11px]",
        isSuccess
          ? "border-emerald-200 bg-emerald-500/10 text-emerald-700"
          : "border-slate-200 bg-slate-500/10 text-slate-600",
      )}
    >
      {isSuccess && <CheckCircle2 className="h-2.5 w-2.5" />}
      {state}
    </span>
  );
}

// ── Detail Panel Sub-components ───────────────────────────────────────────────
function PanelRow({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2 px-3 py-2">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span
        className={cn("max-w-[200px] text-right font-medium text-[11px] leading-snug", mono && "font-mono text-[10px]")}
      >
        {value}
      </span>
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 px-1 font-semibold text-[10px] text-muted-foreground/60 uppercase tracking-wider">{title}</p>
      <div className="divide-y overflow-hidden rounded-lg border bg-muted/20">{children}</div>
    </div>
  );
}

// ── Repost Warning Dialog ─────────────────────────────────────────────────────
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

// ── Right Detail Panel ────────────────────────────────────────────────────────
function DetailPanel({
  stop,
  scan,
  scanLoading,
  onClose,
  onPatch,
  updating,
}: {
  stop: Stop;
  scan: LinkedScan | null;
  scanLoading: boolean;
  onClose: () => void;
  onPatch: (id: string, body: Record<string, string>) => Promise<void>;
  updating: boolean;
}) {
  const [repostLoading, setRepostLoading] = useState(false);
  const [showRepostWarn, setShowRepostWarn] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const addressUrl = buildMapsUrl(stop);
  const isSuccess = stop.label_status === "Match";
  const spokeStopId = stop.spoke_stop_id || stop.rtstop_id;

  const executeRepost = async () => {
    setRepostLoading(true);
    try {
      const res = await fetch("/api/scans/repost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stop_id: spokeStopId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Repost submitted", { description: `New scan ID: ${data.new_rtscan_id}` });
      } else {
        toast.error("Repost failed", { description: data.error ?? "Unknown error" });
      }
    } catch {
      toast.error("Repost failed", { description: "Network error" });
    } finally {
      setRepostLoading(false);
      setShowRepostWarn(false);
    }
  };

  const handleRepost = () => {
    if (isSuccess) setShowRepostWarn(true);
    else executeRepost();
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
            stop_id: spokeStopId,
            image_override_base64: base64,
            image_override_media_type: file.type,
            reposted_by: "Admin (camera)",
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          toast.success("Photo repost submitted", { description: `Scan ID: ${data.new_rtscan_id}` });
        } else {
          toast.error("Photo repost failed", { description: data.error ?? "Unknown error" });
        }
      } catch {
        toast.error("Photo repost failed", { description: "Error processing file" });
      } finally {
        setCameraLoading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b bg-muted/20 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center gap-2">
              <LabelBadge status={stop.label_status} />
              {stop.rtstop_id && <span className="font-mono text-[10px] text-muted-foreground">{stop.rtstop_id}</span>}
            </div>
            <p className="truncate font-semibold text-sm capitalize leading-snug">
              {stop.recipient_name?.toLowerCase() || "Unknown recipient"}
            </p>
            {stop.phone && <p className="mt-0.5 text-[11px] text-muted-foreground">{stop.phone}</p>}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Scan image */}
        {scanLoading && (
          <div className="mx-4 mt-3">
            <Skeleton className="h-36 w-full rounded-lg" />
          </div>
        )}
        {!scanLoading && scan?.image_url && (
          <div className="mx-4 mt-3 overflow-hidden rounded-lg border bg-black/5">
            {/* biome-ignore lint/performance/noImgElement: external telegram CDN, not optimizable */}
            <img src={scan.image_url} alt="Label" className="max-h-44 w-full object-contain" />
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 border-b px-4 py-3">
          <Button className="w-full gap-2" size="sm" onClick={handleRepost} disabled={repostLoading || !spokeStopId}>
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
                  disabled={!addressUrl}
                  onClick={() => addressUrl && window.open(addressUrl, "_blank")}
                >
                  <MapPin className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{addressUrl ? "Open in Google Maps" : "No address available"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={!isSuccess || !spokeStopId}
                  onClick={() => spokeStopId && window.open(`/dashboard/stops?search=${spokeStopId}`, "_blank")}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {!isSuccess
                  ? "Only available for matched stops"
                  : !spokeStopId
                    ? "Stop ID unavailable"
                    : "View stop details"}
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

            <div className="flex-1" />

            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={updating || stop.label_status === "Match"}
              onClick={() => onPatch(stop._id, { label_status: "Match" })}
            >
              {updating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
              Match
            </Button>
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-full gap-1.5 text-muted-foreground text-xs hover:text-foreground"
            disabled={updating || stop.label_status === "Human"}
            onClick={() => onPatch(stop._id, { label_status: "Human" })}
          >
            <AlertTriangle className="h-3 w-3" />
            Flag for human review
          </Button>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleCamera} />
        </div>

        {/* Details body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <PanelSection title="Patient">
            <PanelRow label="Name" value={stop.recipient_name} />
            <PanelRow label="Phone" value={stop.phone} />
            <PanelRow label="Date of birth" value={stop.dob} />
          </PanelSection>

          <PanelSection title="Address">
            <PanelRow label="Street" value={stop.address} />
            <PanelRow label="City" value={stop.city} />
            <PanelRow label="State" value={stop.state} />
            <PanelRow label="ZIP" value={stop.zipcode} />
          </PanelSection>

          <PanelSection title="Prescription">
            <PanelRow label="Rx #" value={stop.rx_pharma_id} mono />
            <PanelRow label="Rx created" value={stop.rx_creation_date} />
            <PanelRow label="Package ID" value={stop.package_id} mono />
          </PanelSection>

          <PanelSection title="Route details">
            <PanelRow label="Route" value={stop.route_title} />
            <PanelRow label="Stop position" value={stop.stop_position?.toString()} />
            <PanelRow label="Driver" value={stop.driver_name} />
            <PanelRow
              label="ETA"
              value={stop.eta ? new Date(stop.eta).toLocaleString("en-US", { timeZone: "America/New_York" }) : null}
            />
          </PanelSection>

          {(stop.stop_notes || stop.driver_notes) && (
            <PanelSection title="Notes">
              <PanelRow label="Stop notes" value={stop.stop_notes} />
              <PanelRow label="Driver notes" value={stop.driver_notes} />
            </PanelSection>
          )}

          {scan && (
            <PanelSection title="Scan info">
              <PanelRow label="Scan ID" value={String(scan.rtscan_id ?? "")} mono />
              <PanelRow label="Scan status" value={scan.status} />
              <PanelRow label="Stage" value={scan.stage?.replace(/_/g, " ")} />
              {scan.error_message && <PanelRow label="Error" value={scan.error_message} />}
            </PanelSection>
          )}
        </div>

        <RepostDialog
          open={showRepostWarn}
          onConfirm={executeRepost}
          onCancel={() => setShowRepostWarn(false)}
          loading={repostLoading}
        />
      </div>
    </TooltipProvider>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StopsPage() {
  const searchParams = useSearchParams();

  const [data, setData] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selected, setSelected] = useState<Stop | null>(null);
  const [linkedScan, setLinkedScan] = useState<LinkedScan | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [routeFilter, setRouteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [deliveryFilter, setDeliveryFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/data/spoke-stops");
      if (res.ok) {
        const json = await res.json();
        setData(json.list ?? json ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    fetchData();
    fetchTenants();
  }, [fetchData, fetchTenants]);

  useEffect(() => {
    if (!selected) {
      setLinkedScan(null);
      return;
    }
    const stopId = selected.spoke_stop_id || selected.rtstop_id;
    if (!stopId) {
      setLinkedScan(null);
      return;
    }
    setScanLoading(true);
    fetch(`/api/scans/by-stop?stop_id=${encodeURIComponent(stopId)}`)
      .then((r) => r.json())
      .then((d) => setLinkedScan(d.scan ?? null))
      .catch(() => setLinkedScan(null))
      .finally(() => setScanLoading(false));
  }, [selected]);

  const routes = useMemo(() => [...new Set(data.map((s) => s.route_title).filter(Boolean))].sort() as string[], [data]);
  const deliveryStates = useMemo(
    () => [...new Set(data.map((s) => s.delivery_state).filter(Boolean))].sort() as string[],
    [data],
  );

  const filtered = useMemo(() => {
    const { from, to } = getDateRange(datePreset, dateStart, dateEnd);
    let result = data;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.recipient_name?.toLowerCase().includes(q) ||
          s.rx_pharma_id?.toLowerCase().includes(q) ||
          s.address?.toLowerCase().includes(q) ||
          s.spoke_stop_id?.toLowerCase().includes(q) ||
          s.rtstop_id?.toLowerCase().includes(q),
      );
    }
    if (routeFilter !== "all") result = result.filter((s) => s.route_title === routeFilter);
    if (statusFilter !== "all") result = result.filter((s) => s.label_status === statusFilter);
    if (deliveryFilter !== "all") result = result.filter((s) => s.delivery_state === deliveryFilter);
    if (tenantFilter !== "all") result = result.filter((s) => String(s.tenant_id) === tenantFilter);
    if (from) {
      result = result.filter((s) => {
        const d = new Date(s.created_at || "");
        return d >= from && (!to || d <= to);
      });
    }
    return result;
  }, [data, search, routeFilter, statusFilter, deliveryFilter, tenantFilter, datePreset, dateStart, dateEnd]);

  const columns: ColumnDef<Stop>[] = useMemo(
    () => [
      {
        accessorKey: "stop_position",
        header: "#",
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-muted-foreground">{row.original.stop_position ?? "—"}</span>
        ),
      },
      {
        accessorKey: "recipient_name",
        header: "Recipient",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-xs capitalize leading-tight">
              {row.original.recipient_name?.toLowerCase() || "—"}
            </p>
            {row.original.rx_pharma_id && (
              <p className="font-mono text-[10px] text-muted-foreground">{row.original.rx_pharma_id}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "address",
        header: "Address",
        cell: ({ row }) => (
          <span className="block max-w-[180px] truncate text-muted-foreground text-xs">
            {row.original.address || "—"}
          </span>
        ),
      },
      {
        accessorKey: "route_title",
        header: "Route",
        cell: ({ row }) =>
          row.original.route_title ? (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {row.original.route_title}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground/40">Unassigned</span>
          ),
      },
      {
        accessorKey: "label_status",
        header: "Label status",
        cell: ({ row }) => <LabelBadge status={row.original.label_status} />,
      },
      {
        accessorKey: "delivery_state",
        header: "Delivery",
        cell: ({ row }) => (
          <DeliveryBadge state={row.original.delivery_state} succeeded={row.original.delivery_succeeded} />
        ),
      },
      {
        accessorKey: "driver_name",
        header: "Driver",
        cell: ({ row }) => <span className="text-[11px] text-muted-foreground">{row.original.driver_name || "—"}</span>,
      },
      {
        accessorKey: "eta",
        header: "ETA",
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-muted-foreground">{fmtEta(row.original.eta)}</span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <div className="text-right">
            <p className="font-medium text-[11px] tabular-nums">{fmtDate(row.original.created_at)}</p>
            <p className="text-[10px] text-muted-foreground">{fmtTime(row.original.created_at)}</p>
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const handlePatch = useCallback(
    async (id: string, body: Record<string, string>) => {
      setUpdating(true);
      try {
        await fetch(`/api/data/spoke-stops/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await fetchData(true);
        if (selected?._id === id) setSelected((prev) => (prev ? { ...prev, ...body } : prev));
        toast.success("Stop updated");
      } catch {
        toast.error("Failed to update stop");
      } finally {
        setUpdating(false);
      }
    },
    [fetchData, selected],
  );

  const exportCsv = () => {
    const headers = [
      "Stop #",
      "Recipient",
      "Rx #",
      "Address",
      "Route",
      "Driver",
      "Label status",
      "Delivery",
      "ETA",
      "Created",
    ];
    const rows = filtered.map((s) => [
      s.stop_position,
      s.recipient_name,
      s.rx_pharma_id,
      s.address,
      s.route_title,
      s.driver_name,
      s.label_status,
      s.delivery_state,
      s.eta,
      s.created_at,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c ?? ""}"`).join(",")).join("\n");
    Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `stops-${new Date().toISOString().slice(0, 10)}.csv`,
    }).click();
  };

  const hasActiveFilters =
    search ||
    routeFilter !== "all" ||
    statusFilter !== "all" ||
    deliveryFilter !== "all" ||
    tenantFilter !== "all" ||
    datePreset !== "all";

  const clearFilters = () => {
    setSearch("");
    setRouteFilter("all");
    setStatusFilter("all");
    setDeliveryFilter("all");
    setTenantFilter("all");
    setDatePreset("all");
    setDateStart("");
    setDateEnd("");
  };

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-[500px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4.5rem)] overflow-hidden">
      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <div className={cn("flex min-w-0 flex-1 flex-col overflow-hidden", selected && "hidden md:flex")}>
        {/* Header */}
        <div className="space-y-3 border-b bg-background px-5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-2 font-semibold text-base">
                <Truck className="h-4 w-4 text-primary" />
                Stops
              </h1>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {filtered.length.toLocaleString()} of {data.length.toLocaleString()} stops
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fetchData(true)}>
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportCsv}>
                <Download className="h-3 w-3" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search stops…"
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

            {tenants.length > 0 && (
              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="All tenants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tenants</SelectItem>
                  {tenants.map((t) => (
                    <SelectItem key={t.tenant_id} value={String(t.tenant_id)}>
                      {t.company_name || `Tenant ${t.tenant_id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

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
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="All dates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dates</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="custom">Custom range…</SelectItem>
              </SelectContent>
            </Select>

            {datePreset === "custom" && (
              <>
                <Input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="h-8 w-36 text-xs"
                />
                <Input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="h-8 w-36 text-xs"
                />
              </>
            )}

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue placeholder="Label status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Match">Match</SelectItem>
                <SelectItem value="Unmatch">Unmatch</SelectItem>
                <SelectItem value="Human">Human</SelectItem>
                <SelectItem value="Processing">Processing</SelectItem>
              </SelectContent>
            </Select>

            {routes.length > 0 && (
              <Select value={routeFilter} onValueChange={setRouteFilter}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="All routes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All routes</SelectItem>
                  {routes.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {deliveryStates.length > 0 && (
              <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="All deliveries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All deliveries</SelectItem>
                  {deliveryStates.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-muted-foreground text-xs"
                onClick={clearFilters}
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Table / Cards */}
        <div className="flex-1 overflow-auto">
          {/* Desktop table */}
          <table className="hidden w-full text-sm md:table">
            <thead className="sticky top-0 z-10 border-b bg-muted/40 text-left">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className="px-3 py-2 font-semibold text-[10px] text-muted-foreground uppercase tracking-wider"
                    >
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-20 text-center text-muted-foreground text-sm">
                    No stops match your filters
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row.original)}
                    className={cn(
                      "cursor-pointer border-border/40 border-b transition-colors hover:bg-muted/30",
                      selected?._id === row.original._id && "bg-primary/5 hover:bg-primary/5",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Mobile cards */}
          <div className="divide-y md:hidden">
            {filtered.map((stop) => (
              <button
                key={stop._id}
                type="button"
                onClick={() => setSelected(stop)}
                className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors active:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <LabelBadge status={stop.label_status} />
                    {stop.route_title && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                        {stop.route_title}
                      </span>
                    )}
                  </div>
                  <p className="truncate font-semibold text-sm capitalize">
                    {stop.recipient_name?.toLowerCase() || "Unknown"}
                  </p>
                  {stop.address && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {stop.address}
                      {stop.city ? `, ${stop.city}` : ""}
                      {stop.state ? ` ${stop.state}` : ""}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    {stop.delivery_state && (
                      <DeliveryBadge state={stop.delivery_state} succeeded={stop.delivery_succeeded} />
                    )}
                    <span className="text-[10px] text-muted-foreground tabular-nums">{fmtDate(stop.created_at)}</span>
                  </div>
                </div>
                <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="py-20 text-center text-muted-foreground text-sm">No stops match your filters</div>
            )}
          </div>
        </div>

        {/* Pagination */}
        {table.getPageCount() > 1 && (
          <div className="flex items-center justify-between border-t bg-muted/10 px-4 py-2">
            <span className="text-[11px] text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} ·{" "}
              {filtered.length.toLocaleString()} stops
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selected && (
        <div
          className={cn(
            "overflow-hidden border-l bg-background",
            "fixed inset-0 z-50 md:relative md:inset-auto md:z-auto md:w-[360px] md:shrink-0",
          )}
        >
          <DetailPanel
            stop={selected}
            scan={linkedScan}
            scanLoading={scanLoading}
            onClose={() => setSelected(null)}
            onPatch={handlePatch}
            updating={updating}
          />
        </div>
      )}
    </div>
  );
}
