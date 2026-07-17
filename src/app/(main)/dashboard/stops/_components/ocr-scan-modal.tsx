"use client";

/**
 * OCRScanModal  v3
 * ─────────────────────────────────────────────────────────────────────────
 * States:
 *   idle       — entry screen: Open Camera | Upload from Gallery
 *   camera     — live viewfinder + shutter
 *   processing — OCR running (named progress phases + per-label stopwatch)
 *   review     — editable fields + address validation + hard 3-field submit gate
 *   submitting — creating the draft stop (spinner)
 *   success    — stop created: name · tracking · Print Rx Label · Close
 *   submit-error — API failed: what went wrong + Try Again
 *   error      — OCR failed to find address: Retry + Close
 *
 * CEO-locked (2026-06-12 Session A):
 *   - Hard validation before submit: phone (10 real digits, area code 2-9, no
 *     placeholder), name (2+ words, 2+ letters each, no OCR noise), address
 *     (Google Places validated). Any failure → blocked with inline errors.
 *   - Name pre-normalized: "LASTNAME, FIRSTNAME" flipped + Title Case.
 *   - Progress: named phases (Scanning → Processing capture → Mapping fields →
 *     Validating address → Validating name → Validating phone).
 *   - Per-label stopwatch under the progress bar.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import JsBarcode from "jsbarcode";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  DollarSign,
  FileImage,
  Loader2,
  PenLine,
  RefreshCw,
  ScanLine,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  aiExtractLabel,
  normalizeAndValidateName,
  type OcrDebug,
  shouldEscalateToAI,
  validatePhone,
} from "@/lib/ocr/ai-extract-client";
import type { FailedScan } from "@/lib/ocr/failed-scans-client";
import {
  disposeOCR,
  type FieldConfidence,
  type OCRProgress,
  processLabelImage,
  warmupOCR,
} from "@/lib/ocr/label-parser";
import { resizeOcrStandard } from "@/lib/ocr/resize-client";
import { readScanPreference } from "@/lib/ocr/scan-preference";
import { cn } from "@/lib/utils";

import FailedScansList from "./failed-scans-list";
import OcrCorrectionForm from "./ocr-correction-form";
import OcrDebugPanel from "./ocr-debug-panel";

/* ──────────────────────────────── Types ─────────────────────────────── */

export interface AddressResult {
  street: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
}

export interface OCRSubmitData {
  address: AddressResult;
  /** Apt / Suite / Unit — kept SEPARATE so Google validates the base street
   *  cleanly; combined back into the delivery address (driver-visible) on save. */
  addressLine2?: string;
  name: string;
  phone: string;
  packageType: "rx" | "standard" | "internal" | "cold";
  requiresSignature: boolean;
  isSameDay: boolean;
  collectCod: boolean;
  codAmount: string;
  /* Hybrid-OCR AI path (Phase 1) — optional, only populated when AI ran. */
  dob?: string; // MM/DD/YYYY
  orderIds?: string[]; // \d{6,7}-\d{2}
  /** Optional gate/access code — captured + stored like other stop fields. */
  gateCode?: string;
  /** False when the user submitted past an unverified-address warning. */
  addressVerified?: boolean;
  /** Permanent OCR scan id — links this draft back to the ocr_scans row
   *  (scan → draft → stop). Only set when AI OCR ran. */
  scanId?: string;
}

interface OCRScanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called when user taps "Submit" — creates the draft stop directly.
   * Async: parent handles API call. Modal shows spinner while waiting.
   */
  onSubmit: (data: OCRSubmitData) => Promise<void>;
  /**
   * When the gallery picker returns 2+ images the parent takes over with the
   * batch flow (Phase D). Optional — without it, only the first file is used
   * and the single-scan flow behaves exactly as before.
   */
  onBatchFiles?: (files: File[]) => void;
  /**
   * Pre-loaded image (batch "Review failed one by one"): when set, the modal
   * skips the idle screen and runs OCR on it straight into the review UI.
   */
  initialFile?: File | null;
  /** Pending same-day failed-scan count (drives the "Failed Scans" tab badge). */
  failedCount?: number;
  /** Reported up as the in-window failed list refetches, to keep the badge live. */
  onFailedCountChange?: (n: number) => void;
  /** Resolve a failed scan: post the draft + mark the record resolved. The host
   *  reuses the normal draft-post path; returns ok so the form can show errors. */
  onResolveSubmit?: (scan: FailedScan, data: OCRSubmitData) => Promise<{ ok: boolean; error?: string }>;
}

type ScanState = "idle" | "camera" | "processing" | "review" | "error";

interface AddressSuggestion {
  description: string;
  place_id: string;
}

/* ──────────────── Elapsed time formatter ───────────────────────────── */

function fmtLabel(ms: number): string {
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ──────────────────────── Rx 2×1 direct print ───────────────────────── */

const LABEL_LOGO = "/img/labelLogo.png";

function buildBarcodeSvg(value: string): string {
  if (typeof window === "undefined" || !value) return "";
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: "CODE128",
      width: 2,
      height: 80,
      displayValue: false,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
    });
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("style", "width:100%;height:100%;display:block");
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return "";
  }
}

function printRxLabelDirect(opts: {
  trackingId: string;
  recipient: string;
  address: string;
  phone: string;
  fromName: string;
}) {
  if (typeof window === "undefined") return;

  const barcode = buildBarcodeSvg(opts.trackingId || "RTL-PENDING");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const parts = opts.address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const street = parts[0] ?? "";
  const locality = parts.slice(1).join(", ");

  const W = 2.225,
    H = 1.25;

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Rx Label</title>
<style>
@page { size: ${W}in ${H}in; margin: 0; }
html,body { margin:0;padding:0;background:#fff;color:#000;
  font-family:-apple-system,BlinkMacSystemFont,"Inter",Arial,sans-serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact; }
body { width:${W}in;height:${H}in;overflow:hidden; }
.root { width:${W}in;height:${H}in;padding:0.04in;box-sizing:border-box;
  display:grid;
  grid-template-rows:0.28in 0.20in 0.14in 0.08in 0.02in 0.10in 0.09in 0.09in 0.09in;
  row-gap:0.01in;overflow:hidden;page-break-after:avoid;break-after:avoid-page; }
.hdr{display:flex;align-items:center;justify-content:space-between;}
.logo{height:0.22in;width:auto;display:block;}
.meta{text-align:right;line-height:1.1;flex-shrink:0;font-size:7pt;font-weight:800;
  letter-spacing:0.05em;text-transform:uppercase;}
.bc{display:flex;align-items:stretch;justify-content:center;overflow:hidden;}
.bc svg{width:100%;height:100%;display:block;}
.tid{text-align:center;font-family:"Geist Mono",ui-monospace,monospace;font-size:12pt;
  font-weight:900;letter-spacing:0.03em;line-height:1;}
.ln{display:flex;align-items:center;gap:0.04in;overflow:hidden;line-height:1.1;}
.fr{font-size:6pt;border-top:0.005in solid #000;padding-top:0.01in;}
.to{font-size:7pt;}
.k{font-weight:800;flex-shrink:0;}
.v{font-weight:600;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.vn{font-weight:700;}
.row{font-size:6pt;line-height:1.1;font-weight:600;text-transform:uppercase;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:0.16in;}
.ph{font-weight:700;}
</style>
<script>
window.addEventListener('DOMContentLoaded',function(){
  document.getElementById('bc').innerHTML=${JSON.stringify(barcode)};
  document.getElementById('tid').textContent=${JSON.stringify(opts.trackingId)};
  document.getElementById('from').textContent=${JSON.stringify(opts.fromName.toUpperCase())};
  document.getElementById('name').textContent=${JSON.stringify(opts.recipient.toUpperCase())};
  document.getElementById('street').textContent=${JSON.stringify(street.toUpperCase())};
  document.getElementById('city').textContent=${JSON.stringify(locality.toUpperCase())};
  document.getElementById('ph').textContent=${JSON.stringify(opts.phone ? "☎ " + opts.phone : "")};
  var img=document.getElementById('logo');
  function go(){setTimeout(function(){window.print();},80);}
  if(img.complete)go();else{img.onload=go;img.onerror=go;}
  window.onafterprint=function(){window.close();};
});
</script></head>
<body><div class="root">
<div class="hdr"><img id="logo" class="logo" src="${LABEL_LOGO}" alt="Routely"><div class="meta">Rx · Local</div></div>
<div class="bc" id="bc"></div>
<div class="tid" id="tid"></div>
<div class="ln fr"><span class="k">FROM:</span><span class="v" id="from"></span></div>
<div></div>
<div class="ln to"><span class="k">TO:</span><span class="v vn" id="name"></span></div>
<div class="row" id="street"></div>
<div class="row" id="city"></div>
<div class="row ph" id="ph"></div>
</div></body></html>`;

  const popup = window.open(
    "",
    "_blank",
    `width=${Math.round(W * 96 + 40)},height=${Math.round(H * 96 + 80)},menubar=no,toolbar=no,scrollbars=no`,
  );
  if (!popup) {
    alert("Please allow popups to print the label.");
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

/* ────────────────── Confidence chip (review header) ────────────────── */

const CHIP_TONES: Record<FieldConfidence, { bg: string; text: string; dot: string }> = {
  high: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  low: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
  none: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

function ConfChip({ label, conf }: { label: string; conf: FieldConfidence }) {
  const c = CHIP_TONES[conf];
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", c.bg, c.text)}
    >
      <span className={cn("size-1.5 rounded-full", c.dot)} />
      {label}
    </span>
  );
}

/* ──────────────────────────── Component ─────────────────────────────── */

export default function OCRScanModal({
  open,
  onOpenChange,
  onSubmit,
  onBatchFiles,
  initialFile,
  failedCount = 0,
  onFailedCountChange,
  onResolveSubmit,
}: OCRScanModalProps) {
  const [state, setState] = useState<ScanState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<OCRProgress | null>(null);

  // Per-field confidence after sanitize + validate
  const [addrConf, setAddrConf] = useState<FieldConfidence>("none");
  const [nameConf, setNameConf] = useState<FieldConfidence>("none");
  const [phoneConf, setPhoneConf] = useState<FieldConfidence>("none");

  // Review fields
  const [reviewAddress, setReviewAddress] = useState("");
  const [reviewName, setReviewName] = useState("");
  const [reviewPhone, setReviewPhone] = useState("");
  // Hybrid-OCR (Phase 1): AI-only fields + the "Use AI" switch (per-session,
  // default OFF — sessionStorage survives modal open/close).
  const [reviewDob, setReviewDob] = useState("");
  const [reviewOrderIds, setReviewOrderIds] = useState("");
  const [reviewGateCode, setReviewGateCode] = useState("");
  const [itemsCount, setItemsCount] = useState<number | null>(null);
  const [aiUsed, setAiUsed] = useState(false);
  // Permanent OCR scan id (ocr_scans) — attached to the draft on submit so the
  // scan → draft → stop chain links. Cleared on retry/reset to avoid staleness.
  const [scanId, setScanId] = useState<string | undefined>(undefined);
  const [useAI, setUseAI] = useState(() => {
    if (typeof window === "undefined") return true;
    // Default ON (2026-07-04, CEO-directed): pharmacy labels almost always need
    // the vision model, so AI-first is the fast default and skips the ~3s
    // on-device Tesseract pre-pass. Explicit "0" = user chose Tesseract-first.
    return sessionStorage.getItem("ocr_use_ai") !== "0";
  });
  const toggleUseAI = (v: boolean) => {
    setUseAI(v);
    try {
      sessionStorage.setItem("ocr_use_ai", v ? "1" : "0");
    } catch {
      /* private mode — session-only state still works */
    }
  };

  // Debug diagnostic (2026-07-04): capture the full OCR trace for the last scan
  // (raw model output + timings + image sent). Ephemeral; nothing persisted.
  const [debugMode, setDebugMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("ocr_debug") === "1";
  });
  const toggleDebug = (v: boolean) => {
    setDebugMode(v);
    try {
      sessionStorage.setItem("ocr_debug", v ? "1" : "0");
    } catch {
      /* private mode — session-only state still works */
    }
  };
  const [debugData, setDebugData] = useState<OcrDebug | null>(null);
  const [debugImage, setDebugImage] = useState<string | null>(null);
  const [debugResizeMs, setDebugResizeMs] = useState<number | null>(null);
  const [debugClientMs, setDebugClientMs] = useState<number | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  // Address validation
  const [validating, setValidating] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [pickedSuggestion, setPickedSuggestion] = useState<AddressSuggestion | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<AddressResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Hard submit validation errors (CEO-locked: 3-field gate)
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  // Per-label stopwatch
  const scanStartRef = useRef<number>(0);
  const stopwatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [labelElapsedMs, setLabelElapsedMs] = useState(0);

  // Package option fields
  const [packageType, setPackageType] = useState<"rx" | "standard" | "internal" | "cold">("rx");
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [isSameDay, setIsSameDay] = useState(false);
  const [collectCod, setCollectCod] = useState(false);
  const [codAmount, setCodAmount] = useState("");

  // ── Window tabs: "scan" (camera/upload) | "failed" (the day's failed-scan
  // list, resolved in-window via the shared correction form). ──────────────
  const [windowTab, setWindowTab] = useState<"scan" | "failed">("scan");
  const [resolvingScan, setResolvingScan] = useState<FailedScan | null>(null);
  const [failedRefreshKey, setFailedRefreshKey] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const validationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearStopwatch() {
    if (stopwatchRef.current) clearInterval(stopwatchRef.current);
    stopwatchRef.current = null;
  }

  function startStopwatch() {
    clearStopwatch();
    scanStartRef.current = Date.now();
    setLabelElapsedMs(0);
    stopwatchRef.current = setInterval(() => {
      setLabelElapsedMs(Date.now() - scanStartRef.current);
    }, 200);
  }

  /* Reset on close */
  useEffect(() => {
    if (!open) {
      stopCamera();
      void disposeOCR();
      clearStopwatch();
      setState("idle");
      setCapturedUrl(null);
      setOcrProgress(null);
      setErrorMsg("");
      setReviewAddress("");
      setReviewName("");
      setReviewPhone("");
      setAddrConf("none");
      setNameConf("none");
      setPhoneConf("none");
      setScanId(undefined);
      setSuggestions([]);
      setPickedSuggestion(null);
      setResolvedAddress(null);
      setSubmitting(false);
      setSubmitErrors([]);
      setLabelElapsedMs(0);
      setPackageType("rx");
      setRequiresSignature(false);
      setIsSameDay(false);
      setCollectCod(false);
      setCodAmount("");
      setWindowTab("scan");
      setResolvingScan(null);
      setDebugData(null);
      setDebugImage(null);
      setDebugResizeMs(null);
      setDebugClientMs(null);
      setZoomUrl(null);
    }
  }, [open]);

  /* Pre-load Tesseract worker while sitting at the idle screen. */
  useEffect(() => {
    if (open && state === "idle") void warmupOCR();
  }, [open, state]);

  /* Warm the Qwen vLLM box the moment the modal opens. The box cold-starts on
   * the vision path (first scan after ~60s idle ~5-12s); firing a tiny 600px
   * dummy now — while the user frames/crops — means the real scan lands on a hot
   * box (~2s). Fire-and-forget, only when Qwen is the active provider; the Bearer
   * stays server-side behind /api/client/ocr/warmup. Covers the batch path too:
   * reaching batch always goes through this modal's idle screen first. */
  useEffect(() => {
    if (!open) return;
    if (readScanPreference() !== "qwen") return;
    void fetch("/api/client/ocr/warmup", { method: "POST", keepalive: true }).catch(() => {
      /* fire-and-forget: warmup failure must never block the modal */
    });
  }, [open]);

  /* Batch "Review failed one by one": run OCR on the handed-over image. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: must not re-fire on state changes
  useEffect(() => {
    if (!open || !initialFile) return;
    const reader = new FileReader();
    reader.onload = (ev) => runOCR(ev.target?.result as string);
    reader.readAsDataURL(initialFile);
  }, [open, initialFile]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  async function startCamera() {
    setState("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      stopCamera();
      setState("idle");
      fileInputRef.current?.click();
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx || !vw || !vh) return;

    // WYSIWYG crop: capture EXACTLY the guide-box rectangle the user sees, not the
    // whole frame. The <video> is object-fit:cover, so the displayed image is the
    // intrinsic frame scaled by max(dw/vw, dh/vh) and center-cropped. We map the
    // guide box's CSS rect (relative to the video's displayed rect) back into the
    // video's intrinsic pixel coordinates and drawImage that source rect.
    const vRect = video.getBoundingClientRect();
    const gRect = guideRef.current?.getBoundingClientRect() ?? null;
    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;
    const dw = vRect.width;
    const dh = vRect.height;
    if (gRect && dw > 0 && dh > 0) {
      const scale = Math.max(dw / vw, dh / vh); // object-cover scale
      const visW = dw / scale; // intrinsic px visible across the display width
      const visH = dh / scale;
      const offX = (vw - visW) / 2; // center-crop offsets (cover trims the overflow)
      const offY = (vh - visH) / 2;
      // Guide rect position relative to the video's displayed top-left.
      const gx = gRect.left - vRect.left;
      const gy = gRect.top - vRect.top;
      // Map display px → intrinsic px, then clamp into the frame.
      const cx = offX + (gx / dw) * visW;
      const cy = offY + (gy / dh) * visH;
      const cw = (gRect.width / dw) * visW;
      const ch = (gRect.height / dh) * visH;
      sx = Math.max(0, Math.min(cx, vw));
      sy = Math.max(0, Math.min(cy, vh));
      sw = Math.max(1, Math.min(cw, vw - sx));
      sh = Math.max(1, Math.min(ch, vh - sy));
    }
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    stopCamera();
    runOCR(dataUrl);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (files.length === 0) return;
    if (files.length > 1 && onBatchFiles) {
      onBatchFiles(files);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => runOCR(ev.target?.result as string);
    reader.readAsDataURL(files[0]);
  }

  async function runOCR(rawDataUrl: string) {
    const scanPreference = readScanPreference();
    // DECODE-ONCE resize (off the main thread). Replaces the old 3× downscaleForOcr
    // that re-decoded a full 12MP phone JPEG three times on the UI thread — the
    // ~7s capture stall + frozen screen. resizeOcrStandard produces all three sizes
    // in a single pass via a Web Worker, with a main-thread single-decode fallback
    // and a legacy per-size fallback baked in, so it can never block a scan.
    //   preview   1600 @ 0.80  → preview / Tesseract / OpenAI fallback path
    //   aiPrimary  600 @ 0.80  → Qwen vLLM (single 600px pass; 1200px retry removed)
    // Show the processing screen + start the clock IMMEDIATELY, so the capture
    // never looks frozen and the on-screen stopwatch reflects true end-to-end time
    // (resize included). The resize runs off-thread, so the UI stays responsive.
    setCapturedUrl(rawDataUrl);
    setState("processing");
    setOcrProgress({ status: "Scanning", progress: 0.05 });
    setSubmitErrors([]);
    setDebugData(null);
    setDebugImage(null);
    startStopwatch();

    const _resizeT0 = performance.now();
    const srcBlob = await (await fetch(rawDataUrl)).blob();
    const sized = await resizeOcrStandard(srcBlob);
    const _resizeMs = Math.round(performance.now() - _resizeT0);
    // TEMP measurement probe — remove once the 7s→~2s win is confirmed on-device.
    console.log(`[ocr] decode-once resize took ${_resizeMs}ms`);
    setDebugResizeMs(_resizeMs);
    const dataUrl = sized.preview;
    const aiDataUrl = scanPreference === "qwen" ? sized.aiPrimary : dataUrl;
    if (debugMode) setDebugImage(aiDataUrl);
    setCapturedUrl(dataUrl);

    try {
      let result: import("@/lib/ocr/label-parser").OCRExtracted;

      if (useAI) {
        // AI-FIRST (2026-07-04, CEO-directed): pharmacy labels almost always need
        // the vision model, so we skip the ~3s on-device Tesseract pre-pass and go
        // straight to Qwen (single 600px pass — the 1200px retry was removed). If
        // the AI call throws (box/network down), we fall back to on-device Tesseract
        // so an offline scan still works and never dies at the error screen.
        setOcrProgress({ status: "Reading label", progress: 0.5 });
        try {
          result = await aiExtractLabel(aiDataUrl, undefined, scanPreference, undefined, debugMode ? setDebugData : undefined);
        } catch {
          setOcrProgress({ status: "Reading label (offline)", progress: 0.35 });
          result = await processLabelImage(dataUrl, (p) => {
            setOcrProgress({ status: "Reading label (offline)", progress: 0.35 + p.progress * 0.3 });
          });
        }
      } else {
        result = await processLabelImage(dataUrl, (p) => {
          // Map Tesseract internal status → named phases
          const label =
            p.status.includes("loading") || p.status.includes("initializ")
              ? "Scanning"
              : p.status === "recognizing text"
                ? "Processing capture"
                : "Processing capture";
          setOcrProgress({ status: label, progress: p.progress * 0.55 });
        });
        setOcrProgress({ status: "Mapping fields", progress: 0.6 });
        if (shouldEscalateToAI(result)) {
          try {
            setOcrProgress({ status: "Mapping fields", progress: 0.65 });
            result = await aiExtractLabel(aiDataUrl, undefined, scanPreference, undefined, debugMode ? setDebugData : undefined);
          } catch {
            /* AI failed — keep the Tesseract result; review is editable */
          }
        }
      }

      // Normalize name immediately: flip "LAST, FIRST" → "First Last" + Title Case
      const nameNorm = normalizeAndValidateName(result.candidateName);
      const normalizedName = nameNorm.normalized ?? result.candidateName ?? "";

      setOcrProgress({ status: "Validating address", progress: 0.72 });
      setOcrProgress({ status: "Validating name", progress: 0.84 });
      setOcrProgress({ status: "Validating phone", progress: 0.93 });

      // Pre-fill review form
      setReviewAddress(result.candidateAddress ?? "");
      setReviewName(normalizedName);
      setReviewPhone(result.candidatePhone ?? "");
      setAddrConf(result.addressConfidence);
      setNameConf(result.nameConfidence);
      setPhoneConf(result.phoneConfidence);
      setReviewDob(result.candidateDob ?? "");
      setReviewOrderIds((result.orderIds ?? []).join(", "));
      setItemsCount(result.numberOfItems ?? null);
      setAiUsed(Boolean(result.aiUsed));
      setScanId(result.scanId);

      if (result.candidateAddress) validateAddress(result.candidateAddress);

      setDebugClientMs(Date.now() - scanStartRef.current);
      clearStopwatch();
      setState("review");
    } catch {
      clearStopwatch();
      setErrorMsg("Couldn't read the label. Check your connection and try again — or enter the details manually.");
      setState("error");
    }
  }

  async function validateAddress(raw: string) {
    if (!raw.trim() || raw.length < 5) return;
    if (validationTimer.current) clearTimeout(validationTimer.current);
    validationTimer.current = setTimeout(async () => {
      setValidating(true);
      setSuggestions([]);
      setPickedSuggestion(null);
      setResolvedAddress(null);
      try {
        const res = await fetch(`/api/client/places?input=${encodeURIComponent(raw)}`);
        const data: { predictions: AddressSuggestion[] } = await res.json();
        const preds = data.predictions ?? [];
        setSuggestions(preds);
        if (preds.length > 0) {
          setPickedSuggestion(preds[0]);
          await resolvePlace(preds[0].place_id);
        }
      } catch {
        /* best-effort */
      } finally {
        setValidating(false);
      }
    }, 400);
  }

  async function resolvePlace(placeId: string) {
    try {
      const res = await fetch(`/api/client/place-details?place_id=${encodeURIComponent(placeId)}`);
      const d = await res.json();
      if (d.street) {
        setResolvedAddress({
          street: d.street,
          city: d.city ?? "",
          state: d.state ?? "FL",
          zip: d.zip ?? "",
          lat: d.lat,
          lng: d.lng,
        });
      }
    } catch {
      /* ignore */
    }
  }

  async function handleSubmit() {
    if (submitting) return;

    // CEO-locked: hard gate on 3 fields before creating any draft
    const phoneVal = validatePhone(reviewPhone);
    const nameVal = normalizeAndValidateName(reviewName);
    const errors: string[] = [];
    if (!phoneVal.valid) errors.push(phoneVal.reason ?? "Invalid phone");
    if (!nameVal.valid) errors.push(nameVal.reason ?? "Invalid name");
    if (!resolvedAddress) errors.push("Address must be validated — select a suggestion below the field");

    if (errors.length > 0) {
      setSubmitErrors(errors);
      return;
    }

    setSubmitErrors([]);
    setSubmitting(true);
    try {
      const orderIds = reviewOrderIds
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d{6,7}-\d{2}$/.test(s));
      await onSubmit({
        address: resolvedAddress!,
        name: nameVal.normalized!,
        phone: reviewPhone,
        packageType,
        requiresSignature,
        isSameDay,
        collectCod,
        codAmount,
        dob: /^\d{2}\/\d{2}\/\d{4}$/.test(reviewDob.trim()) ? reviewDob.trim() : undefined,
        orderIds: orderIds.length > 0 ? orderIds : undefined,
        gateCode: reviewGateCode.trim() || undefined,
        scanId,
      });
    } catch {
      // onSubmit handles its own error toast
    } finally {
      setSubmitting(false);
    }
  }

  function retry() {
    clearStopwatch();
    setLabelElapsedMs(0);
    setCapturedUrl(null);
    setOcrProgress(null);
    setErrorMsg("");
    setReviewAddress("");
    setReviewName("");
    setReviewPhone("");
    setAddrConf("none");
    setNameConf("none");
    setPhoneConf("none");
    setReviewDob("");
    setReviewOrderIds("");
    setReviewGateCode("");
    setItemsCount(null);
    setAiUsed(false);
    setScanId(undefined);
    setSuggestions([]);
    setPickedSuggestion(null);
    setResolvedAddress(null);
    setSubmitErrors([]);
    setDebugData(null);
    setDebugImage(null);
    setZoomUrl(null);
    setState("idle");
  }

  if (!open) return null;

  // Display the phase name directly — we now control progress status strings
  const progressLabel = ocrProgress?.status ?? "Starting…";
  const progressPct = ocrProgress ? Math.round((ocrProgress.progress ?? 0) * 100) : 0;

  return (
    <>
      <canvas ref={canvasRef} className="hidden" aria-hidden />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        aria-hidden
        onChange={handleFileChange}
      />

      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          if (state !== "processing" && !submitting) onOpenChange(false);
        }}
      />

      {/* Bottom sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[92svh] flex-col rounded-t-2xl bg-card shadow-2xl ring-1 ring-border/30"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-border/60" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-1">
          <div>
            <p className="font-semibold text-sm text-foreground">
              {windowTab === "failed" ? "Failed Scans" : "Scan Label"}
            </p>
            <p className="text-xs text-muted-foreground/65">
              {windowTab === "failed"
                ? resolvingScan
                  ? "Confirm the details — the label is shown for reference"
                  : "Resolve the day's failed labels"
                : (state === "idle" && "Point camera at the shipping label") ||
                  (state === "camera" && "Align label in the frame, then capture") ||
                  (state === "processing" && progressLabel) ||
                  (state === "review" && "Confirm the extracted information") ||
                  (state === "error" && "Something went wrong — try again")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {windowTab === "scan" && (
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Switch checked={useAI} onCheckedChange={toggleUseAI} disabled={state === "processing" || submitting} />
                Use AI
              </label>
            )}
            {windowTab === "scan" && (
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Switch
                  checked={debugMode}
                  onCheckedChange={toggleDebug}
                  disabled={state === "processing" || submitting}
                />
                Debug
              </label>
            )}
            {state !== "processing" && !submitting && (
              <button
                type="button"
                onClick={() => {
                  // Resolving a failed scan? X behaves like Cancel — back to the
                  // Failed Scans list (item stays pending), NOT out of the window.
                  if (windowTab === "failed" && resolvingScan) {
                    setResolvingScan(null);
                    return;
                  }
                  stopCamera();
                  onOpenChange(false);
                }}
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={windowTab === "failed" && resolvingScan ? "Back to failed scans" : "Close"}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs — only at the idle/list level (hidden mid-scan: camera/review). */}
        {(state === "idle" || windowTab === "failed") && !resolvingScan && (
          <div className="shrink-0 px-4 pb-2">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setWindowTab("scan")}
                className={cn(
                  "flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all",
                  windowTab === "scan"
                    ? "bg-card text-primary shadow-sm ring-1 ring-border/40"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ScanLine className="size-4" />
                Scan
              </button>
              <button
                type="button"
                onClick={() => {
                  setWindowTab("failed");
                  setFailedRefreshKey((k) => k + 1);
                }}
                className={cn(
                  "relative flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all",
                  windowTab === "failed"
                    ? "bg-card text-primary shadow-sm ring-1 ring-border/40"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Failed Scans
                {failedCount > 0 && (
                  <span className="relative ml-0.5 flex items-center justify-center">
                    {/* Pulsing glow ring (pure CSS) when there are pending failures */}
                    <span className="absolute inline-flex size-5 animate-ping rounded-full bg-rose-500/40" />
                    <span className="relative flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {failedCount}
                    </span>
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── IDLE (Scan tab) ── */}
        {state === "idle" && windowTab === "scan" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-10 pt-4">
            <div className="flex size-20 items-center justify-center rounded-2xl bg-primary/10">
              <ScanLine className="size-10 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm text-foreground">Scan a shipping label</p>
              <p className="mt-1.5 max-w-[260px] text-[13px] text-muted-foreground/65 leading-relaxed">
                Automatically extract address, name, and phone — all processed on-device.
              </p>
            </div>
            <div className="w-full max-w-[320px] space-y-3">
              <Button
                onClick={startCamera}
                className="h-12 w-full gap-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Camera className="size-5" />
                Open Camera
              </Button>
              <Button
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.removeAttribute("capture");
                    fileInputRef.current.click();
                    setTimeout(() => fileInputRef.current?.setAttribute("capture", "environment"), 500);
                  }
                }}
                variant="outline"
                className="h-11 w-full gap-2 rounded-xl border-border/60 text-[13px] font-medium text-foreground"
              >
                <FileImage className="size-4 text-muted-foreground" />
                Upload from Gallery
              </Button>
            </div>
          </div>
        )}

        {/* ── FAILED SCANS tab ── */}
        {windowTab === "failed" &&
          (resolvingScan ? (
            <OcrCorrectionForm
              imageUrl={resolvingScan.image}
              reasons={resolvingScan.reasons}
              skipLabel="Cancel"
              initial={{
                name: resolvingScan.name,
                phone: resolvingScan.phone,
                address: resolvingScan.address,
                dob: resolvingScan.dob,
                orderIds: resolvingScan.orderIds,
              }}
              onSubmit={async (data) => {
                const scan = resolvingScan;
                if (!scan || !onResolveSubmit) return { ok: false, error: "Cannot resolve right now" };
                const res = await onResolveSubmit(scan, data);
                if (res.ok) {
                  // Back to the Failed Scans list, refreshed (one fewer pending).
                  setResolvingScan(null);
                  setFailedRefreshKey((k) => k + 1);
                }
                return res;
              }}
              onSkip={() => setResolvingScan(null)}
            />
          ) : (
            <FailedScansList
              refreshKey={failedRefreshKey}
              onCountChange={onFailedCountChange}
              onResolve={(item) => setResolvingScan(item)}
            />
          ))}

        {/* ── CAMERA ── */}
        {state === "camera" && (
          <div className="flex flex-1 flex-col items-center pb-8">
            <div className="relative w-full overflow-hidden bg-black" style={{ maxHeight: "58svh" }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
                style={{ aspectRatio: "4/3" }}
              />
              <div ref={guideRef} className="pointer-events-none absolute inset-5">
                <div className="absolute left-0 top-0 h-8 w-8 rounded-tl border-l-[2.5px] border-t-[2.5px] border-white/85" />
                <div className="absolute right-0 top-0 h-8 w-8 rounded-tr border-r-[2.5px] border-t-[2.5px] border-white/85" />
                <div className="absolute bottom-0 left-0 h-8 w-8 rounded-bl border-b-[2.5px] border-l-[2.5px] border-white/85" />
                <div className="absolute bottom-0 right-0 h-8 w-8 rounded-br border-b-[2.5px] border-r-[2.5px] border-white/85" />
              </div>
              <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                <span className="rounded-full bg-black/55 px-3.5 py-1 text-[11px] text-white/85">
                  Align label within frame
                </span>
              </div>
            </div>
            <div className="flex w-full items-center justify-around px-8 pt-6">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setState("idle");
                }}
                className="flex size-12 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-accent"
                aria-label="Cancel"
              >
                <X className="size-5" />
              </button>
              <button
                type="button"
                onClick={captureFrame}
                aria-label="Capture photo"
                className="flex size-[76px] items-center justify-center rounded-full border-[3px] border-white/80 shadow-lg active:scale-95 transition-transform"
                style={{ backgroundColor: "var(--primary)" }}
              >
                <Camera className="size-8 text-white" />
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setState("idle");
                  fileInputRef.current?.click();
                }}
                className="flex size-12 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-accent"
                aria-label="Gallery"
              >
                <FileImage className="size-5" />
              </button>
            </div>
          </div>
        )}

        {/* ── PROCESSING ── */}
        {state === "processing" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-12 pt-4">
            {capturedUrl && (
              <div className="relative w-full max-w-[300px] overflow-hidden rounded-xl shadow-md ring-1 ring-border/40">
                {/* biome-ignore lint/a11y/useAltText: captured label preview */}
                <img
                  src={capturedUrl}
                  className="w-full cursor-zoom-in object-cover"
                  onClick={() => capturedUrl && setZoomUrl(capturedUrl)}
                />
                <motion.div
                  className="pointer-events-none absolute left-0 right-0 h-0.5 shadow-[0_0_10px_3px_color-mix(in_srgb,var(--primary)_60%,transparent)]"
                  style={{ backgroundColor: "var(--primary)" }}
                  initial={{ top: "0%" }}
                  animate={{ top: "100%" }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                />
              </div>
            )}
            <div className="flex w-full max-w-[300px] flex-col items-center gap-3">
              <div className="flex items-center gap-2.5">
                <Loader2 className="size-5 animate-spin text-primary" />
                <p className="font-semibold text-sm text-foreground">{progressLabel}</p>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: "var(--primary)" }}
                  animate={{ width: `${Math.max(progressPct, 8)}%` }}
                  transition={{ ease: "easeOut", duration: 0.3 }}
                />
              </div>
              {/* Per-label stopwatch */}
              <div className="flex w-full items-center justify-between">
                <p className="text-[11px] text-muted-foreground/55">Processing on-device · no data sent</p>
                <p className="font-mono text-[11px] text-muted-foreground/40">{fmtLabel(labelElapsedMs)}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── ERROR (OCR failed / no address) ── */}
        {state === "error" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-10 pt-4">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertCircle className="size-8 text-destructive" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm text-foreground">Couldn't scan the label</p>
              <p className="mt-2 max-w-[290px] text-[13px] text-muted-foreground/65 leading-relaxed">{errorMsg}</p>
            </div>
            {capturedUrl && (
              <div className="w-full max-w-[200px] overflow-hidden rounded-xl opacity-40 ring-1 ring-border">
                {/* biome-ignore lint/a11y/useAltText: failed label preview */}
                <img src={capturedUrl} className="w-full" />
              </div>
            )}
            <div className="w-full max-w-[300px] space-y-2.5">
              <Button
                onClick={retry}
                className="h-12 w-full gap-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <RefreshCw className="size-4" />
                Try Again
              </Button>
              <Button
                onClick={() => onOpenChange(false)}
                variant="outline"
                className="h-11 w-full rounded-xl border-border/60 text-[13px] font-medium"
              >
                Close
              </Button>
            </div>
          </div>
        )}

        {/* ── REVIEW ── */}
        {state === "review" && (
          <div className="custom-scroll flex-1 overflow-y-auto">
            <div className="px-4 pb-6 pt-1">
              {/* Thumbnail + detected fields */}
              {capturedUrl && (
                <div className="mb-4 rounded-xl bg-muted/30 p-3 ring-1 ring-border/40">
                  <div className="flex items-center gap-3">
                    {/* biome-ignore lint/a11y/useAltText: label thumbnail */}
                    <img
                      src={capturedUrl}
                      onClick={() => capturedUrl && setZoomUrl(capturedUrl)}
                      className="h-14 w-20 shrink-0 cursor-zoom-in rounded-lg object-cover ring-1 ring-border/50"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                        <p className="text-xs font-semibold text-foreground">Label scanned</p>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {reviewAddress && <ConfChip label="Address" conf={addrConf} />}
                        {reviewName && <ConfChip label="Name" conf={nameConf} />}
                        {reviewPhone && <ConfChip label="Phone" conf={phoneConf} />}
                        {!reviewAddress && !reviewName && !reviewPhone && (
                          <span className="text-[11px] text-amber-600">No fields detected — fill in manually</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={retry}
                      className="ml-1 flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent"
                    >
                      <RefreshCw className="size-3" />
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {/* OCR debug trace — only when the Debug toggle is on */}
              {debugData && (
                <OcrDebugPanel
                  debug={debugData}
                  image={debugImage}
                  resizeMs={debugResizeMs}
                  clientMs={debugClientMs}
                  onZoom={(u) => setZoomUrl(u)}
                />
              )}

              {/* Address */}
              <div className="mb-3">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                  Delivery Address <span className="text-destructive">*</span>
                </label>
                <input
                  value={reviewAddress}
                  onChange={(e) => {
                    setReviewAddress(e.target.value);
                    setResolvedAddress(null);
                    setSubmitErrors([]);
                    validateAddress(e.target.value);
                  }}
                  placeholder="123 Main St, Miami, FL 33101"
                  className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
                {validating && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                    <Loader2 className="size-3 animate-spin" />
                    Validating…
                  </p>
                )}
                {resolvedAddress && !validating && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3 shrink-0" />
                    {[resolvedAddress.street, resolvedAddress.city, resolvedAddress.state, resolvedAddress.zip]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                {suggestions.length > 1 && !validating && (
                  <div className="mt-2 space-y-1.5">
                    {suggestions.slice(1, 3).map((s) => (
                      <button
                        key={s.place_id}
                        type="button"
                        onClick={async () => {
                          setPickedSuggestion(s);
                          setReviewAddress(s.description);
                          setSubmitErrors([]);
                          await resolvePlace(s.place_id);
                        }}
                        className={cn(
                          "w-full rounded-xl border px-3.5 py-2.5 text-left text-xs transition-colors",
                          pickedSuggestion?.place_id === s.place_id
                            ? "border-primary/40 bg-primary/5 text-foreground"
                            : "border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40",
                        )}
                      >
                        {s.description}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="mb-3">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                  Recipient Name <span className="text-destructive">*</span>
                </label>
                <input
                  value={reviewName}
                  onChange={(e) => {
                    setReviewName(e.target.value);
                    setSubmitErrors([]);
                  }}
                  placeholder="Full name"
                  className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
              </div>

              {/* Phone */}
              <div className="mb-4">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                  Phone Number <span className="text-destructive">*</span>
                </label>
                <input
                  value={reviewPhone}
                  onChange={(e) => {
                    setReviewPhone(e.target.value);
                    setSubmitErrors([]);
                  }}
                  placeholder="(555) 123-4567"
                  inputMode="tel"
                  className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
              </div>

              {/* Gate code (optional) — captured + stored like other stop fields */}
              <div className="mb-4">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                  Gate Code <span className="font-normal text-muted-foreground/40">(optional)</span>
                </label>
                <input
                  value={reviewGateCode}
                  onChange={(e) => setReviewGateCode(e.target.value)}
                  placeholder="e.g. #1234"
                  className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
              </div>

              {/* AI-path extras: DOB + Order IDs (hybrid-OCR Phase 1) */}
              {(aiUsed || reviewDob || reviewOrderIds) && (
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                      Date of Birth
                    </label>
                    <input
                      value={reviewDob}
                      onChange={(e) => setReviewDob(e.target.value)}
                      placeholder="MM/DD/YYYY"
                      inputMode="numeric"
                      className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                      Order IDs
                    </label>
                    <input
                      value={reviewOrderIds}
                      onChange={(e) => setReviewOrderIds(e.target.value)}
                      placeholder="6006418-01, 123456-01"
                      className="h-11 w-full rounded-xl border border-input bg-background px-3.5 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/10"
                    />
                    {itemsCount != null &&
                      reviewOrderIds.split(/[,\s]+/).filter((s) => /^\d{6,7}-\d{2}$/.test(s.trim())).length !==
                        itemsCount && (
                        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                          Label says {itemsCount} item{itemsCount === 1 ? "" : "s"} — ID count doesn&apos;t match
                        </p>
                      )}
                  </div>
                </div>
              )}

              {/* ── Package Options ── */}
              <div className="mb-5">
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                  Package Options
                </p>
                <div className="mb-3">
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground/60">Type</p>
                  <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/40 p-1">
                    {(["rx", "standard", "internal", "cold"] as const).map((pt) => (
                      <button
                        key={pt}
                        type="button"
                        onClick={() => setPackageType(pt)}
                        className={cn(
                          "flex h-8 items-center justify-center rounded-lg text-xs font-semibold transition-all",
                          packageType === pt
                            ? "bg-card text-primary shadow-sm ring-1 ring-border/40"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {pt === "rx" ? "Rx" : pt === "internal" ? "Internal" : pt === "cold" ? "Cold" : "Std"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      {
                        key: "sig",
                        label: "Signature",
                        Icon: PenLine,
                        active: requiresSignature,
                        toggle: () => setRequiresSignature((v) => !v),
                      },
                      {
                        key: "sameday",
                        label: "Same Day",
                        Icon: Zap,
                        active: isSameDay,
                        toggle: () => setIsSameDay((v) => !v),
                      },
                      {
                        key: "cod",
                        label: "COD",
                        Icon: DollarSign,
                        active: collectCod,
                        toggle: () => {
                          setCollectCod((v) => {
                            if (v) setCodAmount("");
                            return !v;
                          });
                        },
                      },
                    ].map(({ key, label, Icon, active, toggle }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={toggle}
                        className={cn(
                          "flex h-9 flex-col items-center justify-center gap-0.5 rounded-xl border px-2 text-[11px] font-medium transition-all",
                          active
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border/50 bg-background text-muted-foreground hover:border-border hover:bg-muted/30 hover:text-foreground",
                        )}
                      >
                        <Icon className={cn("size-3.5", active ? "text-primary" : "text-muted-foreground/60")} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                  {collectCod && (
                    <div className="flex h-10 items-center gap-2 rounded-xl border border-primary/30 bg-background px-3.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
                      <DollarSign className="size-3.5 shrink-0 text-primary/60" />
                      <input
                        value={codAmount}
                        onChange={(e) => setCodAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                        onBlur={(e) => {
                          const num = parseFloat(e.target.value.replace(/,/g, ""));
                          setCodAmount(
                            !Number.isNaN(num) && num > 0
                              ? num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : "",
                          );
                        }}
                        placeholder="0.00"
                        inputMode="decimal"
                        className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Submit validation errors */}
              {submitErrors.length > 0 && (
                <div className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3">
                  <p className="mb-1 text-[11px] font-semibold text-destructive">Fix before submitting:</p>
                  {submitErrors.map((e, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static error list per render
                    <p key={i} className="text-[11px] text-destructive/80">
                      • {e}
                    </p>
                  ))}
                </div>
              )}

              {/* CTAs */}
              <div className="space-y-2.5">
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="h-12 w-full rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Creating stop…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 size-4" />
                      Submit
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                  variant="outline"
                  className="h-11 w-full rounded-xl border-border/60 text-[13px] font-medium"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Full-screen image zoom — tap any label image to enlarge; OS pinch-zoom */}
      {zoomUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-3"
          onClick={() => setZoomUrl(null)}
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {/* biome-ignore lint/a11y/useAltText: zoomed label */}
          <img src={zoomUrl} className="max-h-full max-w-full object-contain" style={{ touchAction: "pinch-zoom" }} />
          <button
            type="button"
            onClick={() => setZoomUrl(null)}
            className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </>
  );
}
