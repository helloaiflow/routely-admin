"use client";

/**
 * FailedScansTray — the bulletproof same-day tray for labels that failed the OCR
 * gate. Source of truth is the server (`/api/client/failed-scans`), so it
 * survives window close / refresh / device switch and auto-expires at 24h. Each
 * item resolves through the EXISTING single-scan correction form (the parent
 * re-opens it with the stored image) or can be discarded.
 */

import { useCallback, useEffect, useState } from "react";

import { motion } from "framer-motion";
import { AlertCircle, Loader2, Maximize2, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type FailedScan, fetchFailedScans, resolveFailedScan } from "@/lib/ocr/failed-scans-client";
import { cn } from "@/lib/utils";

interface FailedScansTrayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Parent opens the single-scan correction form with this item's image. */
  onResolve: (item: FailedScan) => void;
  /** Report the latest pending count so the page badge stays in sync. */
  onCountChange?: (count: number) => void;
}

export default function FailedScansTray({ open, onOpenChange, onResolve, onCountChange }: FailedScansTrayProps) {
  const [items, setItems] = useState<FailedScan[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchFailedScans();
    setItems(list);
    onCountChange?.(list.length);
    setLoading(false);
  }, [onCountChange]);

  // Re-fetch every time the tray opens — the server is the source of truth.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function discard(id: string) {
    setBusyId(id);
    const ok = await resolveFailedScan(id, "discarded");
    if (ok) {
      setItems((prev) => {
        const next = prev.filter((i) => i.id !== id);
        onCountChange?.(next.length);
        return next;
      });
    }
    setBusyId(null);
  }

  if (!open) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="fixed right-0 bottom-0 left-0 z-50 flex max-h-[92svh] flex-col rounded-t-2xl bg-card shadow-2xl ring-1 ring-border/30 sm:right-4 sm:left-auto sm:bottom-4 sm:max-h-[88svh] sm:w-[420px] sm:rounded-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-border/40 border-b px-4 py-3">
          <div>
            <p className="font-semibold text-sm text-foreground">Failed Scans</p>
            <p className="text-xs text-muted-foreground/65">Resolve today — auto-clears after 24h</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void load()}
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Refresh"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="custom-scroll flex-1 overflow-y-auto p-3">
          {loading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground/50">
              <Loader2 className="size-5 animate-spin" />
              <p className="text-xs">Loading…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10">
                <AlertCircle className="size-6 text-emerald-500" />
              </div>
              <p className="font-medium text-[13px] text-foreground">No failed scans</p>
              <p className="max-w-[240px] text-xs text-muted-foreground/60 leading-relaxed">
                Labels that fail validation appear here so you never lose them.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl bg-muted/25 p-2.5 ring-1 ring-border/30">
                  <div className="flex gap-3">
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
                      <p className="truncate font-medium text-[13px] text-foreground">
                        {item.name || "Unreadable name"}
                      </p>
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
                      className="h-9 flex-1 rounded-lg text-[13px] font-semibold text-white"
                      style={{ backgroundColor: "var(--primary)" }}
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
      </motion.div>

      {/* Lightbox — expanded label */}
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
