"use client";

/**
 * BarcodeScanModal
 * ─────────────────────────────────────────────────────────────────────────
 * Lightweight camera scanner for the "Scan Code" button. Decodes the common
 * 1D/2D symbologies on shipping labels (CODE128, EAN/UPC, CODE39, ITF, QR,
 * Data Matrix, PDF417, Aztec…) via ZXing, which is pure JS/WASM and therefore
 * works on iOS Safari too (unlike the native BarcodeDetector API).
 *
 * On the first successful read it fires onDetected(value) once and stops. The
 * parent typically drops that value into the stops search box so the list
 * filters automatically.
 *
 * ZXing is imported dynamically (like Tesseract in the OCR modal) so it never
 * lands in the main bundle and only loads when the user opens the scanner.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BarcodeScanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired once with the decoded barcode text. */
  onDetected: (value: string) => void;
}

type ScanState = "starting" | "scanning" | "error";

export default function BarcodeScanModal({ open, onOpenChange, onDetected }: BarcodeScanModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // IScannerControls from @zxing/browser — typed loosely so we don't import
  // the type at module scope. .stop() tears down the stream + decode loop.
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const doneRef = useRef(false);

  // Keep the latest onDetected in a ref so the start/stop effect can depend
  // only on `open` — otherwise a new inline callback each parent render would
  // restart the camera and flicker the scanner.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const [state, setState] = useState<ScanState>("starting");
  const [errorMsg, setErrorMsg] = useState("");

  const stop = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      /* ignore */
    }
    controlsRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    doneRef.current = false;
    setState("starting");
    setErrorMsg("");

    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled) return;
        const video = videoRef.current;
        if (!video) return;

        // Restrict the symbology set to what actually shows up on our labels.
        // Fewer formats = each decode attempt is much faster (the reader isn't
        // juggling a dozen algorithms), and TRY_HARDER spends a little extra
        // CPU to tolerate blur, glare and odd angles — so a careless, quick
        // scan still locks instead of demanding a perfectly framed shot.
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.UPC_A,
          BarcodeFormat.ITF,
          BarcodeFormat.DATA_MATRIX,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        // delayBetweenScanAttempts defaults to 500ms → only ~2 frames/sec get
        // analysed, which is exactly why it felt slow and needed several passes.
        // 100ms gives ~10 attempts/sec for a near-instant lock.
        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 100,
          delayBetweenScanSuccess: 300,
        });

        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              // Continuous autofocus is the other half of the fix: without it
              // the camera holds a fixed focus and only reads at one exact
              // distance. `advanced` makes it best-effort so an unsupported
              // device just ignores it instead of failing getUserMedia.
              advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet],
            },
          },
          video,
          (result) => {
            if (!result || doneRef.current) return;
            doneRef.current = true;
            const text = result.getText().trim();
            stop();
            if (text) onDetectedRef.current(text);
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setState("scanning");

        // Belt-and-suspenders: re-assert continuous focus on the live track
        // once the stream is up — some Android devices ignore the constraint at
        // getUserMedia time but honour applyConstraints afterwards.
        try {
          const stream = video.srcObject as MediaStream | null;
          const track = stream?.getVideoTracks?.()[0];
          track
            ?.applyConstraints?.({ advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet] })
            .catch(() => {});
        } catch {
          /* ignore — focus stays on whatever the camera defaults to */
        }
      } catch {
        if (cancelled) return;
        setErrorMsg("Couldn't start the camera. Allow camera access and try again.");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, stop]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          stop();
          onOpenChange(false);
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
        <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-1">
          <div>
            <p className="font-semibold text-sm text-foreground">Scan Code</p>
            <p className="text-xs text-muted-foreground/65">
              {state === "starting" && "Starting camera…"}
              {state === "scanning" && "Point at a barcode or QR code"}
              {state === "error" && "Camera unavailable"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stop();
              onOpenChange(false);
            }}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {state === "error" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-10 pt-4">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertCircle className="size-8 text-destructive" />
            </div>
            <p className="max-w-[290px] text-center text-[13px] text-muted-foreground/70 leading-relaxed">{errorMsg}</p>
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="h-11 w-full max-w-[300px] rounded-xl border-border/60 text-[13px] font-medium"
            >
              Close
            </Button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center pb-8">
            <div className="relative w-full overflow-hidden bg-black" style={{ maxHeight: "58svh" }}>
              {/* biome-ignore lint/a11y/useMediaCaption: live camera preview, no caption track */}
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ aspectRatio: "4/3" }} />

              {/* Guide box — wide rectangle suited to 1D barcodes, dim outside */}
              <div className="pointer-events-none absolute inset-x-6 top-1/2 h-28 -translate-y-1/2 rounded-xl border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />

              {/* Scan beam */}
              {state === "scanning" && (
                <motion.div
                  className="pointer-events-none absolute inset-x-6 h-0.5 shadow-[0_0_10px_3px_color-mix(in_srgb,var(--primary)_60%,transparent)]"
                  style={{ backgroundColor: "var(--primary)" }}
                  initial={{ top: "38%" }}
                  animate={{ top: "62%" }}
                  transition={{ duration: 1.4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                />
              )}

              {/* Starting overlay */}
              {state === "starting" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="size-6 animate-spin text-white/80" />
                </div>
              )}

              <div className="absolute right-0 bottom-3 left-0 flex justify-center">
                <span className="rounded-full bg-black/55 px-3.5 py-1 text-[11px] text-white/85">
                  Align the barcode in the box
                </span>
              </div>
            </div>

            <div className="flex w-full items-center justify-center px-8 pt-6">
              <button
                type="button"
                onClick={() => {
                  stop();
                  onOpenChange(false);
                }}
                className="flex size-12 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-accent"
                aria-label="Cancel"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </>
  );
}
