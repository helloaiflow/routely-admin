"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, User, Phone, MapPin, Package, Truck,
  Calendar, DollarSign, PenLine, Clock, FileText, Tag,
  CheckCircle2, XCircle, PlusCircle, ImageOff,
  ChevronLeft, ChevronRight, Zap, RotateCcw, Hash, Building2, AlertCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  statusColors, statusLabel, sourceColors,
  formatPhone, formatDate, formatTime, formatCurrency, toTitleCase,
} from "../../_components/_helpers";
import type { SearchResult } from "../../_components/_types";

const DELIVERED_ST = ["delivered","completed","picked_up"];
const FAILED_ST    = ["failed","attempted","cancelled","failed_not_home"];
const TRANSIT_ST   = ["in_transit","out_for_delivery","dispatched","assigned"];

function DetailMap({ lat, lng, address }: { lat:number|null; lng:number|null; address:string }) {
  if (lat && lng) {
    const d = 0.009;
    const bbox = `${lng-d},${lat-d*0.6},${lng+d},${lat+d*0.6}`;
    return (
      <div className="relative h-full w-full overflow-hidden bg-muted">
        <iframe title="map" width="100%" height="100%"
          style={{ border:0, display:"block", minHeight:"100%" }} loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`} />
        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-card/90 px-2.5 py-1.5 text-[10px] font-medium shadow-md backdrop-blur-sm">
          <motion.span className="relative flex size-2 shrink-0">
            <motion.span className="absolute inline-flex h-full w-full rounded-full bg-primary/40"
              animate={{ scale:[1,1.8], opacity:[0.8,0] }} transition={{ duration:1.5, repeat:Infinity }} />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </motion.span>
          <span className="truncate max-w-[160px]">{address.split(",")[0]}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-card">
      <MapPin className="size-6 text-muted-foreground/25" />
      <p className="text-xs text-muted-foreground/45 text-center px-4 leading-snug">{address || "No location"}</p>
    </div>
  );
}

function Gallery({ photos, item, address }: { photos:string[]; item:SearchResult; address:string }) {
  const [active, setActive] = useState(0);
  const sc  = statusColors(item.status);
  const src = sourceColors(item.source);
  const tid = item.stop_id ?? item.id;

  if (photos.length === 0) {
    return (
      <div className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-muted via-muted/50 to-card border border-border/40" style={{ paddingBottom:"66.67%" }}>
        <svg className="absolute inset-0 w-full h-full opacity-[0.035]" xmlns="http://www.w3.org/2000/svg">
          <defs><pattern id="grid-dp" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeWidth="1"/>
          </pattern></defs>
          <rect width="100%" height="100%" fill="url(#grid-dp)" />
        </svg>
        <div className="absolute inset-0 flex flex-col justify-between p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-card/70 backdrop-blur-sm border border-border/30 shadow-sm">
                <Package className="size-4 text-muted-foreground/60" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">Type</p>
                <p className="text-xs font-bold text-foreground">{item.package_type?.toUpperCase() ?? "RX"}</p>
              </div>
            </div>
            <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 bg-card/80 backdrop-blur-sm", sc.text, sc.ring)}>
              <span className={cn("size-1.5 rounded-full", sc.dot)} />{statusLabel(item.status)}
            </span>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-medium text-muted-foreground/40 mb-2 uppercase tracking-widest">Tracking ID</p>
            <p className="font-mono text-2xl font-black text-foreground tracking-tight leading-none">
              {tid.length > 22 ? "…" + tid.slice(-19) : tid}
            </p>
          </div>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground/40 mb-0.5 uppercase tracking-wider">Destination</p>
              <p className="text-xs font-semibold text-foreground truncate">{item.delivery_address || "—"}</p>
              <p className="text-[10px] text-muted-foreground/60 truncate">{[item.delivery_city, item.delivery_state].filter(Boolean).join(", ")}</p>
            </div>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 bg-card/80", src.bg, src.text)}>
              {item.source === "stop" ? "Stop" : "Draft"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative w-full overflow-hidden rounded-2xl bg-muted border border-border/30" style={{ paddingBottom:"66.67%" }}>
        <AnimatePresence mode="wait">
          <motion.img key={active} src={photos[active]} alt={`Photo ${active+1}`}
            className="absolute inset-0 w-full h-full object-cover"
            initial={{ opacity:0, scale:1.02 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}
            transition={{ duration:0.2 }} />
        </AnimatePresence>
        {photos.length > 1 && (
          <>
            <button type="button" onClick={() => setActive(p => (p-1+photos.length)%photos.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => setActive(p => (p+1)%photos.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors">
              <ChevronRight className="size-4" />
            </button>
            <div className="absolute bottom-3 right-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white font-medium backdrop-blur-sm">
              {active+1} / {photos.length}
            </div>
          </>
        )}
        <button type="button" onClick={() => window.open(photos[active], "_blank")}
          className="absolute top-3 right-3 rounded-full bg-black/40 px-2.5 py-1 text-[10px] text-white font-medium backdrop-blur-sm hover:bg-black/60 transition-colors">
          View full
        </button>
      </div>
      {photos.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {photos.map((url, i) => (
            <button key={i} type="button" onClick={() => setActive(i)}
              className={cn("shrink-0 size-14 overflow-hidden rounded-xl border-2 transition-all",
                active === i ? "border-primary shadow-sm" : "border-transparent opacity-60 hover:opacity-100")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Thumb ${i+1}`} className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon:Icon, label, value, mono }: {
  icon: React.ComponentType<{className?:string}>; label:string; value:React.ReactNode; mono?:boolean;
}) {
  if (!value || value === "—") return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/20 last:border-0">
      <Icon className="size-3.5 shrink-0 text-muted-foreground/35 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-wider mb-0.5">{label}</p>
        <p className={cn("text-xs font-medium text-foreground leading-snug", mono && "font-mono text-primary")}>{value}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title:string; children:React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/30 bg-muted/10">
        <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">{title}</p>
      </div>
      <div className="px-4 py-1">{children}</div>
    </div>
  );
}

function HistoryTab({ item }: { item:SearchResult }) {
  const [history, setHistory] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = item.delivery_city || item.delivery_address;
    if (!q) { setLoading(false); return; }
    const ctrl = new AbortController();
    fetch(`/api/client/search?q=${encodeURIComponent(q)}&limit=25`, { signal:ctrl.signal })
      .then(r => r.json())
      .then(d => { setHistory((d.results ?? []).filter((r:SearchResult) => r.id !== item.id).slice(0, 15)); setLoading(false); })
      .catch(() => setLoading(false));
    return () => ctrl.abort();
  }, [item.id, item.delivery_city, item.delivery_address]);

  if (loading) return <div className="space-y-2 py-2">{Array.from({length:4}).map((_,i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/40" />)}</div>;

  return (
    <div className="py-2">
      <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-3">
        {history.length > 0 ? `${history.length} previous deliveries near ${item.delivery_city || "this location"}` : "Address History"}
      </p>
      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <MapPin className="size-7 text-muted-foreground/20" />
          <p className="text-xs text-muted-foreground/45">No previous deliveries found</p>
        </div>
      ) : (
        <ol className="space-y-2">
          {history.map(h => {
            const sc = statusColors(h.status);
            return (
              <li key={h.id} className="flex items-start gap-3 rounded-lg border border-border/35 bg-muted/10 px-3 py-2.5">
                <span className={cn("mt-1 size-2 rounded-full shrink-0", sc.dot)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-primary font-semibold truncate">{h.stop_id ?? h.id}</span>
                    <span className={cn("text-[10px] font-semibold rounded-full px-1.5 py-0.5 shrink-0", sc.bg, sc.text)}>{statusLabel(h.status)}</span>
                  </div>
                  <p className="text-[11px] text-foreground font-medium truncate mt-0.5">{toTitleCase(h.recipient_name) || "—"}</p>
                  <p className="text-[10px] text-muted-foreground/55 mt-0.5">{formatDate(h.delivery_date ?? h.created_at)}{h.driver_name && ` · ${toTitleCase(h.driver_name)}`}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ActivityTab({ item }: { item:SearchResult }) {
  type Ev = { label:string; icon:React.ComponentType<{className?:string}>; color:string; ts:string };
  const events: Ev[] = [
    { label:"Stop created", icon:PlusCircle, color:"text-muted-foreground/50", ts:`${formatDate(item.created_at)} · ${formatTime(item.created_at)}` },
  ];
  if (item.source === "draft") events.push({ label:"Draft submitted", icon:FileText, color:"text-amber-500", ts:formatDate(item.created_at) });
  if (item.driver_name) events.push({ label:`Assigned to ${toTitleCase(item.driver_name)}`, icon:Truck, color:"text-indigo-500", ts:"Active" });
  if (TRANSIT_ST.includes(item.status)) events.push({ label:"In transit", icon:Truck, color:"text-primary", ts:item.eta_at ? formatTime(item.eta_at) : "Active" });
  if (DELIVERED_ST.includes(item.status)) events.push({ label:"Delivered", icon:CheckCircle2, color:"text-emerald-500", ts:item.eta_at ? formatTime(item.eta_at) : "Done" });
  if (FAILED_ST.includes(item.status)) events.push({ label:"Delivery failed", icon:XCircle, color:"text-rose-500", ts:item.eta_at ? formatTime(item.eta_at) : "Failed" });
  if (item.photos.length > 0) events.push({ label:`${item.photos.length} proof photo${item.photos.length !== 1 ? "s" : ""} uploaded`, icon:CheckCircle2, color:"text-teal-500", ts:"Uploaded" });

  return (
    <div className="py-2">
      <ol>
        {events.map((ev, i) => {
          const Icon = ev.icon;
          return (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border/40">
                  <Icon className={cn("size-3.5", ev.color)} />
                </div>
                {i < events.length - 1 && <div className="w-px flex-1 bg-border/25 my-1" style={{ minHeight:"16px" }} />}
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

function MediaTab({ photos }: { photos:string[] }) {
  if (photos.length === 0) return (
    <div className="flex flex-col items-center gap-2 py-10">
      <ImageOff className="size-8 text-muted-foreground/20" />
      <p className="text-xs text-muted-foreground/40">No media available</p>
    </div>
  );
  return (
    <div className="py-2 grid grid-cols-3 gap-2">
      {photos.map((url, i) => (
        <button key={i} type="button" onClick={() => window.open(url, "_blank")}
          className="aspect-square overflow-hidden rounded-lg border border-border/40 bg-muted hover:border-primary/40 transition-colors">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`Photo ${i+1}`} className="w-full h-full object-cover" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

export function DetailView({ id }: { id:string }) {
  const router = useRouter();
  const [item, setItem]     = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const fetchItem = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/client/search?q=${encodeURIComponent(id)}&limit=10`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const results: SearchResult[] = d.results ?? [];
      const exact = results.find(x => (x.stop_id ?? x.id) === id || x.id === id || x.stop_id === id);
      setItem(exact ?? results[0] ?? null);
    } catch {
      setError("Failed to load shipment details.");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchItem(); }, [fetchItem]);

  const address = item ? [item.delivery_address, item.delivery_city, item.delivery_state, item.delivery_zip].filter(Boolean).join(", ") : "";
  const sc  = item ? statusColors(item.status) : null;
  const src = item ? sourceColors(item.source) : null;
  const tid = item ? (item.stop_id ?? item.id) : id;

  if (loading) return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 bg-card">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-muted/60" />
        <div className="h-6 w-48 animate-pulse rounded bg-muted/50" />
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted/40" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <div className="w-full animate-pulse rounded-2xl bg-muted/40" style={{ paddingBottom:"66.67%" }} />
          <div className="h-40 animate-pulse rounded-xl bg-muted/30" />
        </div>
        <div className="space-y-4">
          <div className="h-60 animate-pulse rounded-xl bg-muted/40" />
          <div className="h-32 animate-pulse rounded-xl bg-muted/30" />
        </div>
      </div>
    </div>
  );

  if (error || !item) return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 bg-card">
      <div className="flex size-12 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/25">
        <AlertCircle className="size-5 text-rose-500" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">{error ?? "Shipment not found"}</p>
        <p className="text-xs text-muted-foreground mt-1">Could not load details for <span className="font-mono">{id}</span></p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="size-3.5 mr-1.5" />Go Back
        </Button>
        <Button size="sm" onClick={fetchItem}>Retry</Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col bg-card min-h-0">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border/50 bg-card/95 backdrop-blur-sm px-4 md:px-6 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => router.back()}
            className="h-7 px-2 text-muted-foreground hover:text-foreground gap-1.5 -ml-1">
            <ArrowLeft className="size-3.5" />
            <span className="text-xs">Search</span>
          </Button>
          <span className="text-muted-foreground/30 text-sm">/</span>
          <span className="font-mono text-sm font-bold text-foreground tracking-tight">{tid}</span>
          {sc && (
            <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", sc.bg, sc.text, sc.ring)}>
              <motion.span className={cn("size-1.5 rounded-full", sc.dot)}
                animate={TRANSIT_ST.includes(item.status) ? { scale:[1,1.4,1], opacity:[1,0.5,1] } : {}}
                transition={{ duration:2, repeat:Infinity }} />
              {statusLabel(item.status)}
            </span>
          )}
          {src && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", src.bg, src.text)}>{item.source === "stop" ? "Stop" : "Draft"}</span>}
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">{item.package_type ?? "RX"}</span>
          {item.is_same_day && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-400">⚡ Xpress</span>}
          {item.collect_cod && <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-400">💵 COD</span>}
          {item.requires_signature && <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-400">✍ Sig</span>}
          {item.return_to_sender && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">↩ RTS</span>}
          <span className="text-[10px] text-muted-foreground/40 ml-auto">{formatDate(item.created_at)}</span>
        </div>
        {address && <p className="text-xs text-muted-foreground mt-1 truncate">{address}</p>}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 p-4 md:p-6">

          {/* LEFT: Gallery + Tabs */}
          <div className="flex flex-col gap-5">
            <Gallery photos={item.photos} item={item} address={address} />
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full justify-start rounded-xl bg-muted/40 p-1 h-9 gap-1 mb-4">
                {[
                  { v:"overview", l:"Overview" },
                  { v:"history",  l:"History" },
                  { v:"activity", l:"Activity" },
                  ...(item.photos.length > 0 ? [{ v:"media", l:`Media (${item.photos.length})` }] : []),
                ].map(t => (
                  <TabsTrigger key={t.v} value={t.v}
                    className="flex-1 h-7 rounded-lg text-[11px] font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground">
                    {t.l}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="overview" className="mt-0 focus-visible:outline-none space-y-3">
                <Section title="Recipient">
                  <InfoRow icon={User}    label="Name"    value={toTitleCase(item.recipient_name) || "—"} />
                  <InfoRow icon={Phone}   label="Phone"   value={formatPhone(item.recipient_phone)} />
                  <InfoRow icon={MapPin}  label="Address" value={address || "—"} />
                </Section>
                <Section title="Delivery">
                  <InfoRow icon={Tag}      label="Package"       value={item.package_type?.toUpperCase() ?? "RX"} />
                  <InfoRow icon={Tag}      label="Service"       value={item.service_type ?? "Standard"} />
                  <InfoRow icon={Calendar} label="Delivery Date" value={formatDate(item.delivery_date)} />
                  <InfoRow icon={Clock}    label="ETA"           value={item.eta_at ? formatTime(item.eta_at) : "—"} />
                  {item.is_same_day && <InfoRow icon={Zap} label="Priority" value="⚡ Same Day Xpress" />}
                </Section>
                {(item.collect_cod || item.requires_signature || item.return_to_sender) && (
                  <Section title="Requirements">
                    {item.collect_cod && <InfoRow icon={DollarSign} label="COD Amount" value={formatCurrency(item.collect_amount)} />}
                    {item.requires_signature && <InfoRow icon={PenLine} label="Signature" value="Required at delivery" />}
                    {item.return_to_sender && <InfoRow icon={RotateCcw} label="RTS" value="Return to sender" />}
                  </Section>
                )}
                <Section title="Operational">
                  <InfoRow icon={Truck}     label="Driver" value={item.driver_name ? toTitleCase(item.driver_name) : "Unassigned"} />
                  <InfoRow icon={Building2} label="Route"  value={item.route_title ?? "—"} />
                  <InfoRow icon={FileText}  label="Notes"  value={item.notes ?? "—"} />
                  {item.total_price > 0 && <InfoRow icon={DollarSign} label="Total" value={formatCurrency(item.total_price)} />}
                </Section>
                <Section title="Record">
                  <InfoRow icon={Hash}  label="Tracking ID" value={tid} mono />
                  <InfoRow icon={Tag}   label="Source"      value={item.source === "stop" ? "Dispatched Stop" : "Portal Draft"} />
                  <InfoRow icon={Clock} label="Created"     value={`${formatDate(item.created_at)} · ${formatTime(item.created_at)}`} />
                </Section>
              </TabsContent>

              <TabsContent value="history"  className="mt-0 focus-visible:outline-none"><HistoryTab item={item} /></TabsContent>
              <TabsContent value="activity" className="mt-0 focus-visible:outline-none"><ActivityTab item={item} /></TabsContent>
              {item.photos.length > 0 && (
                <TabsContent value="media" className="mt-0 focus-visible:outline-none"><MediaTab photos={item.photos} /></TabsContent>
              )}
            </Tabs>
          </div>

          {/* RIGHT: unified white card — map + info seamlessly */}
          <div className="overflow-hidden rounded-2xl border border-border/40 bg-card shadow-sm">
            <div style={{ height:"220px" }}>
              <DetailMap lat={item.delivery_lat} lng={item.delivery_lng} address={address} />
            </div>
            <div className="border-t border-border/30 p-4 space-y-4">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-wider mb-2">Status</p>
                {sc && (
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold ring-1", sc.bg, sc.text, sc.ring)}>
                    <span className={cn("size-2 rounded-full", sc.dot)} />{statusLabel(item.status)}
                  </span>
                )}
              </div>
              <Separator />
              <div className="space-y-3">
                {[
                  { label:"Driver",  value: item.driver_name ? toTitleCase(item.driver_name) : "Unassigned", icon:Truck },
                  { label:"Route",   value: item.route_title ?? "—", icon:MapPin },
                  { label:"ETA",     value: item.eta_at ? formatTime(item.eta_at) : "—", icon:Clock },
                  { label:"Created", value: formatDate(item.created_at), icon:Calendar },
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
              {(item.is_same_day || item.collect_cod || item.requires_signature || item.return_to_sender) && (
                <>
                  <Separator />
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-wider mb-2">Flags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {item.is_same_day && <span className="rounded-full bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-400">⚡ Xpress</span>}
                      {item.collect_cod && <span className="rounded-full bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-400">💵 {item.collect_amount ? formatCurrency(item.collect_amount) : "COD"}</span>}
                      {item.requires_signature && <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-400">✍ Signature</span>}
                      {item.return_to_sender && <span className="rounded-full bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">↩ RTS</span>}
                    </div>
                  </div>
                </>
              )}
              {item.photos.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-wider mb-1">Proof</p>
                    <p className="text-xs font-semibold text-foreground">{item.photos.length} photo{item.photos.length !== 1 ? "s" : ""} on file</p>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
