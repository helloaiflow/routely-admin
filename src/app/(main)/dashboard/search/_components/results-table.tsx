"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal, X, Check, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { statusLabel, formatPhone, formatDate, formatTime, toTitleCase } from "./_helpers";
import type { SearchResult } from "./_types";

const PAGE_SIZE = 25;
type SortKey = "recipient_name" | "status" | "created_at" | "delivery_city";

// Readable status pills. Solid + white where contrast holds; amber (unassigned/
// pending) and unknown statuses use a soft tinted style with DARK colored text
// because white-on-light-amber / muted-on-muted were unreadable.
function statusStyle(status: string): { bg: string; text: string; dot: string } {
  if (["delivered","completed","picked_up"].includes(status))
    return { bg:"bg-success", text:"text-white", dot:"bg-white/60" };
  if (["in_transit","out_for_delivery","dispatched","assigned"].includes(status))
    return { bg:"bg-primary", text:"text-white", dot:"bg-white/60" };
  if (["failed","attempted","cancelled","failed_not_home"].includes(status))
    return { bg:"bg-destructive", text:"text-white", dot:"bg-white/60" };
  if (["approved","paid"].includes(status))
    return { bg:"bg-info", text:"text-white", dot:"bg-white/60" };
  if (["unassigned","pending","submitted","created"].includes(status))
    return { bg:"bg-warning", text:"text-white", dot:"bg-white/60" };
  return { bg:"bg-muted border border-border", text:"text-foreground", dot:"bg-muted-foreground/60" };
}

function displayDate(r: SearchResult): { date: string; time: string | null } {
  const ev = ["delivered","completed","picked_up","failed","attempted","cancelled",
              "in_transit","out_for_delivery","dispatched","assigned"];
  if (ev.includes(r.status) && r.eta_at) return { date:formatDate(r.eta_at), time:formatTime(r.eta_at) };
  if (r.delivery_date) return { date:formatDate(r.delivery_date), time:null };
  return { date:formatDate(r.created_at), time:null };
}

interface FilterState { statuses:string[]; sources:string[]; types:string[]; cities:string[]; }
const EMPTY: FilterState = { statuses:[], sources:[], types:[], cities:[] };
const tog = (a:string[], v:string) => a.includes(v) ? a.filter(x=>x!==v) : [...a,v];

function FilterPopover({ results, filters, onApply }: {
  results:SearchResult[]; filters:FilterState; onApply:(f:FilterState)=>void;
}) {
  const [local, setLocal] = useState<FilterState>(filters);
  const opts = useMemo(() => ({
    statuses:[...new Set(results.map(r=>r.status))].sort(),
    sources:["stop","draft"] as const,
    types:[...new Set(results.map(r=>(r.package_type??"rx").toLowerCase()))].sort(),
    cities:[...new Set(results.map(r=>r.delivery_city).filter(Boolean))].sort(),
  }), [results]);
  const n = local.statuses.length+local.sources.length+local.types.length+local.cities.length;

  const Row = ({ label, active, onToggle }: { label:string; active:boolean; onToggle:()=>void }) => (
    <button type="button" onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/40 transition-colors">
      <span className={cn("flex size-3.5 shrink-0 items-center justify-center rounded border", active?"border-primary bg-primary":"border-border")}>
        {active && <Check className="size-2 text-white" strokeWidth={3.5} />}
      </span>
      <span className={active?"font-medium text-foreground":"text-muted-foreground"}>{label}</span>
    </button>
  );
  const Sect = ({ title, items, field }: { title:string; items:readonly string[]; field:keyof FilterState }) => (
    <div>
      <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40">{title}</p>
      {items.map(v=><Row key={v}
        label={field==="statuses"?statusLabel(v):v==="stop"?"Stop":v==="draft"?"Draft":v.toUpperCase()}
        active={local[field].includes(v)}
        onToggle={()=>setLocal(p=>({...p,[field]:tog(p[field],v)}))} />)}
    </div>
  );

  return (
    <Popover onOpenChange={open=>{if(open)setLocal(filters);}}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn(
          "h-7 gap-1.5 text-[11px] border-border/50 transition-all",
          n>0?"border-primary/50 bg-primary/[0.04] text-primary":"text-muted-foreground hover:text-foreground"
        )}>
          <SlidersHorizontal className="size-3"/>Filter
          {n>0&&<span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">{n}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="end">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">Filters</p>
          {n>0&&<button type="button" onClick={()=>{setLocal(EMPTY);onApply(EMPTY);}}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <X className="size-3"/>Clear</button>}
        </div>
        <div className="max-h-64 space-y-3 overflow-y-auto">
          {opts.statuses.length>1&&<Sect title="Status" items={opts.statuses} field="statuses"/>}
          <Sect title="Source" items={opts.sources} field="sources"/>
          {opts.types.length>1&&<Sect title="Type" items={opts.types} field="types"/>}
          {opts.cities.length>1&&<Sect title="City" items={opts.cities as string[]} field="cities"/>}
        </div>
        <div className="mt-3 border-t border-border/30 pt-2.5">
          <Button size="sm" className="h-7 w-full text-[11px]" onClick={()=>onApply(local)}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface Props {
  results:SearchResult[]; loading:boolean;
  onSelect:(r:SearchResult)=>void;
  fromStops:number; fromDrafts:number; selectedId?:string|null;
}

export function ResultsTable({ results, loading, onSelect, fromStops, fromDrafts, selectedId }: Props) {
  const [sort, setSort] = useState<{key:SortKey;dir:"asc"|"desc"}>({key:"created_at",dir:"desc"});
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FilterState>(EMPTY);

  const filtered = useMemo(()=>{
    let r=results;
    if(filters.statuses.length) r=r.filter(x=>filters.statuses.includes(x.status));
    if(filters.sources.length)  r=r.filter(x=>filters.sources.includes(x.source));
    if(filters.types.length)    r=r.filter(x=>filters.types.includes((x.package_type??"rx").toLowerCase()));
    if(filters.cities.length)   r=r.filter(x=>filters.cities.includes(x.delivery_city));
    return r;
  },[results,filters]);

  const sorted = useMemo(()=>[...filtered].sort((a,b)=>{
    const m=sort.dir==="asc"?1:-1;
    return String(a[sort.key]??"").localeCompare(String(b[sort.key]??""))*m;
  }),[filtered,sort]);

  const totalPages = Math.max(1,Math.ceil(sorted.length/PAGE_SIZE));
  const safePage   = Math.min(page,totalPages);
  const pageData   = sorted.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);

  const handleSort = (key:SortKey) => {
    setSort(p=>p.key===key?{key,dir:p.dir==="asc"?"desc":"asc"}:{key,dir:"asc"});
    setPage(1);
  };
  const fn = filters.statuses.length+filters.sources.length+filters.types.length+filters.cities.length;

  // Sort button helper
  const SortBtn = ({ col, label }: { col:SortKey; label:string }) => (
    <button type="button" onClick={()=>handleSort(col)}
      className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50 hover:text-foreground/80 transition-colors">
      {label}
      {sort.key===col
        ? sort.dir==="asc" ? <ChevronUp className="size-3 text-primary"/> : <ChevronDown className="size-3 text-primary"/>
        : <ArrowUpDown className="size-2.5 opacity-30"/>}
    </button>
  );

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border/60 bg-muted/40 px-4 py-2 flex gap-4">
        {["w-40","w-32","w-20","w-20","w-20","w-16"].map((w,i)=><div key={i} className={cn("h-2.5 animate-pulse rounded bg-muted",w)}/>)}
      </div>
      <div className="hidden sm:block">
        {Array.from({length:7}).map((_,i)=>(
          <div key={i} className="flex items-center gap-4 border-b border-border/60 px-4 py-3.5 last:border-0">
            <div className="space-y-1.5 w-36"><div className="h-3 w-full animate-pulse rounded bg-muted"/><div className="h-2 w-2/3 animate-pulse rounded bg-muted/60"/></div>
            <div className="space-y-1 w-40"><div className="h-2.5 w-full animate-pulse rounded bg-muted"/><div className="h-2 w-2/3 animate-pulse rounded bg-muted/60"/></div>
            <div className="h-2.5 w-24 animate-pulse rounded bg-muted"/>
            <div className="h-6 w-20 animate-pulse rounded-full bg-muted"/>
            <div className="space-y-1 w-28"><div className="h-2.5 w-full animate-pulse rounded bg-muted"/><div className="h-2 w-2/3 animate-pulse rounded bg-muted/60"/></div>
            <div className="ml-auto h-2.5 w-20 animate-pulse rounded bg-muted"/>
          </div>
        ))}
      </div>
      <div className="sm:hidden divide-y divide-border/60">
        {Array.from({length:5}).map((_,i)=>(
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="size-2 rounded-full bg-muted shrink-0"/>
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-36 animate-pulse rounded bg-muted"/>
              <div className="h-2.5 w-48 animate-pulse rounded bg-muted/60"/>
            </div>
            <div className="h-6 w-16 animate-pulse rounded-full bg-muted"/>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/40 px-4 py-2">
        <p className="text-xs text-muted-foreground/70">
          <span className="font-semibold text-foreground/80 tabular-nums">{filtered.length}</span>
          {" "}{filtered.length!==1?"results":"result"}
          {fn>0&&<span className="ml-1 font-medium text-primary">(filtered)</span>}
          {fromDrafts>0&&<span className="ml-2 text-muted-foreground/50 text-[11px]">{fromStops} stops · {fromDrafts} drafts</span>}
        </p>
        <FilterPopover results={results} filters={filters} onApply={f=>{setFilters(f);setPage(1);}}/>
      </div>

      {/* ── Desktop: 6 columns ──────────────────────────────────────────────── */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              {/* 1. Recipient */}
              <th className="px-4 py-2.5 text-left"><SortBtn col="recipient_name" label="Recipient"/></th>
              {/* 2. Address */}
              <th className="px-4 py-2.5 text-left"><SortBtn col="delivery_city" label="Address"/></th>
              {/* 3. Phone */}
              <th className="px-4 py-2.5 text-left">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">Phone</span>
              </th>
              {/* 4. Status */}
              <th className="px-4 py-2.5 text-left"><SortBtn col="status" label="Status"/></th>
              {/* 5. Driver */}
              <th className="px-4 py-2.5 text-left">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">Driver</span>
              </th>
              {/* 6. Date */}
              <th className="px-4 py-2.5 text-right"><SortBtn col="created_at" label="Date"/></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {pageData.length===0 ? (
              <tr><td colSpan={6} className="py-14 text-center text-[13px] text-muted-foreground/50">No results found</td></tr>
            ) : pageData.map(r=>{
              const tid   = r.stop_id??r.id;
              const isSel = !!selectedId&&(tid===selectedId||r.id===selectedId||r.stop_id===selectedId);
              const st    = statusStyle(r.status);
              const dt    = displayDate(r);
              return (
                <tr key={r.id} onClick={()=>onSelect(r)}
                  className={cn(
                    "cursor-pointer transition-colors",
                    isSel?"bg-primary/[0.05] shadow-[inset_3px_0_0_0_var(--primary)]":"hover:bg-muted/40",
                  )}>

                  {/* 1. Recipient: name + tracking */}
                  <td className="px-4 py-3.5">
                    <p className="truncate max-w-[170px] text-[13px] font-semibold leading-tight text-foreground">
                      {toTitleCase(r.recipient_name)||"—"}
                    </p>
                    <p className="mt-1 truncate max-w-[170px] font-mono text-[11px] text-primary/85">
                      {tid}
                    </p>
                  </td>

                  {/* 2. Address — single clean line */}
                  <td className="px-4 py-3.5 max-w-[280px]">
                    <p className="truncate text-[13px] text-foreground/85" title={r.delivery_address}>
                      {r.delivery_address||"—"}
                    </p>
                    {(r.delivery_city||r.delivery_state)&&(
                      <p className="mt-1 truncate text-[11px] text-muted-foreground/55">
                        {[r.delivery_city,r.delivery_state].filter(Boolean).join(", ")}{r.delivery_zip?` ${r.delivery_zip}`:""}
                      </p>
                    )}
                  </td>

                  {/* 3. Phone */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <p className="text-[13px] tabular-nums text-foreground/70">{formatPhone(r.recipient_phone)||"—"}</p>
                  </td>

                  {/* 4. Status — badge + subtle source/type (no chip stack) */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",st.bg,st.text)}>
                        <span className={cn("size-1.5 rounded-full",st.dot)}/>
                        {statusLabel(r.status)}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground/50">
                        {r.source==="stop"?"Stop":"Draft"} · {(r.package_type??"RX").toUpperCase()}
                        {r.is_same_day?" · ⚡":""}{r.collect_cod?" · 💵":""}
                      </span>
                    </div>
                  </td>

                  {/* 5. Driver — single line */}
                  <td className="px-4 py-3.5 max-w-[150px]">
                    {r.driver_name
                      ? <p className="truncate text-[13px] font-medium text-foreground/80">{toTitleCase(r.driver_name)}</p>
                      : <span className="text-[11px] text-muted-foreground/40">Unassigned</span>}
                  </td>

                  {/* 6. Date — single line */}
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <p className="text-[13px] font-medium text-muted-foreground">
                      {dt.date}{dt.time?<span className="text-muted-foreground/50"> · {dt.time}</span>:""}
                    </p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: simple list, opens panel (not new page) ──────────────── */}
      <div className="sm:hidden divide-y divide-border/60">
        {pageData.length===0 ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground/50">No results found</div>
        ) : pageData.map(r=>{
          const tid   = r.stop_id??r.id;
          const isSel = !!selectedId&&(tid===selectedId||r.id===selectedId||r.stop_id===selectedId);
          const st    = statusStyle(r.status);
          const dt    = displayDate(r);
          return (
            <button key={r.id} type="button" onClick={()=>onSelect(r)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
                isSel?"bg-primary/[0.06] shadow-[inset_2px_0_0_0_var(--primary)]":"hover:bg-muted/40",
              )}>
              {/* Status dot */}
              <span className={cn("size-2 shrink-0 rounded-full",st.bg)}/>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-foreground truncate">
                    {toTitleCase(r.recipient_name)||"—"}
                  </p>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",st.bg,st.text)}>
                    {statusLabel(r.status)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground/70 truncate">
                  {r.delivery_address||"—"}{r.delivery_city?`, ${r.delivery_city}`:""}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-bold text-primary truncate">{tid}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground/50">{dt.date}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Pagination */}
      {sorted.length>0&&(
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/40 px-4 py-2">
          <p className="text-[11px] text-muted-foreground/50 tabular-nums">
            {sorted.length<=PAGE_SIZE
              ? `${sorted.length} total`
              : `${(safePage-1)*PAGE_SIZE+1}–${Math.min(safePage*PAGE_SIZE,sorted.length)} of ${sorted.length}`}
          </p>
          {totalPages>1&&(
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground/50 hover:text-foreground/80"
                disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>
                <ChevronLeft className="size-3.5"/>
              </Button>
              <span className="px-2 text-[11px] text-muted-foreground/70 tabular-nums">{safePage}/{totalPages}</span>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground/50 hover:text-foreground/80"
                disabled={safePage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>
                <ChevronRight className="size-3.5"/>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
