"use client";

/**
 * OcrDebugPanel — CEO diagnostic (2026-07-04)
 * ─────────────────────────────────────────────────────────────────────────
 * Renders, for the scan that just ran, the FULL OCR trace so failures can be
 * dissected instead of guessed at:
 *   • timings   — resize (client) / read (box) / server total / client total
 *   • image     — the exact bytes sent to Qwen (tap to enlarge)
 *   • raw       — the verbatim JSON the model returned
 *   • phone     — model phone + candidates → cleaned phone → valid? (why it dies)
 *   • fields    — what the site actually received after cleanup
 *   • gate      — the same 3-field submit validation, so "why did it fail" is exact
 *
 * Only shown when the modal's Debug toggle is on. Nothing here is persisted.
 */

import { type ReactNode, useState } from "react";

import { Bug, ChevronDown, ChevronRight } from "lucide-react";

import { normalizeAndValidateName, type OcrDebug, validatePhone } from "@/lib/ocr/ai-extract-client";
import { cn } from "@/lib/utils";

type RawParsed = {
  name?: string | null;
  phone?: string | null;
  phone_candidates?: string[];
  phone_status?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  dob?: string | null;
  order_ids?: string[];
  number_of_items?: number | null;
};

type Cleaned = {
  name?: string | null;
  phone?: string | null;
  phoneE164?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  dob?: string | null;
  order_ids?: string[];
};

function ms(n: number | null | undefined): string {
  if (n == null) return "—";
  return n < 1000 ? `${Math.round(n)}ms` : `${(n / 1000).toFixed(2)}s`;
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-background px-2 py-1.5 ring-1 ring-border/40">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">{label}</span>
      <span className={cn("font-mono text-xs font-bold", warn ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className={cn("mt-0.5 shrink-0 font-bold", ok ? "text-emerald-500" : "text-rose-500")}>{ok ? "✓" : "✗"}</span>
      <span className="text-[11px] text-foreground/80">{children}</span>
    </div>
  );
}

export default function OcrDebugPanel({
  debug,
  image,
  resizeMs,
  clientMs,
  onZoom,
}: {
  debug: OcrDebug;
  image: string | null;
  resizeMs: number | null;
  clientMs: number | null;
  onZoom: (url: string) => void;
}) {
  const [open, setOpen] = useState(true);

  const rawp = (debug.raw_parsed ?? {}) as RawParsed;
  const cleaned = (debug.cleaned ?? {}) as Cleaned;

  const phoneRes = validatePhone(cleaned.phone ?? null);
  const nameRes = normalizeAndValidateName(cleaned.name ?? null);
  const addrOk = Boolean(cleaned.street && cleaned.city && cleaned.state && cleaned.zip);

  let rawPretty = debug.raw_text ?? "";
  try {
    rawPretty = JSON.stringify(JSON.parse(debug.raw_text), null, 2);
  } catch {
    /* keep the verbatim string if it isn't valid JSON — that's itself the bug */
  }

  const boxSlow = debug.read_ms > 3500;
  const kb = Math.round(debug.image_bytes / 1024);

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <Bug className="size-3.5 text-amber-600 dark:text-amber-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
          OCR Debug
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground/60">
          {debug.provider} · {ms(clientMs)}
        </span>
        {open ? (
          <ChevronDown className="size-4 text-muted-foreground/50" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground/50" />
        )}
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-3">
          {/* Timings — the money row for "why 7-8s" */}
          <div className="grid grid-cols-4 gap-1.5">
            <Stat label="Resize" value={ms(resizeMs)} warn={(resizeMs ?? 0) > 1500} />
            <Stat label="Box read" value={ms(debug.read_ms)} warn={boxSlow} />
            <Stat label="Server" value={ms(debug.total_ms)} />
            <Stat label="Total" value={ms(clientMs)} warn={(clientMs ?? 0) > 4000} />
          </div>
          <p className="text-[11px] text-muted-foreground/60">
            {debug.model} · img {kb}KB · score {debug.critical_score}/6
            {debug.used_second_pass ? " · 2nd-pass" : ""}
            {boxSlow ? " · ⚠ box slow (cold or overloaded)" : ""}
          </p>

          {/* Image Qwen actually received */}
          {image && (
            <button
              type="button"
              onClick={() => onZoom(image)}
              className="block w-full overflow-hidden rounded-lg ring-1 ring-border/50"
              title="Tap to enlarge the exact image sent to Qwen"
            >
              {/* biome-ignore lint/a11y/useAltText: debug image sent to model */}
              <img src={image} className="max-h-40 w-full object-contain bg-black/80" />
            </button>
          )}
          <p className="-mt-1.5 text-center text-[10px] text-muted-foreground/50">↑ exact image sent to Qwen (tap to zoom)</p>

          {/* PHONE trace — where the phone dies */}
          <div className="rounded-lg bg-background/60 p-2.5 ring-1 ring-border/40">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Phone trace</p>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground/60">model.phone</span>
                <span className="text-foreground">{rawp.phone ?? "null"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground/60">candidates</span>
                <span className="text-foreground">
                  {rawp.phone_candidates && rawp.phone_candidates.length > 0 ? rawp.phone_candidates.join(", ") : "[]"}
                </span>
              </div>
              {rawp.phone_status && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground/60">status</span>
                  <span className="text-foreground">{rawp.phone_status}</span>
                </div>
              )}
              <div className="flex justify-between gap-2 border-t border-border/40 pt-1">
                <span className="text-muted-foreground/60">→ site got</span>
                <span className={cn("font-bold", cleaned.phone ? "text-foreground" : "text-rose-500")}>
                  {cleaned.phone ?? "null"}
                </span>
              </div>
            </div>
            <div className="mt-1.5 text-[11px]">
              {rawp.phone && !cleaned.phone ? (
                <span className="text-amber-600 dark:text-amber-400">
                  ⚠ Qwen saw a phone but cleanup rejected it (malformed/placeholder/&gt;10 digits)
                </span>
              ) : !rawp.phone && (!rawp.phone_candidates || rawp.phone_candidates.length === 0) ? (
                <span className="text-rose-500">✗ Qwen returned NO phone at all → prompt/read problem</span>
              ) : cleaned.phone ? (
                <span className="text-emerald-600 dark:text-emerald-400">✓ phone captured</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">⚠ candidates present but none accepted</span>
              )}
            </div>
          </div>

          {/* Raw model output */}
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
              Qwen returned (raw)
            </p>
            <pre className="max-h-52 overflow-auto rounded-lg bg-zinc-950 p-2.5 font-mono text-[11px] leading-relaxed text-emerald-300 ring-1 ring-border/40">
              {rawPretty || "(empty)"}
            </pre>
          </div>

          {/* Submit gate — the exact 3-field validation that decides success/fail */}
          <div className="rounded-lg bg-background/60 p-2.5 ring-1 ring-border/40">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
              Submit gate (what the site expects)
            </p>
            <div className="space-y-1">
              <Check ok={phoneRes.valid}>
                phone: <span className="font-mono">{cleaned.phone ?? "null"}</span>
                {!phoneRes.valid && <span className="text-rose-500"> — {phoneRes.reason}</span>}
              </Check>
              <Check ok={nameRes.valid}>
                name: <span className="font-mono">{cleaned.name ?? "null"}</span>
                {!nameRes.valid && <span className="text-rose-500"> — {nameRes.reason}</span>}
              </Check>
              <Check ok={addrOk}>
                address:{" "}
                <span className="font-mono">
                  {[cleaned.street, cleaned.city, cleaned.state, cleaned.zip].filter(Boolean).join(", ") || "null"}
                </span>
                {!addrOk && <span className="text-rose-500"> — incomplete</span>}
              </Check>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
