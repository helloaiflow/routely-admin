"use client";

/**
 * FailedScansList — the pending same-day failed-scan list, rendered INSIDE the
 * OCR window's "Failed Scans" tab. Source of truth is the server
 * (`/api/client/failed-scans`); it re-fetches on mount and whenever `refreshKey`
 * changes (e.g. after a resolve). Rows show a label thumbnail (tap to zoom),
 * partial data, failure reason, and Resolve / Discard. Resolve hands the record
 * up to the host, which opens the shared correction form in-window.
 */

import { useCallback, useEffect, useState } from "react";

import { motion } from "framer-motion";
import { AlertCircle, Loader2, Maximize2, RefreshCw, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  discardFailedScans,
  type FailedScan,
  fetchFailedScans,
  resolveFailedScan,
} from "@/lib/ocr/failed-scans-client";
import { cn } from "@/lib/utils";

interface FailedScansListProps {
  /** Bump to force a re-fetch (after a resolve, etc.). */
  refreshKey?: number;
  onResolve: (item: FailedScan) => void;
  onCountChange?: (count: number) => void;
}

export default function FailedScansList({ refreshKey = 0, onResolve, onCountChange }: FailedScansListProps) {
  const [items, setItems] = useState<FailedScan[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchFailedScans();
    setItems(list);
    setSelected(new Set());
    onCountChange?.(list.length);
    setLoading(false);
  }, [onCountChange]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch on mount + each refreshKey change
  useEffect(() => {
    void load();
  }, [refreshKey]);

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function discard(id: string) {
    setBusyId(id);
    const ok = await resolveFailedScan(id, "discarded");
    if (ok) {
      setItems((prev) => {
        const next = prev.filter((i) => i.id !== id);
        onCountChange?.(next.length);
        return next;
      });
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
    setBusyId(null);
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    const ok = await discardFailedScans(ids);
    if (ok) {
      setItems((prev) => {
        const next = prev.filter((i) => !selected.has(i.id));
        onCountChange?.(next.length);
        return next;
      });
      setSelected(new Set());
    }
    setBulkBusy(false);
  }

  return (
    <>
      <div className="custom-scroll flex-1 overflow-y-auto px-4 pb-6 pt-2">
        <div className="mb-3 flex items-center justify-between">
          {items.length > 0 ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground/70">
              <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
              {selected.size > 0 ? `${selected.size} selected` : "Select all"}
            </label>
          ) : (
            <p className="text-xs text-muted-foreground/65">Resolve today — auto-clears after 24h</p>
          )}
          <div className="flex items-center gap-1.5">
            {selected.size > 0 && (
              <Button
                onClick={deleteSelected}
                disabled={bulkBusy}
                variant="outline"
                className="h-7 gap-1.5 rounded-lg border-rose-500/40 px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
              >
                {bulkBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                Delete{allSelected ? " all" : ` (${selected.size})`}
              </Button>
            )}
            <button
              type="button"
              onClick={() => void load()}
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Refresh"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {loading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground/50">
            <Loader2 className="size-5 animate-spin" />
            <p className="text-xs">Loading…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2.5 py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10">
              <AlertCircle className="size-6 text-emerald-500" />
            </div>
            <p className="font-medium text-[13px] text-foreground">All caught up</p>
            <p className="max-w-[240px] text-xs text-muted-foreground/60 leading-relaxed">
              Labels that fail validation land here so you never lose them.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl p-3 ring-1 transition-colors",
                  selected.has(item.id) ? "bg-primary/5 ring-primary/30" : "bg-muted/25 ring-border/30",
                )}
              >
                <div className="flex gap-3">
                  <Checkbox
                    checked={selected.has(item.id)}
                    onCheckedChange={() => toggleOne(item.id)}
                    aria-label="Select failed scan"
                    className="mt-1 shrink-0"
                  />
                  {item.image ? (
                    <button
                      type="button"
                      onClick={() => setLightbox(item.image)}
                      className="group relative size-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-border/50 transition-transform active:scale-95"
                      aria-label="Expand label image"
                    >
                      {/* biome-ignore lint/a11y/useAltText: failed label thumbnail */}
                      {/* biome-ignore lint/performance/noImgElement: stored base64 data URL */}
                      <img src={item.image} className="h-full w-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                        <Maximize2 className="size-4 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
                      </span>
                    </button>
                  ) : (
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground/40">
                      <AlertCircle className="size-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[13px] text-foreground">{item.name || "Unreadable name"}</p>
                    <p className="truncate text-[11px] text-muted-foreground/70">
                      {[item.phone, item.address].filter(Boolean).join(" · ") || "No data extracted"}
                    </p>
                    {item.reasons.length > 0 && (
                      <p className="mt-1 truncate text-[11px] text-rose-600 dark:text-rose-400">
                        {item.reasons.join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2.5 flex gap-2">
                  <Button
                    onClick={() => onResolve(item)}
                    className="h-9 flex-1 rounded-lg text-[13px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Resolve
                  </Button>
                  <Button
                    onClick={() => discard(item.id)}
                    disabled={busyId === item.id}
                    variant="outline"
                    className="h-9 rounded-lg border-border/60 px-3 text-[13px] font-medium text-muted-foreground"
                  >
                    {busyId === item.id ? <Loader2 className="size-3.5 animate-spin" /> : "Discard"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-card/10 text-white transition-colors hover:bg-card/20"
            aria-label="Close preview"
          >
            <X className="size-5" />
          </button>
          {/* biome-ignore lint/a11y/useAltText: expanded failed label */}
          {/* biome-ignore lint/performance/noImgElement: stored base64 data URL */}
          <img
            src={lightbox}
            className="max-h-[88svh] max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </motion.div>
      )}
    </>
  );
}
