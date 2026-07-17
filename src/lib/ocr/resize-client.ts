"use client";

/**
 * OCR resize client — main-thread API over the image-resize Worker pool.
 * ─────────────────────────────────────────────────────────────────────────
 * ONE decode per image, producing every OCR size in a single pass, off the
 * main thread. This is the fix for the ~7s capture stall: the old path called
 * `downscaleForOcr` 3× per image, re-decoding a full 12MP JPEG each time on the
 * UI thread.
 *
 * Robustness ladder (never blocks a scan):
 *   1. Worker pool  — decode once, off-thread (best; frees the UI even at 100 imgs)
 *   2. Main-thread decode-once — one <img> decode, N canvas draws (kills the 7s,
 *      but on the UI thread) when OffscreenCanvas / Worker isn't available
 *   3. Legacy per-size `downscaleForOcr` — last-resort, matches old behaviour
 *
 * Standard sizes mirror the current pipeline exactly:
 *   preview   1600 @ 0.80  (human-readable failed-scan preview / OpenAI path)
 *   aiPrimary  600 @ 0.80  (Qwen vLLM primary)
 *   aiRetry   1200 @ 0.85  (Qwen retry on missing critical fields)
 */

import { downscaleForOcr } from "./image-tuning";
import type { ResizeRequest, ResizeResponse, ResizeTarget } from "./image-resize-worker";

export interface OcrResizeResult {
  preview: string;
  aiPrimary: string;
  aiRetry: string;
}

export const OCR_STANDARD_TARGETS: ResizeTarget[] = [
  { key: "preview", maxEdge: 1600, quality: 0.8 },
  { key: "aiPrimary", maxEdge: 600, quality: 0.8 },
  { key: "aiRetry", maxEdge: 1200, quality: 0.85 },
];

/* ───────────────────────── capability detection ───────────────────────── */

let workerSupported: boolean | null = null;
function canUseWorkerResize(): boolean {
  if (workerSupported !== null) return workerSupported;
  workerSupported =
    typeof window !== "undefined" &&
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap === "function";
  return workerSupported;
}

/* ─────────────────────────────── worker pool ──────────────────────────── */

interface Pending {
  resolve: (r: Record<string, string>) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const POOL_SIZE = (() => {
  if (typeof navigator === "undefined") return 2;
  const hc = navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(4, hc)); // 1–4 workers; the box is the real bottleneck, not resize
})();

const REQUEST_TIMEOUT_MS = 15000;

let pool: Worker[] = [];
let rr = 0;
let reqSeq = 0;
const pending = new Map<number, Pending>();

function ensurePool(): Worker[] {
  if (pool.length > 0) return pool;
  for (let i = 0; i < POOL_SIZE; i++) {
    const w = new Worker(new URL("./image-resize-worker.ts", import.meta.url));
    w.onmessage = (e: MessageEvent<ResizeResponse>) => {
      const msg = e.data;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.results);
      else p.reject(new Error(msg.error));
    };
    w.onerror = () => {
      // A worker died — reject its in-flight requests so they fall back.
      for (const [id, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new Error("resize worker crashed"));
        pending.delete(id);
      }
    };
    pool.push(w);
  }
  return pool;
}

function runInWorker(blob: Blob, targets: ResizeTarget[]): Promise<Record<string, string>> {
  const workers = ensurePool();
  const worker = workers[rr % workers.length];
  rr += 1;
  const id = ++reqSeq;
  const req: ResizeRequest = { id, blob, targets };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("resize timeout"));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage(req);
  });
}

/** Tear down the pool (call when the batch page / scan modal unmounts). */
export function disposeResizePool(): void {
  for (const w of pool) w.terminate();
  pool = [];
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error("resize pool disposed"));
  }
  pending.clear();
}

/* ─────────────────── main-thread decode-once fallback ──────────────────── */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

async function resizeMainThreadOnce(file: Blob, targets: ResizeTarget[]): Promise<Record<string, string>> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url); // ONE decode for all sizes
    const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
    const results: Record<string, string> = {};
    for (const t of targets) {
      const scale = longEdge ? Math.min(1, t.maxEdge / longEdge) : 1;
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      results[t.key] = canvas.toDataURL("image/jpeg", t.quality);
    }
    return results;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ─────────────── legacy last-resort (per-size, from a dataURL) ─────────── */

async function resizeLegacy(file: Blob, targets: ResizeTarget[]): Promise<Record<string, string>> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
  const results: Record<string, string> = {};
  for (const t of targets) {
    results[t.key] = await downscaleForOcr(dataUrl, t.maxEdge, t.quality);
  }
  return results;
}

/* ──────────────────────────────── public API ──────────────────────────── */

/**
 * Resize a captured image to the given targets with ONE decode. Tries the
 * worker pool, then a main-thread single-decode, then the legacy per-size path.
 * Always resolves (never throws) unless every strategy fails.
 */
export async function resizeForOcr(
  file: Blob,
  targets: ResizeTarget[] = OCR_STANDARD_TARGETS,
): Promise<Record<string, string>> {
  if (canUseWorkerResize()) {
    try {
      return await runInWorker(file, targets);
    } catch {
      // fall through to main-thread paths
    }
  }
  try {
    return await resizeMainThreadOnce(file, targets);
  } catch {
    return resizeLegacy(file, targets);
  }
}

/** Convenience wrapper returning the three standard OCR sizes. */
export async function resizeOcrStandard(file: Blob): Promise<OcrResizeResult> {
  const r = await resizeForOcr(file, OCR_STANDARD_TARGETS);
  return {
    preview: r.preview,
    aiPrimary: r.aiPrimary,
    aiRetry: r.aiRetry,
  };
}
