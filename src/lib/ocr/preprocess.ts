"use client";

/**
 * preprocess.ts  v2  — gentle, OCR-safe
 * ─────────────────────────────────────────────────────────────────────
 * HARD LESSON from v1: aggressive global Otsu binarization DESTROYS text on
 * real-world phone photos (shadows, gradients, off-white surfaces) and thin
 * fonts. Tesseract already runs superior *local* binarization internally via
 * Leptonica — so pre-binarizing with a naive global threshold actively hurts.
 *
 * v2 does only the minimum that reliably helps and lets Tesseract threshold:
 *   1. Upscale so the long edge is ~2000px — the single biggest legit win.
 *      Tesseract wants capital letters ≈ 30px tall (~300 DPI). Small phone
 *      crops have thin strokes; upscaling with smoothing fixes that. Never
 *      downscale below source unless it's huge (memory/speed cap at 3000).
 *   2. Grayscale (Rec. 601 luma).
 *   3. GENTLE contrast normalization (2% percentile stretch). Just enough to
 *      recover a slightly dim photo, never enough to crush midtones.
 *
 * No binarization. No destructive sharpening. Output PNG dataURL.
 * Any failure → return the original dataURL untouched (never blocks OCR).
 */

const UPSCALE_IF_BELOW = 1500; // if long edge < this, upscale
const UPSCALE_TARGET = 2000; // ...to this
const DOWNSCALE_IF_ABOVE = 3000; // if long edge > this, downscale
const DOWNSCALE_TARGET = 2600; // ...to this
const CONTRAST_CLIP_PCT = 2; // gentle percentile clip

export async function preprocessLabelImage(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = drawScaled(img);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return dataUrl;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  toGrayscale(imageData.data);
  stretchContrast(imageData.data, CONTRAST_CLIP_PCT);
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL("image/png");
}

/* ─────────────────────────────── helpers ────────────────────────────── */

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("preprocess: failed to load image"));
    img.src = dataUrl;
  });
}

function drawScaled(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w === 0 || h === 0) throw new Error("preprocess: zero dimensions");

  const longEdge = Math.max(w, h);
  let factor = 1;
  if (longEdge < UPSCALE_IF_BELOW) factor = UPSCALE_TARGET / longEdge;
  else if (longEdge > DOWNSCALE_IF_ABOVE) factor = DOWNSCALE_TARGET / longEdge;

  const targetW = Math.round(w * factor);
  const targetH = Math.round(h * factor);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return canvas;
}

function toGrayscale(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
}

/**
 * Gentle linear contrast stretch. Finds the value at the clipPct and
 * (100 − clipPct) percentiles and maps them to 0 / 255. Far softer than
 * binarization — preserves anti-aliased glyph edges that Tesseract relies on.
 */
function stretchContrast(data: Uint8ClampedArray, clipPct: number): void {
  const hist = new Array<number>(256).fill(0);
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++;
  const clipCount = (n * clipPct) / 100;

  let lo = 0;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= clipCount) {
      lo = i;
      break;
    }
  }
  let hi = 255;
  acc = 0;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc >= clipCount) {
      hi = i;
      break;
    }
  }
  // Guard: if the range is too narrow, leave the image alone (don't amplify noise).
  if (hi - lo < 32) return;

  const scale = 255 / (hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    let v = (data[i] - lo) * scale;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}
