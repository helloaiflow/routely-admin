"use client";

/**
 * OCR image-weight tuning — EXPOSED, ADJUSTABLE constants.
 * ─────────────────────────────────────────────────────────────────────
 * After the viewfinder crop and before OCR upload, the captured label is
 * downscaled + JPEG-compressed. Vision models (gpt-4o-mini) downscale
 * internally anyway, so shipping a 2500–4000px crop only adds upload latency
 * and storage weight without accuracy. This trims it to a sweet spot that
 * keeps small text (phone, order_id, dob) legible.
 *
 * CRITICAL — do NOT over-compress: small high-contrast text is what these
 * fields are. If field accuracy degrades on real labels, BACK OFF:
 *   OCR_MAX_EDGE   1600 → 2000
 *   OCR_JPEG_QUALITY 0.8 → 0.85
 *
 * These are the knobs the OCR bake-off (Codex / self-hosted Qwen on the Mac
 * Mini) can sweep — image size is now a tunable variable per model. Tuned here
 * for the current gpt-4o-mini path; retune per model as needed.
 */
export const OCR_MAX_EDGE = 1600; // cap the long edge (px). Only downscales — never upscales a small crop.
export const OCR_JPEG_QUALITY = 0.8; // JPEG quality for the uploaded + stored crop.

/**
 * Downscale (long edge ≤ OCR_MAX_EDGE) + JPEG-compress a cropped label dataURL
 * for OCR upload. Never upscales (preserves a small/low-res crop's resolution —
 * it only re-encodes those at OCR_JPEG_QUALITY). Returns the original on any
 * failure so it can never block a scan.
 */
export function downscaleForOcr(dataUrl: string, maxEdge = OCR_MAX_EDGE, quality = OCR_JPEG_QUALITY): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
          if (!longEdge) return resolve(dataUrl);
          const scale = Math.min(1, maxEdge / longEdge); // ≤1 → never upscales
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(dataUrl);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
}
