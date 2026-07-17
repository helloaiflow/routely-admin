"use client";

import { Check, Package, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { type DraftFilter, type DraftOrder, formatTimeAgo } from "../_lib/helpers";

const FILTER_OPTIONS: { value: DraftFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Done" },
];

export function DraftList({
  drafts,
  selectedId,
  filter,
  search,
  onSelect,
  onFilterChange,
  onSearchChange,
  onNew,
}: {
  drafts: DraftOrder[];
  selectedId: string | null;
  filter: DraftFilter;
  search: string;
  onSelect: (id: string) => void;
  onFilterChange: (f: DraftFilter) => void;
  onSearchChange: (q: string) => void;
  onNew: () => void;
}) {
  const counts: Record<DraftFilter, number> = {
    all: drafts.length,
    draft: drafts.filter((d) => d.status === "draft").length,
    pending: drafts.filter((d) => d.status === "pending").length,
    approved: drafts.filter((d) => d.status === "approved").length,
  };

  const filtered = drafts
    .filter((d) => filter === "all" || d.status === filter)
    .filter((d) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        d.recipient_name.toLowerCase().includes(q) ||
        d.delivery_address.toLowerCase().includes(q) ||
        d.delivery_city.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q)
      );
    });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* HEADER */}
      <div className="flex shrink-0 flex-col gap-1.5 border-b px-2 py-2">
        {/* Row 1: icon + title + count + New button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Package className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold">Stops</span>
            <span className="flex h-3.5 items-center rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
              {counts.all}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={onNew} className="h-5 gap-1 px-1.5 text-[10px]">
            <Plus className="size-2.5" />
            New
          </Button>
        </div>

        {/* Row 2: filter pills */}
        <div className="flex items-center gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFilterChange(opt.value)}
              className={cn(
                "flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-medium transition-colors",
                filter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {opt.label}
              <span
                className={cn(
                  "text-[10px]",
                  filter === opt.value ? "text-primary-foreground/70" : "text-muted-foreground/60",
                )}
              >
                {counts[opt.value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* SEARCH */}
      <div className="shrink-0 border-b px-2 py-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-1.5 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            className="h-6 pl-5 text-[10px]"
          />
        </div>
      </div>

      {/* CARD LIST */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-1.5 p-1.5">
            {filtered.map((d) => {
              const selected = d.id === selectedId;
              const accentColor =
                d.status === "pending" ? "bg-primary" : d.status === "approved" ? "bg-emerald-500" : "bg-border/60";
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelect(d.id)}
                  className={cn(
                    "relative flex w-full flex-col items-start gap-1 overflow-hidden rounded-lg border p-2.5 pl-3.5 text-left transition-all",
                    selected
                      ? "border-primary/30 bg-gradient-to-t from-primary/10 to-card shadow-sm ring-2 ring-primary/20"
                      : "border-transparent bg-gradient-to-t from-primary/5 to-card shadow-xs ring-1 ring-foreground/8 hover:shadow-sm hover:ring-foreground/15",
                  )}
                >
                  {/* Accent bar left */}
                  <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", accentColor)} />

                  {/* Row 1: checkbox + name + time */}
                  <div className="flex w-full items-center gap-1.5">
                    <div
                      className={cn(
                        "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-all",
                        selected ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background",
                      )}
                    >
                      {selected && <Check className="size-2.5 text-primary-foreground" strokeWidth={3} />}
                    </div>
                    <span
                      className={cn(
                        "flex-1 truncate text-[11px] font-semibold",
                        selected ? "text-primary" : "text-foreground",
                      )}
                    >
                      {d.recipient_name || "Unnamed"}
                    </span>
                    {d.status === "pending" && (
                      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
                    )}
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatTimeAgo(d.updated_at)}</span>
                  </div>

                  {/* Row 2: street */}
                  <span className="w-full truncate text-[10px] text-foreground/70">{d.delivery_address}</span>

                  {/* Row 3: city · zip · phone */}
                  <span className="w-full truncate text-[10px] text-muted-foreground">
                    {d.delivery_city}
                    {d.delivery_zip ? ` · ${d.delivery_zip}` : ""}
                    {d.recipient_phone ? ` · ${d.recipient_phone}` : ""}
                  </span>

                  {/* Row 4: badges + emojis */}
                  <div className="flex w-full flex-wrap items-center gap-1">
                    <Badge
                      variant={d.status === "pending" ? "default" : "secondary"}
                      className="h-3.5 rounded-full px-1.5 text-[10px]"
                    >
                      {d.status}
                    </Badge>
                    {d.package_type && (
                      <Badge variant="outline" className="h-3.5 rounded-full px-1.5 text-[10px]">
                        {d.package_type === "rx" ? "💊" : d.package_type === "cold" ? "🧊" : "📦"}
                      </Badge>
                    )}
                    {d.requires_signature && (
                      <span className="text-xs leading-none" title="Signature required">
                        ✍️
                      </span>
                    )}
                    {d.collect_cod && (
                      <span className="text-xs leading-none" title="COD">
                        💵
                      </span>
                    )}
                    {d.is_same_day && (
                      <span className="text-xs leading-none" title="Same day">
                        ⚡
                      </span>
                    )}
                    {d.carrier && d.carrier !== "routely" && (
                      <Badge variant="secondary" className="h-3.5 rounded-full px-1.5 text-[10px] uppercase">
                        {d.carrier}
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}

            {filtered.length === 0 && (
              <p className="py-6 text-center text-[10px] text-muted-foreground">No stops found</p>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
