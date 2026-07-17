/// <reference lib="webworker" />
/**
 * OCR image-resize Web Worker
 * ─────────────────────────────────────────────────────────────────────────
 * Decodes a captured label image ONCE (off the main thread) and produces every
 * size the OCR pipeline needs in a single pass. Replaces the old pattern of
 * calling `downscaleForOcr` 3× on the same original — which re-decoded a full
 * 12MP phone JPEG three times on the UI thread (~7s + a frozen screen).
 *
 * Off-thread decode via `createImageBitmap` + `OffscreenCanvas`. No DOM, no
 * React here — this module runs in a Worker scope.
 *
 * Message protocol
 *   in : { id, blob, targets: [{ key, maxEdge, quality }] }
 *   out: { id, ok: true, results: { [key]: dataUrl } }
 *      | { id, ok: false, error }
 *
 * Scaling math mirrors `downscaleForOcr` EXACTLY (never upscales; JPEG output)
 * so this is a byte-for-byte behavioural drop-in for each size.
 */

export interface ResizeTarget {
  /** Result key, e.g. "preview" | "aiPrimary" | "aiRetry". */
  key: string;
  /** Long-edge cap in px. Only downscales — never upscales a small crop. */
  maxEdge: number;
  /** JPEG quality 0–1. */
  quality: number;
}

export interface ResizeRequest {
  id: number;
  blob: Blob;
  targets: ResizeTarget[];
}

export type ResizeResponse =
  | { id: number; ok: true; results: Record<string, string> }
  | { id: number; ok: false; error: string };

function blobToDataUrl(blob: Blob): Promise<string> {
  // FileReader is available in Worker scope.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

self.onmessage = async (e: MessageEvent<ResizeRequest>) => {
  const { id, blob, targets } = e.data;
  try {
    // DECODE ONCE — the whole point. `createImageBitmap` decodes off-thread.
    const bitmap = await createImageBitmap(blob);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const results: Record<string, string> = {};

    for (const t of targets) {
      const scale = longEdge ? Math.min(1, t.maxEdge / longEdge) : 1; // ≤1 → never upscales
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, w, h);
      const outBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: t.quality });
      results[t.key] = await blobToDataUrl(outBlob);
    }

    bitmap.close();
    const res: ResizeResponse = { id, ok: true, results };
    self.postMessage(res);
  } catch (err) {
    const res: ResizeResponse = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(res);
  }
};
