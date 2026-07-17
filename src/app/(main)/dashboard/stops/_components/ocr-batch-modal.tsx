"use client";

/**
 * OCRBatchModal  v3
 * ─────────────────────────────────────────────────────────────────────────
 * Sequential auto-advance batch label scanning.
 *
 * Phases: cap_warning? → running → (correction?) → summary
 *
 * CEO-locked (2026-06-12 Session A + 2026-06-13 Session A.2):
 *   - Hard 3-field gate (phone/name/address): any failure → FAILED.
 *   - Correction queue IN-WINDOW: shows the label image preview + FULL field
 *     set (identical to single-scan review). Submit/Skip + counter "1/N".
 *   - Cap warning screen: if >20 files selected, show which were dropped +
 *     Continue button before starting the queue.
 *   - Named progress phases + per-label + global stopwatches.
 *   - Batch ALWAYS uses AI (no Tesseract round-trip for 20 labels).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  SkipForward,
  X,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { aiExtractLabel, normalizeAndValidateName, validatePhone } from "@/lib/ocr/ai-extract-client";
import { persistFailedScan, resolveFailedScan } from "@/lib/ocr/failed-scans-client";
import { downscaleForOcr } from "@/lib/ocr/image-tuning";
import { disposeOCR, type OCRProgress, warmupOCR } from "@/lib/ocr/label-parser";
import { readScanPreference } from "@/lib/ocr/scan-preference";
import { cn } from "@/lib/utils";

import OcrCorrectionForm from "./ocr-correction-form";
import type { AddressResult, OCRSubmitData } from "./ocr-scan-modal";

/* ──────────────────────────────── Types ─────────────────────────────── */

type ItemStatus = "pending" | "processing" | "success" | "failed" | "skipped" | "cancelled";

interface BatchItem {
  file: File;
  status: ItemStatus;
  name: string | null;
  address: string | null;
  error: string | null;
  /** Stored on failure so the correction form pre-fills everything. */
  extractedName: string | null;
  extractedPhone: string | null;
  extractedAddress: string | null;
  extractedResolvedAddress: AddressResult | null;
  extractedDob: string | null;
  extractedOrderIds: string[];
  /** Mongo failed_scans _id once persisted — so in-window resolve/skip can mark
   *  the same-day tray record resolved/discarded and avoid a duplicate. */
  failedScanId?: string | null;
}

interface OCRBatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Up to 20 image files, already validated/sliced by the caller. */
  files: File[];
  /**
   * Files beyond the 20-cap that were dropped — triggers a warning screen
   * before the queue starts so the user can see what didn't load.
   */
  overflowFiles?: File[];
  onSubmitDraft: (data: OCRSubmitData, signal?: AbortSignal) => Promise<{ ok: boolean; error?: string }>;
  /** Optional — correction now happens in-window; this is a legacy fallback. */
  onReviewFailed?: (files: File[]) => void;
}

interface AddressSuggestion {
  description: string;
  place_id: string;
}

/* ─────────────────────────────── Helpers ────────────────────────────── */

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.onerror = () => reject(new Error("Couldn't read the image file"));
    reader.readAsDataURL(file);
  });
}

async function validateViaPlaces(raw: string, signal?: AbortSignal): Promise<AddressResult | null> {
  try {
    const res = await fetch(`/api/client/places?input=${encodeURIComponent(raw)}`, { signal });
    const data: { predictions?: AddressSuggestion[] } = await res.json();
    const top = data.predictions?.[0];
    if (!top) return null;
    const dr = await fetch(`/api/client/place-details?place_id=${encodeURIComponent(top.place_id)}`, { signal });
    const d = await dr.json();
    if (!d.street) return null;
    return { street: d.street, city: d.city ?? "", state: d.state ?? "FL", zip: d.zip ?? "", lat: d.lat, lng: d.lng };
  } catch (err) {
    // Abort (skip/timeout) must propagate so the queue advances instead of
    // misreading it as "address didn't validate".
    if (signal?.aborted) throw err;
    return null;
  }
}

function fmtMs(ms: number): string {
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const STATUS_DOT: Record<ItemStatus, string> = {
  pending: "bg-muted-foreground/25",
  processing: "bg-primary ring-2 ring-primary/30",
  success: "bg-emerald-500",
  failed: "bg-rose-500",
  skipped: "bg-amber-400/60",
  cancelled: "bg-muted-foreground/40",
};

/* ──────────────────────────────── Modal ─────────────────────────────── */

export default function OCRBatchModal({
  open,
  onOpenChange,
  files,
  overflowFiles,
  onSubmitDraft,
  onReviewFailed,
}: OCRBatchModalProps) {
  const [items, setItems] = useState<BatchItem[]>(() =>
    files.map((file) => ({
      file,
      status: "pending",
      name: null,
      address: null,
      error: null,
      extractedName: null,
      extractedPhone: null,
      extractedAddress: null,
      extractedResolvedAddress: null,
      extractedDob: null,
      extractedOrderIds: [],
      failedScanId: null,
    })),
  );

  const hasOverflow = Boolean(overflowFiles?.length);
  const [phase, setPhase] = useState<"cap_warning" | "running" | "correction" | "summary">(
    hasOverflow ? "cap_warning" : "running",
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<OCRProgress | null>(null);
  const [flash, setFlash] = useState<{ kind: "success" | "failed"; text: string } | null>(null);
  const [paused, setPaused] = useState(false);

  // ── Stopwatches ──────────────────────────────────────────────────────────
  const batchStartRef = useRef<number>(0);
  const labelStartRef = useRef<number>(0);
  const stopwatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [globalElapsedMs, setGlobalElapsedMs] = useState(0);
  const [labelElapsedMs, setLabelElapsedMs] = useState(0);

  // ── Correction queue state ───────────────────────────────────────────────
  // The form fields themselves live in the shared <OcrCorrectionForm>; here we
  // only track which failed items we're walking through + the preview image.
  const [corrQueue, setCorrQueue] = useState<number[]>([]);
  const [corrPos, setCorrPos] = useState(0);
  const [corrPreviewUrl, setCorrPreviewUrl] = useState<string | null>(null);
  const corrPreviewUrlRef = useRef<string | null>(null);

  // ── Expandable preview (lightbox) — shared by correction + cap-warning ────
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Object URLs for the dropped-over-cap labels (built once, revoked on close).
  const [overflowUrls, setOverflowUrls] = useState<string[]>([]);

  const pausedRef = useRef(false);
  const cancelRef = useRef(false);
  const skipWaitRef = useRef<(() => void) | null>(null);
  // Abort controller for the CURRENT item's network work (places + posting).
  // Without it, one hung request froze the whole queue forever (the 33-label
  // freeze: "Posting" never resolved, Skip only worked between labels).
  const currentAbortRef = useRef<AbortController | null>(null);
  const skipRequestedRef = useRef(false);
  const runningRef = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // ── Stopwatch tick ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === "running" && !paused) {
      stopwatchRef.current = setInterval(() => {
        const now = Date.now();
        setGlobalElapsedMs(now - batchStartRef.current);
        setLabelElapsedMs(now - labelStartRef.current);
      }, 200);
    } else {
      if (stopwatchRef.current) {
        clearInterval(stopwatchRef.current);
        stopwatchRef.current = null;
      }
    }
    return () => {
      if (stopwatchRef.current) {
        clearInterval(stopwatchRef.current);
        stopwatchRef.current = null;
      }
    };
  }, [phase, paused]);

  const updateItem = useCallback((idx: number, patch: Partial<BatchItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const advanceDelay = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        skipWaitRef.current = null;
        resolve();
      }, ms);
      skipWaitRef.current = () => {
        clearTimeout(t);
        skipWaitRef.current = null;
        resolve();
      };
    });
  }, []);

  const processQueue = useCallback(
    async (indices: number[]) => {
      if (runningRef.current) return;
      runningRef.current = true;
      batchStartRef.current = Date.now();
      // One id per batch run — correlates the api_logs audit lines for all the
      // images in THIS batch ("what happened to these 15 scans?"). NON-PHI.
      const batchId = `batch_${batchStartRef.current}_${Math.random().toString(36).slice(2, 7)}`;

      for (const i of indices) {
        while (pausedRef.current && !cancelRef.current) {
          await new Promise((r) => setTimeout(r, 150));
        }
        if (cancelRef.current) {
          setItems((prev) =>
            prev.map((it, k) => (indices.includes(k) && it.status === "pending" ? { ...it, status: "cancelled" } : it)),
          );
          break;
        }

        setCurrentIdx(i);
        setFlash(null);
        setOcrProgress(null);
        updateItem(i, { status: "processing" });
        labelStartRef.current = Date.now();
        setLabelElapsedMs(0);

        const item = itemsRef.current[i];
        const displayUrl = URL.createObjectURL(item.file);
        setCurrentUrl(displayUrl);

        // Per-item abort + hard timeouts: Skip works MID-processing (not just
        // between labels) and no hung request can ever freeze the queue —
        // it fails THIS item and the batch moves on.
        skipRequestedRef.current = false;
        const ac = new AbortController();
        currentAbortRef.current = ac;
        const guard = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
          new Promise<T>((resolve, reject) => {
            const onAbort = () => {
              clearTimeout(t);
              reject(new DOMException("Aborted", "AbortError"));
            };
            const t = setTimeout(() => {
              ac.signal.removeEventListener("abort", onAbort);
              ac.abort();
              reject(new Error(`${label} timed out — the server is busy; this label was marked failed`));
            }, ms);
            ac.signal.addEventListener("abort", onAbort, { once: true });
            p.then(
              (v) => {
                clearTimeout(t);
                ac.signal.removeEventListener("abort", onAbort);
                resolve(v);
              },
              (e) => {
                clearTimeout(t);
                ac.signal.removeEventListener("abort", onAbort);
                reject(e);
              },
            );
          });

        let outcome: { kind: "success" | "failed"; text: string };
        try {
          setOcrProgress({ status: "Scanning", progress: 0.1 });
          const originalDataUrl = await fileToDataUrl(item.file);
          const scanPreference = readScanPreference();
          // AI sizing mirrors the single-scan path: the Qwen vLLM box (bake-off
          // 2026-07-03) is fastest + most accurate with a SMALL 600px primary and
          // a 1200px retry only on missing critical fields (p50 1.5s, 100/100,
          // phone 91%). The old batch 1600/2000 blew past the box's 4096 ctx and
          // dragged latency to ~12s with worse phone capture. `dataUrl` stays at
          // 1600px for the human-readable failed-scan preview; OpenAI keeps 1600.
          const dataUrl = await downscaleForOcr(originalDataUrl);
          const aiDataUrl = scanPreference === "qwen" ? await downscaleForOcr(originalDataUrl, 600, 0.8) : dataUrl;
          const aiRetryDataUrl =
            scanPreference === "qwen" ? await downscaleForOcr(originalDataUrl, 1200, 0.85) : undefined;

          setOcrProgress({ status: "Processing capture", progress: 0.25 });
          const result = await guard(aiExtractLabel(aiDataUrl, batchId, scanPreference, aiRetryDataUrl), 90_000, "Scan");

          setOcrProgress({ status: "Mapping fields", progress: 0.5 });

          setOcrProgress({ status: "Validating phone", progress: 0.6 });
          const phoneVal = validatePhone(result.candidatePhone);

          setOcrProgress({ status: "Validating name", progress: 0.7 });
          const nameVal = normalizeAndValidateName(result.candidateName);

          setOcrProgress({ status: "Validating address", progress: 0.8 });
          const resolved = result.candidateAddress
            ? await guard(validateViaPlaces(result.candidateAddress, ac.signal), 15_000, "Address validation")
            : null;

          const failures: string[] = [];
          if (!phoneVal.valid) failures.push(phoneVal.reason ?? "Invalid phone");
          if (!nameVal.valid) failures.push(nameVal.reason ?? "Invalid name");
          if (!resolved) failures.push("Address did not validate");

          if (failures.length > 0) {
            updateItem(i, {
              status: "failed",
              error: failures[0],
              extractedName: nameVal.normalized ?? result.candidateName ?? null,
              extractedPhone: result.candidatePhone ?? null,
              extractedAddress: result.candidateAddress ?? null,
              extractedResolvedAddress: resolved,
              extractedDob: result.candidateDob ?? null,
              extractedOrderIds: result.orderIds ?? [],
            });
            // BULLETPROOF: persist the failed scan (image + partial data) to the
            // same-day Mongo tray so it survives window close / refresh / device
            // switch and is never lost. Best-effort; the in-window correction
            // still works regardless. Auto-deletes after 24h via TTL.
            void persistFailedScan({
              image: dataUrl,
              name: nameVal.normalized ?? result.candidateName ?? null,
              phone: result.candidatePhone ?? null,
              address: result.candidateAddress ?? null,
              dob: result.candidateDob ?? null,
              orderIds: result.orderIds ?? [],
              reasons: failures,
              source: "batch",
            }).then((id) => {
              if (id) updateItem(i, { failedScanId: id });
            });
            outcome = { kind: "failed", text: failures[0] };
          } else {
            setOcrProgress({ status: "Posting", progress: 0.9 });
            const sub = await guard(
              onSubmitDraft(
                {
                  address: resolved!,
                  name: nameVal.normalized!,
                  phone: result.candidatePhone ?? "",
                  packageType: "rx",
                  requiresSignature: false,
                  isSameDay: false,
                  collectCod: false,
                  codAmount: "",
                  dob: result.candidateDob ?? undefined,
                  orderIds: result.orderIds.length > 0 ? result.orderIds : undefined,
                  scanId: result.scanId,
                },
                ac.signal,
              ),
              45_000,
              "Posting",
            );
            setOcrProgress({ status: "Saving stop", progress: 0.98 });
            if (!sub.ok) throw new Error(sub.error ?? "Couldn't create the draft stop");
            const idMismatch =
              result.numberOfItems != null &&
              result.orderIds.length > 0 &&
              result.orderIds.length !== result.numberOfItems;
            const summaryText = [
              [nameVal.normalized, resolved!.street].filter(Boolean).join(" · "),
              idMismatch ? `(IDs ${result.orderIds.length}/${result.numberOfItems} mismatch)` : "",
            ]
              .filter(Boolean)
              .join(" ");
            updateItem(i, {
              status: "success",
              name: nameVal.normalized ?? null,
              address: resolved!.street,
              error: null,
            });
            outcome = { kind: "success", text: summaryText || "Draft stop created" };
          }
        } catch (err) {
          if (skipRequestedRef.current) {
            updateItem(i, { status: "skipped", error: null });
            outcome = { kind: "failed", text: "Skipped" };
          } else if (cancelRef.current) {
            updateItem(i, { status: "cancelled", error: null });
            outcome = { kind: "failed", text: "Cancelled" };
          } else {
            const msg = err instanceof Error ? err.message : "Couldn't process this image";
            updateItem(i, { status: "failed", error: msg });
            outcome = { kind: "failed", text: msg };
          }
        }

        currentAbortRef.current = null;
        setOcrProgress(null);
        setFlash(outcome);
        await advanceDelay(1500);
        URL.revokeObjectURL(displayUrl);
        setCurrentUrl(null);
      }

      runningRef.current = false;
      setFlash(null);
      setPhase("summary");
    },
    [advanceDelay, onSubmitDraft, updateItem],
  );

  /* Start queue on mount — gated: cap_warning waits for Continue button. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: run exactly once per mount
  useEffect(() => {
    cancelRef.current = false;
    void warmupOCR();
    if (!hasOverflow) {
      void processQueue(files.map((_, i) => i));
    }
    return () => {
      cancelRef.current = true;
      skipWaitRef.current?.();
      if (stopwatchRef.current) clearInterval(stopwatchRef.current);
      if (corrPreviewUrlRef.current) URL.revokeObjectURL(corrPreviewUrlRef.current);
      void disposeOCR();
    };
  }, []);

  /* Build thumbnails for the dropped-over-cap labels; revoke on unmount. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: overflowFiles is fixed for the modal's life
  useEffect(() => {
    if (!overflowFiles?.length) return;
    const urls = overflowFiles.map((f) => URL.createObjectURL(f));
    setOverflowUrls(urls);
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, []);

  /* Esc closes the lightbox first (before any queue cancel). */
  useEffect(() => {
    if (!lightboxUrl) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setLightboxUrl(null);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lightboxUrl]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: stable refs only
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && phase === "running") cancelQueue();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  /* ── Queue controls ─────────────────────────────────────────────────── */

  function cancelQueue() {
    cancelRef.current = true;
    pausedRef.current = false;
    setPaused(false);
    currentAbortRef.current?.abort(); // stop the in-flight item too
    skipWaitRef.current?.();
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }

  function skip() {
    // Works BOTH mid-processing (aborts the current item's network work) and
    // during the between-labels flash (fast-forwards the 1.5s delay).
    skipRequestedRef.current = true;
    currentAbortRef.current?.abort();
    skipWaitRef.current?.();
  }

  function startBatch() {
    setPhase("running");
    void processQueue(files.map((_, i) => i));
  }

  function retryFailed() {
    const failedIdx = itemsRef.current.map((it, i) => (it.status === "failed" ? i : -1)).filter((i) => i >= 0);
    if (failedIdx.length === 0) return;
    // Discard the prior same-day tray records for these items — a retry re-scans
    // and will persist a fresh record if it fails again (avoids duplicates).
    for (const i of failedIdx) {
      const fid = itemsRef.current[i]?.failedScanId;
      if (fid) void resolveFailedScan(fid, "discarded");
    }
    cancelRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    setItems((prev) =>
      prev.map((it, i) =>
        failedIdx.includes(i)
          ? {
              ...it,
              status: "pending",
              error: null,
              extractedName: null,
              extractedPhone: null,
              extractedAddress: null,
              extractedResolvedAddress: null,
              extractedDob: null,
              extractedOrderIds: [],
              failedScanId: null,
            }
          : it,
      ),
    );
    setPhase("running");
    void processQueue(failedIdx);
  }

  function close() {
    cancelQueue();
    onOpenChange(false);
  }

  /* ── Correction queue helpers ─────────────────────────────────────────── */

  function startCorrection() {
    const failedIdx = itemsRef.current.map((it, i) => (it.status === "failed" ? i : -1)).filter((i) => i >= 0);
    if (failedIdx.length === 0) {
      setPhase("summary");
      return;
    }
    setCorrQueue(failedIdx);
    setCorrPos(0);
    loadCorrItem(failedIdx, 0);
    setPhase("correction");
  }

  function loadCorrItem(queue: number[], pos: number) {
    const idx = queue[pos];
    const it = itemsRef.current[idx];
    // Only manage the preview image here — the shared form owns the fields and
    // is keyed by corrPos so it re-initialises per item. No OCR is re-run.
    if (corrPreviewUrlRef.current) {
      URL.revokeObjectURL(corrPreviewUrlRef.current);
      corrPreviewUrlRef.current = null;
    }
    const previewUrl = URL.createObjectURL(it.file);
    corrPreviewUrlRef.current = previewUrl;
    setCorrPreviewUrl(previewUrl);
  }

  // Submit handler for the shared correction form (current batch item). Posts
  // the draft, marks the same-day tray record resolved, advances the queue.
  async function handleCorrSubmit(data: OCRSubmitData): Promise<{ ok: boolean; error?: string }> {
    const idx = corrQueue[corrPos];
    try {
      const sub = await onSubmitDraft(data);
      if (!sub.ok) return { ok: false, error: sub.error ?? "Couldn't create the draft stop" };
      const resolvedId = itemsRef.current[idx]?.failedScanId;
      if (resolvedId) void resolveFailedScan(resolvedId, "resolved");
      updateItem(idx, {
        status: "success",
        name: data.name,
        address: data.address.street,
        error: null,
      });
      advanceCorrQueue();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Submit failed" };
    }
  }

  function handleCorrSkip() {
    const idx = corrQueue[corrPos];
    updateItem(idx, { status: "skipped" });
    advanceCorrQueue();
  }

  function advanceCorrQueue() {
    // Revoke the preview URL for this item
    if (corrPreviewUrlRef.current) {
      URL.revokeObjectURL(corrPreviewUrlRef.current);
      corrPreviewUrlRef.current = null;
      setCorrPreviewUrl(null);
    }
    const nextPos = corrPos + 1;
    if (nextPos >= corrQueue.length) {
      setPhase("summary");
    } else {
      setCorrPos(nextPos);
      loadCorrItem(corrQueue, nextPos);
    }
  }

  /* ─────────────────────────────── Render ─────────────────────────────── */

  if (!open) return null;

  const total = items.length;
  const doneCount = items.filter((it) => it.status === "success" || it.status === "failed").length;
  const successCount = items.filter((it) => it.status === "success").length;
  const failedItems = items.filter((it) => it.status === "failed");
  const skippedCount = items.filter((it) => it.status === "skipped").length;
  const cancelledCount = items.filter((it) => it.status === "cancelled" || it.status === "pending").length;
  const progressPct = ocrProgress ? Math.round((ocrProgress.progress ?? 0) * 100) : 0;
  const current = items[currentIdx];
  const isProcessing = current?.status === "processing" && !flash;
  const progressLabel = ocrProgress?.status ?? "Reading label…";

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          if (phase === "summary") close();
        }}
      />

      {/* Bottom sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="fixed right-0 bottom-0 left-0 z-50 flex max-h-[92svh] flex-col rounded-t-2xl bg-card shadow-2xl ring-1 ring-border/30"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-border/60" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-4 pt-1 pb-3">
          <div>
            <p className="font-semibold text-sm text-foreground">Batch Scan</p>
            <p className="text-xs text-muted-foreground/65">
              {phase === "cap_warning" && `${total} of ${total + (overflowFiles?.length ?? 0)} labels loaded`}
              {phase === "running" &&
                (paused
                  ? `Paused — ${doneCount} of ${total} done`
                  : `${Math.min(currentIdx + 1, total)} / ${total} · ${fmtMs(globalElapsedMs)}`)}
              {phase === "correction" && `Review ${corrPos + 1} of ${corrQueue.length} failed`}
              {phase === "summary" &&
                `${successCount} created · ${failedItems.length} failed${skippedCount > 0 ? ` · ${skippedCount} skipped` : ""}${cancelledCount > 0 ? ` · ${cancelledCount} cancelled` : ""}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              // In the correction phase, X returns to the results list (summary)
              // — don't drop the user out of the batch / lose their place.
              if (phase === "correction") {
                setPhase("summary");
                return;
              }
              close();
            }}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={
              phase === "correction" ? "Back to results" : phase === "running" ? "Cancel remaining and close" : "Close"
            }
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── CAP WARNING ── */}
        {phase === "cap_warning" && (
          <div className="flex flex-1 flex-col gap-4 px-5 pb-8 pt-2">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3.5">
              <p className="mb-1 font-semibold text-[13px] text-amber-700 dark:text-amber-400">
                Maximum 200 labels per batch
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                You selected {total + (overflowFiles?.length ?? 0)} labels.{" "}
                <strong>{overflowFiles?.length ?? 0} were not added:</strong>
              </p>
            </div>

            {/* Image previews of the dropped labels — tap any to expand. */}
            <div className="custom-scroll max-h-[34svh] flex-1 overflow-y-auto">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {overflowUrls.map((url, i) => (
                  <button
                    // biome-ignore lint/suspicious/noArrayIndexKey: overflow list is stable for the modal's life
                    key={`overflow-${i}`}
                    type="button"
                    onClick={() => setLightboxUrl(url)}
                    className="group relative aspect-[3/4] overflow-hidden rounded-lg bg-muted/30 ring-1 ring-border/30 transition-transform active:scale-95"
                    aria-label={`Expand dropped label ${i + 1}`}
                  >
                    {/* biome-ignore lint/a11y/useAltText: dropped label thumbnail */}
                    {/* biome-ignore lint/performance/noImgElement: ephemeral object URL */}
                    <img src={url} className="h-full w-full object-cover" />
                    <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                    <span className="absolute bottom-1 right-1 rounded bg-black/55 px-1 text-[10px] font-medium text-white">
                      tap to zoom
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed">
              The first <strong>{total}</strong> labels are ready to scan. Upload the remaining ones in a new batch
              after this one.
            </p>

            <div className="space-y-2.5">
              <Button
                onClick={startBatch}
                className="h-12 w-full rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <ChevronRight className="mr-2 size-4" />
                Continue with {total} labels
              </Button>
              <Button
                onClick={close}
                variant="outline"
                className="h-11 w-full rounded-xl border-border/60 font-medium text-[13px]"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ── RUNNING ── */}
        {phase === "running" && (
          <div className="flex flex-1 flex-col items-center gap-4 px-6 pb-8">
            {/* Large current image with status frame */}
            <div
              className={cn(
                "relative w-full max-w-[320px] overflow-hidden rounded-xl shadow-md ring-2 transition-colors",
                flash?.kind === "success" && "ring-emerald-500",
                flash?.kind === "failed" && "ring-rose-500",
                !flash && "ring-border/40",
              )}
            >
              {currentUrl ? (
                // biome-ignore lint/a11y/useAltText: label photo being processed
                // biome-ignore lint/performance/noImgElement: ephemeral object URL
                <img src={currentUrl} className="max-h-[40svh] w-full bg-black/5 object-contain" />
              ) : (
                <div className="flex h-40 w-full items-center justify-center bg-muted/30">
                  <Loader2 className="size-6 animate-spin text-muted-foreground/50" />
                </div>
              )}
              {isProcessing && (
                <motion.div
                  className="pointer-events-none absolute right-0 left-0 h-0.5 shadow-[0_0_10px_3px_color-mix(in_srgb,var(--primary)_60%,transparent)]"
                  style={{ backgroundColor: "var(--primary)" }}
                  initial={{ top: "0%" }}
                  animate={{ top: "100%" }}
                  transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                />
              )}
            </div>

            {/* Per-image status line */}
            <div className="flex min-h-10 w-full max-w-[320px] flex-col items-center justify-center gap-1.5 text-center">
              {flash ? (
                <p
                  className={cn(
                    "flex items-start justify-center gap-1.5 text-xs leading-snug",
                    flash.kind === "success"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {flash.kind === "success" ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  )}
                  <span>{flash.text}</span>
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    <p className="font-medium text-[13px] text-foreground">{paused ? "Paused" : progressLabel}</p>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: "var(--primary)" }}
                      animate={{ width: `${Math.max(progressPct, 8)}%` }}
                      transition={{ ease: "easeOut", duration: 0.3 }}
                    />
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground/40">{fmtMs(labelElapsedMs)}</p>
                </>
              )}
            </div>

            {/* Queue dots */}
            <div className="flex max-w-[320px] flex-wrap items-center justify-center gap-1.5">
              {items.map((it, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: queue is fixed-order for its whole life
                  key={`${it.file.name}-${i}`}
                  className={cn(
                    "size-2 rounded-full transition-colors",
                    STATUS_DOT[i === currentIdx && isProcessing ? "processing" : it.status],
                  )}
                />
              ))}
            </div>

            {/* Controls */}
            <div className="flex w-full max-w-[320px] items-center justify-center gap-2.5">
              <Button
                onClick={togglePause}
                variant="outline"
                className="h-10 flex-1 gap-1.5 rounded-xl border-border/60 font-medium text-[13px]"
              >
                {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                {paused ? "Resume" : "Pause"}
              </Button>
              <Button
                onClick={skip}
                variant="outline"
                className="h-10 flex-1 gap-1.5 rounded-xl border-border/60 font-medium text-[13px]"
              >
                <ChevronRight className="size-3.5" />
                Skip
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground/50">Esc or ✕ cancels the rest — created drafts stay</p>
          </div>
        )}

        {/* ── CORRECTION ── */}
        {phase === "correction" &&
          (() => {
            const it = itemsRef.current[corrQueue[corrPos]];
            return (
              <OcrCorrectionForm
                key={corrPos}
                imageUrl={corrPreviewUrl}
                counterLabel={`${corrPos + 1} / ${corrQueue.length} failed`}
                initial={{
                  name: it?.extractedName ?? null,
                  phone: it?.extractedPhone ?? null,
                  address: it?.extractedAddress ?? null,
                  resolvedAddress: it?.extractedResolvedAddress ?? null,
                  dob: it?.extractedDob ?? null,
                  orderIds: it?.extractedOrderIds ?? [],
                }}
                onSubmit={handleCorrSubmit}
                onSkip={handleCorrSkip}
              />
            );
          })()}

        {/* ── SUMMARY ── */}
        {phase === "summary" && (
          <div className="custom-scroll flex-1 overflow-y-auto">
            <div className="px-4 pt-1 pb-6">
              <div className="mb-3 space-y-1.5">
                {items.map((it, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: queue is fixed-order for its whole life
                    key={`${it.file.name}-${i}`}
                    className="flex items-start gap-2.5 rounded-xl bg-muted/25 px-3 py-2.5 ring-1 ring-border/30"
                  >
                    {it.status === "success" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />}
                    {it.status === "failed" && <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />}
                    {it.status === "skipped" && <SkipForward className="mt-0.5 size-4 shrink-0 text-amber-500" />}
                    {(it.status === "cancelled" || it.status === "pending") && (
                      <X className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-xs text-foreground">{it.file.name}</p>
                      <p
                        className={cn(
                          "truncate text-[11px]",
                          it.status === "success" && "text-emerald-600 dark:text-emerald-400",
                          it.status === "failed" && "text-rose-600 dark:text-rose-400",
                          it.status === "skipped" && "text-amber-600 dark:text-amber-400",
                          (it.status === "cancelled" || it.status === "pending") && "text-muted-foreground/60",
                        )}
                      >
                        {it.status === "success" &&
                          `Draft created${it.name ? ` — ${it.name}` : ""}${it.address ? ` · ${it.address}` : ""}`}
                        {it.status === "failed" && (it.error ?? "Failed")}
                        {it.status === "skipped" && "Skipped"}
                        {(it.status === "cancelled" || it.status === "pending") && "Cancelled"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2.5">
                {failedItems.length > 0 && (
                  <>
                    <Button
                      onClick={retryFailed}
                      className="h-12 w-full gap-2 rounded-xl font-semibold text-sm bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <RefreshCw className="size-4" />
                      Retry failed ({failedItems.length})
                    </Button>
                    <Button
                      onClick={startCorrection}
                      variant="outline"
                      className="h-11 w-full rounded-xl border-border/60 font-medium text-[13px]"
                    >
                      Review failed one by one
                    </Button>
                  </>
                )}
                <Button
                  onClick={close}
                  variant="outline"
                  className="h-11 w-full rounded-xl border-border/60 font-medium text-[13px]"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* ── LIGHTBOX — expanded label image (correction + cap-warning) ── */}
      {lightboxUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-card/10 text-white transition-colors hover:bg-card/20"
            aria-label="Close preview"
          >
            <X className="size-5" />
          </button>
          {/* biome-ignore lint/a11y/useAltText: expanded label preview */}
          {/* biome-ignore lint/performance/noImgElement: ephemeral object URL */}
          <img
            src={lightboxUrl}
            className="max-h-[88svh] max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </motion.div>
      )}
    </>
  );
}
