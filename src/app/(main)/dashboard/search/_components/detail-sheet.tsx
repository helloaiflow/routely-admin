"use client";

import { useState, useEffect } from "react";
import {
  User, Phone, MapPin, Package, Truck, Calendar, DollarSign,
  PenLine, Clock, FileText, Tag, CheckCircle2, XCircle,
  PlusCircle, X, ChevronLeft, ChevronRight,
  Zap, RotateCcw, Hash, Building2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  statusColors, statusLabel, sourceColors,
  formatPhone, formatDate, formatTime, formatCurrency, toTitleCase,
} from "./_helpers";
import type { SearchResult } from "./_types";

const DELIVERED_ST = ["delivered","completed","picked_up"];
const FAILED_ST    = ["failed","attempted","cancelled","failed_not_home"];
const TRANSIT_ST   = ["in_transit","out_for_delivery","dispatched","assigned"];

// ── Gallery ────────────────────────────────────────────────────────────────
function Gallery({ photos, item, address }: { photos: string[]; item: SearchResult; address: string }) {
  const [active, setActive] = useState(0);

  const sc  = statusColors(item.status);
  const src = sourceColors(item.source);

  if (photos.length === 0) {
    // Beautiful placeholder label card
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gradient-to-br from-muted/60 via-muted/30 to-background border border-border/50">
        {/* Grid texture overlay */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Content */}
        <div className="absolute inset-0 flex flex-col justify-between p-5">
          {/* Top row */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-card/80 backdrop-blur-sm border border-border/40 shadow-sm">
                <Package className="size-4 text-muted-foreground/60" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Package</p>
                <p className="text-[11px] font-bold text-foreground">{item.package_type?.toUpperCase() ?? "RX"}</p>
              </div>
            </div>
            <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 bg-card/80 backdrop-blur-sm", sc.text, sc.ring)}>
              <span className={cn("size-1.5 rounded-full", sc.dot)} />
              {statusLabel(item.status)}
            </span>
          </div>

          {/* Center: tracking number */}
          <div className="text-center">
            <p className="text-[10px] font-medium text-muted-foreground/45 mb-1 uppercase tracking-widest">Tracking ID</p>
            <p className="font-mono text-xl font-black text-foreground tracking-tight leading-none">
              {(item.stop_id ?? item.id).length > 20 ? "…" + (item.stop_id ?? item.id).slice(-17) : (item.stop_id ?? item.id)}
            </p>
          </div>

          {/* Bottom: address + source */}
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground/45 mb-0.5 uppercase tracking-wider">Destination</p>
              <p className="text-[11px] font-semibold text-foreground truncate">{item.delivery_address || "—"}</p>
              <p className="text-[10px] text-muted-foreground/60 truncate">{[item.delivery_city, item.delivery_state].filter(Boolean).join(", ")}</p>
            </div>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 bg-card/80 backdrop-blur-sm", src.bg, src.text)}>
              {item.source === "stop" ? "Stop" : "Draft"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Photo gallery
  return (
    <div className="space-y-2">
      {/* Featured photo */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted border border-border/40">
        <AnimatePresence mode="wait">
          <motion.img
            key={active}
            src={photos[active]}
            alt={`Photo ${active + 1}`}
            className="absolute inset-0 w-full h-full object-cover"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        </AnimatePresence>
        {/* Nav arrows (only if more than 1 photo) */}
        {photos.length > 1 && (
          <>
            <button type="button"
              onClick={() => setActive(p => (p - 1 + photos.length) % photos.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button"
              onClick={() => setActive(p => (p + 1) % photos.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors">
              <ChevronRight className="size-4" />
            </button>
            {/* Counter */}
            <div className="absolute bottom-2 right-2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white font-medium backdrop-blur-sm">
              {active + 1} / {photos.length}
            </div>
          </>
        )}
        {/* Open full-size */}
        <button type="button" onClick={() => window.open(photos[active], "_blank")}
          className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-[10px] text-white font-medium backdrop-blur-sm hover:bg-black/60 transition-colors">
          View full
        </button>
      </div>
      {/* Thumbnails row */}
      {photos.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {photos.map((url, i) => (
            <button key={i} type="button" onClick={() => setActive(i)}
              className={cn("shrink-0 size-14 overflow-hidden rounded-lg border-2 transition-all",
                active === i ? "border-primary shadow-sm" : "border-transparent opacity-60 hover:opacity-100")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Thumb ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Right panel map ────────────────────────────────────────────────────────
function RightMap({ lat, lng, address }: { lat: number | null; lng: number | null; address: string }) {
  if (lat && lng) {
    const d    = 0.009;
    const bbox = `${lng - d},${lat - d * 0.6},${lng + d},${lat + d * 0.6}`;
    return (
      <div className="relative h-[220px] overflow-hidden border-b border-border/30">
        <iframe title="map" width="100%" height="100%"
          style={{ border: 0, display: "block", minHeight: "220px" }} loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`} />
        {/* Animated pulse dot overlay */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-card/90 px-2.5 py-1.5 text-[10px] font-medium shadow-md backdrop-blur-sm">
          <motion.span className="relative flex size-2 shrink-0">
            <motion.span className="absolute inline-flex h-full w-full rounded-full bg-primary/40"
              animate={{ scale: [1, 1.8], opacity: [0.8, 0] }} transition={{ duration: 1.5, repeat: Infinity }} />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </motion.span>
          <span className="truncate max-w-[140px]">{[address.split(",")[0]].join("")}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-[140px] flex-col items-center justify-center gap-2 border-b border-border/30 bg-muted/20">
      <MapPin className="size-6 text-muted-foreground/25" />
      <p className="text-xs text-muted-foreground/45 text-center px-3 leading-snug">{address || "No coordinates available"}</p>
    </div>
  );
}

// ── InfoRow ────────────────────────────────────────────────────────────────
function InfoRow({
  icon: Icon, label, value, mono,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; mono?: boolean }) {
  if (!value || value === "—") return null;
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-border/20 last:border-0">
      <Icon className="size-3.5 shrink-0 text-muted-foreground/35 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground/45 uppercase tracking-wider mb-0.5">{label}</p>
        <p className={cn("text-xs font-medium text-foreground leading-snug", mono && "font-mono text-primary")}>{value}</p>
      </div>
    </div>
  );
}

// ── History Tab ────────────────────────────────────────────────────────────
function HistoryTab({ item }: { item: SearchResult }) {
  const [history, setHistory] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = item.delivery_city || item.delivery_address;
    if (!q) { setLoading(false); return; }
    const ctrl = new AbortController();
    fetch(`/api/client/search?q=${encodeURIComponent(q)}&limit=25`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => { setHistory((d.results ?? []).filter((r: SearchResult) => r.id !== item.id).slice(0, 15)); setLoading(false); })
      .catch(() => setLoading(false));
    return () => ctrl.abort();
  }, [item.id, item.delivery_city, item.delivery_address]);

  if (loading) return (
    <div className="p-4 space-y-2">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/40" />)}
    </div>
  );

  return (
    <div className="p-4">
      <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-3">
        {history.length > 0
          ? `${history.length} previous deliveries near ${item.delivery_city || "this location"}`
          : "Address History"}
      </p>
      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <MapPin className="size-7 text-muted-foreground/20" />
          <p className="text-xs text-muted-foreground/45">No previous deliveries found</p>
        </div>
      ) : (
        <ol className="space-y-2">
          {history.map(h => {
            const sc = statusColors(h.status);
            return (
              <li key={h.id} className={cn("flex items-start gap-3 rounded-lg border-l-2 border border-border/35 bg-muted/10 px-3 py-2.5", `border-l-border`)}>
                <span className={cn("mt-1 size-2 rounded-full shrink-0", sc.dot)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-primary font-semibold truncate">{h.stop_id ?? h.id}</span>
                    <span className={cn("text-[10px] font-semibold rounded-full px-1.5 py-0.5 shrink-0", sc.bg, sc.text)}>{statusLabel(h.status)}</span>
                  </div>
                  <p className="text-[11px] text-foreground font-medium truncate mt-0.5">{toTitleCase(h.recipient_name) || "—"}</p>
                  <p className="text-[10px] text-muted-foreground/55 mt-0.5">
                    {formatDate(h.delivery_date ?? h.created_at)}{h.driver_name && ` · ${toTitleCase(h.driver_name)}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ── Activity Tab ───────────────────────────────────────────────────────────
function ActivityTab({ item }: { item: SearchResult }) {
  type Ev = { label: string; icon: React.ComponentType<{ className?: string }>; color: string; ts: string };
  const events: Ev[] = [
    { label: "Stop created", icon: PlusCircle, color: "text-muted-foreground/50", ts: `${formatDate(item.created_at)} · ${formatTime(item.created_at)}` },
  ];
  if (item.source === "draft") events.push({ label: "Draft submitted via portal", icon: FileText, color: "text-amber-500", ts: formatDate(item.created_at) });
  if (item.driver_name) events.push({ label: `Assigned to ${toTitleCase(item.driver_name)}`, icon: Truck, color: "text-indigo-500", ts: "Active" });
  if (TRANSIT_ST.includes(item.status)) events.push({ label: "In transit to recipient", icon: Truck, color: "text-primary", ts: item.eta_at ? formatTime(item.eta_at) : "Active" });
  if (DELIVERED_ST.includes(item.status)) events.push({ label: "Successfully delivered", icon: CheckCircle2, color: "text-emerald-500", ts: item.eta_at ? formatTime(item.eta_at) : "Completed" });
  if (FAILED_ST.includes(item.status)) events.push({ label: "Delivery failed / attempted", icon: XCircle, color: "text-rose-500", ts: item.eta_at ? formatTime(item.eta_at) : "Failed" });
  if (item.photos.length > 0) events.push({ label: `${item.photos.length} proof photo${item.photos.length !== 1 ? "s" : ""} uploaded`, icon: CheckCircle2, color: "text-teal-500", ts: "Uploaded" });

  return (
    <div className="p-4">
      <ol>
        {events.map((ev, i) => {
          const Icon = ev.icon;
          return (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border/40">
                  <Icon className={cn("size-3.5", ev.color)} />
                </div>
                {i < events.length - 1 && <div className="w-px flex-1 bg-border/30 my-1" style={{ minHeight: "16px" }} />}
              </div>
              <div className="pb-4 pt-1 flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{ev.label}</p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">{ev.ts}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
interface Props { item: SearchResult | null; onClose: () => void; }

export function DetailSheet({ item, onClose }: Props) {
  const sc      = item ? statusColors(item.status) : null;
  const src     = item ? sourceColors(item.source) : null;
  const trackId = item ? (item.stop_id ?? item.id) : "";
  const address = item
    ? [item.delivery_address, item.delivery_city, item.delivery_state, item.delivery_zip].filter(Boolean).join(", ")
    : "";

  return (
    <Sheet open={!!item} onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[900px] p-0 flex flex-col overflow-hidden gap-0 bg-background">
        {item && (
          <>
            {/* ── HEADER ── */}
            <div className="shrink-0 border-b border-border/50 bg-card px-5 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-base font-bold text-foreground leading-none tracking-tight">
                      {trackId}
                    </span>
                    {sc && (
                      <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 shrink-0", sc.bg, sc.text, sc.ring)}>
                        <span className={cn("size-1.5 rounded-full", sc.dot)} />
                        {statusLabel(item.status)}
                      </span>
                    )}
                    {src && (
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", src.bg, src.text)}>
                        {item.source === "stop" ? "Stop" : "Draft"}
                      </span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                      {item.package_type ?? "RX"}
                    </span>
                    {item.is_same_day && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-400">⚡ Xpress</span>}
                    {item.collect_cod && <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-400">💵 COD</span>}
                    {item.requires_signature && <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-400">✍ Sig</span>}
                    {item.return_to_sender && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">↩ RTS</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{address}</p>
                </div>
                <SheetClose asChild>
                  <button type="button" className="shrink-0 flex items-center justify-center size-7 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground transition-colors">
                    <X className="size-3.5" />
                  </button>
                </SheetClose>
              </div>
            </div>

            {/* ── BODY: left + right ── */}
            <div className="flex-1 overflow-hidden flex flex-col sm:flex-row min-h-0">

              {/* LEFT COLUMN — Gallery + Tabs */}
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border-r border-border/30">
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-4">
                    {/* Gallery */}
                    <Gallery photos={item.photos} item={item} address={address} />

                    {/* Tabs */}
                    <Tabs defaultValue="overview" className="w-full">
                      <TabsList className="w-full justify-start rounded-lg bg-muted/40 p-0.5 h-8 gap-0.5">
                        {[
                          { v: "overview", l: "Overview" },
                          { v: "history",  l: "History" },
                          { v: "activity", l: "Activity" },
                        ].map(t => (
                          <TabsTrigger key={t.v} value={t.v}
                            className="flex-1 h-7 rounded-md text-[11px] font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground">
                            {t.l}
                          </TabsTrigger>
                        ))}
                      </TabsList>

                      <TabsContent value="overview" className="mt-3 focus-visible:outline-none">
                        <div className="space-y-0.5">
                          {/* Recipient section */}
                          <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
                            <div className="px-3 py-2 border-b border-border/30 bg-muted/20">
                              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Recipient</p>
                            </div>
                            <div className="px-3 py-1">
                              <InfoRow icon={User}    label="Name"    value={toTitleCase(item.recipient_name) || "—"} />
                              <InfoRow icon={Phone}   label="Phone"   value={formatPhone(item.recipient_phone)} />
                              <InfoRow icon={MapPin}  label="Address" value={address || "—"} />
                            </div>
                          </div>

                          {/* Delivery section */}
                          <div className="rounded-xl border border-border/40 bg-card overflow-hidden mt-3">
                            <div className="px-3 py-2 border-b border-border/30 bg-muted/20">
                              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Delivery</p>
                            </div>
                            <div className="px-3 py-1">
                              <InfoRow icon={Tag}      label="Package Type"   value={item.package_type?.toUpperCase() ?? "RX"} />
                              <InfoRow icon={Tag}      label="Service"        value={item.service_type ?? "Standard"} />
                              <InfoRow icon={Calendar} label="Delivery Date"  value={formatDate(item.delivery_date)} />
                              <InfoRow icon={Clock}    label="ETA"            value={item.eta_at ? formatTime(item.eta_at) : "—"} />
                              {item.is_same_day && <InfoRow icon={Zap}        label="Priority"       value="⚡ Same Day Xpress" />}
                            </div>
                          </div>

                          {/* Requirements */}
                          {(item.collect_cod || item.requires_signature || item.return_to_sender) && (
                            <div className="rounded-xl border border-border/40 bg-card overflow-hidden mt-3">
                              <div className="px-3 py-2 border-b border-border/30 bg-muted/20">
                                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Requirements</p>
                              </div>
                              <div className="px-3 py-1">
                                {item.collect_cod && <InfoRow icon={DollarSign}  label="COD Amount"  value={formatCurrency(item.collect_amount)} />}
                                {item.requires_signature && <InfoRow icon={PenLine} label="Signature" value="Required at delivery" />}
                                {item.return_to_sender && <InfoRow icon={RotateCcw} label="RTS"       value="Return to sender" />}
                              </div>
                            </div>
                          )}

                          {/* Operational */}
                          <div className="rounded-xl border border-border/40 bg-card overflow-hidden mt-3">
                            <div className="px-3 py-2 border-b border-border/30 bg-muted/20">
                              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Operational</p>
                            </div>
                            <div className="px-3 py-1">
                              <InfoRow icon={Truck}    label="Driver"   value={item.driver_name ? toTitleCase(item.driver_name) : "Unassigned"} />
                              <InfoRow icon={Building2} label="Route"   value={item.route_title ?? "—"} />
                              <InfoRow icon={FileText} label="Notes"    value={item.notes ?? "—"} />
                              {item.total_price > 0 && <InfoRow icon={DollarSign} label="Total Price" value={formatCurrency(item.total_price)} />}
                            </div>
                          </div>

                          {/* Meta */}
                          <div className="rounded-xl border border-border/40 bg-card overflow-hidden mt-3">
                            <div className="px-3 py-2 border-b border-border/30 bg-muted/20">
                              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Record</p>
                            </div>
                            <div className="px-3 py-1">
                              <InfoRow icon={Hash}     label="Tracking ID" value={trackId} mono />
                              <InfoRow icon={Tag}      label="Source"      value={item.source === "stop" ? "Dispatched Stop" : "Portal Draft"} />
                              <InfoRow icon={Clock}    label="Created"     value={`${formatDate(item.created_at)} · ${formatTime(item.created_at)}`} />
                            </div>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="history" className="mt-3 focus-visible:outline-none -mx-4">
                        <HistoryTab item={item} />
                      </TabsContent>
                      <TabsContent value="activity" className="mt-3 focus-visible:outline-none -mx-4">
                        <ActivityTab item={item} />
                      </TabsContent>
                    </Tabs>
                  </div>
                </ScrollArea>
              </div>

              {/* RIGHT COLUMN — Map + Quick Info (white background) */}
              <div className="hidden sm:flex w-[280px] shrink-0 flex-col bg-card overflow-hidden">
                {/* Map */}
                <RightMap lat={item.delivery_lat} lng={item.delivery_lng} address={address} />

                {/* Quick info panel */}
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-4">
                    {/* Status */}
                    {sc && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-wider mb-2">Status</p>
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold ring-1", sc.bg, sc.text, sc.ring)}>
                          <motion.span className={cn("size-2 rounded-full", sc.dot)}
                            animate={TRANSIT_ST.includes(item.status) ? { scale: [1,1.4,1], opacity: [1,0.5,1] } : {}}
                            transition={{ duration: 2, repeat: Infinity }} />
                          {statusLabel(item.status)}
                        </span>
                      </div>
                    )}

                    {/* Key info grid */}
                    <div className="space-y-3">
                      {[
                        { label: "Driver",  value: item.driver_name ? toTitleCase(item.driver_name) : "Unassigned", icon: Truck },
                        { label: "Route",   value: item.route_title ?? "—",                                          icon: MapPin },
                        { label: "ETA",     value: item.eta_at ? formatTime(item.eta_at) : "—",                     icon: Clock },
                        { label: "Created", value: formatDate(item.created_at),                                      icon: Calendar },
                      ].map(row => {
                        const Icon = row.icon;
                        return (
                          <div key={row.label} className="flex items-start gap-2.5">
                            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/50">
                              <Icon className="size-3 text-muted-foreground/50" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-medium text-muted-foreground/45 uppercase tracking-wide">{row.label}</p>
                              <p className="text-xs font-semibold text-foreground leading-snug truncate">{row.value}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Badges */}
                    {(item.is_same_day || item.collect_cod || item.requires_signature || item.return_to_sender) && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-wider mb-2">Flags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {item.is_same_day && <span className="rounded-full bg-violet-500/10 border border-violet-500/20 px-2.5 py-1 text-[10px] font-semibold text-violet-700 dark:text-violet-400">⚡ Xpress</span>}
                          {item.collect_cod && <span className="rounded-full bg-teal-500/10 border border-teal-500/20 px-2.5 py-1 text-[10px] font-semibold text-teal-700 dark:text-teal-400">💵 COD {item.collect_amount ? formatCurrency(item.collect_amount) : ""}</span>}
                          {item.requires_signature && <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 text-[10px] font-semibold text-indigo-700 dark:text-indigo-400">✍ Signature</span>}
                          {item.return_to_sender && <span className="rounded-full bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400">↩ RTS</span>}
                        </div>
                      </div>
                    )}

                    {/* Photo count (if any) */}
                    {item.photos.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-wider mb-2">Proof</p>
                        <p className="text-xs font-semibold text-foreground">{item.photos.length} photo{item.photos.length !== 1 ? "s" : ""} on file</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
