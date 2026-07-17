"use client";

import { type ComponentType, Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, User, Phone, MapPin, Package, Truck, Camera,
  Calendar, DollarSign, PenLine, Clock, FileText, Tag,
  CheckCircle2, XCircle, PlusCircle, ChevronLeft, ChevronRight,
  Zap, RotateCcw, Hash, Building2, AlertCircle, Copy, X, Ban,
  ChevronDown, ExternalLink, Link2, List, Users, ArrowDownToLine, Mail,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  statusColors, statusLabel, sourceColors,
  formatPhone, formatDate, formatTime, formatCurrency, toTitleCase,
} from "./_helpers";
import type { SearchResult } from "./_types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const DELIVERED_ST = ["delivered","completed","picked_up"];
const FAILED_ST    = ["failed","attempted","cancelled","failed_not_home"];
const TRANSIT_ST   = ["in_transit","out_for_delivery","dispatched","assigned"];

// ─────────────────────────────────────────────────────────────────────────────
// DetailMap
// ─────────────────────────────────────────────────────────────────────────────
function DetailMap({ lat, lng, address }: { lat:number|null; lng:number|null; address:string }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (lat && lng && apiKey) {
    const src = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${lat},${lng}&zoom=16&maptype=roadmap`;
    return (
      <div className="relative h-full w-full overflow-hidden bg-muted">
        <iframe title="map" width="100%" height="100%"
          style={{ border:0, display:"block", minHeight:"100%" }} loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={src} />
      </div>
    );
  }
  if (lat && lng) {
    const d = 0.008;
    const bbox = `${lng-d},${lat-d*0.65},${lng+d},${lat+d*0.65}`;
    return (
      <div className="relative h-full w-full overflow-hidden bg-muted">
        <iframe title="map" width="100%" height="100%"
          style={{ border:0, display:"block", minHeight:"100%" }} loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`} />
      </div>
    );
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/60">
      <MapPin className="size-5 text-muted-foreground/20" />
      <p className="text-[10px] text-muted-foreground/40 text-center px-3 leading-snug max-w-[160px]">{address || "No coordinates available"}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gallery (left column)
// ─────────────────────────────────────────────────────────────────────────────
function Gallery({ photos, item }: { photos:string[]; item:SearchResult }) {
  const [active, setActive] = useState(0);
  const sc  = statusColors(item.status);
  const tid = item.stop_id ?? item.id;

  if (photos.length === 0) {
    // Shipping label placeholder card
    return (
      <div className="relative w-full overflow-hidden rounded-xl border border-border/40 bg-gradient-to-br from-muted via-muted/50 to-card" style={{ paddingBottom:"75%" }}>
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs><pattern id="sdv-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="1"/>
          </pattern></defs>
          <rect width="100%" height="100%" fill="url(#sdv-grid)" />
        </svg>
        <div className="absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-card/70 border border-border/25 shadow-sm">
                <Package className="size-3.5 text-muted-foreground/50" />
              </div>
              <span className="text-[10px] font-bold text-foreground/70 uppercase tracking-wider">{item.package_type?.toUpperCase() ?? "RX"}</span>
            </div>
            <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 bg-card/80 backdrop-blur-sm", sc.text, sc.ring)}>
              <span className={cn("size-1.5 rounded-full", sc.dot)} />{statusLabel(item.status)}
            </span>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-medium text-muted-foreground/35 mb-1.5 uppercase tracking-[0.15em]">Tracking</p>
            <p className="font-mono text-base font-black text-foreground tracking-tight leading-none break-all">{tid}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-muted-foreground/35 mb-0.5 uppercase tracking-wider">Destination</p>
            <p className="text-[10px] font-semibold text-foreground truncate">{item.delivery_address || "—"}</p>
            <p className="text-[10px] text-muted-foreground/55 truncate">{[item.delivery_city, item.delivery_state].filter(Boolean).join(", ")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* Main photo */}
      <div className="relative w-full overflow-hidden rounded-xl bg-muted border border-border/30" style={{ paddingBottom:"75%" }}>
        <AnimatePresence mode="wait">
          <motion.img key={active} src={photos[active]} alt={`Photo ${active+1}`}
            className="absolute inset-0 w-full h-full object-cover"
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            transition={{ duration:0.15 }} />
        </AnimatePresence>
        {photos.length > 1 && (
          <>
            <button type="button" onClick={() => setActive(p => (p-1+photos.length)%photos.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors">
              <ChevronLeft className="size-3.5" />
            </button>
            <button type="button" onClick={() => setActive(p => (p+1)%photos.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors">
              <ChevronRight className="size-3.5" />
            </button>
            <div className="absolute bottom-2 right-2 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] text-white font-medium">
              {active+1}/{photos.length}
            </div>
          </>
        )}
        <button type="button" onClick={() => window.open(photos[active], "_blank")}
          className="absolute top-2 right-2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white hover:bg-black/60 transition-colors">
          View
        </button>
      </div>
      {/* Thumbnails */}
      {photos.length > 1 && (
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {photos.map((url, i) => (
            <button key={i} type="button" onClick={() => setActive(i)}
              className={cn("shrink-0 size-12 overflow-hidden rounded-lg border-2 transition-all",
                active === i ? "border-primary" : "border-transparent opacity-50 hover:opacity-80")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InfoRow
// ─────────────────────────────────────────────────────────────────────────────
function InfoRow({ icon:Icon, label, value, mono, action }: {
  icon: React.ComponentType<{className?:string}>;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  action?: React.ReactNode;
}) {
  if (!value || value === "—") return null;
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-border/15 last:border-0">
      <Icon className="size-3 shrink-0 text-muted-foreground/30 mt-[3px]" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider mb-0.5">{label}</p>
        <p className={cn("text-xs font-medium text-foreground leading-snug break-words", mono && "font-mono text-[11px] text-primary")}>{value}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// History Tab
// ─────────────────────────────────────────────────────────────────────────────
function HistoryTab({ item }: { item:SearchResult }) {
  const [history, setHistory] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = item.delivery_city || item.delivery_address;
    if (!q) { setLoading(false); return; }
    const ctrl = new AbortController();
    fetch(`/api/client/search?q=${encodeURIComponent(q)}&limit=25`, { signal:ctrl.signal })
      .then(r => r.json())
      .then(d => { setHistory((d.results ?? []).filter((r:SearchResult) => r.id !== item.id).slice(0,12)); setLoading(false); })
      .catch(() => setLoading(false));
    return () => ctrl.abort();
  }, [item.id, item.delivery_city, item.delivery_address]);

  if (loading) return (
    <div className="space-y-2 p-3">
      {Array.from({length:3}).map((_,i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />)}
    </div>
  );

  return (
    <div className="p-3">
      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <Clock className="size-6 text-muted-foreground/20" />
          <p className="text-[11px] text-muted-foreground/40 text-center">No previous deliveries found<br/>for this location</p>
        </div>
      ) : (
        <>
          <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider mb-2">
            {history.length} previous deliveries near {item.delivery_city || "this address"}
          </p>
          <ol className="space-y-1.5">
            {history.map(h => {
              const sc = statusColors(h.status);
              return (
                <li key={h.id} className="flex items-start gap-2.5 rounded-lg border border-border/30 bg-muted/10 px-3 py-2">
                  <span className={cn("mt-1 size-1.5 rounded-full shrink-0", sc.dot)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-primary font-semibold truncate">{h.stop_id ?? h.id}</span>
                      <span className={cn("text-[10px] font-semibold rounded-full px-1.5 py-0.5 shrink-0", sc.bg, sc.text)}>{statusLabel(h.status)}</span>
                    </div>
                    <p className="text-[11px] text-foreground font-medium truncate mt-0.5">{toTitleCase(h.recipient_name) || "—"}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {formatDate(h.delivery_date ?? h.created_at)}
                      {h.driver_name && ` · ${toTitleCase(h.driver_name)}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity Tab
// ─────────────────────────────────────────────────────────────────────────────
function ActivityTab({ item }: { item:SearchResult }) {
  type Ev = { label:string; icon:React.ComponentType<{className?:string}>; color:string; ts:string };
  const events: Ev[] = [
    { label:"Stop created", icon:PlusCircle, color:"text-muted-foreground/50", ts:`${formatDate(item.created_at)} · ${formatTime(item.created_at)}` },
  ];
  if (item.source === "draft") events.push({ label:"Draft submitted via portal", icon:FileText, color:"text-amber-500", ts:formatDate(item.created_at) });
  if (item.driver_name) events.push({ label:`Assigned to ${toTitleCase(item.driver_name)}`, icon:Truck, color:"text-indigo-500", ts:"Active" });
  if (TRANSIT_ST.includes(item.status)) events.push({ label:"In transit to recipient", icon:Truck, color:"text-primary", ts:item.eta_at ? formatTime(item.eta_at) : "Active" });
  if (DELIVERED_ST.includes(item.status)) events.push({ label:"Delivered successfully", icon:CheckCircle2, color:"text-emerald-500", ts:item.eta_at ? formatTime(item.eta_at) : "Completed" });
  if (FAILED_ST.includes(item.status)) events.push({ label:"Delivery failed / attempted", icon:XCircle, color:"text-rose-500", ts:item.eta_at ? formatTime(item.eta_at) : "Failed" });
  if (item.photos.length > 0) events.push({ label:`${item.photos.length} proof photo${item.photos.length !== 1 ? "s" : ""} captured`, icon:CheckCircle2, color:"text-teal-500", ts:"Uploaded" });

  return (
    <div className="p-3">
      <ol>
        {events.map((ev, i) => {
          const Icon = ev.icon;
          return (
            <li key={i} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border/30">
                  <Icon className={cn("size-3", ev.color)} />
                </div>
                {i < events.length - 1 && <div className="w-px flex-1 bg-border/25 my-1" style={{ minHeight:"14px" }} />}
              </div>
              <div className="pb-3.5 pt-0.5 flex-1 min-w-0">
                <p className="text-[11px] font-medium text-foreground leading-snug">{ev.label}</p>
                <p className="text-[10px] text-muted-foreground/45 mt-0.5">{ev.ts}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Photo Gallery for panel
// ─────────────────────────────────────────────────────────────────────────────
function PhotoGallery({ photos }: { photos: string[] }) {
  const [active, setActive] = useState(0);
  return (
    <div className="px-4 pt-4">
      {/* Elegant framed media card */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-muted/25 to-card shadow-sm">
        {/* Frame header */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Camera className="size-3.5 text-muted-foreground/70" />
            Proof of delivery
          </span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70 tabular-nums">
            {active + 1} / {photos.length}
          </span>
        </div>

        {/* Hero photo */}
        <div className="relative mx-2.5 overflow-hidden rounded-xl bg-muted ring-1 ring-border/50" style={{ paddingBottom: "56%" }}>
          <AnimatePresence mode="wait">
            <motion.img key={active} src={photos[active]} alt={`Proof ${active + 1}`}
              className="absolute inset-0 h-full w-full object-cover"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }} />
          </AnimatePresence>
          <button type="button" onClick={() => window.open(photos[active], "_blank")}
            className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-lg bg-black/45 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/65">
            <ExternalLink className="size-2.5" />View
          </button>
        </div>

        {/* Thumbnail strip */}
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-2.5 pt-2.5 pb-3">
            {photos.map((url, i) => (
              <button key={i} type="button" onClick={() => setActive(i)}
                className={cn(
                  "relative size-14 shrink-0 overflow-hidden rounded-lg transition-all",
                  active === i
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-card"
                    : "opacity-60 ring-1 ring-border/50 hover:opacity-100",
                )}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
        {photos.length <= 1 && <div className="h-2.5" />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// panelBadge
// ─────────────────────────────────────────────────────────────────────────────
function panelBadge(status: string): { cls: string; dot: boolean } {
  if (DELIVERED_ST.includes(status)) return { cls: "bg-success/12 text-success", dot: true };
  if (TRANSIT_ST.includes(status))   return { cls: "bg-primary/12 text-primary", dot: false };
  if (FAILED_ST.includes(status))    return { cls: "bg-destructive/12 text-destructive", dot: false };
  return { cls: "bg-warning/15 text-warning", dot: false };
}

/** Compact journey stepper — Created → Dispatched → In transit → Delivered/Failed.
 *  Reads at a glance where the shipment is; pure tokens, dark-mode safe. */
function StatusStepper({ status }: { status: string }) {
  const isDelivered = DELIVERED_ST.includes(status);
  const isFailed = FAILED_ST.includes(status);
  const isTransit = TRANSIT_ST.includes(status);
  const reached = isDelivered ? 3 : isTransit ? 2 : isFailed ? 3 : 1;
  const steps = [
    { key: "created", label: "Created", Icon: FileText },
    { key: "dispatched", label: "Dispatched", Icon: Truck },
    { key: "transit", label: "In transit", Icon: MapPin },
    { key: "end", label: isFailed ? "Failed" : "Delivered", Icon: isFailed ? XCircle : CheckCircle2 },
  ];
  const endTone = isFailed ? "bg-destructive text-white" : "bg-success text-white";
  return (
    <div className="border-b border-border/40 px-4 py-3">
      <div className="flex items-center">
        {steps.map((s, i) => {
          const isLast = i === steps.length - 1;
          const active = i <= reached;
          const node = isLast && (isDelivered || isFailed) ? endTone : active ? "bg-primary text-white" : "bg-muted text-muted-foreground/45";
          return (
            <Fragment key={s.key}>
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full transition-colors", node)}>
                <s.Icon className="size-3" />
              </span>
              {!isLast && <span className={cn("mx-1 h-0.5 flex-1 rounded-full", i < reached ? "bg-primary" : "bg-muted")} />}
            </Fragment>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between">
        {steps.map((s, i) => (
          <span key={s.key} className={cn("text-[10px] font-medium tracking-tight", i <= reached ? "text-foreground/70" : "text-muted-foreground/40")}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function FooterAction({ icon: Icon, label, onClick, disabled }: {
  icon: ComponentType<{ className?: string }>; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
    >
      <Icon className="size-4" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function PanelSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/10 last:border-0">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between py-2.5 pr-0.5 transition-colors hover:text-foreground">
        <span className="text-xs font-semibold tracking-[-0.01em] text-foreground/80">{title}</span>
        <ChevronDown className={cn("size-3.5 text-muted-foreground/35 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden">
            <div className="pb-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PanelRow({ icon: Icon, label, value, mono, muted }: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string; value: React.ReactNode; mono?: boolean; muted?: boolean;
}) {
  if (!value || value === "—") return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/[0.07] py-2 last:border-0">
      <span className="shrink-0 text-[11px] text-muted-foreground/65 leading-snug">{label}</span>
      <span className={cn(
        "flex min-w-0 items-center gap-1.5 text-right text-[11px] font-medium leading-snug",
        mono ? "font-mono text-[11px] text-primary" : "text-foreground",
        muted && "font-normal text-muted-foreground/50",
      )}>
        {Icon && <Icon className="size-3 shrink-0 text-muted-foreground/40" />}
        <span className="truncate">{value}</span>
      </span>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* Header skeleton */}
      <div className="shrink-0 border-b border-border/20 bg-gradient-to-b from-muted/30 to-card px-4 pb-4 pt-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-3 w-16 animate-pulse rounded bg-muted/50" />
          <div className="flex gap-2">
            {Array.from({length:4}).map((_,i) => <div key={i} className="size-6 animate-pulse rounded-md bg-muted/40" />)}
          </div>
        </div>
        <div className="h-5 w-48 animate-pulse rounded bg-muted/50" />
        <div className="mt-1 h-3.5 w-36 animate-pulse rounded bg-muted/30" />
        <div className="mt-3 flex gap-2">
          <div className="h-5 w-28 animate-pulse rounded-md bg-muted/40" />
          <div className="h-5 w-10 animate-pulse rounded-full bg-muted/30" />
          <div className="h-5 w-8 animate-pulse rounded bg-muted/30" />
        </div>
      </div>
      <div className="flex-1 space-y-0 px-4 py-4">
        {Array.from({length:4}).map((_,s) => (
          <div key={s} className="border-b border-border/10 py-3">
            <div className="mb-2.5 h-3 w-28 animate-pulse rounded bg-muted/45" />
            {Array.from({length:3}).map((_,r) => (
              <div key={r} className="flex justify-between py-1.5">
                <div className="h-2.5 w-20 animate-pulse rounded bg-muted/25" />
                <div className="h-2.5 w-24 animate-pulse rounded bg-muted/25" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SpokePanel({ item, onClose }: { item: SearchResult; onClose: () => void }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const tid      = item.stop_id ?? item.id;
  const street   = item.delivery_address || "—";
  const cityLine = [item.delivery_city, item.delivery_state, item.delivery_zip].filter(Boolean).join(", ");
  const badge    = panelBadge(item.status);
  const isDelivered = DELIVERED_ST.includes(item.status);
  const isFailed    = FAILED_ST.includes(item.status);
  const isTransit   = TRANSIT_ST.includes(item.status);
  const hasCoords   = item.delivery_lat != null && item.delivery_lng != null;
  const hasReq      = item.requires_signature || item.collect_cod || item.is_same_day || item.return_to_sender;

  const openMap  = () => { if (hasCoords) window.open(`https://www.openstreetmap.org/?mlat=${item.delivery_lat}&mlon=${item.delivery_lng}#map=17/${item.delivery_lat}/${item.delivery_lng}`, "_blank"); };
  const copyLink = () => { navigator.clipboard.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };

  // Status accent color for header
  const accentGlow   = isDelivered ? "from-success/12" : isFailed ? "from-destructive/12" : isTransit ? "from-primary/12" : "from-warning/12";
  const accentBorder = isDelivered ? "border-success/30" : isFailed ? "border-destructive/30" : isTransit ? "border-primary/30" : "border-warning/30";
  const accentTop    = isDelivered ? "bg-success" : isFailed ? "bg-destructive" : isTransit ? "bg-primary" : "bg-warning";
  const dotColor     = isDelivered ? "bg-success" : isFailed ? "bg-destructive" : isTransit ? "bg-primary" : "bg-warning";

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">

      {/* ── HEADER ───────────────────────────────────────────── */}
      <div className={cn("sticky top-0 z-10 shrink-0 border-b bg-card", accentBorder)}>
        {/* 3px solid top accent bar */}
        <div className={cn("h-[3px] w-full", accentTop)} />
        {/* Soft gradient wash */}
        <div className={cn("absolute inset-0 top-[3px] bg-gradient-to-b", accentGlow, "to-transparent pointer-events-none")} />

        {/* Icon toolbar */}
        <div className="relative flex items-center justify-between px-4 pt-2.5 pb-2">
          <div className="flex items-center gap-2">
            <motion.div className={cn("size-2 rounded-full", dotColor)}
              animate={isTransit ? { scale:[1,1.5,1], opacity:[1,0.4,1] } : {}}
              transition={{ duration:1.8, repeat:Infinity }} />
            <span className="text-[11px] font-semibold text-foreground/70">{statusLabel(item.status)}</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" title="Open full page" onClick={() => router.push(`/dashboard/search/${encodeURIComponent(tid)}`)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground/50 transition-all hover:bg-muted hover:text-foreground"><ExternalLink className="size-3.5" /></button>
            <button type="button" title="View on map" onClick={openMap} className={cn("flex size-7 items-center justify-center rounded-md transition-all", hasCoords ? "text-muted-foreground/50 hover:bg-muted hover:text-foreground" : "cursor-default text-muted-foreground/25")}><MapPin className="size-3.5" /></button>
            <button type="button" title="Copy link" onClick={copyLink} className={cn("flex size-7 items-center justify-center rounded-md transition-all", copied ? "text-success" : "text-muted-foreground/50 hover:bg-muted hover:text-foreground")}><Link2 className="size-3.5" /></button>
            <div className="mx-1 h-4 w-px bg-border" />
            <button type="button" title="Close" onClick={onClose} className="flex size-7 items-center justify-center rounded-md text-muted-foreground/50 transition-all hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>
          </div>
        </div>

        {/* Address block */}
        <div className="relative px-4 pb-3">
          <p className="text-base font-bold tracking-tight text-foreground leading-tight">{street}</p>
          {cityLine && <p className="mt-0.5 text-xs font-medium text-muted-foreground">{cityLine}</p>}

          {/* Driver row */}
          {item.driver_name && (
            <div className="mt-2 flex items-center gap-1.5">
              <div className="flex size-5 items-center justify-center rounded-full bg-muted">
                <Truck className="size-3 text-muted-foreground" />
              </div>
              <span className="text-xs font-medium text-foreground/80">{toTitleCase(item.driver_name)}</span>
              {item.route_title && (
                <span className="text-[11px] text-muted-foreground/60">· {item.route_title.length > 20 ? item.route_title.slice(0, 20) + "…" : item.route_title}</span>
              )}
            </div>
          )}

          {/* Pills row */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground/70">
              <Hash className="size-2.5" />{tid.length > 16 ? "…" + tid.slice(-13) : tid}
            </span>
            {item.source === "stop"
              ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">Stop</span>
              : <span className="rounded-full bg-warning px-2 py-0.5 text-[10px] font-semibold text-white">Draft</span>}
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground/70">{item.package_type ?? "RX"}</span>
            {item.is_same_day && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">⚡ Xpress</span>}
            {item.collect_cod && <span className="rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-600 dark:bg-teal-500/15 dark:text-teal-300">💵 COD</span>}
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE BODY ────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto">

        {/* Journey stepper — where the shipment is, at a glance */}
        <StatusStepper status={item.status} />

        {/* — Photo gallery (if photos exist) — */}
        {item.photos.length > 0 && (
          <PhotoGallery photos={item.photos} />
        )}

        {/* Delivery result card */}
        {(isDelivered || isFailed) && (
          <div className={cn(
            "mx-3 mt-3 rounded-xl border p-3",
            isDelivered ? "border-success/25 bg-success/[0.06]" : "border-destructive/25 bg-destructive/[0.06]"
          )}>
            {isDelivered ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex size-6 items-center justify-center rounded-full bg-success/15">
                    <CheckCircle2 className="size-3.5 text-success" />
                  </div>
                  <span className="text-[13px] font-semibold text-success">Delivered</span>
                  {item.eta_at && <span className="ml-auto text-[11px] text-success/70 font-medium">{formatTime(item.eta_at)}</span>}
                </div>
                {hasCoords && (
                  <button type="button" onClick={openMap} className="mt-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[10px] font-medium text-success hover:bg-success/20 transition-colors">
                    <MapPin className="size-2.5" />Exact location ›
                  </button>
                )}
                <div className="mt-2 space-y-0.5">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[11px] text-success/60">Delivered on</span>
                    <span className="text-[11px] font-semibold text-success">{item.eta_at ? `${formatDate(item.eta_at)} · ${formatTime(item.eta_at)}` : "—"}</span>
                  </div>
                </div>
                {/* Proof photos live in the media gallery above — no duplicate here. */}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-full bg-destructive/15">
                  <XCircle className="size-3.5 text-destructive" />
                </div>
                <span className="text-[13px] font-semibold text-destructive">Delivery failed</span>
                {item.eta_at && <span className="ml-auto text-[11px] text-destructive/70 font-medium">{formatTime(item.eta_at)}</span>}
              </div>
            )}
          </div>
        )}

        {/* Note for driver */}
        {item.notes && !isFailed && (
          <div className="mx-3 mt-3 rounded-xl border border-warning/25 bg-warning/[0.08] px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1.5">
              <FileText className="size-3 text-warning" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-warning/70">Driver Note</span>
            </div>
            <p className="text-xs font-medium leading-snug text-foreground/80">{item.notes}</p>
          </div>
        )}

        {/* Sections */}
        <div className="px-4 pt-3">
          <PanelSection title="Stop setup" defaultOpen>
            <PanelRow icon={Building2}       label="Depot"             value="—" muted />
            <PanelRow icon={MapPin}          label="Route"             value={item.route_title ?? "Assign to route"} muted={!item.route_title} />
            <PanelRow icon={ArrowDownToLine} label="Stop type"         value="Delivery" />
            <PanelRow icon={Clock}           label="Est. time at stop" value="—" muted />
            <PanelRow icon={Users}           label="Allowed drivers"   value="All drivers" />
            <PanelRow icon={PenLine}         label="Proof of delivery" value={item.requires_signature ? "Enabled" : "Disabled"} />
            <PanelRow icon={Clock}           label="Time window"       value={item.delivery_date ? formatDate(item.delivery_date) : "Anytime"} />
            <PanelRow icon={List}            label="Place in route"    value="Anywhere" />
          </PanelSection>

          <PanelSection title="Recipient information" defaultOpen>
            <PanelRow icon={User}  label="Recipient name" value={toTitleCase(item.recipient_name) || "—"} />
            <PanelRow icon={Phone} label="Phone number"   value={item.recipient_phone ? <a href={`tel:${item.recipient_phone}`} className="text-primary hover:underline">{formatPhone(item.recipient_phone)}</a> : "—"} />
            <PanelRow icon={Mail}  label="Email address"  value="—" muted />
          </PanelSection>

          <PanelSection title="Order information">
            <PanelRow label="Client"       value="No client" muted />
            <PanelRow label="Barcode IDs"  value={item.stop_id ?? "None"} />
            <PanelRow label="Package type" value={(item.package_type ?? "RX").toUpperCase()} />
            {item.collect_cod && <PanelRow label="COD amount" value={formatCurrency(item.collect_amount)} />}
            <PanelRow label="Tracking ID"  value={tid} mono />
            <PanelRow label="Source"       value={item.source === "stop" ? "Dispatched Stop" : "Portal Draft"} />
            <PanelRow label="Created"      value={`${formatDate(item.created_at)} · ${formatTime(item.created_at)}`} />
            {item.total_price > 0 && <PanelRow label="Total price" value={formatCurrency(item.total_price)} />}
          </PanelSection>

          <PanelSection title="Custom properties">
            <PanelRow label="Routely Stop ID" value={item.stop_id ?? "—"} mono />
            <PanelRow label="Record ID"       value={item.id} mono />
            <PanelRow label="Coordinates"     value={hasCoords ? `${item.delivery_lat!.toFixed(5)}, ${item.delivery_lng!.toFixed(5)}` : "—"} mono />
          </PanelSection>

          {hasReq && (
            <PanelSection title="Delivery requirements">
              <PanelRow label="Signature required" value={item.requires_signature ? "Yes" : "No"} />
              <PanelRow label="COD"                 value={item.collect_cod ? `Yes · ${formatCurrency(item.collect_amount)}` : "No"} />
              <PanelRow label="Same day"            value={item.is_same_day ? "Yes" : "No"} />
              <PanelRow label="Return to sender"    value={item.return_to_sender ? "Yes" : "No"} />
            </PanelSection>
          )}
        </div>
      </div>

      {/* ── QUICK ACTIONS (sticky footer, thumb-friendly) ────────── */}
      <div className="shrink-0 border-t border-border/50 bg-card/70 px-3 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="grid grid-cols-4 gap-1">
          <FooterAction
            icon={Phone}
            label="Call"
            disabled={!item.recipient_phone}
            onClick={() => { if (item.recipient_phone) window.location.href = `tel:${item.recipient_phone}`; }}
          />
          <FooterAction icon={Link2} label={copied ? "Copied" : "Copy ID"} onClick={copyLink} />
          <FooterAction icon={MapPin} label="Map" disabled={!hasCoords} onClick={openMap} />
          <FooterAction
            icon={ExternalLink}
            label="Open"
            onClick={() => router.push(`/dashboard/search/${encodeURIComponent(tid)}`)}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main StopDetailView
// ─────────────────────────────────────────────────────────────────────────────
export interface StopDetailViewProps {
  id: string;
  initialData?: SearchResult;
  mode: "panel" | "page";
  onClose?: () => void;
}

export function StopDetailView({ id, initialData, mode, onClose }: StopDetailViewProps) {
  const router = useRouter();
  const [item, setItem]       = useState<SearchResult | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError]     = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);

  const fetchItem = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/client/search?q=${encodeURIComponent(id)}&limit=10`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const results: SearchResult[] = d.results ?? [];
      const exact = results.find(x => (x.stop_id ?? x.id) === id || x.id === id || x.stop_id === id);
      setItem(exact ?? results[0] ?? null);
    } catch { setError("Failed to load shipment details."); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    if (!initialData) fetchItem();
  }, [id, initialData, fetchItem]);

  // Sync when id changes (panel navigates between stops)
  useEffect(() => {
    if (initialData?.id !== id && initialData?.stop_id !== id) {
      setItem(null);
      setLoading(true);
      fetchItem();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleCopy = () => {
    const tid = item ? (item.stop_id ?? item.id) : id;
    navigator.clipboard.writeText(tid).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  const handleClose = () => {
    if (onClose) onClose();
    else router.back();
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    if (mode === "panel") return <PanelSkeleton />;
    return (
    <div className={cn("flex flex-col bg-card", mode === "page" ? "flex-1 min-h-full" : "h-full")}>
      <div className="flex items-center gap-2.5 border-b border-border/40 px-4 py-3">
        <div className="h-7 w-7 animate-pulse rounded-md bg-muted/60" />
        <div className="h-4 w-36 animate-pulse rounded bg-muted/50" />
        <div className="h-5 w-14 animate-pulse rounded-full bg-muted/40 ml-1" />
      </div>
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Left skeleton */}
        <div className="w-full lg:w-[240px] shrink-0 border-r border-border/30 p-4 space-y-3">
          <div className="w-full animate-pulse rounded-xl bg-muted/40" style={{ paddingBottom:"75%" }} />
          <div className="space-y-2 pt-2">
            {[3,2,4].map((w,i) => <div key={i} className={cn("h-3 animate-pulse rounded bg-muted/30", `w-${w}/4`)} />)}
          </div>
        </div>
        {/* Right skeleton */}
        <div className="flex-1 flex flex-col">
          <div className="h-[200px] animate-pulse bg-muted/20" />
          <div className="p-4 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-8 animate-pulse rounded-lg bg-muted/30" />)}
          </div>
        </div>
      </div>
    </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !item) return (
    <div className={cn("flex flex-col items-center justify-center gap-4 bg-card p-6", mode === "page" ? "flex-1 min-h-full" : "h-full")}>
      <div className="flex size-10 items-center justify-center rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/30">
        <AlertCircle className="size-5 text-rose-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">{error ?? "Shipment not found"}</p>
        <p className="text-[11px] text-muted-foreground mt-1 font-mono">{id}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleClose}>
          <ArrowLeft className="size-3.5 mr-1.5" />Back
        </Button>
        <Button size="sm" onClick={fetchItem}>Retry</Button>
      </div>
    </div>
  );

  const address = [item.delivery_address, item.delivery_city, item.delivery_state, item.delivery_zip].filter(Boolean).join(", ");
  const sc  = statusColors(item.status);
  const src = sourceColors(item.source);
  const tid = item.stop_id ?? item.id;
  const isInTransit = TRANSIT_ST.includes(item.status);
  const isDraft     = item.source === "draft" && ["draft","pending","created","approved"].includes(item.status);

  if ((mode as string) === "panel") return <SpokePanel item={item} onClose={handleClose} />;

  return (
    <div className={cn("flex flex-col bg-card", mode === "page" ? "flex-1 min-h-full" : "h-full overflow-hidden")}>

      {/* ── Sticky Header ─────────────────────────────────────────────────── */}
      <div className="shrink-0 sticky top-0 z-10 border-b border-border/40 bg-card/95 backdrop-blur-sm px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {/* Back / Close */}
          <button type="button" onClick={handleClose}
            className="shrink-0 flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors h-7 px-1.5 rounded-md hover:bg-muted/40">
            {mode === "page" ? <ArrowLeft className="size-3.5" /> : <X className="size-3.5" />}
          </button>

          <span className="text-muted-foreground/25">|</span>

          {/* Tracking ID */}
          <button type="button" onClick={handleCopy}
            className="flex items-center gap-1.5 group">
            <span className="font-mono text-[13px] font-bold text-foreground tracking-tight">{tid}</span>
            <Copy className={cn("size-3 transition-colors", copied ? "text-emerald-500" : "text-muted-foreground/30 group-hover:text-muted-foreground")} />
          </button>

          {/* Status */}
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 shrink-0", sc.bg, sc.text, sc.ring)}>
            <motion.span className={cn("size-1.5 rounded-full", sc.dot)}
              animate={isInTransit ? { scale:[1,1.5,1], opacity:[1,0.4,1] } : {}}
              transition={{ duration:2, repeat:Infinity }} />
            {statusLabel(item.status)}
          </span>

          {/* Source + Type */}
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold shrink-0", src.bg, src.text)}>
            {item.source === "stop" ? "Stop" : "Draft"}
          </span>
          <span className="rounded-full bg-muted text-muted-foreground/70 px-1.5 py-0.5 text-[10px] font-medium uppercase shrink-0">
            {item.package_type ?? "RX"}
          </span>

          {/* Flag badges */}
          {item.is_same_day && <span className="rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-400 px-1.5 py-0.5 text-[10px] font-semibold shrink-0 hidden sm:inline">⚡ Xpress</span>}
          {item.collect_cod && <span className="rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-400 px-1.5 py-0.5 text-[10px] font-semibold shrink-0 hidden sm:inline">💵 COD</span>}
          {item.requires_signature && <span className="rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5 text-[10px] font-semibold shrink-0 hidden md:inline">✍</span>}

          {/* Actions */}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            {isInTransit && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline"
                    className="h-6 px-2 text-[10px] border-rose-500/25 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 hover:border-rose-300 gap-1">
                    <Ban className="size-2.5" />Cancel
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent size="sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this stop?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will request cancellation for <span className="font-mono font-semibold">{tid}</span>. The dispatcher will be notified.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel size="sm">Keep stop</AlertDialogCancel>
                    <AlertDialogAction size="sm" className="bg-rose-600 hover:bg-rose-700">
                      Cancel stop
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {isDraft && (
              <Button size="sm" className="h-6 px-2 text-[10px] gap-1"
                onClick={() => router.push('/dashboard/draft_order')}>
                Process Order
              </Button>
            )}
          </div>
        </div>
        {/* Address subtitle */}
        {address && <p className="text-[10px] text-muted-foreground/50 mt-1 truncate pl-0.5">{address}</p>}
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className={cn(
        "flex flex-col lg:flex-row flex-1 min-h-0",
        mode === "panel" ? "overflow-hidden" : "overflow-auto lg:overflow-hidden"
      )}>

        {/* ── LEFT: Gallery + Contact ──────────────────────────────────── */}
        <div className={cn(
          "flex flex-col gap-3 p-3 border-border/30",
          "w-full lg:w-[230px] shrink-0 lg:border-r lg:overflow-y-auto",
        )}>
          {/* Gallery */}
          <Gallery photos={item.photos} item={item} />

          {/* Contact card */}
          <div className="rounded-xl border border-border/35 bg-card overflow-hidden">
            <div className="px-3 py-2 border-b border-border/25 bg-muted/10">
              <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Contact</p>
            </div>
            <div className="px-3 py-0.5">
              <InfoRow icon={User}   label="Name"    value={toTitleCase(item.recipient_name) || "—"} />
              <InfoRow icon={Phone}  label="Phone"   value={formatPhone(item.recipient_phone)}
                action={item.recipient_phone ? (
                  <a href={`tel:${item.recipient_phone}`}
                    className="text-[10px] text-primary hover:underline">Call</a>
                ) : undefined} />
              <InfoRow icon={MapPin} label="Address" value={address || "—"} />
            </div>
          </div>

          {/* Notes (if any) */}
          {item.notes && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-50/50 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-amber-600/70 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-[11px] text-amber-900/80 leading-relaxed">{item.notes}</p>
            </div>
          )}
        </div>

        {/* ── RIGHT: Map + Tabs ─────────────────────────────────────────── */}
        <div className={cn(
          "flex flex-col flex-1 min-w-0",
          mode === "panel" ? "overflow-hidden" : ""
        )}>
          {/* Map */}
          <div className="shrink-0 border-b border-border/30" style={{ height:"200px" }}>
            <DetailMap lat={item.delivery_lat} lng={item.delivery_lng} address={address} />
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview" className={cn(
            "flex flex-col flex-1 min-h-0",
            mode === "panel" ? "overflow-hidden" : ""
          )}>
            <div className="shrink-0 border-b border-border/30 px-3 bg-card overflow-x-auto">
              <TabsList className="h-9 w-max bg-transparent p-0 gap-0 rounded-none justify-start">
                {[
                  { v:"overview",  l:"Overview" },
                  { v:"delivery",  l:"Delivery" },
                  { v:"recipient", l:"Recipient" },
                  { v:"route",     l:"Route" },
                  { v:"proof",     l:`Proof${item.photos.length > 0 ? ` (${item.photos.length})` : ""}` },
                  { v:"history",   l:"History" },
                ].map(t => (
                  <TabsTrigger key={t.v} value={t.v}
                    className="h-full rounded-none px-3 text-[11px] font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent text-muted-foreground hover:text-foreground transition-none bg-transparent shadow-none">
                    {t.l}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Tab content scroll area */}
            <div className={cn(
              "flex-1",
              mode === "panel" ? "overflow-y-auto" : "overflow-auto"
            )}>

              {/* Overview */}
              <TabsContent value="overview" className="mt-0 focus-visible:outline-none p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label:"Status",  value:statusLabel(item.status), dot:sc.dot },
                    { label:"Source",  value:item.source === "stop" ? "Dispatched Stop" : "Portal Draft", dot:null },
                    { label:"Package", value:item.package_type?.toUpperCase() ?? "RX", dot:null },
                    { label:"Service", value:item.service_type ?? "Standard", dot:null },
                  ].map(c => (
                    <div key={c.label} className="rounded-lg border border-border/30 bg-muted/10 px-3 py-2">
                      <p className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-wider mb-1">{c.label}</p>
                      <div className="flex items-center gap-1.5">
                        {c.dot && <span className={cn("size-1.5 rounded-full shrink-0", c.dot)} />}
                        <p className="text-xs font-semibold text-foreground truncate">{String(c.value)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Separator className="opacity-40" />
                <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
                  <div className="px-3 py-0.5">
                    <InfoRow icon={Truck}    label="Driver"   value={item.driver_name ? toTitleCase(item.driver_name) : "Unassigned"} />
                    <InfoRow icon={Building2} label="Route"   value={item.route_title ?? "—"} />
                    <InfoRow icon={Clock}    label="ETA"      value={item.eta_at ? formatTime(item.eta_at) : "—"} />
                    <InfoRow icon={Calendar} label="Created"  value={`${formatDate(item.created_at)} · ${formatTime(item.created_at)}`} />
                    {item.total_price > 0 && <InfoRow icon={DollarSign} label="Total" value={formatCurrency(item.total_price)} />}
                  </div>
                </div>
                {/* Flags */}
                {(item.is_same_day || item.collect_cod || item.requires_signature || item.return_to_sender) && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {item.is_same_day      && <span className="rounded-full bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-400">⚡ Xpress</span>}
                    {item.collect_cod      && <span className="rounded-full bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-400">💵 COD {item.collect_amount ? formatCurrency(item.collect_amount) : ""}</span>}
                    {item.requires_signature && <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-400">✍ Signature required</span>}
                    {item.return_to_sender && <span className="rounded-full bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">↩ Return to sender</span>}
                  </div>
                )}
              </TabsContent>

              {/* Delivery */}
              <TabsContent value="delivery" className="mt-0 focus-visible:outline-none p-3">
                <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
                  <div className="px-3 py-0.5">
                    <InfoRow icon={Package}  label="Package Type"   value={item.package_type?.toUpperCase() ?? "RX"} />
                    <InfoRow icon={Tag}      label="Service Type"   value={item.service_type ?? "Standard"} />
                    <InfoRow icon={Calendar} label="Delivery Date"  value={formatDate(item.delivery_date)} />
                    <InfoRow icon={Clock}    label="ETA"            value={item.eta_at ? formatTime(item.eta_at) : "—"} />
                    {item.is_same_day && <InfoRow icon={Zap} label="Priority" value="Same Day Xpress" />}
                    {item.collect_cod && <InfoRow icon={DollarSign} label="COD Amount" value={formatCurrency(item.collect_amount)} />}
                    {item.requires_signature && <InfoRow icon={PenLine} label="Signature" value="Required at delivery" />}
                    {item.return_to_sender && <InfoRow icon={RotateCcw} label="Return" value="Return to sender if failed" />}
                    <InfoRow icon={FileText} label="Notes" value={item.notes ?? "—"} />
                    <InfoRow icon={DollarSign} label="Total Price" value={item.total_price > 0 ? formatCurrency(item.total_price) : "—"} />
                    <InfoRow icon={MapPin} label="Coordinates" mono value={item.delivery_lat != null && item.delivery_lng != null ? `${item.delivery_lat.toFixed(5)}, ${item.delivery_lng.toFixed(5)}` : "—"} />
                  </div>
                </div>
              </TabsContent>

              {/* Recipient */}
              <TabsContent value="recipient" className="mt-0 focus-visible:outline-none p-3">
                <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
                  <div className="px-3 py-0.5">
                    <InfoRow icon={User}   label="Name"       value={toTitleCase(item.recipient_name) || "—"} />
                    <InfoRow icon={Phone}  label="Phone"      value={item.recipient_phone ? <a href={`tel:${item.recipient_phone}`} className="text-primary hover:underline">{formatPhone(item.recipient_phone)}</a> : "—"} />
                    <InfoRow icon={MapPin} label="Address"    value={item.delivery_address || "—"} />
                    <InfoRow icon={MapPin} label="City"       value={[item.delivery_city, item.delivery_state].filter(Boolean).join(", ")} />
                    <InfoRow icon={Hash}   label="ZIP"        value={item.delivery_zip || "—"} />
                  </div>
                </div>
              </TabsContent>

              {/* Route */}
              <TabsContent value="route" className="mt-0 focus-visible:outline-none p-3">
                <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
                  <div className="px-3 py-0.5">
                    <InfoRow icon={Truck}     label="Assigned Driver" value={item.driver_name ? toTitleCase(item.driver_name) : "Not assigned"} />
                    <InfoRow icon={Building2} label="Route Title"     value={item.route_title ?? "—"} />
                    <InfoRow icon={Clock}     label="Estimated ETA"   value={item.eta_at ? `${formatDate(item.eta_at)} · ${formatTime(item.eta_at)}` : "—"} />
                    <InfoRow icon={MapPin}    label="Destination"     value={address || "—"} />
                    <InfoRow icon={Calendar}  label="Delivery Date"   value={formatDate(item.delivery_date)} />
                    <InfoRow icon={MapPin}    label="Coordinates"     mono value={item.delivery_lat != null && item.delivery_lng != null ? `${item.delivery_lat.toFixed(5)}, ${item.delivery_lng.toFixed(5)}` : "—"} />
                  </div>
                </div>
                {!item.driver_name && (
                  <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/20 px-3 py-2.5 flex items-center gap-2">
                    <AlertCircle className="size-3.5 text-amber-500 shrink-0" />
                    <p className="text-[11px] text-amber-700">This stop has not been assigned to a driver yet.</p>
                  </div>
                )}
              </TabsContent>

              {/* Proof */}
              <TabsContent value="proof" className="mt-0 focus-visible:outline-none p-3">
                {item.photos.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10">
                    <Package className="size-7 text-muted-foreground/20" />
                    <p className="text-[11px] text-muted-foreground/40 text-center">No proof photos available<br/>for this stop</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {item.photos.map((url,i) => (
                      <button key={i} type="button" onClick={() => window.open(url,"_blank")}
                        className="aspect-square overflow-hidden rounded-lg border border-border/30 bg-muted hover:border-primary/40 transition-colors">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Proof ${i+1}`} className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* History */}
              <TabsContent value="history" className="mt-0 focus-visible:outline-none">
                <HistoryTab item={item} />
              </TabsContent>

            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
