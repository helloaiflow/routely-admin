"use client";

import { useMemo, useState } from "react";

import { ChevronLeft, ChevronRight, Download, ExternalLink, MoreVertical, Printer, Search, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { LabelDetailSheet } from "./label-detail-sheet";
import {
  CARRIER_LOGOS,
  estArrivalLabel,
  type LabelOrder,
  type LabelStatus,
  money,
  STATUS_META,
  shortDate,
} from "./types";

const PAGE_SIZE = 25;

/* Carrier chip — same plate pattern as orders/new (bg-white/95 = gate exemption) */
export function CarrierChip({ provider, size = "sm" }: { provider?: string; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const logo = provider ? CARRIER_LOGOS[provider.toLowerCase()] : undefined;
  if (logo && !failed) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-md bg-white/95 ring-1 ring-border",
          size === "sm" ? "size-6" : "size-8",
        )}
      >
        {/* biome-ignore lint/performance/noImgElement: tiny local brand SVG */}
        <img
          src={logo}
          alt={provider}
          className={cn("size-full object-contain", size === "sm" ? "p-0.5" : "p-1")}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-border/60 bg-muted px-1.5 font-bold text-[10px]">
      {provider ?? "—"}
    </span>
  );
}

export function StatusBadge({ status }: { status: LabelStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.failed;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium text-[11px]",
        meta.cls,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function LabelsTable({ orders }: { orders: LabelOrder[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [carrier, setCarrier] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<LabelOrder | null>(null);

  const carriers = useMemo(
    () => [...new Set(orders.map((o) => o.rate?.provider).filter(Boolean))] as string[],
    [orders],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (carrier !== "all" && o.rate?.provider !== carrier) return false;
      if (!q) return true;
      return (
        o.order_id.toLowerCase().includes(q) ||
        (o.shippo?.tracking_number ?? "").toLowerCase().includes(q) ||
        (o.to_address?.name ?? "").toLowerCase().includes(q) ||
        (o.to_address?.city ?? "").toLowerCase().includes(q)
      );
    });
  }, [orders, query, status, carrier]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const resetPage = () => setPage(0);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 border-dashed bg-card px-6 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-primary/10">
          <Tag className="size-5 text-primary" aria-hidden="true" />
        </span>
        <div>
          <p className="type-card-title">No labels yet</p>
          <p className="type-desc mt-1">Buy USPS, UPS, or FedEx labels at Routely rates — right from your dashboard.</p>
        </div>
        <Button asChild className="mt-1 bg-primary font-semibold text-white hover:bg-primary/90">
          <a href="/dashboard/orders/new">Buy your first label</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* One cohesive card: in-card toolbar (stops grid pattern) + rows + footer */}
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        {/* ── Toolbar — lives INSIDE the card, separated by border-b ── */}
        <div className="flex flex-col gap-2 border-border/60 border-b px-3 py-2.5 sm:flex-row sm:items-center">
          <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
            <Search className="size-3.5 shrink-0 text-primary/60" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPage();
              }}
              placeholder="Search order, tracking, or recipient…"
              aria-label="Search labels"
              className="h-full w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground/50 sm:text-[13px]"
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                resetPage();
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-9 w-[130px] border-border/60 text-[13px]"
                aria-label="Filter by status"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={carrier}
              onValueChange={(v) => {
                setCarrier(v);
                resetPage();
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-9 w-[110px] border-border/60 text-[13px]"
                aria-label="Filter by carrier"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All carriers</SelectItem>
                {carriers.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Desktop table ── */}
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Ship To</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.order_id} className="cursor-pointer" onClick={() => setSelected(o)}>
                  <TableCell className="font-mono text-[11px] text-primary tabular-nums">{o.order_id}</TableCell>
                  <TableCell>
                    <span className="block text-[13px] text-muted-foreground">{shortDate(o.created_at)}</span>
                    {estArrivalLabel(o) && (
                      <span className="block text-[11px] text-muted-foreground/70">Est. {estArrivalLabel(o)}</span>
                    )}
                  </TableCell>
                  {/* Recipient: name + tracking (mono) below */}
                  <TableCell className="max-w-[190px]">
                    <span className="block truncate font-medium text-[13px]">{o.to_address?.name ?? "—"}</span>
                    {o.shippo?.tracking_number ? (
                      o.shippo?.tracking_url ? (
                        <a
                          href={o.shippo.tracking_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate font-mono text-[11px] text-primary tabular-nums hover:underline"
                        >
                          {o.shippo.tracking_number}
                        </a>
                      ) : (
                        <span className="block truncate font-mono text-[11px] text-muted-foreground tabular-nums">
                          {o.shippo.tracking_number}
                        </span>
                      )
                    ) : (
                      <span className="block font-mono text-[11px] text-muted-foreground tabular-nums">—</span>
                    )}
                  </TableCell>
                  {/* Ship To: street + City, ST ZIP */}
                  <TableCell className="max-w-[200px]">
                    <span className="block truncate text-[13px]">{o.to_address?.street1 ?? "—"}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[o.to_address?.city, [o.to_address?.state, o.to_address?.zip].filter(Boolean).join(" ")]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      <CarrierChip provider={o.rate?.provider} />
                      <span className="text-[13px]">{o.rate?.provider ?? "—"}</span>
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate text-[13px]">{o.rate?.service ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="text-right font-semibold text-[13px] tabular-nums">
                    {money(o.rate?.client_price)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <RowMenu order={o} onDetail={() => setSelected(o)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* ── Mobile rows (same card, divided) ── */}
        <div className="divide-y divide-border/40 sm:hidden">
          {rows.map((o) => (
            <button
              key={o.order_id}
              type="button"
              onClick={() => setSelected(o)}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/30"
            >
              <CarrierChip provider={o.rate?.provider} size="md" />
              <span className="min-w-0 flex-1">
                {/* name + tracking on top */}
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-[13px]">{o.to_address?.name ?? "—"}</span>
                  <span className="shrink-0 font-semibold text-[13px] tabular-nums">{money(o.rate?.client_price)}</span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[11px] text-muted-foreground tabular-nums">
                    {o.shippo?.tracking_number ?? o.order_id}
                  </span>
                  <StatusBadge status={o.status} />
                </span>
                {/* address below */}
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {[
                    o.to_address?.street1,
                    o.to_address?.city,
                    [o.to_address?.state, o.to_address?.zip].filter(Boolean).join(" "),
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  {estArrivalLabel(o) ? ` · Est. ${estArrivalLabel(o)}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* ── Footer: empty-filter state + pagination inside the card ── */}
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-muted-foreground text-sm">No labels match those filters.</p>
        )}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-border/60 border-t px-3 py-2">
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-border/60"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-border/60"
                disabled={safePage >= pages - 1}
                onClick={() => setPage(safePage + 1)}
              >
                Next
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <LabelDetailSheet order={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}

export function printLabelPng(labelUrl: string | undefined, title: string) {
  if (!labelUrl || typeof window === "undefined") return;
  const w = window.open("", "_blank", "width=480,height=720");
  if (!w) return;
  w.document.write(
    `<!DOCTYPE html><html><head><title>${title}</title><style>@page{margin:0}body{margin:0;display:flex;justify-content:center}img{width:4in}</style></head><body><img src="${labelUrl}" onload="window.print()" /></body></html>`,
  );
  w.document.close();
}

function RowMenu({ order, onDetail }: { order: LabelOrder; onDetail: () => void }) {
  const canAct = order.status === "purchased" && order.shippo?.label_url;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${order.order_id}`}>
          <MoreVertical className="size-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onDetail}>View details</DropdownMenuItem>
        {canAct && (
          <>
            <DropdownMenuItem onClick={() => printLabelPng(order.shippo?.label_url, `Label ${order.order_id}`)}>
              <Printer className="size-3.5" aria-hidden="true" />
              Print label
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={order.shippo?.label_url} target="_blank" rel="noreferrer" download>
                <Download className="size-3.5" aria-hidden="true" />
                Download PNG
              </a>
            </DropdownMenuItem>
          </>
        )}
        {order.shippo?.tracking_url && (
          <DropdownMenuItem asChild>
            <a href={order.shippo.tracking_url} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Track
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
