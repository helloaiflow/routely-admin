"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useUser } from "@clerk/nextjs";
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCw,
  ScanLine,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { ApplicantDetail } from "./_types";

/* R29B/R29C — the Document Visualizer (3rd column, >=1280px). Renders a document inline instead of
 * window.open()'ing the raw signed URL: zoom/pan/rotate/fit/fullscreen, native multipage PDF
 * rendering (pdf.js), client-side HEIC->JPEG conversion (heic2any -- Chrome/Edge can't render HEIC
 * natively), a subtle staff watermark, and a side-by-side compare mode for the selfie vs license
 * front with a "Same person? ✓/✕" decision (R29C: POST .../documents/selfie-match, proxied to the
 * routely-api endpoint of the same name -- upserts applicant_verifications(kind='selfie'), audited).
 * The access-log requirement is ALREADY satisfied: every signed-URL fetch already writes a
 * 'document.accessed' event server-side (see the /documents/[docId]/url route's own comment) --
 * nothing new needed there. */

const DOCUMENT_KIND_LABEL: Record<string, string> = {
  license_front: "License (front)",
  license_back: "License (back)",
  selfie: "Selfie",
  insurance: "Insurance",
  registration: "Registration",
};

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
// The signed URL itself is short-lived (120s server-side) -- refetch proactively well before it
// could expire while someone is still looking at it, not only reactively on a load error.
const URL_REFRESH_MS = 90_000;

type SignedUrlState = { url: string; fetchedAt: number } | null;

function formatBadge(contentType: string | null): string {
  if (!contentType) return "FILE";
  if (contentType.includes("pdf")) return "PDF";
  if (contentType.includes("heic") || contentType.includes("heif")) return "HEIC";
  if (contentType.includes("png")) return "PNG";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "JPG";
  return contentType.split("/")[1]?.toUpperCase() ?? "FILE";
}

async function fetchSignedUrl(applicantKey: string, docId: string): Promise<string> {
  const res = await fetch(
    `/api/client/driver-applicants/${encodeURIComponent(applicantKey)}/documents/${encodeURIComponent(docId)}/url`,
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = data.detail as { message?: string } | undefined;
    throw new Error((detail?.message as string) ?? (data.error as string) ?? "Could not get a viewing link");
  }
  const url = data.url as string | undefined;
  if (!url) throw new Error("No URL returned");
  return url;
}

export function DocumentVisualizer({
  applicantKey,
  documents,
  selectedDocId,
  onSelectDoc,
  onClose,
  onChanged,
}: {
  applicantKey: string;
  documents: ApplicantDetail["documents"];
  selectedDocId: string | null;
  onSelectDoc: (docId: string) => void;
  onClose: () => void;
  /** R29C: refreshes the detail panel's own data after a "Same person?" decision is recorded. */
  onChanged: () => void;
}) {
  const { user } = useUser();
  const staffEmail = user?.primaryEmailAddress?.emailAddress ?? "staff";

  const viewable = useMemo(
    () => documents.filter((d) => d.status === "uploaded" || d.status === "verified" || d.status === "needs_review"),
    [documents],
  );
  const doc = viewable.find((d) => d.id === selectedDocId) ?? null;
  const docIndex = doc ? viewable.indexOf(doc) : -1;

  const [compareMode, setCompareMode] = useState(false);
  const selfieDoc = viewable.find((d) => d.kind === "selfie") ?? null;
  const licenseDoc = viewable.find((d) => d.kind === "license_front") ?? null;

  if (!doc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground text-sm">
        <p>No document selected.</p>
        <p className="text-xs">Click a row in Requirements or Documents to view it here.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b p-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {formatBadge(doc.content_type)}
          </Badge>
          <span className="truncate text-xs">{DOCUMENT_KIND_LABEL[doc.kind] ?? doc.kind}</span>
          {viewable.length > 1 && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {docIndex + 1} of {viewable.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {selfieDoc && licenseDoc && (
            <Button
              type="button"
              variant={compareMode ? "default" : "ghost"}
              size="icon"
              className="size-7"
              title="Compare selfie vs. license"
              onClick={() => setCompareMode((c) => !c)}
            >
              <Columns2 className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" className="size-7" title="Close" onClick={onClose}>
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {compareMode && selfieDoc && licenseDoc ? (
          <CompareView
            applicantKey={applicantKey}
            selfieDoc={selfieDoc}
            licenseDoc={licenseDoc}
            staffEmail={staffEmail}
            onChanged={onChanged}
          />
        ) : (
          <SingleDocView
            key={doc.id}
            applicantKey={applicantKey}
            doc={doc}
            staffEmail={staffEmail}
            onPrev={docIndex > 0 ? () => onSelectDoc(viewable[docIndex - 1].id) : undefined}
            onNext={docIndex < viewable.length - 1 ? () => onSelectDoc(viewable[docIndex + 1].id) : undefined}
          />
        )}
      </div>

      <div className="border-t p-2 text-[11px] text-muted-foreground">
        {doc.masked_number ? `Read from document: ${doc.masked_number} · ` : ""}
        {doc.status}
      </div>
    </div>
  );
}

function Watermark({ staffEmail }: { staffEmail: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden select-none">
      <span className="rotate-[-20deg] whitespace-nowrap text-foreground/10 text-sm">
        Routely staff · {staffEmail} · {new Date().toLocaleDateString()}
      </span>
    </div>
  );
}

function useSignedUrl(applicantKey: string, docId: string) {
  const [state, setState] = useState<SignedUrlState>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const url = await fetchSignedUrl(applicantKey, docId);
      setState({ url, fetchedAt: Date.now() });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load document");
    } finally {
      refreshing.current = false;
    }
  }, [applicantKey, docId]);

  useEffect(() => {
    setState(null);
    setError(null);
    void refresh();
    // Proactive renewal -- the signed URL is short-lived server-side; a viewer left open longer
    // than that would otherwise just silently fail on the NEXT interaction (zoom/rotate doesn't
    // reload the image, but a fresh page nav or reopen would).
    const interval = setInterval(() => void refresh(), URL_REFRESH_MS);
    return () => clearInterval(interval);
    // refresh is itself useCallback'd on [applicantKey, docId] -- its own identity changing already
    // covers re-running this effect when either one changes.
  }, [refresh]);

  return { state, error, refresh };
}

function SingleDocView({
  applicantKey,
  doc,
  staffEmail,
  onPrev,
  onNext,
}: {
  applicantKey: string;
  doc: ApplicantDetail["documents"][number];
  staffEmail: string;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const { state, error, refresh } = useSignedUrl(applicantKey, doc.id);
  // The parent mounts this component with key={doc.id} (see DocumentVisualizer's render) -- a
  // fresh mount per document, so these initial values already reset on every doc change without
  // needing an explicit effect.
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.()
        .then(() => setFullscreen(true))
        .catch(() => toast.error("Could not enter fullscreen"));
    } else {
      document
        .exitFullscreen?.()
        .then(() => setFullscreen(false))
        .catch(() => toast.error("Could not exit fullscreen"));
    }
  }

  const isPdf = doc.content_type?.includes("pdf") ?? false;
  const isHeic = doc.content_type?.includes("heic") || doc.content_type?.includes("heif");

  return (
    <div ref={containerRef} className="relative flex h-full min-h-0 flex-col bg-muted/20">
      <div className="flex items-center justify-center gap-1 border-b bg-background/80 p-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={zoom <= ZOOM_MIN}
          onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
          title="Zoom out"
        >
          <ZoomOut className="size-3.5" aria-hidden="true" />
        </Button>
        <span className="w-10 text-center text-[11px] tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={zoom >= ZOOM_MAX}
          onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
          title="Zoom in"
        >
          <ZoomIn className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => setRotation((r) => (r + 90) % 360)}
          title="Rotate 90°"
        >
          <RotateCw className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => {
            setZoom(1);
            setRotation(0);
          }}
          title="Fit to width"
        >
          <ScanLine className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={toggleFullscreen}
          title="Fullscreen"
        >
          {fullscreen ? (
            <Minimize2 className="size-3.5" aria-hidden="true" />
          ) : (
            <Maximize2 className="size-3.5" aria-hidden="true" />
          )}
        </Button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto">
        {error ? (
          <div className="flex flex-col items-center gap-2 p-4 text-center text-xs">
            <p className="text-destructive">{error}</p>
            <Button type="button" size="sm" variant="outline" onClick={refresh}>
              Retry
            </Button>
          </div>
        ) : !state ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : isPdf ? (
          <PdfView url={state.url} zoom={zoom} rotation={rotation} onExpired={refresh} />
        ) : isHeic ? (
          <HeicImage url={state.url} zoom={zoom} rotation={rotation} onExpired={refresh} />
        ) : (
          // biome-ignore lint/performance/noImgElement: signed R2 URL
          <img
            src={state.url}
            alt={DOCUMENT_KIND_LABEL[doc.kind] ?? doc.kind}
            className="max-w-none transition-transform"
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
            onError={refresh}
          />
        )}
        <Watermark staffEmail={staffEmail} />
      </div>

      {(onPrev || onNext) && (
        <>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="-translate-y-1/2 absolute top-1/2 left-2 size-7 opacity-80"
            disabled={!onPrev}
            onClick={onPrev}
            title="Previous document"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="-translate-y-1/2 absolute top-1/2 right-2 size-7 opacity-80"
            disabled={!onNext}
            onClick={onNext}
            title="Next document"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </>
      )}
    </div>
  );
}

/** PDFs: rendered with pdf.js onto a canvas -- never downloaded, never an <iframe> (which would
 *  hand the browser its own built-in PDF viewer, complete with a save/download button we
 *  deliberately don't want here). Multipage: a simple ‹ page N/M › control of its own. */
function PdfView({
  url,
  zoom,
  rotation,
  onExpired,
}: {
  url: string;
  zoom: number;
  rotation: number;
  onExpired: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const pdfRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<import("pdfjs-dist").PDFDocumentLoadingTask | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPage(1);
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const loadingTask = pdfjsLib.getDocument({ url });
        loadingTaskRef.current = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) return;
        pdfRef.current = doc;
        setPageCount(doc.numPages);
        setLoading(false);
      } catch {
        if (!cancelled) onExpired();
      }
    })();
    return () => {
      cancelled = true;
      void loadingTaskRef.current?.destroy();
    };
  }, [url, onExpired]);

  useEffect(() => {
    if (!pdfRef.current || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const pdfDoc = pdfRef.current;
      if (!pdfDoc) return;
      const pdfPage = await pdfDoc.getPage(page);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale: zoom * 1.5, rotation });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [page, zoom, rotation]);

  if (loading) return <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />;
  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} />
      {pageCount > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ‹
          </Button>
          <span>
            {page} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </Button>
        </div>
      )}
    </div>
  );
}

/** HEIC: Chrome/Edge can't render it natively -- convert to a JPEG blob client-side (heic2any) once
 *  per signed-URL fetch, then render that like any other image. */
function HeicImage({
  url,
  zoom,
  rotation,
  onExpired,
}: {
  url: string;
  zoom: number;
  rotation: number;
  onExpired: () => void;
}) {
  const [jpegUrl, setJpegUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setJpegUrl(null);
    setFailed(false);
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("expired");
        const blob = await res.blob();
        const heic2any = (await import("heic2any")).default;
        const converted = await heic2any({ blob, toType: "image/jpeg", quality: 0.9 });
        if (cancelled) return;
        const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
        objectUrl = URL.createObjectURL(jpegBlob);
        setJpegUrl(objectUrl);
      } catch {
        if (!cancelled) {
          setFailed(true);
          onExpired();
          toast.error("Could not convert this HEIC photo for preview");
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, onExpired]);

  if (failed) return <p className="text-destructive text-xs">Could not preview this HEIC photo.</p>;
  if (!jpegUrl) return <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />;
  return (
    // biome-ignore lint/performance/noImgElement: ephemeral object URL (heic2any's converted blob)
    <img
      src={jpegUrl}
      alt="Converted preview"
      className="max-w-none transition-transform"
      style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
    />
  );
}

async function postSelfieMatch(applicantKey: string, match: boolean): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`/api/client/driver-applicants/${encodeURIComponent(applicantKey)}/documents/selfie-match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ match }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true };
  const detail = data.detail as { message?: string } | undefined;
  return {
    ok: false,
    message: (detail?.message as string) ?? (data.message as string) ?? "Could not record this decision",
  };
}

function CompareView({
  applicantKey,
  selfieDoc,
  licenseDoc,
  staffEmail,
  onChanged,
}: {
  applicantKey: string;
  selfieDoc: ApplicantDetail["documents"][number];
  licenseDoc: ApplicantDetail["documents"][number];
  staffEmail: string;
  onChanged: () => void;
}) {
  const selfie = useSignedUrl(applicantKey, selfieDoc.id);
  const license = useSignedUrl(applicantKey, licenseDoc.id);
  const [busy, setBusy] = useState<"match" | "no_match" | null>(null);

  async function decide(match: boolean) {
    setBusy(match ? "match" : "no_match");
    try {
      const { ok, message } = await postSelfieMatch(applicantKey, match);
      if (!ok) throw new Error(message);
      toast.success(match ? "Recorded: same person" : "Recorded: not a match");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record this decision");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x">
        {[
          { label: "License (front)", state: license.state, error: license.error },
          { label: "Selfie", state: selfie.state, error: selfie.error },
        ].map(({ label, state, error }) => (
          <div key={label} className="relative flex min-h-0 flex-col items-center justify-center bg-muted/20 p-2">
            <p className="absolute top-2 left-2 text-[11px] text-muted-foreground">{label}</p>
            {error ? (
              <p className="text-destructive text-xs">{error}</p>
            ) : !state ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : (
              // biome-ignore lint/performance/noImgElement: signed R2 URL
              <img src={state.url} alt={label} className="max-h-full max-w-full object-contain" />
            )}
            <Watermark staffEmail={staffEmail} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 border-t p-2 text-xs">
        <span className="text-muted-foreground">Same person?</span>
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => decide(true)}>
          {busy === "match" && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}✓ Match
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => decide(false)}>
          {busy === "no_match" && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}✕ No match
        </Button>
      </div>
    </div>
  );
}
