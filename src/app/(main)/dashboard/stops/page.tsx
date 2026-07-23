"use client";

import { BRAND_PRIMARY } from "@/lib/brand";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import dynamic from "next/dynamic";

import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowUp,
  Building2,
  Calendar as CalendarIcon,
  Camera,
  CheckCircle2,
  ChevronDown,
  Copy,
  DoorOpen,
  ExternalLink,
  FileText,
  Flame,
  Handshake,
  Hash,
  Layers,
  Link2,
  Loader2,
  Lock,
  Mailbox,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Navigation,
  Package,
  PenLine,
  Phone,
  Pill,
  Plus,
  Printer,
  RotateCcw,
  ScanLine,
  Search,
  Snowflake,
  StickyNote,
  Trash2,
  Truck,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRoutelyRealtime } from "@/hooks/use-routely-realtime";

/* Hardened list-fetch: a HARD 15s timeout means a hung API request can never
 * leave the loading skeleton up forever (the "frozen, no data" freeze), and
 * non-OK responses THROW instead of resolving to an error payload — so a
 * failed refresh keeps whatever is already on screen rather than wiping it. */
async function fetchJsonSafe(url: string, timeoutMs = 15_000): Promise<Record<string, unknown>> {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}
import { fetchFailedScansCount, resolveFailedScan } from "@/lib/ocr/failed-scans-client";
import { cn } from "@/lib/utils";

import type { OCRSubmitData } from "./_components/ocr-scan-modal";
import { PrintLabelDialog } from "./_components/print-label-dialog";

const OCRScanModal = dynamic(() => import("./_components/ocr-scan-modal"), { ssr: false });
const OCRBatchModal = dynamic(() => import("./_components/ocr-batch-modal"), { ssr: false });
const BarcodeScanModal = dynamic(() => import("./_components/barcode-scan-modal"), { ssr: false });
const STOPS_REALTIME_TABLES = ["stops", "draft_stops"] as const;
const DETAIL_STOP_TABLES = ["stops"] as const;
const DETAIL_DRAFT_TABLES = ["draft_stops"] as const;

/* ── Types ───────────────────────────────────────────────────────────────── */
type PackageType = "rx" | "cold" | "regular" | "internal";

interface AddressResult {
  street: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
}
interface Prediction {
  description: string;
  place_id: string;
  main_text: string;
  secondary_text: string;
}

/* ── Address normalization ───────────────────────────────────────────────────
   Google-prediction fallbacks (and OCR) can land a full address blob in
   `street` ("2600 W Sunrise Lakes Dr Apt 105, Sunrise, Fl 33322") with city/zip
   empty and a standalone state ("FL") — which renders as "…blob…, FL" and fails
   server validation (empty city/zip). Normalize EVERY address before save and
   submit so the four fields are clean and never duplicated. Conservative:
   unit/apt segments stay in street; unknown segments are preserved, not dropped. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function normalizeAddress(a: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lat?: number;
  lng?: number;
}): AddressResult {
  let street = String(a.street ?? "")
    .replace(/\s+/g, " ")
    .trim();
  let city = String(a.city ?? "")
    .replace(/\s+/g, " ")
    .trim();
  let state = String(a.state ?? "").trim();
  let zip = (String(a.zip ?? "").match(/\b\d{5}\b/) ?? [""])[0];

  // Street arrived as a comma blob — pull city/state/zip out of trailing segments.
  if (street.includes(",")) {
    const segs = street
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    street = segs.shift() ?? "";
    for (const seg of segs) {
      if (/^(usa|united states( of america)?)$/i.test(seg)) continue; // drop country
      if (/^(unit|apt|apartment|suite|ste|bldg|building|#|lot|rm|room)\b/i.test(seg)) {
        street = `${street} ${seg}`; // unit info belongs to the street
        continue;
      }
      const segZip = seg.match(/\b\d{5}(?:-\d{4})?\b/);
      if (segZip && !zip) zip = segZip[0].slice(0, 5);
      const rest = seg
        .replace(/\b\d{5}(?:-\d{4})?\b/g, "")
        .replace(/[,\s]+$/g, "")
        .trim();
      if (!rest) continue; // segment was just the zip
      if (/^[A-Za-z]{2}$/.test(rest)) {
        if (!state) state = rest; // "Fl" / "FL"
        continue;
      }
      const tailState = rest.match(/\b([A-Za-z]{2})$/);
      const restCity = tailState
        ? rest
            .slice(0, -2)
            .replace(/[,\s]+$/g, "")
            .trim()
        : rest;
      if (tailState && !state && restCity) state = tailState[1]; // "Sunrise FL"
      if (restCity) {
        if (!city) city = restCity;
        else if (restCity.toLowerCase() !== city.toLowerCase()) street = `${street} ${restCity}`; // preserve, don't drop
      }
    }
  }

  // Canonical state: 2-letter uppercase; FL business default when absent/invalid.
  // Resolved BEFORE the strip pass so a no-comma blob ("… Sunrise FL 33322")
  // still gets its trailing state token removed when the input state was empty.
  state = /^[A-Za-z]{2}$/.test(state) ? state.toUpperCase() : "FL";

  // Strip duplicated trailing zip / state / city from the street (no-comma blobs too).
  if (zip) street = street.replace(new RegExp(`[,\\s]*\\b${zip}(?:-\\d{4})?\\b\\s*$`), "").trim();
  street = street.replace(new RegExp(`[,\\s]*\\b${escapeRe(state)}\\b\\.?\\s*$`, "i"), "").trim();
  if (city) street = street.replace(new RegExp(`[,\\s]*\\b${escapeRe(city)}\\b\\s*$`, "i"), "").trim();
  street = street.replace(/[,\s]+$/g, "").trim();

  return { street, city, state, zip, lat: a.lat, lng: a.lng };
}
interface DraftStop {
  draft_id: string;
  tracking_id: string; // RTL-{unix} assigned at creation
  status: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  // Read-only delivery zone (South/North/Central/Other) — backfilled on the record.
  route_zone?: string | null;
  pickup_address: string;
  pickup_location_id: string;
  recipient_name: string;
  recipient_phone: string;
  package_type: string;
  notes: string | null;
  created_at: string;
}

interface TodayStop {
  pickup_location_id?: string; // present on drafts so the panel can resolve to a real pickup
  pickup_address?: string;
  pickup_name?: string;
  id: string;
  stop_id: string;
  stop_type: string;
  status: string;
  recipient_name: string;
  recipient_phone?: string; // basic-fields list line (drafts + submitted shaper both expose it)
  address: string;
  city: string;
  state: string;
  zip: string;
  package_type: string;
  driver_name: string | null;
  route_title: string | null;
  // Read-only delivery zone from the record (shapeStopForList → `zone`).
  zone?: string | null;
  total_price: number;
  created_at: string;
  // Recovered draft: a submit failed → status fell back to "draft" + this note.
  // Present only on recovered stops-drafts (real stop_id), drives the row badge.
  submit_error?: { reason?: string } | null;
}
interface Rate {
  amount?: number | null;
  service?: string;
  days?: number | null;
}
interface InternalNote {
  id: string;
  text: string;
  author: string;
  role: "client" | "dispatch" | "system";
  created_at: string;
}
interface FullStop {
  stop_id: string;
  stop_type: string;
  status: string;
  order_ref: string | null;
  // Read-only delivery zone from the record (shapeStopForDetail → `route_zone`).
  route_zone?: string | null;
  total_price: number;
  created_at: string;
  recipient: { name: string; phone: string; email: string; dob: string | null };
  address: { street: string; city: string; state: string; zip: string; gate_code: string; drop_preference: string };
  package: {
    type: string;
    rx_number: string;
    dp_note: string;
    notes: string;
    cold_chain: boolean;
    requires_signature: boolean;
    weight_oz: number;
    length_in: number;
    width_in: number;
    height_in: number;
  };
  service: {
    type: string;
    date: string | null;
    collect_payment: boolean;
    cod_amount: number;
    return_to_sender: boolean;
  };
  assignment: { driver_name: string | null; route_title: string | null; eta_at: string | null };
  rates: { ups: Rate | null; usps: Rate | null; fedex: Rate | null; selected: string | null };
  photos: string[];
  internal_notes?: InternalNote[];
  dispatch_sync?: { status?: string; error?: string } | null;
  /** Submit failure note — status fell back to "draft"; drives the resubmit strip. */
  submit_error?: { at?: string; reason?: string; spoke_status?: number | null; attempt_count?: number } | null;
  /** Hybrid-OCR (Phase 1): canonical order-id array; rx_number mirrors it. */
  order_ids?: string[];
}
interface PickupLocation {
  id: string;
  name: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  code?: string;
  is_default?: boolean;
}
interface Pricing {
  price_per_stop: number;
  price_per_mile: number;
  postpay_enabled: boolean;
}

/* ── Date policy ──────────────────────────────────────────────────────────────
 * service.date is the canonical delivery day. Policy for every submit:
 *   same-day        → today (ET)
 *   scheduled       → the picked date
 *   OCR / no date   → today (ET)   ← OCR has no date picker, so it delivers today
 * No submit may leave service.date null. todayYmdET() is the DST-safe ET default. */
function todayYmdET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/* ── Status helpers ───────────────────────────────────────────────────────── */
const DELIVERED = ["delivered", "completed", "picked_up"];
const TRANSIT = ["in_transit", "out_for_delivery", "dispatched", "assigned"];
const FAILED = ["failed", "attempted", "cancelled", "failed_not_home", "return_to_sender", "submit_failed"];

function statusAccent(s: string) {
  // Using /20 glow for more visible gradient tint in the header
  if (DELIVERED.includes(s))
    return {
      bar: "bg-emerald-500",
      glow: "from-emerald-500/20",
      border: "border-emerald-300",
      dot: "bg-emerald-500",
      dotHex: "#10b981",
      badge: "bg-emerald-500 text-white border-emerald-500",
    };
  if (TRANSIT.includes(s))
    return {
      bar: "bg-blue-600",
      glow: "from-blue-600/20",
      border: "border-blue-300",
      dot: "bg-blue-600",
      dotHex: "#2563eb",
      badge: "bg-blue-600 text-white border-blue-600",
    };
  if (FAILED.includes(s))
    return {
      bar: "bg-rose-500",
      glow: "from-rose-500/20",
      border: "border-rose-300",
      dot: "bg-rose-500",
      dotHex: "#ef4444",
      badge: "bg-rose-500 text-white border-rose-500",
    };
  if (s === "draft")
    return {
      bar: "bg-violet-500",
      glow: "from-violet-500/20",
      border: "border-violet-300",
      dot: "bg-violet-500",
      dotHex: "#8b5cf6",
      badge: "bg-violet-500 text-white border-violet-500",
    };
  return {
    bar: "bg-amber-500",
    glow: "from-amber-500/20",
    border: "border-amber-300",
    dot: "bg-amber-500",
    dotHex: "#f59e0b",
    badge: "bg-amber-500 text-white border-amber-500",
  };
}
function statusLabel(s: string) {
  const m: Record<string, string> = {
    pending: "Submitted",
    unassigned: "Unassigned",
    draft: "Draft",
    assigned: "Assigned",
    in_transit: "In Transit",
    dispatched: "Dispatched",
    delivered: "Delivered",
    picked_up: "Picked Up",
    failed: "Failed",
    completed: "Completed",
    return_to_sender: "Return to Sender",
    submit_failed: "Submit Failed",
  };
  return m[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}
// Strips everything except digits, caps at 10, formats as (XXX) XXX-XXXX
function fmtPhone(raw: string): string {
  let normalized = raw.replace(/\D/g, "");
  // E.164 / 11-digit US numbers ("+1305…") — drop the country code, else the
  // (xxx) xxx-xxxx grouping shifts by one digit.
  if (normalized.length === 11 && normalized[0] === "1") normalized = normalized.slice(1);
  const digits = normalized.slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Returns E.164 for payload: +1XXXXXXXXXX or null
function phoneToE164(formatted: string): string | null {
  const digits = formatted.replace(/\D/g, "").slice(0, 10);
  return digits.length === 10 ? `+1${digits}` : null;
}

// Validates phone has exactly 10 digits
function isValidPhone(formatted: string): boolean {
  return formatted.replace(/\D/g, "").length === 10;
}
function fmtDob(raw: string): string {
  // Strip all non-digits, cap at 8
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length === 0) return "";

  // Build MM with clamp: first digit > 1 → prepend 0
  let mm = d.slice(0, 2);
  if (mm.length === 1 && parseInt(mm, 10) > 1) mm = `0${mm}`;
  // Clamp month 01-12
  if (mm.length === 2 && parseInt(mm, 10) > 12) mm = "12";
  if (mm.length === 2 && parseInt(mm, 10) === 0) mm = "01";

  if (d.length <= 2) return mm;

  // Build DD with clamp: first digit > 3 → prepend 0
  let dd = d.slice(2, 4);
  if (dd.length === 1 && parseInt(dd, 10) > 3) dd = `0${dd}`;
  // Clamp day 01-31
  if (dd.length === 2 && parseInt(dd, 10) > 31) dd = "31";
  if (dd.length === 2 && parseInt(dd, 10) === 0) dd = "01";

  if (d.length <= 4) return `${mm}/${dd}`;

  // Build YYYY: clamp to reasonable range
  let yyyy = d.slice(4, 8);
  // Only validate when 4 digits complete
  if (yyyy.length === 4) {
    const yr = parseInt(yyyy, 10);
    const currentYear = new Date().getFullYear();
    if (yr < 1900) yyyy = "1900";
    if (yr > currentYear) yyyy = String(currentYear);
  }

  return `${mm}/${dd}/${yyyy}`;
}

function isValidDob(v: string): boolean {
  if (!v || v.length < 10) return false;
  const parts = v.split("/");
  if (parts.length !== 3) return false;
  const [mm, dd, yyyy] = parts.map(Number);
  if (Number.isNaN(mm) || Number.isNaN(dd) || Number.isNaN(yyyy)) return false;
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;
  if (yyyy < 1900 || yyyy > new Date().getFullYear()) return false;
  // Check actual date validity (e.g. Feb 31 is invalid)
  const date = new Date(yyyy, mm - 1, dd);
  return date.getFullYear() === yyyy && date.getMonth() === mm - 1 && date.getDate() === dd;
}
function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function fmtCurrency(v: string) {
  const num = parseFloat(v.replace(/[^0-9.]/g, ""));
  if (Number.isNaN(num)) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(num);
}
function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}
function fmtNoteTime(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}
function _fmtStopTime(iso: string) {
  try {
    const d = new Date(iso);
    const isToday = d.toDateString() === new Date().toDateString();
    if (isToday) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return "—";
  }
}
function fmtStopDate(iso: string) {
  try {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`;
  } catch {
    return "—";
  }
}
function toTitle(s: string) {
  return (s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Address Autocomplete ─────────────────────────────────────────────────── */
function AddrSearch({
  onSelect,
  placeholder,
  onClear,
  autoFocus,
  inputRef,
  defaultValue,
}: {
  onSelect: (d: AddressResult) => void;
  placeholder?: string;
  onClear?: () => void;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  defaultValue?: string;
}) {
  const [val, setVal] = useState(defaultValue ?? "");
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  // Portal dropdown position is tracked in state and recomputed via useEffect
  // (after DOM layout) instead of inline-in-JSX. Inline computation could race
  // with the ref attachment and render the dropdown at (0,0) — invisible
  // off-panel. State + scroll/resize listeners keep it pinned to the input.
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const deb = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const localRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inp = inputRef ?? localRef;
  useEffect(() => {
    if (autoFocus) setTimeout(() => inp.current?.focus(), 250);
  }, [autoFocus, inp]);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setPreds([]);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  // Re-anchor the portal dropdown whenever it opens, scrolls, or resizes.
  useEffect(() => {
    if (!open || preds.length === 0) {
      setPos(null);
      return;
    }
    function update() {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    update();
    window.addEventListener("scroll", update, true); // capture: catches inner scrollers
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, preds.length]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setVal(v);
    clearTimeout(deb.current);
    if (v.length < 3) {
      setPreds([]);
      setOpen(false);
      return;
    }
    deb.current = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/client/places?input=${encodeURIComponent(v)}`);
        const d = await r.json();
        const p = d.predictions ?? [];
        setPreds(p);
        setOpen(p.length > 0);
      } catch {
        setPreds([]);
      } finally {
        setBusy(false);
      }
    }, 280);
  }
  async function pick(p: Prediction) {
    clearTimeout(deb.current); // cancel any pending search before closing
    setOpen(false);
    setPreds([]);
    try {
      const r = await fetch(`/api/client/place-details?place_id=${encodeURIComponent(p.place_id)}`);
      const d = await r.json();
      // Normalize: when Google details lack a street, the prediction text is a
      // full blob — parse it into street/city/state/zip instead of saving it raw.
      const result = normalizeAddress({
        street: d.street || p.description,
        city: d.city || "",
        state: d.state || "",
        zip: d.zip || "",
        lat: d.lat,
        lng: d.lng,
      });
      const fullAddr = [result.street, result.city, result.state, result.zip].filter(Boolean).join(", ");
      setVal(fullAddr || p.description);
      onSelect(result);
    } catch {
      setVal(p.description);
      onSelect(normalizeAddress({ street: p.description }));
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border bg-background px-2.5 transition-colors",
          open ? "border-primary shadow-sm ring-2 ring-primary/15" : "border-border/60 hover:border-border",
        )}
      >
        <MapPin className="size-3.5 shrink-0 text-primary/70" />
        <input
          ref={inp}
          value={val}
          onChange={onChange}
          placeholder={placeholder ?? "Search address…"}
          spellCheck={false}
          autoComplete="off"
          className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
        />
        {busy ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground/50" />
        ) : (
          val && (
            <button
              type="button"
              aria-label="Clear address"
              onClick={() => {
                setVal("");
                setPreds([]);
                setOpen(false);
                onClear?.();
              }}
              className="text-muted-foreground/50 transition-colors hover:text-muted-foreground"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )
        )}
      </div>
      {open &&
        preds.length > 0 &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {preds.map((p) => (
              <button
                key={p.place_id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                className="flex w-full items-start gap-3 border-border/60 border-b px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-accent"
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary/70" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[13px] text-foreground">{p.main_text}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{p.secondary_text}</p>
                </div>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ── NewStopInput: address autocomplete with today's stops at top ───────── */
function NewStopInput({
  value,
  onChange,
  onClear,
  todayStops,
  onSelectExisting,
}: {
  value: AddressResult | null;
  onChange: (a: AddressResult) => void;
  onClear: () => void;
  todayStops: TodayStop[];
  onSelectExisting: (s: TodayStop) => void;
}) {
  const [text, setText] = useState("");
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const deb = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync display text when value is cleared externally
  useEffect(() => {
    if (!value) setText("");
  }, [value]);

  useEffect(() => {
    function handleOut(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPreds([]);
      }
    }
    document.addEventListener("mousedown", handleOut);
    return () => document.removeEventListener("mousedown", handleOut);
  }, []);

  function handleChange(v: string) {
    setText(v);
    if (value) onClear();
    clearTimeout(deb.current);
    // Show dropdown if we have existing matches even without Places yet
    const q = v.toLowerCase();
    const matched =
      v.length >= 2
        ? todayStops.filter((s) => s.address?.toLowerCase().includes(q) || s.recipient_name?.toLowerCase().includes(q))
        : [];
    if (matched.length > 0) setOpen(true);
    if (v.length < 3) {
      setPreds([]);
      if (matched.length === 0) setOpen(false);
      return;
    }
    deb.current = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/client/places?input=${encodeURIComponent(v)}`);
        const d = await r.json();
        const p = d.predictions ?? [];
        setPreds(p);
        setOpen(p.length > 0 || matched.length > 0);
      } catch {
        setPreds([]);
      } finally {
        setBusy(false);
      }
    }, 280);
  }

  const matchedStops = useMemo(() => {
    const q = text.toLowerCase();
    if (q.length < 2) return [];
    return todayStops.filter(
      (s) => s.address?.toLowerCase().includes(q) || s.recipient_name?.toLowerCase().includes(q),
    );
  }, [text, todayStops]);

  async function pick(p: Prediction) {
    clearTimeout(deb.current);
    setOpen(false);
    setPreds([]);
    setBusy(true);
    try {
      const r = await fetch(`/api/client/place-details?place_id=${encodeURIComponent(p.place_id)}`);
      const d = await r.json();
      // Same normalization as AddrSearch — never let a prediction blob through.
      const result = normalizeAddress({
        street: d.street || p.description,
        city: d.city || "",
        state: d.state || "",
        zip: d.zip || "",
        lat: d.lat,
        lng: d.lng,
      });
      const full = [result.street, result.city, result.state, result.zip].filter(Boolean).join(", ");
      setText(full);
      onChange(result);
    } catch {
      setText(p.description);
      onChange(normalizeAddress({ street: p.description }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex-1" ref={containerRef}>
      <div
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border bg-background px-2.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15",
          open
            ? "border-primary shadow-sm ring-2 ring-primary/15"
            : value
              ? "border-emerald-400 bg-emerald-50/30"
              : "border-border/60 hover:border-border",
        )}
      >
        {value ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
        ) : (
          <MapPin className="size-3.5 shrink-0 text-primary/60" />
        )}
        <input
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search delivery address…"
          spellCheck={false}
          autoComplete="off"
          className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
        />
        {busy ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground/40" />
        ) : (
          text && (
            <button
              type="button"
              aria-label="Clear address"
              onClick={() => {
                setText("");
                onClear();
                setPreds([]);
                setOpen(false);
              }}
              className="text-muted-foreground/50 transition-colors hover:text-muted-foreground"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )
        )}
      </div>
      <AnimatePresence>
        {open && (preds.length > 0 || matchedStops.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute top-[calc(100%+4px)] right-0 left-0 z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
          >
            {/* Section 1: TODAY's duplicate-address awareness — operational signal,
                non-blocking. Tells the user "we already created N for this address
                today" so they don't accidentally double-enter an order. */}
            {matchedStops.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 border-amber-200/50 border-b bg-amber-50 px-3.5 py-1.5 dark:border-amber-500/20 dark:bg-amber-500/10">
                  <AlertCircle className="size-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <span className="font-semibold text-[11px] text-amber-700 dark:text-amber-300">
                    Today: {matchedStops.length} {matchedStops.length === 1 ? "delivery" : "deliveries"} already at this
                    address
                  </span>
                </div>
                {matchedStops.slice(0, 3).map((s) => {
                  const ac = statusAccent(s.status);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setOpen(false);
                        setPreds([]);
                        const full = [s.address, s.city, s.state, s.zip].filter(Boolean).join(", ");
                        setText(full);
                        onChange({ street: s.address, city: s.city, state: s.state, zip: s.zip });
                      }}
                      className="flex w-full items-center gap-3 border-border/40 border-b px-3.5 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span className={cn("size-2 shrink-0 rounded-full", ac.dot)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-xs text-foreground">{s.address}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {[s.city, s.state].filter(Boolean).join(", ")} · {toTitle(s.recipient_name) || "No name yet"}
                        </p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 font-bold text-[10px]", ac.badge)}>
                        {statusLabel(s.status)}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
            {/* Section 2: Google Places suggestions */}
            {preds.length > 0 && (
              <>
                {matchedStops.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-muted/40 px-3.5 py-1.5">
                    <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
                      Add another stop
                    </span>
                  </div>
                )}
                {preds.slice(0, 5).map((p) => (
                  <button
                    key={p.place_id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(p);
                    }}
                    className="flex w-full items-start gap-3 border-border/60 border-b px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-accent"
                  >
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary/70" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[13px] text-foreground">{p.main_text}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{p.secondary_text}</p>
                    </div>
                  </button>
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Address Filter with autocomplete (search mode) ─────────────────────── */
function _AddrFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const deb = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOut(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPreds([]);
      }
    }
    document.addEventListener("mousedown", handleOut);
    return () => document.removeEventListener("mousedown", handleOut);
  }, []);

  function handleChange(v: string) {
    onChange(v);
    clearTimeout(deb.current);
    if (v.length < 2) {
      setPreds([]);
      setOpen(false);
      return;
    }
    deb.current = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/client/places?input=${encodeURIComponent(v)}`);
        const d = await r.json();
        setPreds(d.predictions ?? []);
        setOpen((d.predictions ?? []).length > 0);
      } catch {
        setPreds([]);
      } finally {
        setBusy(false);
      }
    }, 280);
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <div
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border bg-background px-2.5 transition-colors",
          open ? "border-primary shadow-sm ring-2 ring-primary/15" : "border-border/60 hover:border-border",
        )}
      >
        <Search className="size-3.5 shrink-0 text-muted-foreground/50" />
        <input
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Filter stops…"
          spellCheck={false}
          autoComplete="off"
          className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
        />
        {busy ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground/40" />
        ) : value ? (
          <button
            type="button"
            aria-label="Clear filter"
            onClick={() => {
              onChange("");
              setPreds([]);
              setOpen(false);
            }}
            className="text-muted-foreground/40 transition-colors hover:text-muted-foreground"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <AnimatePresence>
        {open && preds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute top-[calc(100%+4px)] right-0 left-0 z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
          >
            {preds.slice(0, 5).map((p) => (
              <button
                key={p.place_id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(p.main_text);
                  setOpen(false);
                  setPreds([]);
                }}
                className="flex w-full items-start gap-3 border-border/60 border-b px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-accent"
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary/70" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[13px] text-foreground">{p.main_text}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{p.secondary_text}</p>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Pickup Selector ──────────────────────────────────────────────────────── */
function PickupSelector({
  locations,
  selected,
  onSelect,
}: {
  locations: PickupLocation[];
  selected: PickupLocation | null;
  onSelect: (l: PickupLocation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleOut(e: MouseEvent) {
      const target = e.target as Node;
      // Allow clicks inside the trigger area OR the portal'd dropdown.
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setCustom(false);
    }
    document.addEventListener("mousedown", handleOut);
    return () => document.removeEventListener("mousedown", handleOut);
  }, []);
  // Re-anchor the portal dropdown deterministically on open + scroll + resize.
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    function update() {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);
  // Sort for UI display only — default first, then the rest in their existing
  // order. DropOff and Custom Address are pinned at the bottom (in that order).
  // DropOff is the "no-pickup-route" signal — FastAPI detects it via empty
  // pickup_address (and we also send pickup_name:"DropOff" for clarity).
  // Tenant data is not mutated.
  const sortedLocations = [...locations].sort((a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)));
  const opts: (PickupLocation & { id: string })[] = [
    ...sortedLocations,
    { id: "__dropoff__", name: "DropOff", address: "" },
    { id: "__custom__", name: "Custom address", address: "" },
  ];
  function pick(l: PickupLocation) {
    if (l.id === "__custom__") {
      setCustom(true);
      setOpen(false);
    } else {
      onSelect(l);
      setOpen(false);
      setCustom(false);
    }
  }
  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2 text-left transition-colors",
            open ? "border-primary ring-2 ring-primary/15" : "border-border/60 hover:border-border",
          )}
        >
          <div className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10">
            <MapPin className="size-3 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-xs text-foreground">
              {toTitle(selected?.name ?? "Select pickup")}
            </p>
            {selected?.address && (
              <p className="truncate text-[11px] text-muted-foreground leading-tight">{toTitle(selected.address)}</p>
            )}
          </div>
          <ChevronDown
            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </button>
        {/* Portal'd dropdown — escapes FormSection overflow-hidden and panel overflow-y-auto.
            Position computed in useEffect (state-driven) so it survives layout race conditions.
            Plain div + z-[9999] removes any AnimatePresence/motion-driven visibility hiccup. */}
        {open &&
          pos &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={dropdownRef}
              className="fixed z-[9999] overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
              style={{ top: pos.top, left: pos.left, width: pos.width }}
            >
              {opts.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(l);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 border-border/60 border-b px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-accent",
                    selected?.id === l.id && l.id !== "__custom__" && "bg-accent/60",
                  )}
                >
                  <MapPin
                    className={cn(
                      "size-3.5 shrink-0",
                      l.id === "__custom__" ? "text-muted-foreground" : "text-primary",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-xs text-foreground">{toTitle(l.name)}</p>
                    {l.address && <p className="truncate text-[11px] text-muted-foreground">{toTitle(l.address)}</p>}
                    {l.is_default && <span className="font-semibold text-[10px] text-primary">Default</span>}
                  </div>
                  {selected?.id === l.id && l.id !== "__custom__" && (
                    <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </div>,
            document.body,
          )}
      </div>
      {custom && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="overflow-hidden"
        >
          <AddrSearch
            placeholder="Custom pickup address…"
            onSelect={(addr) => {
              onSelect({
                id: "__custom__",
                name: "Custom",
                address: addr.street,
                city: addr.city,
                state: addr.state,
                zip: addr.zip,
              });
              setCustom(false);
            }}
          />
        </motion.div>
      )}
    </div>
  );
}

const GMAP_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const ROUTE_MAP_ID = "80ba5f15e5846750fb260767"; // routely-draft-map

/* ── Google Maps Route Layer ─────────────────────────────────────────────── */
type RouteResult = {
  miles: number;
  mins: number;
  gallons: number;
  gasCost: number;
  tollCost: number; // real from Routes API travelAdvisory
  dist: string;
  time: string;
  viewport?: { low: { latitude: number; longitude: number }; high: { latitude: number; longitude: number } };
  midpoint?: { lat: number; lng: number };
  pickupCoord?: { lat: number; lng: number };
  deliveryCoord?: { lat: number; lng: number };
  encodedPath?: string;
};

function RouteLayer({
  active,
  pickupAddr,
  deliveryAddr,
  onResult,
  onMarkerClick,
  activeMarker,
}: {
  active?: boolean;
  pickupAddr: string;
  deliveryAddr: string;
  onResult: (r: RouteResult | null) => void;
  onMarkerClick?: (m: "pickup" | "delivery") => void;
  activeMarker?: "pickup" | "delivery" | null;
}) {
  const map = useMap();
  const geometryLib = useMapsLibrary("geometry");
  const glowRef = useRef<google.maps.Polyline | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const altPolylineRef = useRef<google.maps.Polyline | null>(null);
  // Last route viewport — used to re-fit when the map becomes visible on mobile
  // (the map lives in a display:none tab, so the fitBounds during the fetch runs
  // against a 0×0 container and has no effect until the tab is shown).
  const lastViewportRef = useRef<RouteResult["viewport"]>(undefined);
  const [markers, setMarkers] = useState<{
    pickup: { lat: number; lng: number } | null;
    delivery: { lat: number; lng: number } | null;
  }>({ pickup: null, delivery: null });

  useEffect(() => {
    if (!map || !geometryLib || !pickupAddr || !deliveryAddr) return;

    // Cleanup previous polylines
    glowRef.current?.setMap(null);
    polylineRef.current?.setMap(null);
    altPolylineRef.current?.setMap(null);
    glowRef.current = null;
    polylineRef.current = null;
    altPolylineRef.current = null;
    setMarkers({ pickup: null, delivery: null });

    let cancelled = false;

    fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GMAP_KEY,
        // Only request fields we need — better performance + lower latency
        "X-Goog-FieldMask": [
          "routes.distanceMeters",
          "routes.duration",
          "routes.polyline.encodedPolyline",
          "routes.viewport",
          "routes.travelAdvisory.tollInfo",
        ].join(","),
      },
      body: JSON.stringify({
        origin: { address: pickupAddr },
        destination: { address: deliveryAddr },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        computeAlternativeRoutes: true,
        extraComputations: ["TOLLS"],
      }),
    })
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        if (cancelled) return;
        const routes = (data.routes as Record<string, unknown>[]) ?? [];
        if (routes.length === 0) {
          console.error("[RouteLayer] computeRoutes returned 0 routes:", data);
          onResult(null);
          return;
        }

        const primary = routes[0];
        const encodedPolyline = (primary.polyline as Record<string, string>)?.encodedPolyline;
        if (!encodedPolyline) {
          console.error("[RouteLayer] No encodedPolyline in response:", primary);
          onResult(null);
          return;
        }

        // Decode encoded polyline using Maps Geometry library
        const path = geometryLib.encoding.decodePath(encodedPolyline);

        // Geographic midpoint of the route — where tooltip will anchor
        const midIdx = Math.floor(path.length / 2);
        const midPt = path[midIdx];
        const midpoint = midPt ? { lat: midPt.lat(), lng: midPt.lng() } : undefined;

        // Glow layer (wider, semi-transparent — drawn FIRST so it's underneath)
        const glowLine = new google.maps.Polyline({
          path,
          map,
          strokeColor: BRAND_PRIMARY,
          strokeWeight: 12,
          strokeOpacity: 0.22,
          zIndex: 8,
        });
        glowRef.current = glowLine;

        // Main route line
        const line = new google.maps.Polyline({
          path,
          map,
          strokeColor: BRAND_PRIMARY,
          strokeWeight: 5,
          strokeOpacity: 0.95,
          zIndex: 10,
          icons: [
            {
              icon: { path: google.maps.SymbolPath.CIRCLE, fillOpacity: 0, scale: 0 },
              offset: "0%",
            },
          ],
        });
        polylineRef.current = line;

        // Draw alt route (gray) if available
        if (routes.length > 1) {
          const altEncoded = (routes[1].polyline as Record<string, string>)?.encodedPolyline;
          if (altEncoded) {
            const altPath = geometryLib.encoding.decodePath(altEncoded);
            const altLine = new google.maps.Polyline({
              path: altPath,
              map,
              strokeColor: "#94A3B8",
              strokeWeight: 4,
              strokeOpacity: 0.5,
              zIndex: 5,
            });
            altPolylineRef.current = altLine;
          }
        }

        // Set markers from decoded path (first and last point)
        const startPt = path[0];
        const endPt = path[path.length - 1];
        if (startPt && endPt) {
          setMarkers({
            pickup: { lat: startPt.lat(), lng: startPt.lng() },
            delivery: { lat: endPt.lat(), lng: endPt.lng() },
          });
        }

        // FitBounds using viewport returned by Routes API
        const vp = primary.viewport as Record<string, Record<string, number>> | undefined;
        if (vp?.low && vp?.high) {
          lastViewportRef.current = vp as RouteResult["viewport"];
          map.fitBounds(
            new google.maps.LatLngBounds(
              { lat: vp.low.latitude, lng: vp.low.longitude },
              { lat: vp.high.latitude, lng: vp.high.longitude },
            ),
            { top: 100, bottom: 80, left: 60, right: 80 },
          );
        }

        // Parse distance + duration
        const distM = (primary.distanceMeters as number) ?? 0;
        const miles = distM / 1609.34;
        // Duration comes as "Xs" — strip the trailing "s"
        const durStr = (primary.duration as string) ?? "0s";
        const durS = parseInt(durStr.replace("s", ""), 10) || 0;
        const mins = Math.round(durS / 60);

        // Real toll data from Routes API travelAdvisory
        let tollCost = 0;
        const tollInfo = (primary.travelAdvisory as Record<string, unknown>)?.tollInfo as
          | Record<string, unknown>
          | undefined;
        if (tollInfo?.estimatedPrice) {
          const prices = tollInfo.estimatedPrice as Array<Record<string, unknown>>;
          const usd = prices.find((p) => p.currencyCode === "USD");
          if (usd) {
            const units = parseInt(String(usd.units ?? "0"), 10) || 0;
            const nanos = (usd.nanos as number) ?? 0;
            tollCost = units + nanos / 1e9;
          }
        }

        const gallons = miles / 25;
        const gasCost = gallons * 3.5;

        onResult({
          miles,
          mins,
          gallons,
          gasCost,
          tollCost, // REAL toll data from Routes API
          dist: `${miles.toFixed(1)} mi`,
          time: mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} hr ${mins % 60} min`,
          viewport: vp?.low && vp?.high ? (vp as RouteResult["viewport"]) : undefined,
          midpoint,
          pickupCoord: startPt ? { lat: startPt.lat(), lng: startPt.lng() } : undefined,
          deliveryCoord: endPt ? { lat: endPt.lat(), lng: endPt.lng() } : undefined,
          encodedPath: encodedPolyline,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[RouteLayer] computeRoutes fetch error:", err);
        onResult(null);
      });

    return () => {
      cancelled = true;
      glowRef.current?.setMap(null);
      polylineRef.current?.setMap(null);
      altPolylineRef.current?.setMap(null);
    };
  }, [map, geometryLib, pickupAddr, deliveryAddr, onResult]);

  // Re-fit when the map becomes visible (mobile "Map" tab). On mobile the map
  // sits in a display:none container while on the list/detail tabs, so the
  // fitBounds above ran against a 0×0 box. When `active` flips true the
  // container has real dimensions — trigger a resize + re-fit to the last
  // known viewport so switching stops auto-focuses correctly.
  useEffect(() => {
    if (!active || !map) return;
    const vp = lastViewportRef.current;
    if (!vp?.low || !vp?.high) return;
    const t = window.setTimeout(() => {
      google.maps.event.trigger(map, "resize");
      map.fitBounds(
        new google.maps.LatLngBounds(
          { lat: vp.low.latitude, lng: vp.low.longitude },
          { lat: vp.high.latitude, lng: vp.high.longitude },
        ),
        { top: 100, bottom: 80, left: 60, right: 80 },
      );
    }, 80);
    return () => window.clearTimeout(t);
  }, [active, map]);

  return (
    <>
      {markers.pickup && (
        <AdvancedMarker position={markers.pickup} zIndex={20} onClick={() => onMarkerClick?.("pickup")}>
          <div style={{ filter: "drop-shadow(0 4px 12px var(--primary-glow-strong))", cursor: "pointer" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--primary)",
                  border: "3px solid white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 900,
                  color: "white",
                  lineHeight: 1,
                  transition: "transform 0.15s",
                  transform: activeMarker === "pickup" ? "scale(1.2)" : "scale(1)",
                  boxShadow: activeMarker === "pickup" ? "0 0 0 4px color-mix(in srgb, var(--primary) 25%, transparent)" : "none",
                }}
              >
                A
              </div>
              <div style={{ width: 2, height: 8, background: "var(--primary)", opacity: 0.7 }} />
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--primary)", opacity: 0.5 }} />
            </div>
          </div>
        </AdvancedMarker>
      )}
      {markers.delivery && (
        <AdvancedMarker position={markers.delivery} zIndex={20} onClick={() => onMarkerClick?.("delivery")}>
          <div style={{ filter: "drop-shadow(0 4px 12px rgba(239,68,68,0.5))", cursor: "pointer" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "#ef4444",
                  border: "3px solid white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 900,
                  color: "white",
                  lineHeight: 1,
                  transition: "transform 0.15s",
                  transform: activeMarker === "delivery" ? "scale(1.2)" : "scale(1)",
                  boxShadow: activeMarker === "delivery" ? "0 0 0 4px rgba(239,68,68,0.25)" : "none",
                }}
              >
                B
              </div>
              <div style={{ width: 2, height: 8, background: "#ef4444", opacity: 0.7 }} />
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", opacity: 0.5 }} />
            </div>
          </div>
        </AdvancedMarker>
      )}
    </>
  );
}

function GoogleMap({
  active,
  pickupAddr,
  deliveryAddr,
  pickupName,
  deliveryName,
}: {
  active?: boolean;
  pickupAddr: string;
  deliveryAddr: string;
  pickupName?: string;
  deliveryName?: string;
}) {
  const [result, setResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [routeViewport, setRouteViewport] = useState<RouteResult["viewport"]>(undefined);
  const [rushDismissed, setRushDismissed] = useState(false);
  const [activeMarker, setActiveMarker] = useState<"pickup" | "delivery" | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const onResult = useCallback((r: RouteResult | null) => {
    setResult(r);
    setRouteViewport(r?.viewport);
    setLoading(false);
  }, []);

  // Trigger loading ONLY when the addresses actually change, not on every
  // re-render (hover, parent state churn, etc). Without this guard the
  // overlay flashes white during routine renders.
  const prevAddrsRef = useRef({ pickup: "", delivery: "" });
  useEffect(() => {
    const prev = prevAddrsRef.current;
    if (pickupAddr && deliveryAddr && (pickupAddr !== prev.pickup || deliveryAddr !== prev.delivery)) {
      prevAddrsRef.current = { pickup: pickupAddr, delivery: deliveryAddr };
      setLoading(true);
      setResult(null);
    } else if (!pickupAddr || !deliveryAddr) {
      setLoading(false);
      setResult(null);
    }
  }, [pickupAddr, deliveryAddr]);

  // Reset the rush-hour toast whenever the route changes
  useEffect(() => {
    setRushDismissed(false);
  }, []);

  // Dark mode watcher — tracks `dark` class on <html> so the map + chrome adapt
  const [mapDark, setMapDark] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setMapDark(document.documentElement.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Apply night-mode style to the Google map when dark mode toggles.
  //
  // NOTE on mapId + styles: when a Map is created with a `mapId` (cloud-
  // styled basemap), Google IGNORES legacy inline `styles` arrays entirely.
  // The canonical dark/light mechanism on a mapId map is the `colorScheme`
  // prop on <Map>. The `setOptions({ styles })` below is preserved as a
  // graceful fallback for the un-mapId path; for the cloud-styled map the
  // colorScheme prop drives the night basemap.
  //
  // Palette below is Google's official night-mode palette
  // (https://developers.google.com/maps/documentation/javascript/examples/style-array)
  // — replaces the prior navy palette per the design spec.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!mapRef.current) return;
      if (mapDark) {
        mapRef.current.setOptions({
          styles: [
            { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            {
              featureType: "administrative.locality",
              elementType: "labels.text.fill",
              stylers: [{ color: "#d59563" }],
            },
            { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
            { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
            { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
            { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
            { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
            { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
            { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
            { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
            { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
            { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
            { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
          ],
        });
      } else {
        mapRef.current.setOptions({ styles: [] });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mapDark]);

  const currentHour = new Date().getHours();
  const isRush = (currentHour >= 7 && currentHour <= 9) || (currentHour >= 16 && currentHour <= 19);

  if (!pickupAddr || !deliveryAddr)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-muted/30">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border/60">
          <MapIcon className="size-7 text-muted-foreground/50" aria-hidden="true" />
        </div>
        <div className="text-center">
          <p className="font-bold text-[13px] text-foreground/70">Route map</p>
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
            Select a stop to see
            <br />
            the pickup → delivery route
          </p>
        </div>
      </div>
    );

  return (
    <div className="relative h-full w-full">
      {/* Loading overlay */}
      {loading && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-2.5 rounded-2xl bg-card px-6 py-4 shadow-xl ring-1 ring-border/60">
            <Loader2 className="size-5 animate-spin text-primary" />
            <p className="font-semibold text-[11px] text-muted-foreground">Calculating route…</p>
          </div>
        </div>
      )}

      {/* Map */}
      <APIProvider apiKey={GMAP_KEY}>
        <Map
          defaultCenter={{ lat: 26.3, lng: -80.15 }}
          defaultZoom={8}
          mapId={ROUTE_MAP_ID}
          // colorScheme is the canonical dark/light switch on a mapId map.
          // The `key` below still forces a remount when theme flips so the
          // overlays / polylines redraw cleanly against the new basemap.
          colorScheme={mapDark ? "DARK" : "LIGHT"}
          key={mapDark ? "dark" : "light"}
          disableDefaultUI={true}
          clickableIcons={false}
          gestureHandling="cooperative"
          style={{ width: "100%", height: "100%" }}
          onTilesLoaded={(e) => {
            mapRef.current = e.map;
          }}
          onClick={() => setActiveMarker(null)}
        >
          <RouteLayer
            active={active}
            pickupAddr={pickupAddr}
            deliveryAddr={deliveryAddr}
            onResult={onResult}
            onMarkerClick={setActiveMarker}
            activeMarker={activeMarker}
          />

          {/* Pickup marker popup — Street View + info */}
          {activeMarker === "pickup" && result?.pickupCoord && (
            <AdvancedMarker
              position={result.pickupCoord}
              zIndex={25}
              anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER}
            >
              <div
                style={{
                  marginBottom: 48,
                  filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.2))",
                  width: 240,
                }}
              >
                <div
                  style={{
                    borderRadius: 14,
                    overflow: "hidden",
                    background: mapDark ? "hsl(var(--card))" : "white",
                    border: mapDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  {/* Street View */}
                  <div style={{ position: "relative", height: 110, background: "#e8eaed", overflow: "hidden" }}>
                    <img
                      src={`https://maps.googleapis.com/maps/api/streetview?size=480x220&location=${result.pickupCoord.lat},${result.pickupCoord.lng}&fov=90&pitch=5&key=${GMAP_KEY}`}
                      alt="Street view"
                      onClick={() =>
                        setLightbox(
                          `https://maps.googleapis.com/maps/api/streetview?size=800x450&location=${result.pickupCoord?.lat},${result.pickupCoord?.lng}&fov=90&pitch=5&key=${GMAP_KEY}`,
                        )
                      }
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        cursor: "zoom-in",
                        transition: "opacity 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                    />
                    <div
                      style={{
                        position: "absolute",
                        bottom: 6,
                        left: 8,
                        background: "rgba(0,0,0,0.55)",
                        backdropFilter: "blur(4px)",
                        borderRadius: 6,
                        padding: "2px 8px",
                      }}
                    >
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: "white", letterSpacing: "0.05em" }}>
                        PICKUP
                      </span>
                    </div>
                    {/* Zoom hint */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: 6,
                        right: 8,
                        background: "rgba(0,0,0,0.45)",
                        backdropFilter: "blur(4px)",
                        borderRadius: 5,
                        padding: "2px 6px",
                        pointerEvents: "none",
                      }}
                    >
                      <span style={{ fontSize: 8.5, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
                        Click to expand
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveMarker(null)}
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "rgba(0,0,0,0.45)",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <X style={{ width: 10, height: 10, color: "white" }} />
                    </button>
                  </div>
                  {/* Info */}
                  <div style={{ padding: "10px 12px 12px" }}>
                    {pickupName && (
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: mapDark ? "hsl(var(--foreground))" : "#0f172a",
                          margin: "0 0 2px",
                          lineHeight: 1.2,
                        }}
                      >
                        {pickupName}
                      </p>
                    )}
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: mapDark ? "hsl(var(--muted-foreground))" : "#64748b",
                        margin: 0,
                        lineHeight: 1.4,
                      }}
                    >
                      {pickupAddr.split(",")[0]}
                    </p>
                    <p
                      style={{
                        fontSize: 10,
                        color: mapDark ? "hsl(var(--muted-foreground) / 0.7)" : "#94a3b8",
                        margin: "2px 0 0",
                      }}
                    >
                      {pickupAddr.split(",").slice(1).join(",").trim()}
                    </p>
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: mapDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #f1f5f9",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "var(--primary)",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--primary)" }}>Pickup point A</span>
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    margin: "0 auto",
                    width: 0,
                    height: 0,
                    borderLeft: "8px solid transparent",
                    borderRight: "8px solid transparent",
                    borderTop: mapDark ? "8px solid hsl(var(--card))" : "8px solid white",
                  }}
                />
              </div>
            </AdvancedMarker>
          )}

          {/* Delivery marker popup — Street View + info */}
          {activeMarker === "delivery" && result?.deliveryCoord && (
            <AdvancedMarker
              position={result.deliveryCoord}
              zIndex={25}
              anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER}
            >
              <div
                style={{
                  marginBottom: 48,
                  filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.2))",
                  width: 240,
                }}
              >
                <div
                  style={{
                    borderRadius: 14,
                    overflow: "hidden",
                    background: mapDark ? "hsl(var(--card))" : "white",
                    border: mapDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  {/* Street View */}
                  <div style={{ position: "relative", height: 110, background: "#e8eaed", overflow: "hidden" }}>
                    <img
                      src={`https://maps.googleapis.com/maps/api/streetview?size=480x220&location=${result.deliveryCoord.lat},${result.deliveryCoord.lng}&fov=90&pitch=5&key=${GMAP_KEY}`}
                      alt="Street view"
                      onClick={() =>
                        setLightbox(
                          `https://maps.googleapis.com/maps/api/streetview?size=800x450&location=${result.deliveryCoord?.lat},${result.deliveryCoord?.lng}&fov=90&pitch=5&key=${GMAP_KEY}`,
                        )
                      }
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        cursor: "zoom-in",
                        transition: "opacity 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                    />
                    <div
                      style={{
                        position: "absolute",
                        bottom: 6,
                        left: 8,
                        background: "rgba(239,68,68,0.75)",
                        backdropFilter: "blur(4px)",
                        borderRadius: 6,
                        padding: "2px 8px",
                      }}
                    >
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: "white", letterSpacing: "0.05em" }}>
                        DELIVERY
                      </span>
                    </div>
                    {/* Zoom hint */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: 6,
                        right: 8,
                        background: "rgba(0,0,0,0.45)",
                        backdropFilter: "blur(4px)",
                        borderRadius: 5,
                        padding: "2px 6px",
                        pointerEvents: "none",
                      }}
                    >
                      <span style={{ fontSize: 8.5, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
                        Click to expand
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveMarker(null)}
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "rgba(0,0,0,0.45)",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <X style={{ width: 10, height: 10, color: "white" }} />
                    </button>
                  </div>
                  {/* Info */}
                  <div style={{ padding: "10px 12px 12px" }}>
                    {deliveryName && (
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: mapDark ? "hsl(var(--foreground))" : "#0f172a",
                          margin: "0 0 2px",
                          lineHeight: 1.2,
                        }}
                      >
                        {deliveryName}
                      </p>
                    )}
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: mapDark ? "hsl(var(--muted-foreground))" : "#64748b",
                        margin: 0,
                        lineHeight: 1.4,
                      }}
                    >
                      {deliveryAddr.split(",")[0]}
                    </p>
                    <p
                      style={{
                        fontSize: 10,
                        color: mapDark ? "hsl(var(--muted-foreground) / 0.7)" : "#94a3b8",
                        margin: "2px 0 0",
                      }}
                    >
                      {deliveryAddr.split(",").slice(1).join(",").trim()}
                    </p>
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: mapDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #f1f5f9",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444" }}>Delivery point B</span>
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    margin: "0 auto",
                    width: 0,
                    height: 0,
                    borderLeft: "8px solid transparent",
                    borderRight: "8px solid transparent",
                    borderTop: mapDark ? "8px solid hsl(var(--card))" : "8px solid white",
                  }}
                />
              </div>
            </AdvancedMarker>
          )}

          {/* Route summary tooltip — anchored at route midpoint */}
          {result?.midpoint && (
            <AdvancedMarker
              position={result.midpoint}
              zIndex={15}
              anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER}
            >
              <div
                style={{
                  marginBottom: 12,
                  filter: "drop-shadow(0 8px 32px color-mix(in srgb, var(--primary) 40%, transparent))",
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    borderRadius: 14,
                    background: "color-mix(in srgb, var(--primary) 95%, transparent)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    padding: "10px 14px",
                    minWidth: 165,
                    border: "1px solid rgba(255,255,255,0.18)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Truck style={{ width: 13, height: 13, color: "rgba(255,255,255,0.7)", flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 900, color: "white", lineHeight: 1 }}>{result.time}</span>
                    {isRush && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          background: "rgba(251,146,60,0.3)",
                          color: "rgb(254,215,170)",
                          padding: "2px 5px",
                          borderRadius: 99,
                        }}
                      >
                        rush
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Distance</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: "white" }}>{result.dist}</span>
                    </div>
                    {/* Cost fields (gas / tolls / trip cost) intentionally hidden —
                        not relevant for operational dispatch. Route calculations
                        still happen in RouteLayer; only the tooltip display was trimmed. */}
                  </div>
                </div>
                {/* Arrow pointing down to route */}
                <div
                  style={{
                    margin: "0 auto",
                    width: 0,
                    height: 0,
                    borderLeft: "7px solid transparent",
                    borderRight: "7px solid transparent",
                    borderTop: "7px solid color-mix(in srgb, var(--primary) 95%, transparent)",
                  }}
                />
              </div>
            </AdvancedMarker>
          )}
        </Map>
      </APIProvider>

      {/* Rush hour — dismissible dark-glass toast, top-right */}
      {isRush && result && !rushDismissed && (
        <div className="absolute top-3 right-3 z-20">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: mapDark ? "rgba(15,15,20,0.85)" : "rgba(255,255,255,0.95)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              borderRadius: 10,
              padding: "6px 10px",
              border: "1px solid rgba(251,146,60,0.35)",
              boxShadow: mapDark ? "0 4px 16px rgba(0,0,0,0.35)" : "0 4px 20px rgba(0,0,0,0.12)",
            }}
          >
            <Zap className="size-3" aria-hidden="true" />
            <div>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: "rgb(251,146,60)", lineHeight: 1.2, margin: 0 }}>
                Rush hour
              </p>
              <p style={{ fontSize: 9, color: "rgba(251,146,60,0.65)", lineHeight: 1.2, margin: 0 }}>
                +30–45 min expected
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRushDismissed(true)}
              aria-label="Dismiss"
              style={{
                marginLeft: 4,
                width: 18,
                height: 18,
                borderRadius: 5,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: mapDark ? "rgba(255,255,255,0.35)" : "rgba(30,30,40,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              <X className="size-2.5" />
            </button>
          </div>
        </div>
      )}

      {/* Map controls — compact dark pill group, centered right */}
      <TooltipProvider delayDuration={300}>
        <div
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: 12,
            border: mapDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
            boxShadow: mapDark
              ? "0 4px 24px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15)"
              : "0 4px 20px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)",
            background: mapDark ? "rgba(12,12,16,0.78)" : "rgba(255,255,255,0.92)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        >
          {/* Satellite toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Toggle satellite view"
                onClick={() => {
                  if (mapRef.current) {
                    const cur = mapRef.current.getMapTypeId();
                    mapRef.current.setMapTypeId(cur === "satellite" ? "roadmap" : "satellite");
                  }
                }}
                style={{
                  width: 36,
                  height: 36,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  color: mapDark ? "rgba(255,255,255,0.72)" : "rgba(30,30,40,0.75)",
                  transition: "background 0.12s, color 0.12s",
                  borderBottom: mapDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = mapDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.05)";
                  e.currentTarget.style.color = mapDark ? "rgba(255,255,255,1)" : "rgba(0,0,0,0.95)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = mapDark ? "rgba(255,255,255,0.72)" : "rgba(30,30,40,0.75)";
                }}
              >
                <Layers style={{ width: 14, height: 14 }} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-[11px]">
              Satellite view
            </TooltipContent>
          </Tooltip>

          {/* Center route */}
          {result && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Center route"
                  onClick={() => {
                    if (mapRef.current && routeViewport) {
                      mapRef.current.fitBounds(
                        new google.maps.LatLngBounds(
                          { lat: routeViewport.low.latitude, lng: routeViewport.low.longitude },
                          { lat: routeViewport.high.latitude, lng: routeViewport.high.longitude },
                        ),
                        { top: 80, bottom: 80, left: 60, right: 60 },
                      );
                    }
                  }}
                  style={{
                    width: 36,
                    height: 36,
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    color: mapDark ? "rgba(255,255,255,0.72)" : "rgba(30,30,40,0.75)",
                    transition: "background 0.12s, color 0.12s",
                    borderBottom: mapDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = mapDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.05)";
                    e.currentTarget.style.color = mapDark ? "rgba(255,255,255,1)" : "rgba(0,0,0,0.95)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = mapDark ? "rgba(255,255,255,0.72)" : "rgba(30,30,40,0.75)";
                  }}
                >
                  <Navigation style={{ width: 14, height: 14 }} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-[11px]">
                Center route
              </TooltipContent>
            </Tooltip>
          )}

          {/* Screenshot via Static Maps */}
          {result?.pickupCoord && result?.deliveryCoord && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Download route map"
                  onClick={() => {
                    if (!result.pickupCoord || !result.deliveryCoord) return;
                    const url =
                      `https://maps.googleapis.com/maps/api/staticmap?size=800x500&maptype=roadmap` +
                      `&markers=color:0x${BRAND_PRIMARY.slice(1)}|label:A|${result.pickupCoord.lat},${result.pickupCoord.lng}` +
                      `&markers=color:red|label:B|${result.deliveryCoord.lat},${result.deliveryCoord.lng}` +
                      `&key=${GMAP_KEY}`;
                    window.open(url, "_blank");
                  }}
                  style={{
                    width: 36,
                    height: 36,
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    color: mapDark ? "rgba(255,255,255,0.72)" : "rgba(30,30,40,0.75)",
                    transition: "background 0.12s, color 0.12s",
                    borderBottom: mapDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = mapDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.05)";
                    e.currentTarget.style.color = mapDark ? "rgba(255,255,255,1)" : "rgba(0,0,0,0.95)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = mapDark ? "rgba(255,255,255,0.72)" : "rgba(30,30,40,0.75)";
                  }}
                >
                  <Camera style={{ width: 14, height: 14 }} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-[11px]">
                Route screenshot
              </TooltipContent>
            </Tooltip>
          )}

          {/* Open in Google Maps */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Open in Google Maps"
                onClick={() =>
                  window.open(
                    `https://maps.google.com/maps?saddr=${encodeURIComponent(pickupAddr)}&daddr=${encodeURIComponent(deliveryAddr)}`,
                    "_blank",
                  )
                }
                style={{
                  width: 36,
                  height: 36,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  color: mapDark ? "rgba(255,255,255,0.72)" : "rgba(30,30,40,0.75)",
                  transition: "background 0.12s, color 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = mapDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.05)";
                  e.currentTarget.style.color = mapDark ? "rgba(255,255,255,1)" : "rgba(0,0,0,0.95)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = mapDark ? "rgba(255,255,255,0.72)" : "rgba(30,30,40,0.75)";
                }}
              >
                <ExternalLink style={{ width: 14, height: 14 }} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-[11px]">
              Open in Google Maps
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* Street View lightbox — fullscreen portal */}
      {lightbox &&
        typeof document !== "undefined" &&
        createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              background: "rgba(0,0,0,0.88)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
            onClick={() => setLightbox(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              style={{ position: "relative", maxWidth: "min(90vw,900px)", width: "100%" }}
            >
              <img
                src={lightbox}
                alt="Street View"
                style={{ width: "100%", borderRadius: 16, display: "block", boxShadow: "0 32px 64px rgba(0,0,0,0.6)" }}
              />
              <button
                type="button"
                onClick={() => setLightbox(null)}
                aria-label="Close"
                style={{
                  position: "absolute",
                  top: -14,
                  right: -14,
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.15)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
              <p
                style={{
                  textAlign: "center",
                  marginTop: 12,
                  fontSize: 11.5,
                  color: "rgba(255,255,255,0.4)",
                  fontWeight: 500,
                }}
              >
                Street View · Click outside or × to close
              </p>
            </motion.div>
          </motion.div>,
          document.body,
        )}
    </div>
  );
}

/* ── Detail panel building blocks ─────────────────────────────────────────── */
// Emoji glyphs replaced with lucide icons (2026-06-12): emojis render
// differently per OS and break alignment — icons are deterministic.
const PKG_TYPES: { id: PackageType; icon: React.ElementType; l: string }[] = [
  { id: "rx", icon: Pill, l: "Prescription" },
  { id: "cold", icon: Snowflake, l: "Cold Chain" },
  { id: "regular", icon: Package, l: "Standard" },
  { id: "internal", icon: Building2, l: "Internal" },
];

/* Single source of truth for the Delivery Address > Drop-off select. */
/* Both the Select options and the section summary read from this list. */
const DROP_OPTIONS: { v: string; icon: React.ElementType }[] = [
  { v: "Leave at Door", icon: DoorOpen },
  { v: "Mail Box", icon: Mailbox },
  { v: "Front Desk", icon: Building2 },
  { v: "Leave at Gate", icon: Lock },
  { v: "With Neighbor", icon: Users },
  { v: "No Contact", icon: Handshake },
  { v: "Other", icon: StickyNote },
];
function dropLabel(v: string): string {
  const o = DROP_OPTIONS.find((d) => d.v === v);
  return o ? o.v : "";
}

function FormSection({
  title,
  // biome-ignore lint/correctness/noUnusedFunctionParameters: icon kept for call-site compat
  icon: _icon,
  children,
  defaultOpen = true,
  summary,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  summary?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/10 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 pr-3 text-left transition-colors hover:text-foreground"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold tracking-[-0.01em] text-foreground/80">{title}</span>
          {!open && summary && (
            <span className="ml-1 max-w-[120px] truncate text-[11px] text-muted-foreground/50">{summary}</span>
          )}
        </div>
        <ChevronDown
          className={cn("size-3.5 text-muted-foreground/35 transition-transform duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/[0.07] py-2 last:border-0">
      <span className="shrink-0 text-[11px] text-muted-foreground/65 leading-snug">{label}</span>
      <div className="flex min-w-0 items-center justify-end gap-1.5">{children}</div>
    </div>
  );
}

function ReadRow({
  label,
  value,
  mono,
  editable,
  onChange,
  placeholder,
  inputMode,
  required,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  editable?: boolean;
  onChange?: (v: string) => void;
  placeholder?: string;
  inputMode?: "text" | "tel" | "email" | "numeric" | "decimal";
  required?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => {
    setLocal(value ?? "");
  }, [value]);

  if (!editable) {
    if (!value) return null;
    return (
      <div className="flex items-start justify-between gap-4 border-b border-border/[0.07] py-2 last:border-0">
        <span className="shrink-0 text-[11px] text-muted-foreground/65 leading-snug">
          {label}
          {required && (
            <span className="ml-0.5 text-rose-400" title="Required">
              *
            </span>
          )}
        </span>
        <span
          className={cn(
            "min-w-0 truncate text-right text-[11px] font-medium leading-snug text-foreground",
            mono && "font-mono text-[11px] text-primary",
          )}
        >
          {value}
        </span>
      </div>
    );
  }

  // Keys always allowed regardless of inputMode
  const CTRL_KEYS = [
    "Backspace",
    "Delete",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Tab",
    "Enter",
    "Escape",
    "Home",
    "End",
  ];

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "Escape") {
      setEditing(false);
      return;
    }
    // For phone: allow only digits + control keys
    if (inputMode === "tel") {
      if (!CTRL_KEYS.includes(e.key) && !/^\d$/.test(e.key) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
      }
    }
    // For numeric (DOB): allow only digits + control keys
    if (inputMode === "numeric") {
      if (!CTRL_KEYS.includes(e.key) && !/^\d$/.test(e.key) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
      }
    }
  }

  return (
    <div
      className="group flex cursor-text items-start justify-between gap-4 border-b border-border/[0.07] py-2 last:border-0"
      onClick={() => setEditing(true)}
    >
      <span className="shrink-0 text-[11px] text-muted-foreground/65 leading-snug">
        {label}
        {required && (
          <span className="ml-0.5 text-rose-400" title="Required">
            *
          </span>
        )}
      </span>
      {editing ? (
        <input
          value={local}
          onChange={(e) => {
            const raw = e.target.value;
            // Strip non-digits on paste for tel/numeric fields
            if (inputMode === "tel") {
              const fmt = fmtPhone(raw);
              setLocal(fmt);
              onChange?.(fmt);
            } else if (inputMode === "numeric") {
              // strip non-digits for DOB, let parent fmtDob handle formatting
              const digits = raw.replace(/\D/g, "").slice(0, 8);
              onChange?.(digits);
              // local shows the formatted value returned via value prop
            } else {
              setLocal(raw);
              onChange?.(raw);
            }
          }}
          onBlur={() => setEditing(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          inputMode={inputMode ?? "text"}
          className="flex-1 rounded-none border-0 bg-transparent text-right font-medium text-xs text-foreground outline-none focus:ring-0"
        />
      ) : (
        <span
          onFocus={() => setEditing(true)}
          className={cn(
            "flex-1 truncate text-right font-medium text-xs transition-colors focus:outline-none",
            local ? "text-foreground" : "text-muted-foreground/60 italic",
            "group-hover:text-foreground",
          )}
        >
          {local || placeholder || "—"}
        </span>
      )}
    </div>
  );
}

function Toggle({
  value,
  onChange,
  color = "primary",
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  color?: "primary" | "teal";
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
        value ? (color === "teal" ? "bg-teal-600" : "bg-primary") : "bg-muted-foreground/25",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-card shadow-md transition-transform duration-200",
          value ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

function _RateCard({
  carrier,
  amount,
  service,
  days,
  selected,
  onSelect,
}: {
  carrier: string;
  amount: number | null | undefined;
  service?: string;
  days?: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  if (amount == null)
    return (
      <div className="flex items-center justify-between rounded-xl border-2 border-border/40 bg-muted/20 px-3.5 py-2.5 opacity-50">
        <div>
          <p className="font-semibold text-xs text-foreground">{carrier}</p>
          <p className="text-[11px] text-muted-foreground">Not available</p>
        </div>
        <span className="text-[11px] text-muted-foreground">N/A</span>
      </div>
    );
  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer items-center justify-between rounded-xl border-2 px-3.5 py-2.5 transition-colors",
        selected
          ? "border-primary bg-primary/5 shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]"
          : "border-border/40 bg-card hover:border-primary/40 hover:shadow-sm",
      )}
    >
      <div>
        <p className="font-semibold text-xs text-foreground">{carrier}</p>
        <p className="text-[11px] text-muted-foreground">
          {service ?? "Standard"}
          {days != null ? ` · ${days} days` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="font-bold text-[13px] text-foreground">${amount.toFixed(2)}</span>
        {selected ? (
          <CheckCircle2 className="size-4 text-primary" />
        ) : (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-[11px] text-primary">Select</span>
        )}
      </div>
    </div>
  );
}

const INPUT_CLS =
  "h-7 w-full border-0 border-b border-transparent bg-transparent px-0.5 text-xs font-medium text-foreground transition-colors outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-0 focus-visible:ring-0 rounded-none text-right";
const _INLINE_INPUT_CLS =
  "w-full border-0 bg-transparent text-xs font-medium text-foreground outline-none placeholder:text-muted-foreground/30 focus:outline-none focus:ring-0 focus-visible:ring-1 focus-visible:ring-primary/25 transition-colors hover:text-foreground/90 rounded-none py-0";

/* ── Draft Stop Panel ────────────────────────────────────────────────────── */
function _DraftStopPanel({
  draft,
  pickup,
  pricing,
  onClose,
  onSubmitted,
}: {
  draft: DraftStop;
  pickup: PickupLocation | null;
  pricing: Pricing;
  onClose: () => void;
  onSubmitted: (trackingNumber: string) => void;
}) {
  const [name, setName] = useState(draft.recipient_name || "");
  const [phone, setPhone] = useState(draft.recipient_phone || "");
  const [pkg, setPkg] = useState(draft.package_type || "rx");
  const [notes, setNotes] = useState(draft.notes || "");
  const [rxNum, setRxNum] = useState("");
  const [gate, setGate] = useState("");
  const [sig, setSig] = useState(false);
  const [cod, setCod] = useState(false);
  const [codAmt, setCodAmt] = useState("0");
  const [sameDay, setSameDay] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [trackingNum, setTrackingNum] = useState("");
  const [error, setError] = useState("");
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});

  function validateDraftForm(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Full name is required";
    else if (name.trim().length < 2) errs.name = "Name must be at least 2 characters";
    if (!phone) errs.phone = "Phone number is required";
    else if (phone.replace(/\D/g, "").length < 10) errs.phone = "Enter a valid 10-digit phone number";
    setDraftErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // Auto-save draft on name/phone change
  const autoSave = useCallback(
    async (patch: Record<string, unknown>) => {
      await fetch("/api/client/draft-stops", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: draft.draft_id, ...patch }),
      }).catch(() => {});
    },
    [draft.draft_id],
  );

  async function submitOrder() {
    if (!validateDraftForm()) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/client/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_id: draft.tracking_id || undefined, // reuse draft's RTL-{unix} ID
          recipient_name: name.trim(),
          recipient_phone: phoneToE164(phone) ?? undefined,
          delivery_address: draft.delivery_address,
          delivery_city: draft.delivery_city,
          delivery_state: draft.delivery_state,
          delivery_zip: draft.delivery_zip,
          pickup_address: pickup?.address || draft.pickup_address,
          package_type: pkg,
          rx_number: rxNum.trim() || undefined,
          gate_code: gate.trim() || undefined,
          notes: notes.trim() || undefined,
          requires_signature: sig,
          collect_cod: cod,
          collect_amount: cod ? codAmt : "0",
          delivery_type: sameDay ? "same_day" : "next_day",
          is_same_day: sameDay,
          payment_status: "paid",
          total_price: pricing.price_per_stop,
          total_amount: pricing.price_per_stop,
          stops: 1,
        }),
      });
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        /* empty body */
      }
      if (!res.ok || data.ok === false) {
        console.error("Submit failed:", res.status, data);
        setError(String(data.error || `Server error ${res.status}`));
        return;
      }
      // Mark draft as approved
      await fetch("/api/client/draft-stops", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: draft.draft_id, status: "approved", tracking_id: data.tracking_number }),
      }).catch(() => {});
      const tn = String(data.tracking_number ?? "");
      setTrackingNum(tn);
      setSubmitted(true);
      onSubmitted(tn);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const street = draft.delivery_address;
  const city = [draft.delivery_city, draft.delivery_state, draft.delivery_zip].filter(Boolean).join(", ");

  if (submitted)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background px-8 text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
        >
          <div className="flex size-20 items-center justify-center rounded-full bg-emerald-500/15">
            <CheckCircle2 className="size-10 text-emerald-600" />
          </div>
        </motion.div>
        <div>
          <p className="font-black text-lg text-foreground">Stop Created!</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{street}</p>
          <p className="mt-3 font-bold font-mono text-[13px] text-primary">{trackingNum}</p>
        </div>
        <Button onClick={onClose} className="mt-2 h-9 rounded-xl px-8 font-bold text-sm">
          Done
        </Button>
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Header */}
      <div
        className="relative shrink-0 overflow-hidden border-violet-300/70 border-b"
        style={{ background: "hsl(var(--background))" }}
      >
        <div className="h-[5px] w-full bg-gradient-to-r from-violet-600 via-violet-500 to-violet-400" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-violet-500/25 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-400/15 to-transparent" />
        <div
          className="pointer-events-none absolute inset-x-0 top-[5px] h-[60px]"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)" }}
        />
        {/* Tools strip */}
        <div className="relative flex items-center justify-between border-border/[0.06] border-b px-4 pt-1.5 pb-1">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 shrink-0 rounded-full bg-violet-500" />
            <span className="font-semibold text-[11px] text-muted-foreground/50 italic">Draft</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </div>
        {/* KPI card body */}
        <div className="relative px-4 pt-3 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-foreground leading-tight tracking-tight">{toTitle(street)}</p>
              <p className="mt-0.5 font-medium text-[11px] text-muted-foreground">{toTitle(city)}</p>
            </div>
            <Package className="mt-0.5 size-5 shrink-0 text-violet-400/30" aria-hidden="true" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 font-semibold text-[10px] text-violet-700 dark:text-violet-400">
              <span className="size-1 shrink-0 rounded-full bg-violet-500" />
              Draft
            </span>
            <span className="inline-flex items-center gap-0.5 rounded-md bg-muted/60 px-1.5 py-0.5 font-mono font-semibold text-[10px] text-muted-foreground/55">
              <Hash className="size-2.5" aria-hidden="true" />
              Tracking Pending
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="custom-scroll min-h-0 flex-1 overflow-y-auto bg-background">
        <div className="space-y-0">
          {/* Recipient */}
          <FormSection title="Recipient" icon="👤" defaultOpen>
            <div className="space-y-2">
              <div className="flex items-center gap-2 overflow-hidden rounded-lg border border-border/60 bg-background px-2.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <User className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setDraftErrors((er) => {
                      const n = { ...er };
                      delete n.name;
                      return n;
                    });
                    autoSave({ recipient_name: e.target.value.trim().toUpperCase() });
                  }}
                  placeholder="Recipient name *"
                  className="h-9 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40"
                />
              </div>
              {draftErrors.name && <p className="px-1 font-medium text-[11px] text-rose-500">{draftErrors.name}</p>}
              <div className="flex items-center gap-2 overflow-hidden rounded-lg border border-border/60 bg-background px-2.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={phone}
                  onKeyDown={(e) => {
                    const ctrl = [
                      "Backspace",
                      "Delete",
                      "ArrowLeft",
                      "ArrowRight",
                      "Tab",
                      "Enter",
                      "Escape",
                      "Home",
                      "End",
                    ];
                    if (!ctrl.includes(e.key) && !/^\d$/.test(e.key) && !e.metaKey && !e.ctrlKey) e.preventDefault();
                  }}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "").slice(0, 10);
                    const fmt = fmtPhone(d);
                    setPhone(fmt);
                    setDraftErrors((er) => {
                      const n = { ...er };
                      delete n.phone;
                      return n;
                    });
                    if (d.length === 10) autoSave({ recipient_phone: `+1${d}` });
                  }}
                  placeholder="(555) 123-4567"
                  inputMode="tel"
                  className="h-9 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40"
                />
              </div>
              {draftErrors.phone && <p className="px-1 font-medium text-[11px] text-rose-500">{draftErrors.phone}</p>}
            </div>
          </FormSection>

          {/* Package */}
          <FormSection title="Package" icon="📦" defaultOpen>
            <FieldRow label="Pkg Type">
              <Select
                value={pkg}
                onValueChange={(v) => {
                  setPkg(v);
                  autoSave({ package_type: v });
                }}
              >
                <SelectTrigger className="h-7 w-[130px] justify-end gap-1 border-0 bg-transparent pr-1 font-medium text-xs text-foreground focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {PKG_TYPES.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      <span className="flex items-center gap-1.5">
                        <p.icon className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> {p.l}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <div className="mt-2 space-y-1">
              <FieldRow label="Internal Client ID">
                <input
                  value={rxNum}
                  onChange={(e) => setRxNum(e.target.value)}
                  placeholder="Optional"
                  className={INPUT_CLS}
                />
              </FieldRow>
              <FieldRow label="Gate Code">
                <input
                  value={gate}
                  onChange={(e) => setGate(e.target.value)}
                  placeholder="Optional"
                  className={INPUT_CLS}
                />
              </FieldRow>
              <FieldRow label="Sig. Required">
                <Toggle value={sig} onChange={setSig} />
              </FieldRow>
            </div>
          </FormSection>

          {/* Service */}
          <FormSection title="Service" icon="🚚" defaultOpen={false}>
            <FieldRow label="Same Day">
              <Toggle value={sameDay} onChange={setSameDay} />
            </FieldRow>
            <FieldRow label="Collect on Delivery">
              <Toggle color="teal" value={cod} onChange={setCod} />
            </FieldRow>
            {cod && (
              <FieldRow label="COD Amount">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-[13px] text-muted-foreground">$</span>
                  <input
                    value={codAmt}
                    inputMode="decimal"
                    onChange={(e) => setCodAmt(e.target.value.replace(/[^0-9.]/g, ""))}
                    onBlur={(e) => {
                      const num = parseFloat(e.target.value);
                      if (!Number.isNaN(num)) setCodAmt(num.toFixed(2));
                    }}
                    className="h-7 w-24 rounded-none border-0 border-transparent border-b bg-transparent text-right font-semibold text-xs text-foreground outline-none transition-colors focus:border-primary/40 focus:ring-0"
                  />
                </div>
              </FieldRow>
            )}
          </FormSection>

          {/* Notes */}
          <div className="px-4 pt-2 pb-3">
            <label className="mb-1.5 flex items-center gap-1.5 font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
              <FileText className="size-3" />
              Driver Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                autoSave({ notes: e.target.value || null });
              }}
              placeholder="Special instructions…"
              rows={2}
              className="w-full resize-none rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 text-foreground text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>
      </div>

      {/* Footer — raised above mobile nav bar */}
      <div
        className="shrink-0 space-y-2 border-border/40 border-t bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-3"
        style={{ paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom) + 4.5rem))" }}
      >
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-1.5 font-semibold text-[11px] text-destructive">{error}</p>
        )}
        <Button
          onClick={submitOrder}
          disabled={submitting || !name.trim()}
          className="h-12 w-full gap-2 rounded-xl font-bold text-sm shadow-md"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Submitting…
            </>
          ) : (
            <>
              <Plus className="size-4" />
              Submit Order
            </>
          )}
        </Button>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl border border-border/40 py-2.5 font-medium text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.98]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Stop Detail Panel ────────────────────────────────────────────────────── */
/* ── Status Tracker ─────────────────────────────────────────────────────── */
const STATUS_STAGES = [
  { key: "draft", label: "Draft", icon: "✏️" },
  { key: "unassigned", label: "Submitted", icon: "📋" },
  { key: "assigned", label: "Assigned", icon: "👤" },
  { key: "transit", label: "In Route", icon: "🚗" },
  { key: "delivered", label: "Delivered", icon: "✅" },
];

function stageIndex(status: string): number {
  if (["draft"].includes(status)) return 0;
  if (["unassigned", "pending", "submitted"].includes(status)) return 1;
  if (["assigned", "dispatched"].includes(status)) return 2;
  if (["in_transit", "out_for_delivery", "en_route"].includes(status)) return 3;
  if (["delivered", "completed", "picked_up"].includes(status)) return 4;
  if (["failed", "attempted", "cancelled", "failed_not_home", "return_to_sender"].includes(status)) return -1;
  return 1;
}

function StopStatusTracker({ status }: { status: string }) {
  // Phase 3 (stop-timeline): return_to_sender rides the failed visual path —
  // red branch on the tracker, "Failed → Return" label. Presentation only;
  // status logic and the timeline are untouched.
  const failed = ["failed", "attempted", "cancelled", "failed_not_home", "return_to_sender"].includes(status);
  const isReturn = status === "return_to_sender";
  const idx = failed ? 3 : stageIndex(status);
  const total = STATUS_STAGES.length - 1; // 4
  const isDone = idx === total && !failed;

  return (
    <div className="px-3 pt-1 pb-3">
      {/* Track */}
      <div className="relative flex items-center" style={{ height: 32 }}>
        {/* Full background dashed line */}
        <div className="absolute inset-x-3 top-1/2 -translate-y-1/2">
          <div
            className="h-[2px] w-full rounded-full"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, hsl(var(--border)/0.35) 0px, hsl(var(--border)/0.35) 10px, transparent 10px, transparent 13px, hsl(var(--border)/0.2) 13px, hsl(var(--border)/0.2) 15px, transparent 15px, transparent 18px)",
            }}
          />
        </div>

        {/* Filled dashed progress overlay — STATIC, idx-driven width. A plain
            div (no framer-motion). The prior motion.div started at scaleX:0 and
            collapsed the fill to nothing when the enter-animation didn't run,
            so the bar read empty regardless of the real status / 75% container. */}
        <div
          className="absolute inset-x-3 top-1/2 -translate-y-1/2 overflow-hidden"
          style={{ width: `calc(${(idx / total) * 100}% - 0.75rem)` }}
        >
          <div
            className="h-[2px] w-full"
            style={{
              backgroundImage: failed
                ? "repeating-linear-gradient(90deg, #f87171 0px, #f87171 10px, transparent 10px, transparent 13px, #fca5a5 13px, #fca5a5 15px, transparent 15px, transparent 18px)"
                : isDone
                  ? "repeating-linear-gradient(90deg, #10b981 0px, #10b981 10px, transparent 10px, transparent 13px, #34d399 13px, #34d399 15px, transparent 15px, transparent 18px)"
                  : "repeating-linear-gradient(90deg, var(--primary) 0px, var(--primary) 10px, transparent 10px, transparent 13px, rgb(96, 165, 250) 13px, rgb(96, 165, 250) 15px, transparent 15px, transparent 18px)",
            }}
          />
        </div>

        {/* Stage dots + active truck */}
        {STATUS_STAGES.map((stage, i) => {
          const pct = i / total;
          const isActive = i === idx;
          const isFail = failed && i === idx;

          return (
            <div
              key={stage.key}
              className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `calc(${pct * 100}% * ((100% - 1.5rem) / 100%) + 0.75rem)` }}
            >
              {isActive ? (
                <div className="relative flex items-center justify-center">
                  {isFail ? (
                    <div className="relative flex size-5 items-center justify-center rounded-full bg-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.45)]">
                      <X className="size-3 text-white" />
                    </div>
                  ) : isDone ? (
                    <div className="relative flex size-5 items-center justify-center rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]">
                      <CheckCircle2 className="size-3 text-white" />
                    </div>
                  ) : (
                    // STATIC truck — scale(1.3), no framer-motion wrapper, no dark: variants.
                    <div
                      className="text-primary drop-shadow-[0_0_5px_hsl(var(--primary)/0.7)]"
                      style={{ transform: "scale(1.3)" }}
                    >
                      <Truck className="size-[18px]" />
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={cn(
                    "size-[9px] rounded-full border-2",
                    i <= idx ? "border-primary bg-primary/30" : "border-border/50 bg-background",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Labels */}
      <div className="mt-1 flex justify-between px-0">
        {STATUS_STAGES.map((stage, i) => {
          const isFail = failed && i === idx;
          const isActive = !failed && i === idx;
          return (
            <span
              key={stage.key}
              className={cn(
                "text-[10px] leading-tight tracking-wide",
                isFail
                  ? "font-semibold text-rose-500"
                  : isActive
                    ? "font-semibold text-primary"
                    : i < idx
                      ? "font-normal text-muted-foreground/55"
                      : "font-normal text-muted-foreground/35",
              )}
            >
              {isFail ? (isReturn ? "Failed → Return" : "Failed") : stage.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── History tab (stop-timeline Phase 4) ──────────────────────────────────────
 * Renders the stop's full timeline from /api/client/stops/{id}/timeline —
 * FastAPI already filtered it server-side to customer-visibility entries
 * (internal/admin rows never reach this app). Read-only. */
type TimelineEntry = {
  event: string;
  label: string;
  actor: string | null;
  actor_name: string | null;
  timestamp: string | null;
  note: string | null;
  tenant_role?: string;
  field_changes?: Array<{ field: string; old_value: unknown; new_value: unknown }>;
};

const TIMELINE_ICONS: Record<string, React.ElementType> = {
  created: Package,
  dropoff_registered: Package,
  posted_to_spoke: Truck,
  checked_in: Package,
  "stop.field_changed": PenLine,
  assigned: User,
  in_transit: Truck,
  picked_up: Package,
  delivered: CheckCircle2,
  failed: X,
};

const FIELD_LABELS: Record<string, string> = {
  "recipient.name": "Recipient name",
  "recipient.phone": "Phone",
  "recipient.email": "Email",
  stop_type: "Stop type",
};

function timelineActorDisplay(e: TimelineEntry): string {
  const name = e.actor_name || "System";
  if (e.actor === "tenant_owner" || e.actor === "tenant_member") {
    return `${toTitle(name)} · ${e.tenant_role ?? (e.actor === "tenant_member" ? "member" : "owner")}`;
  }
  if (e.actor === "spoke") return `${name} · Driver`;
  if (e.actor === "system") return `System · ${name}`;
  return name;
}

function StopHistoryTimeline({ stopId, isDraft }: { stopId: string; isDraft: boolean }) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (isDraft) return;
    let cancelled = false;
    setEntries(null);
    setError(null);
    fetch(`/api/client/stops/${encodeURIComponent(stopId)}/timeline`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!cancelled) setEntries((d.timeline as TimelineEntry[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load history — try again shortly");
      });
    return () => {
      cancelled = true;
    };
  }, [stopId, isDraft]);

  if (isDraft) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 bg-card p-3 py-16">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted/50">
          <FileText className="size-5 text-muted-foreground/50" aria-hidden="true" />
        </div>
        <p className="max-w-[200px] text-center text-[11px] text-muted-foreground/60">
          History starts once the order is submitted
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 py-12">
        <AlertCircle className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
        <span className="text-[11px] text-muted-foreground/60">{error}</span>
      </div>
    );
  }
  if (entries === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-12">
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="text-[11px] text-muted-foreground">Loading history…</span>
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-[11px] text-muted-foreground/50">No history recorded yet</p>
      </div>
    );
  }

  return (
    <div className="bg-card px-3 py-3">
      <ol className="relative ml-2 border-l border-border/50">
        {entries.map((e, i) => {
          const Icon = TIMELINE_ICONS[e.event] ?? FileText;
          const hasDetail = (e.field_changes?.length ?? 0) > 0;
          const isOpen = expanded === i;
          const ts = e.timestamp ? new Date(e.timestamp) : null;
          return (
            <li key={`${e.event}-${e.timestamp ?? i}`} className="relative pb-4 pl-5 last:pb-1">
              <span
                className={cn(
                  "absolute -left-[9px] top-0.5 flex size-[18px] items-center justify-center rounded-full ring-2 ring-card",
                  e.event === "delivered"
                    ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300"
                    : e.event === "failed"
                      ? "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300"
                      : "bg-muted text-muted-foreground/70",
                )}
              >
                <Icon className="size-2.5" aria-hidden="true" />
              </span>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-foreground/85">{e.label}</span>
                {ts && (
                  <span className="shrink-0 text-[10px] text-muted-foreground/50">
                    {ts.toLocaleDateString(undefined, { month: "short", day: "numeric" })}{" "}
                    {ts.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground/70">{timelineActorDisplay(e)}</p>
              {e.note && <p className="mt-0.5 whitespace-pre-line text-[11px] text-muted-foreground/50">{e.note}</p>}
              {hasDetail && (
                <>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : i)}
                    className="mt-1 flex items-center gap-1 text-[10px] font-medium text-primary/80 hover:text-primary"
                  >
                    <ChevronDown
                      className={cn("size-3 transition-transform", isOpen && "rotate-180")}
                      aria-hidden="true"
                    />
                    {isOpen
                      ? "Hide changes"
                      : `${e.field_changes?.length} change${(e.field_changes?.length ?? 0) > 1 ? "s" : ""}`}
                  </button>
                  {isOpen && (
                    <div className="mt-1.5 space-y-1 rounded-lg bg-muted/30 px-2.5 py-2">
                      {e.field_changes?.map((c) => (
                        <div key={c.field} className="text-[11px]">
                          <span className="font-medium text-foreground/70">{FIELD_LABELS[c.field] ?? c.field}:</span>{" "}
                          <span className="text-muted-foreground/60 line-through">{String(c.old_value ?? "—")}</span>
                          {" → "}
                          <span className="text-foreground/80">{String(c.new_value ?? "—")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StopDetailPanel({
  stopId,
  summary,
  onClose,
  draftData,
  pickup,
  pricing,
  onDraftSubmitted,
  pickupLocations,
  onPickupChange,
  onAddressChange,
  onBasicInfoChange,
  onNoLongerUnassigned,
  tenantCompanyName,
}: {
  stopId: string;
  summary: TodayStop;
  onClose: () => void;
  draftData?: DraftStop; // present when this is a draft
  pickup?: PickupLocation | null;
  pricing?: Pricing;
  onDraftSubmitted?: () => void;
  pickupLocations?: PickupLocation[];
  onPickupChange?: (loc: PickupLocation) => void;
  /** Fired when delivery address is changed via the in-panel autocomplete.
   *  Parent uses it to optimistically sync the left list row + header state. */
  onAddressChange?: (a: AddressResult) => void;
  /** Fired as recipient name/phone are edited (the PATCH is debounced and
   *  fire-and-forget) — parent optimistically syncs the left list row so it
   *  never shows a stale value until the next full refetch. */
  onBasicInfoChange?: (patch: { recipient_name?: string; recipient_phone?: string }) => void;
  /** Server said 409 — a dispatcher grabbed this stop mid-edit/delete.
   *  Parent should close the panel and refresh the unassigned list. */
  onNoLongerUnassigned?: () => void;
  /** Tenant company_name — surfaced on the printed label as FROM. */
  tenantCompanyName?: string;
}) {
  const [full, setFull] = useState<FullStop | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [_saving, setSaving] = useState(false);
  const [_saved, setSaved] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);

  // editable fields
  const [gate, setGate] = useState("");
  const [dropPref, setDropPref] = useState("");
  const [pkg, setPkg] = useState<string>("rx");
  const [rxNumber, setRxNumber] = useState("");
  const [dpNote, setDpNote] = useState("");
  // Quick Notes (replaces the old Driver Notes input — see panel comment).
  const [quickNote, setQuickNote] = useState("");
  const [quickNoteModalOpen, setQuickNoteModalOpen] = useState(false);
  const [savingQuickNote, setSavingQuickNote] = useState(false);
  const [coldChain, setColdChain] = useState(false);
  const [sig, setSig] = useState(false);
  const [weightOz, setWeightOz] = useState("8");
  const [lengthIn, setLengthIn] = useState("10");
  const [widthIn, setWidthIn] = useState("7");
  const [heightIn, setHeightIn] = useState("2");
  const [serviceType, setServiceType] = useState("local");
  const [serviceDate, setServiceDate] = useState("");
  const [returnToSender, setReturnToSender] = useState(false);
  const [cod, setCod] = useState(false);
  const [codAmt, setCodAmt] = useState("0");
  const [selectedRate, setSelectedRate] = useState<string | null>(null);
  const [dimsOpen, setDimsOpen] = useState(false);
  // Payment / COD collapsible under Recipient — auto-opens when a COD is set.
  const [payOpen, setPayOpen] = useState(false);
  // Realtime invalidation: bump to re-run the detail fetch below.
  const [realtimeTick, setRealtimeTick] = useState(0);
  const lastLocalSaveRef = useRef(0);
  const [stopType, setStopType] = useState<"delivery" | "pickup" | "return">("delivery");
  const [recipName, setRecipName] = useState("");
  const [recipPhone, setRecipPhone] = useState("");
  const [recipEmail, setRecipEmail] = useState("");
  const [recipDob, setRecipDob] = useState("");
  const [editingDeliveryAddr, setEditingDeliveryAddr] = useState(false);
  const [localDeliveryStreet, setLocalDeliveryStreet] = useState("");
  const [localDeliveryCity, setLocalDeliveryCity] = useState("");
  const [localDeliveryState, setLocalDeliveryState] = useState("");
  const [localDeliveryZip, setLocalDeliveryZip] = useState("");
  const [localPickup, setLocalPickup] = useState<PickupLocation | null>(pickup ?? null);
  useEffect(() => {
    setLocalPickup(pickup ?? null);
  }, [pickup]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitDone, setSubmitDone] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // ── Internal notes + tab state ──────────────────────────────────
  const [panelTab, setPanelTab] = useState("details");
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [postingNote, setPostingNote] = useState(false);
  // Gate codes (lazy-fetched when tab first opens)
  const [gateCodesData, setGateCodesData] = useState<Record<string, unknown>[]>([]);
  const [gateCodesLoading, setGateCodesLoading] = useState(false);
  const [gateCodesFetched, setGateCodesFetched] = useState(false);
  const [gateCodesStreet, setGateCodesStreet] = useState("");
  const [gateCodeInput, setGateCodeInput] = useState("");
  const [savingGateCode, setSavingGateCode] = useState(false);
  // Gate codes added while this is still a DRAFT. They're keyed to the draft's
  // address/zip, which FastAPI can normalize/enrich on submit — so the
  // address-based lookup on the new stop can miss them. Buffer here and re-post
  // to the real stop_id after submit (mirrors the internal-notes copy).
  const [draftGateCodes, setDraftGateCodes] = useState<{ code: string; notes?: string }[]>([]);

  const isDraft = !!draftData;
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Fetch full detail — submitted stops use /stops/[id]; drafts use the matching
  // /draft-stops/[draft_id] endpoint which returns the same FullStop shape so the
  // [full] initialization effect below populates every form field identically.
  // biome-ignore lint/correctness/useExhaustiveDependencies: draftData is keyed by draft_id; realtimeTick is an intentional invalidation tick
  useEffect(() => {
    const key = isDraft ? (draftData?.draft_id ?? "") : stopId;
    if (!key) {
      setFull(null);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, 15000);

    setLoading(true);
    setFull(null);
    const url = isDraft
      ? `/api/client/draft-stops/${encodeURIComponent(key)}`
      : `/api/client/stops/${encodeURIComponent(key)}`;

    fetch(url, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        setFull(d.stop ?? null);
        setLoading(false);
      })
      .catch((err) => {
        // Cleanup abort (newer selection) → that run owns loading; don't stomp it.
        if (err?.name === "AbortError" && !timedOut) return;
        setFull(null);
        setLoading(false);
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
    // Key on the draft's stable id, NOT the draftData object: the parent
    // optimistically replaces activeDraft on address/pickup edits, and keying
    // on object identity made this re-fetch race the in-flight PATCH — the
    // stale GET result then re-initialized every form field (the "address
    // reverts" bug). Same draft id = same record; no re-fetch needed.
    // realtimeTick: bumped by the realtime listener below to invalidate+refetch.
  }, [stopId, isDraft, draftData?.draft_id, realtimeTick]);

  // Live-invalidate the open stop/draft. Realtime is a signal only; shaped data
  // still comes from the existing /api/client/* detail endpoints. Uses the
  // shared useRoutelyRealtime hook so the subscription survives Clerk token
  // expiry (fresh setAuth before every rejoin + backoff resubscribe).
  const detailKey = isDraft ? (draftData?.draft_id ?? "") : stopId;
  useRoutelyRealtime({
    channelName: `${isDraft ? "draft" : "stop"}-detail-${detailKey}`,
    tables: isDraft ? DETAIL_DRAFT_TABLES : DETAIL_STOP_TABLES,
    filter: isDraft ? `draft_id=eq.${detailKey}` : `stop_id=eq.${detailKey}`,
    enabled: Boolean(detailKey),
    refreshOnVisible: false,
    onChange: () => {
      if (Date.now() - lastLocalSaveRef.current < 2500) return;
      setRealtimeTick((t) => t + 1);
    },
  });

  // Initialize form from fetched detail
  useEffect(() => {
    if (!full) return;
    setGate(full.address.gate_code ?? "");
    setDropPref(full.address.drop_preference ?? "");
    setPkg(full.package.type ?? "rx");
    setRxNumber(full.package.rx_number ?? "");
    setDpNote(full.package.dp_note ?? "");
    setColdChain(full.package.cold_chain ?? false);
    setSig(full.package.requires_signature ?? false);
    setWeightOz(String(full.package.weight_oz ?? 8));
    setLengthIn(String(full.package.length_in ?? 10));
    setWidthIn(String(full.package.width_in ?? 7));
    setHeightIn(String(full.package.height_in ?? 2));
    // Normalize legacy "nextday" → "local" so the Service Type <Select> always
    // has a matching option. Default date is derived from the RESOLVED type:
    //   local → tomorrow,   same_day / express → today,   return → tomorrow.
    // Local YYYY-MM-DD (no UTC drift) for the <input type="date"> value.
    const rawType = full.service.type ?? "local";
    const resolvedType = rawType === "nextday" ? "local" : rawType;
    const localDateStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    };
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultDate =
      resolvedType === "same_day" || resolvedType === "express" ? localDateStr(today) : localDateStr(tomorrow);
    setServiceType(resolvedType);
    setServiceDate(full.service.date ?? defaultDate);
    setReturnToSender(full.service.return_to_sender ?? false);
    setCod(full.service.collect_payment ?? false);
    setCodAmt(String(full.service.cod_amount ?? 0));
    // Expanded when a COD already exists — never hide configured data.
    setPayOpen((full.service.collect_payment ?? false) || Number(full.service.cod_amount ?? 0) > 0);
    setSelectedRate(full.rates.selected);
    setStopType((full.stop_type ?? "delivery") as "delivery" | "pickup" | "return");
    setRecipName(full.recipient.name ?? "");
    // Phone: store formatted
    setRecipPhone(full.recipient.phone ? fmtPhone(full.recipient.phone) : "");
    setRecipEmail(full.recipient.email ?? "");
    setRecipDob(full.recipient.dob ?? "");
    setLocalDeliveryStreet(full.address.street ?? "");
    setLocalDeliveryCity(full.address.city ?? "");
    setLocalDeliveryState(full.address.state ?? "");
    setLocalDeliveryZip(full.address.zip ?? "");
    setInternalNotes(full.internal_notes ?? []);
  }, [full]);

  // For drafts: also pre-populate recipient fields from draftData when it changes
  useEffect(() => {
    if (!isDraft || !draftData) return;
    if (draftData.recipient_name) setRecipName(draftData.recipient_name);
    if (draftData.recipient_phone) setRecipPhone(fmtPhone(draftData.recipient_phone));
  }, [isDraft, draftData]);

  // Fetch gate codes on panel mount (was tab-open lazy) — the tab badge needs
  // the count before the tab is ever opened. Read-only GET, same endpoint.
  useEffect(() => {
    if (gateCodesFetched || (!stopId && !isDraft)) return;
    const gcId = isDraft ? (draftData?.draft_id ?? stopId) : stopId;
    setGateCodesLoading(true);
    fetch(`/api/client/stops/${encodeURIComponent(gcId)}/gate-codes`)
      .then((r) => r.json())
      .then((d) => {
        setGateCodesData((d.codes ?? []) as Record<string, unknown>[]);
        setGateCodesStreet(d.street ?? "");
        setGateCodesFetched(true);
      })
      .catch(() => setGateCodesFetched(true))
      .finally(() => setGateCodesLoading(false));
  }, [gateCodesFetched, stopId]);

  const handleSaveGateCode = async () => {
    const code = gateCodeInput.trim();
    if (!code || savingGateCode) return;

    // DRAFT: don't persist against the ephemeral draft (its address/zip can
    // change on submit). Buffer locally + show optimistically; submitDraft
    // re-posts these to the real stop_id so they bind to the final address.
    if (isDraft) {
      if (draftGateCodes.some((g) => g.code === code)) {
        setGateCodeInput("");
        return;
      }
      setDraftGateCodes((prev) => [...prev, { code }]);
      setGateCodesData((prev) => [
        {
          gate_code: code,
          address: gateCodesStreet,
          notes: "",
          added_by: "You",
          created_at: new Date().toISOString(),
          _pending: true,
        } as Record<string, unknown>,
        ...prev,
      ]);
      setGateCodeInput("");
      toast.success("Gate code added");
      return;
    }

    // SUBMITTED stop: persist immediately (keyed to the stop's real address).
    setSavingGateCode(true);
    try {
      const res = await fetch(`/api/client/stops/${encodeURIComponent(stopId)}/gate-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        toast.error("Failed to save gate code");
        return;
      }
      const data = await res.json();
      // Prepend to the list immediately
      setGateCodesData((prev) => [data.code as Record<string, unknown>, ...prev]);
      setGateCodeInput("");
      toast.success("Gate code saved");
    } catch {
      toast.error("Failed to save gate code");
    } finally {
      setSavingGateCode(false);
    }
  };

  const handlePostNote = async () => {
    const text = noteText.trim();
    setPostingNote(true);
    try {
      const sid = isDraft ? draftData?.draft_id : stopId;
      const res = await fetch(`/api/client/stops/${encodeURIComponent(sid ?? "")}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        toast.error("Failed to post note");
        return;
      }
      const data = await res.json();
      setInternalNotes((prev) => [...prev, data.note as InternalNote]);
      setNoteText("");
    } catch {
      toast.error("Failed to post note");
    } finally {
      setPostingNote(false);
    }
  };

  // Quick Notes: same POST + append flow as the Notes tab (handlePostNote),
  // triggered from the confirm modal. Field clears on success.
  const handleSaveQuickNote = async () => {
    const text = quickNote.trim();
    if (!text) {
      setQuickNoteModalOpen(false);
      return;
    }
    setSavingQuickNote(true);
    try {
      const sid = isDraft ? draftData?.draft_id : stopId;
      const res = await fetch(`/api/client/stops/${encodeURIComponent(sid ?? "")}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        toast.error("Failed to save note");
        return;
      }
      const data = await res.json();
      setInternalNotes((prev) => [...prev, data.note as InternalNote]);
      setQuickNote("");
      setQuickNoteModalOpen(false);
      toast.success("Note saved");
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSavingQuickNote(false);
    }
  };

  const scheduleAutoSave = useCallback(
    (patch: Record<string, unknown>) => {
      if (isDraft) {
        // Auto-save to draft_stops
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(async () => {
          await fetch("/api/client/draft-stops", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ draft_id: draftData?.draft_id, ...patch }),
          }).catch(() => {});
        }, 800);
        return;
      }
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(async () => {
        try {
          // Stamp for the realtime echo guard — this save will bounce back as a
          // postgres_changes UPDATE within ~1-2s; the listener skips it.
          lastLocalSaveRef.current = Date.now();
          const res = await fetch(`/api/client/stops/${encodeURIComponent(stopId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          if (res.status === 409) {
            // Dispatcher grabbed the stop mid-edit — surface it and refresh.
            toast.error("This stop is no longer unassigned — your change was not saved", {
              position: "top-center",
            });
            onNoLongerUnassigned?.();
            return;
          }
          const payload = (await res.json()) as { ok?: boolean; warning?: string; detail?: string };
          if (payload.ok) {
            setAutoSaved(true);
            setTimeout(() => setAutoSaved(false), 1500);
            if (payload.warning === "dispatch_sync_pending") {
              toast.warning("Saved — sync to dispatch pending", { position: "top-center" });
            } else if (payload.warning === "never_synced") {
              toast.warning("Saved locally — this stop was never created in dispatch", {
                position: "top-center",
              });
            }
          }
        } catch {
          /* silent */
        }
      }, 800);
    },
    [stopId, isDraft, draftData, onNoLongerUnassigned],
  );

  async function _save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/client/stops/${encodeURIComponent(stopId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: { gate_code: gate || null, drop_preference: dropPref || null },
          package: {
            type: pkg,
            // Driver note is dispatcher-owned — this panel no longer writes
            // it; preserve whatever the doc already has.
            notes: full?.package.notes || null,
            rx_number: rxNumber || null,
            dp_note: dpNote || null,
            cold_chain: coldChain,
            requires_signature: sig,
            weight_oz: Number(weightOz) || 8,
            length_in: Number(lengthIn) || 10,
            width_in: Number(widthIn) || 7,
            height_in: Number(heightIn) || 2,
          },
          service: {
            type: serviceType,
            // Never null the canonical delivery day — default to today (ET).
            date: serviceDate || todayYmdET(),
            collect_payment: cod,
            cod_amount: cod ? parseFloat(codAmt) || 0 : 0,
            return_to_sender: returnToSender,
          },
          rates: { selected: selectedRate },
        }),
      });
      if ((await res.json()).ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }

  function validateForm(): boolean {
    const errs: Record<string, string> = {};
    const name = recipName.trim() || full?.recipient.name || draftData?.recipient_name || "";
    const phone = recipPhone || full?.recipient.phone || "";
    const email = recipEmail || full?.recipient.email || "";
    const dob = recipDob || full?.recipient.dob || "";

    if (!name) errs.name = "Full name is required";
    else if (name.length < 2) errs.name = "Name must be at least 2 characters";

    if (!phone || !isValidPhone(phone)) errs.phone = "Enter a valid 10-digit US phone number";

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email address";
    if (dob && !isValidDob(dob)) errs.dob = "Invalid date — use MM/DD/YYYY (e.g. 01/15/1990)";

    const gateVal = gate || full?.address.gate_code || "";
    if (gateVal && gateVal.length > 20) errs.gate = "Gate code too long (max 20 chars)";

    const cod_val = parseFloat(codAmt);
    if (cod && (Number.isNaN(cod_val) || cod_val <= 0)) errs.cod = "Enter a valid COD amount";
    if (cod && cod_val > 9999) errs.cod = "COD amount too high (max $9,999)";

    // Delivery address is required by orders/create (FastAPI). Validate the
    // NORMALIZED address (same normalization submit uses) — a legacy blob draft
    // whose street contains city/state/zip passes once parsed; a truly
    // incomplete address fails with the exact missing pieces named.
    const normAddr = normalizeAddress({
      street: localDeliveryStreet || full?.address.street || draftData?.delivery_address || "",
      city: localDeliveryCity || full?.address.city || draftData?.delivery_city || "",
      state: localDeliveryState || full?.address.state || draftData?.delivery_state || "",
      zip: localDeliveryZip || full?.address.zip || draftData?.delivery_zip || "",
    });
    if (!normAddr.street) errs.delivery_address = "Delivery street address is required";
    if (!normAddr.city) errs.delivery_city = "Delivery city is required";
    if (!/^[A-Z]{2}$/.test(normAddr.state)) errs.delivery_state = "Delivery state is required";
    if (!/^\d{5}$/.test(normAddr.zip)) errs.delivery_zip = "Delivery ZIP code is required";

    setValidationErrors(errs);
    // Reveal the address editor so the user can fix a missing/invalid address
    // (the fields are otherwise collapsed behind the read-only address row),
    // and name exactly which pieces are missing.
    const missing = [
      errs.delivery_address && "street",
      errs.delivery_city && "city",
      errs.delivery_state && "state",
      errs.delivery_zip && "ZIP",
    ].filter(Boolean);
    if (missing.length > 0) {
      setEditingDeliveryAddr(true);
      setSubmitError(
        `Delivery address is incomplete — missing ${missing.join(", ")}. Update the address, then submit again.`,
      );
    }
    return Object.keys(errs).length === 0;
  }

  async function submitDraft() {
    if (!draftData) return;
    if (submitting) return; // re-entrancy guard (the button is also disabled)
    // Flush any pending debounced autosave so it cannot land AFTER the approve
    // transition and race the draft's final state.
    clearTimeout(autoSaveTimer.current);
    if (!validateForm()) return; // shows inline errors
    setSubmitError("");
    setSubmitting(true);
    try {
      // Build payload from CURRENT hydrated state — never from the slim draftData
      // list-row snapshot. Priority: local UI state → FullStop hydration (`full`)
      // → draftData fallback (only used if both above are empty).
      // ── Pickup — single source of truth ───────────────────────────────
      // Priority chain:
      //   1. Location resolved from the draft's SAVED pickup_location_id.
      //      This is the authoritative truth after a bulk edit / refresh —
      //      activeDraft.pickup_location_id is updated optimistically AND
      //      reloaded via loadDrafts. Trusting this first prevents a stale
      //      localPickup (panel-local state) from overriding the saved choice.
      //   2. Panel's localPickup — covers in-panel manual pickup changes
      //      where the draft hasn't been re-fetched yet.
      //   3. Global tenant pickup — only when the draft has no saved id
      //      (legacy drafts created before pickup persistence).
      //   4. draftData.pickup_address — last-ditch string fallback.
      const savedPickupId = draftData?.pickup_location_id ?? "";
      const resolvedSavedPickup = savedPickupId
        ? ((pickupLocations ?? []).find((l) => l.id === savedPickupId) ?? null)
        : null;
      const submitPickup: PickupLocation | null = resolvedSavedPickup || localPickup || pickup || null;
      // DropOff signal: explicit pickup id wins. FastAPI detects DropOff via
      // empty pickup_address — we force-clear here so a previously-saved
      // pickup_address from earlier draft state never leaks back in.
      const isDropoff = submitPickup?.id === "__dropoff__" || draftData?.pickup_location_id === "__dropoff__";

      // Normalize the delivery address from the LATEST state (local → hydrated →
      // draft row) so legacy blob drafts ("street, city, FL zip" in one field)
      // submit as clean street/city/state/zip — never the raw malformed string.
      const normDelivery = normalizeAddress({
        street: localDeliveryStreet || full?.address.street || draftData.delivery_address || "",
        city: localDeliveryCity || full?.address.city || draftData.delivery_city || "",
        state: localDeliveryState || full?.address.state || draftData.delivery_state || "",
        zip: localDeliveryZip || full?.address.zip || draftData.delivery_zip || "",
      });

      const orderBody = {
        // Recipient
        recipient_name: recipName.trim() || full?.recipient.name || draftData.recipient_name || "TBD",
        recipient_phone:
          phoneToE164(
            recipPhone ||
              (full?.recipient.phone ? fmtPhone(full.recipient.phone) : "") ||
              draftData.recipient_phone ||
              "",
          ) ?? undefined,
        recipient_email: recipEmail || full?.recipient.email || undefined,
        recipient_dob: recipDob || full?.recipient.dob || undefined,
        // Delivery address — normalized from the latest state (see normDelivery above)
        delivery_address: normDelivery.street,
        delivery_city: normDelivery.city,
        delivery_state: normDelivery.state,
        delivery_zip: normDelivery.zip,
        // Pickup — all fields derived from the single submitPickup source above.
        // For DropOff: explicit FastAPI signal via stop_type:"dropoff" PLUS
        // pickup.location_id:"dropoff" (alternative form), and every pickup_*
        // address field cleared so a stale draftData.pickup_address cannot
        // resolve the default tenant pickup on the backend.
        pickup_location_id: isDropoff ? "dropoff" : submitPickup?.id || draftData.pickup_location_id || undefined,
        pickup_name: isDropoff ? "DropOff" : submitPickup?.name || undefined,
        pickup_address: isDropoff ? "" : submitPickup?.address || draftData.pickup_address,
        pickup_city: isDropoff ? "" : submitPickup?.city || undefined,
        pickup_state: isDropoff ? "FL" : submitPickup?.state || "FL",
        pickup_zip: isDropoff ? "" : submitPickup?.zip || undefined,
        pickup_code: isDropoff ? undefined : submitPickup?.code || undefined,
        // Nested pickup object — FastAPI also accepts this shape for DropOff
        // detection (per backend contract).
        pickup: isDropoff ? { location_id: "dropoff" } : undefined,
        // Address extras
        gate_code: gate || full?.address.gate_code || undefined,
        drop_preference: dropPref || full?.address.drop_preference || undefined,
        // Stop type — DropOff selection forces stop_type:"dropoff" (FastAPI's
        // preferred DropOff signal). Otherwise use the user's stopType choice
        // (delivery / pickup / return), then full, then default delivery.
        stop_type: isDropoff
          ? "dropoff"
          : stopType || (full as unknown as { stop_type?: string } | null)?.stop_type || "delivery",
        // Package
        package_type: pkg || full?.package.type || draftData.package_type || "rx",
        rx_number: rxNumber || full?.package.rx_number || undefined,
        dp_note: dpNote || full?.package.dp_note || undefined,
        notes: full?.package.notes || undefined,
        requires_signature: sig,
        cold_chain: coldChain,
        weight_oz: Number(weightOz) || full?.package.weight_oz || 8,
        length_in: Number(lengthIn) || full?.package.length_in || 10,
        width_in: Number(widthIn) || full?.package.width_in || 7,
        height_in: Number(heightIn) || full?.package.height_in || 2,
        // Service
        collect_cod: cod,
        collect_amount: cod ? codAmt : "0",
        delivery_type: serviceType === "same_day" ? "same_day" : "next_day",
        is_same_day: serviceType === "same_day",
        delivery_date: serviceDate || full?.service.date || undefined,
        return_to_sender: returnToSender,
        // Payment + pricing
        payment_status: "paid",
        total_price: pricing?.price_per_stop ?? 14,
        total_amount: pricing?.price_per_stop ?? 14,
        stops: 1,
        // Idempotency key consumed by FastAPI's paired-stops orchestrator
        // (POST /v1/stops/). Retries with the same draft_id resolve to the
        // SAME pickup + delivery pair under the same order_ref. Next is a
        // pure pass-through — FastAPI owns RTL / order_ref / tracking_pool /
        // pickup + delivery insertion. draftData is non-null here because
        // submitDraft early-returns on !draftData above.
        created_from_draft_id: draftData.draft_id,
      };
      // Idempotent submit with one retry. orders/create dedupes on
      // created_from_draft_id, so re-POSTing the same draft never creates a
      // duplicate — it resolves to the same pickup+delivery pair. A 202
      // ("backup_queued") means FastAPI was unreachable and the order was
      // handed to the n8n backup; that is NOT a confirmed canonical stop, so we
      // keep the draft and let the user retry rather than marking it approved.
      let data: Record<string, unknown> = {};
      let httpStatus = 0;
      let created = false;
      let queued = false;
      let spokeUnconfirmed = false;
      for (let attempt = 0; attempt < 2 && !created; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 600));
        try {
          const res = await fetch("/api/client/orders/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(orderBody),
          });
          httpStatus = res.status;
          try {
            data = await res.json();
          } catch {
            data = {};
          }
          if (res.ok && data.ok !== false) {
            created = true;
            break;
          }
          // 202 = the n8n backup ALREADY fired (FastAPI was unreachable). Do not
          // retry — a retry that reaches FastAPI would create a second order
          // alongside the queued backup. Keep the draft; the user retries later.
          if (res.status === 202 || data.dispatch_status === "backup_queued") {
            queued = true;
            break;
          }
          // 409 = FastAPI created the stop but Spoke never accepted it (ghost
          // prevented). The route already saved it as submit_failed. Deterministic.
          if (res.status === 409 || data.dispatch_status === "spoke_unconfirmed") {
            spokeUnconfirmed = true;
            break;
          }
          // 4xx (e.g. validation) is deterministic — don't waste a retry.
          if (res.status >= 400 && res.status < 500) break;
          // 5xx / network error: nothing persisted, a retry is safe and useful.
        } catch (e) {
          console.error("Submit attempt failed:", e);
        }
      }
      if (!created) {
        console.error("Submit failed:", httpStatus, data);
        if (spokeUnconfirmed) {
          // Consume the draft so it doesn't linger beside the submit_failed stop
          // (no dual state); the stop is recoverable from the Failed tab.
          const failedStopId = String(data.stop_id ?? data.tracking_number ?? "");
          if (failedStopId) {
            await fetch("/api/client/draft-stops", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ draft_id: draftData.draft_id, status: "approved", tracking_id: failedStopId }),
            }).catch(() => {});
          }
          toast.error("Spoke didn’t accept this stop — saved as a draft. Find it in Drafts to retry.");
          onNoLongerUnassigned?.();
          return;
        }
        setSubmitError(
          queued
            ? "We couldn’t reach the dispatch service, so this order was queued for backup processing. Your draft is safe — please tap Submit again in a moment."
            : String(data.error || `Server error ${httpStatus || ""}`.trim()),
        );
        return;
      }
      // Follow-up PATCH on the freshly-created submitted stop. orders/create
      // forwards only a subset of fields to FastAPI, so a number of editable
      // fields (drop_preference, cold_chain, dob, dp_note, stop_type, the
      // service.type/date pair, return_to_sender, dimensions, …) never landed
      // on the stops doc. The submitted PATCH route's ALLOWED whitelist covers
      // every editable field — so we write them all under their canonical paths.
      // Result: when the user opens the submitted stop, the existing
      // useEffect([full]) init populates every form field correctly.
      const newStopId = String(data.tracking_number ?? data.stop_id ?? "");
      if (newStopId) {
        const phoneE164 = phoneToE164(
          recipPhone ||
            (full?.recipient.phone ? fmtPhone(full.recipient.phone) : "") ||
            draftData.recipient_phone ||
            "",
        );
        await fetch(`/api/client/stops/${encodeURIComponent(newStopId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: {
              name: recipName.trim() || full?.recipient.name || draftData.recipient_name || "",
              phone: phoneE164 ?? undefined,
              email: recipEmail || full?.recipient.email || null,
              dob: recipDob || full?.recipient.dob || null,
            },
            address: {
              gate_code: gate || null,
              drop_preference: dropPref || null,
            },
            // Hybrid-OCR: carry the canonical order-id array onto the stop.
            order_ids: full?.order_ids?.length ? full.order_ids : undefined,
            package: {
              type: pkg || full?.package.type || "rx",
              notes: full?.package.notes || null,
              rx_number: rxNumber || full?.package.rx_number || null,
              dp_note: dpNote || full?.package.dp_note || null,
              cold_chain: Boolean(coldChain),
              requires_signature: Boolean(sig),
              weight_oz: Number(weightOz) || 8,
              length_in: Number(lengthIn) || 10,
              width_in: Number(widthIn) || 7,
              height_in: Number(heightIn) || 2,
            },
            service: {
              type: serviceType || "local",
              // Canonical delivery day — default to today (ET) so the submit
              // follow-up PATCH can never null the date FastAPI just set.
              date: serviceDate || todayYmdET(),
              collect_payment: Boolean(cod),
              cod_amount: cod ? parseFloat(codAmt) || 0 : 0,
              return_to_sender: Boolean(returnToSender),
            },
            // Preserve dropoff that FastAPI's orchestrator already set on the
            // stops doc. The previous `stopType || "delivery"` silently
            // overwrote it because stopType state only tracks
            // delivery/pickup/return (DropOff is encoded via pickup.id), so
            // the patch effectively converted every DropOff into a delivery.
            stop_type: isDropoff ? "dropoff" : stopType || "delivery",
            // Pickup — same submitPickup computed above. Forces the bulk-edited /
            // user-selected pickup onto stops.pickup.* regardless of what FastAPI
            // wrote, so the submitted detail panel hydrates the right pickup.
            pickup: {
              location_id: submitPickup?.id ?? null,
              name: submitPickup?.name ?? null,
              address: submitPickup?.address ?? null,
              city: submitPickup?.city ?? null,
              state: submitPickup?.state ?? null,
              zip: submitPickup?.zip ?? null,
              code: submitPickup?.code ?? null,
            },
          }),
        }).catch(() => {});
      }
      // Copy draft internal notes to the submitted stop
      if (newStopId && internalNotes.length > 0) {
        await Promise.allSettled(
          internalNotes.map((note) =>
            fetch(`/api/client/stops/${encodeURIComponent(newStopId)}/notes`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: note.text }),
            }),
          ),
        );
      }
      // Copy gate codes added on the draft to the submitted stop, binding them
      // to the stop's FINAL (FastAPI-normalized) address + zip. Mirrors the
      // internal-notes copy above. Includes a still-unsaved typed code.
      if (newStopId) {
        const pendingCode = gateCodeInput.trim();
        const codesToBind = [...draftGateCodes];
        if (pendingCode && !codesToBind.some((g) => g.code === pendingCode)) {
          codesToBind.push({ code: pendingCode });
        }
        if (codesToBind.length > 0) {
          await Promise.allSettled(
            codesToBind.map((gc) =>
              fetch(`/api/client/stops/${encodeURIComponent(newStopId)}/gate-codes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: gc.code, notes: gc.notes ?? "" }),
              }),
            ),
          );
        }
      }
      // Mark draft approved. The stop is already created (idempotent above), so
      // this transition must NOT be silently lost — that is what leaves a draft
      // looking unsubmitted while its stop exists. Check the result and retry
      // once; if it still fails, the stop is real but the draft stayed "draft",
      // so tell the user to refresh instead of letting them re-submit blindly.
      let approved = false;
      for (let attempt = 0; attempt < 2 && !approved; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 400));
        try {
          const ar = await fetch("/api/client/draft-stops", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              draft_id: draftData.draft_id,
              status: "approved",
              tracking_id: data.tracking_number,
            }),
          });
          approved = ar.ok;
        } catch {
          approved = false;
        }
      }
      setSubmitDone(true);
      if (approved) {
        toast.success("Order submitted");
      } else {
        toast.warning(`Stop ${String(data.tracking_number ?? "")} created — refresh to update your draft list.`);
      }
      onDraftSubmitted?.();
    } catch (e) {
      setSubmitError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // Delete flows through the confirmation modal (no browser confirm). For
  // UNASSIGNED stops the server deletes in dispatch (Spoke) first — including
  // the paired pickup — then soft-deletes Mongo; the modal says so plainly.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      if (isDraft) {
        await fetch("/api/client/draft-stops", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft_id: draftData?.draft_id, status: "deleted" }),
        });
        setDeleteOpen(false);
        onClose();
        onDraftSubmitted?.();
        return;
      }
      const res = await fetch(`/api/client/stops/${encodeURIComponent(stopId)}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 409) {
        toast.error("This stop is no longer unassigned — a dispatcher already picked it up", {
          position: "top-center",
        });
        setDeleteOpen(false);
        onNoLongerUnassigned?.();
        return;
      }
      if (!res.ok) {
        toast.error(String(payload.error ?? "Couldn't delete the stop"), { position: "top-center" });
        setDeleteOpen(false);
        return;
      }
      if (payload.warning === "partial_failure" || payload.warning === "pickup_not_unassigned") {
        toast.warning(String(payload.detail ?? "Deleted, but the paired pickup needs attention"), {
          position: "top-center",
          duration: 6000,
        });
      } else {
        toast.success("Stop deleted — removed from dispatch", { position: "top-center" });
      }
      setDeleteOpen(false);
      onClose();
      onDraftSubmitted?.();
    } catch {
      toast.error("Couldn't delete the stop — try again", { position: "top-center" });
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const status = isDraft ? "draft" : (full?.status ?? summary.status);

  // D20 (address lock): a submitted-but-unassigned stop's delivery address is
  // immutable — Circuit can't update an unassigned stop's location, so the only
  // path is delete + new draft. Drafts stay freely editable.
  const addressLocked = !isDraft && ["pending", "approved", "paid", "unassigned", "created"].includes(status);
  const [addrLockedOpen, setAddrLockedOpen] = useState(false);

  // Q-RETRY: resubmit a submit_failed stop to dispatch (same submit action,
  // re-applied). Success → the stop becomes unassigned; reuse the
  // close-and-reload path. Repeat failure → refreshed reason, stays failed.
  const [retrying, setRetrying] = useState(false);
  const handleRetrySubmission = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/client/stops/${encodeURIComponent(stopId)}/retry`, { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        legs?: Array<{ error?: string }>;
      };
      if (res.ok && d.ok) {
        toast.success("Resubmitted to dispatch");
        onNoLongerUnassigned?.();
      } else {
        const legErr = Array.isArray(d.legs) ? d.legs.find((l) => l.error)?.error : null;
        toast.error(legErr || d.error || "Resubmission failed again");
        const fres = await fetch(`/api/client/stops/${encodeURIComponent(stopId)}`);
        const fd = (await fres.json().catch(() => null)) as { stop?: FullStop } | null;
        if (fd?.stop) setFull(fd.stop);
      }
    } catch {
      toast.error("Couldn't reach dispatch — try again");
    } finally {
      setRetrying(false);
    }
  };
  const ac = statusAccent(status);
  const tid = full?.stop_id ?? summary.stop_id;
  const street = full?.address.street ?? summary.address;
  const city = full?.address.city ?? summary.city;
  const state = full?.address.state ?? summary.state;
  const zip = full?.address.zip ?? summary.zip;
  const driver = full?.assignment.driver_name ?? summary.driver_name;
  const route = full?.assignment.route_title ?? summary.route_title;
  // Read-only delivery zone (backfilled on the record). Detail exposes it top-level
  // as `route_zone` (stops + drafts); the list summary exposes it as `zone`.
  const routeZone = full?.route_zone ?? summary.zone ?? null;
  const fullAddr = [street, city, state, zip].filter(Boolean).join(", ");
  const _isTransit = TRANSIT.includes(status);

  const tools = [
    { Icon: Copy, tip: "Duplicate", fn: () => null, danger: false },
    { Icon: Trash2, tip: "Delete", fn: () => setDeleteOpen(true), danger: true },
    // Replaced the Sync Spoke (RefreshCw) action with Print Label.
    { Icon: Printer, tip: "Print Label", fn: () => setPrintOpen(true), danger: false },
    {
      Icon: Phone,
      tip: "Call",
      fn: () => {
        if (full?.recipient.phone) window.open(`tel:${full.recipient.phone}`);
      },
      danger: false,
    },
    {
      Icon: MessageSquare,
      tip: "SMS",
      fn: () => {
        if (full?.recipient.phone) window.open(`sms:${full.recipient.phone}`);
      },
      danger: false,
    },
    {
      Icon: Navigation,
      tip: "Google Maps",
      fn: () => window.open(`https://maps.google.com/?q=${encodeURIComponent(fullAddr)}`, "_blank"),
      danger: false,
    },
    {
      Icon: ExternalLink,
      tip: "Open full",
      fn: () => window.open(`/dashboard/search?stop=${tid}`, "_blank"),
      danger: false,
    },
    {
      Icon: Link2,
      tip: "Copy link",
      fn: () => {
        navigator.clipboard.writeText(tid).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      },
      danger: false,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* ── Header — search-panel style ───────────────────── */}
      <div className={cn("sticky top-0 z-10 shrink-0 border-b bg-card", ac.border)}>
        {/* 3px top bar */}
        <div className={cn("h-[3px] w-full", ac.bar)} />
        {/* Single subtle gradient — matches search panel from-{color}/12 */}
        <div
          className={cn("pointer-events-none absolute inset-0 top-[3px] bg-gradient-to-b", ac.glow, "to-transparent")}
        />

        {/* Tools row — RTL hyperlink at the spec'd 11px; icons tightened
            to gap-1, size-3.5 already matches. */}
        <div className="relative flex items-center justify-between px-4 pt-2.5 pb-2">
          <div className="flex items-center gap-2">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="font-mono text-[10px] text-primary dark:text-white/80 hover:underline"
            >
              {!isDraft && tid ? tid : "Tracking Pending"}
            </a>
            <AnimatePresence>
              {autoSaved && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-0.5 font-semibold text-[10px] text-emerald-600"
                >
                  <CheckCircle2 className="size-2.5" />
                  Saved
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-1">
            {tools.map(({ Icon, tip, fn, danger }) => (
              <button
                key={tip}
                type="button"
                onClick={fn}
                title={tip}
                aria-label={tip}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-all",
                  tip === "Copy link" && copied
                    ? "text-emerald-500"
                    : danger
                      ? "text-muted-foreground/60 hover:bg-rose-500/10 hover:text-rose-500"
                      : "text-muted-foreground/60 hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
              </button>
            ))}
            <div className="mx-1 h-4 w-px bg-border/60" />
            <button
              type="button"
              onClick={onClose}
              title="Close"
              aria-label="Close panel"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground/60 transition-all hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Identity block */}
        <div className="relative px-4 pb-3">
          {(() => {
            const fullName = toTitle(recipName || full?.recipient.name || summary.recipient_name || "");
            const streetVal = isDraft ? toTitle(draftData?.delivery_address || "") : toTitle(street || "");
            const cityVal = isDraft
              ? [toTitle(draftData?.delivery_city || ""), draftData?.delivery_state, draftData?.delivery_zip]
                  .filter(Boolean)
                  .join(", ")
              : [toTitle(city), state, zip].filter(Boolean).join(", ");
            return fullName ? (
              <>
                <p className="font-bold text-base text-foreground leading-tight tracking-tight">{fullName}</p>
                <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground/70 leading-tight">
                  {streetVal || "—"}
                </p>
                {cityVal && <p className="truncate text-[11px] text-muted-foreground/55">{cityVal}</p>}
              </>
            ) : (
              <>
                <p className="font-bold text-base text-foreground leading-tight tracking-tight">{streetVal || "—"}</p>
                {cityVal && <p className="mt-0.5 truncate text-xs text-muted-foreground/70">{cityVal}</p>}
              </>
            );
          })()}
          {/* Badges row — every badge is rounded-full text-[10px] (per spec).
              Emoji prefixes dropped (rendered inconsistently across OS /
              looked toy-like beside the enterprise typography). Status is the
              authoritative pill; type / pkg / flags are quieter chips. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {/* Status — primary, colored ring badge */}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                isDraft
                  ? "bg-violet-50 text-violet-600 ring-violet-200/60 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30"
                  : DELIVERED.includes(status)
                    ? "bg-emerald-50 text-emerald-600 ring-emerald-200/60 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
                    : TRANSIT.includes(status)
                      ? "bg-blue-50 text-blue-600 ring-blue-200/60 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30"
                      : FAILED.includes(status)
                        ? "bg-rose-50 text-rose-600 ring-rose-200/60 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30"
                        : "bg-amber-50 text-amber-600 ring-amber-200/60 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
              )}
            >
              {statusLabel(status)}
            </span>
            {/* Stop type */}
            {stopType && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
                {toTitle(stopType)}
              </span>
            )}
            {/* Package type */}
            {(() => {
              const ptId =
                pkg || (isDraft ? (draftData?.package_type ?? "rx") : (full?.package.type ?? summary.package_type));
              const meta = PKG_TYPES.find((p) => p.id === ptId);
              return meta ? (
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
                  {meta.l}
                </span>
              ) : null;
            })()}
            {/* Special flags */}
            {(serviceType === "same_day" || serviceType === "express") && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200/60 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
                {serviceType === "same_day" ? "Same Day" : "Express"}
              </span>
            )}
            {(full?.package.requires_signature || sig) && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-blue-200/60 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30">
                Sig. Req.
              </span>
            )}
            {(full?.service.collect_payment || cod) && (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700 ring-1 ring-teal-200/60 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/30">
                {parseFloat(codAmt || "0") > 0 ? fmtCurrency(codAmt) : "COD"}
              </span>
            )}
            {(full?.package.cold_chain || coldChain) && (
              <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-700 ring-1 ring-cyan-200/60 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/30">
                Cold Chain
              </span>
            )}
            {(gate || full?.address.gate_code) && (
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground ring-1 ring-border">
                {gate || full?.address.gate_code}
              </span>
            )}
            {/* Drop-off preference */}
            {(dropPref || full?.address.drop_preference) &&
              dropLabel(dropPref || full?.address.drop_preference || "") && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
                  {dropLabel(dropPref || full?.address.drop_preference || "")}
                </span>
              )}
          </div>
          {/* Driver */}
          {driver && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <Truck className="size-3 text-muted-foreground/60" aria-hidden="true" />
              <span className="font-medium text-[11px] text-muted-foreground">{toTitle(driver)}</span>
              {route && (
                <span className="text-[10px] text-muted-foreground/60">
                  · {route.length > 22 ? `${route.slice(0, 22)}…` : route}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Status tracker */}
        <StopStatusTracker status={status} />

        {/* Q-RETRY — failed-submission strip: reason + resubmit. Shows for a
            recovered draft (status fell back to "draft" + submit_error) as well
            as the legacy submit_failed status. */}
        {!isDraft && (status === "submit_failed" || !!full?.submit_error) && (
          <div className="mx-3 mb-3 rounded-lg border border-rose-200/60 bg-rose-50 px-3 py-2.5 dark:border-rose-500/30 dark:bg-rose-500/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[11px] text-rose-700 dark:text-rose-300">
                  Submit failed — fix &amp; resubmit
                </p>
                {(full?.submit_error?.reason || full?.dispatch_sync?.error) && (
                  <p
                    className="mt-0.5 truncate text-[11px] text-rose-600/80 dark:text-rose-300/70"
                    title={full?.submit_error?.reason || full?.dispatch_sync?.error}
                  >
                    {full?.submit_error?.reason || full?.dispatch_sync?.error}
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                className="h-7 shrink-0 gap-1.5 bg-rose-600 px-2.5 text-[11px] text-white hover:bg-rose-700"
                disabled={retrying}
                onClick={handleRetrySubmission}
              >
                {retrying ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCcw className="size-3" aria-hidden="true" />
                )}
                Retry submission
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="custom-scroll min-h-0 flex-1 overflow-y-auto bg-card">
        {/* ── Tab bar ── */}
        <div className="sticky top-0 z-10 flex shrink-0 border-b border-border/50 bg-card">
          {(["details", "notes", "gate-codes", "history"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setPanelTab(tab)}
              className={cn(
                // h-8 (was h-9) makes the panel feel less chunky per spec
                "h-8 border-b-2 px-3 text-[11px] font-medium transition-colors",
                panelTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground/60 hover:text-foreground",
              )}
            >
              {tab === "details" ? (
                "Details"
              ) : tab === "notes" ? (
                <span className="flex items-center gap-1.5">
                  Notes
                  {internalNotes.length > 0 && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary dark:bg-primary/25 dark:text-white/90">
                      {internalNotes.length}
                    </span>
                  )}
                </span>
              ) : tab === "history" ? (
                "History"
              ) : (
                <span className="flex items-center gap-1.5">
                  Gate Codes
                  {gateCodesData.length > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 font-semibold text-[10px] text-muted-foreground">
                      {gateCodesData.length}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Details tab ── */}
        {panelTab === "details" &&
          (loading ? (
            <div className="space-y-4 p-4">
              {[1, 2, 3].map((s) => (
                <div key={s} className="space-y-2">
                  <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted/60" />
                  {[1, 2, 3].map((r) => (
                    <div key={r} className="flex justify-between">
                      <div className="h-3 w-1/4 animate-pulse rounded bg-muted/40" />
                      <div className="h-3 w-1/3 animate-pulse rounded bg-muted/40" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Quick Notes (CEO-locked 2026-06-12): the old Driver Notes field
                wrote package.notes, which FastAPI forwards to the SPOKE DRIVER
                NOTE — tenants/members must not send driver instructions (that's
                the dispatcher's job). Repurposed: appends to the SAME
                internal_notes list the Notes tab uses (same endpoint/shape,
                author from session). Save via confirm modal on blur-with-text;
                no extra button (avoids confusion with the draft approve CTA). */}
              <div className="border-b border-border/60 bg-card px-3 py-2.5">
                <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                  <MessageSquare className="size-3 text-muted-foreground/50" aria-hidden="true" />
                  Quick Notes
                </label>
                <textarea
                  value={quickNote}
                  maxLength={500}
                  onChange={(e) => setQuickNote(e.target.value)}
                  onBlur={() => {
                    if (quickNote.trim()) setQuickNoteModalOpen(true);
                  }}
                  placeholder="Add a quick note about this stop…"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground leading-relaxed shadow-sm outline-none transition-colors placeholder:text-muted-foreground/35 focus:border-primary focus:ring-2 focus:ring-primary/10 dark:bg-background"
                />
              </div>

              {/* Recipient — read-only (Spoke-owned identity) */}
              <FormSection
                title="Recipient"
                icon="👤"
                defaultOpen
                summary={recipName ? toTitle(recipName) : full ? toTitle(full.recipient.name) : ""}
              >
                <ReadRow
                  label="Full Name"
                  required
                  value={recipName || full?.recipient.name || null}
                  editable
                  onChange={(v) => {
                    setRecipName(v);
                    setValidationErrors((e) => {
                      const n = { ...e };
                      delete n.name;
                      return n;
                    });
                    scheduleAutoSave({ recipient: { name: v.toUpperCase() } });
                    onBasicInfoChange?.({ recipient_name: v.toUpperCase() });
                  }}
                  placeholder="Full name"
                />
                {validationErrors.name && (
                  <p className="px-3 pt-0.5 font-medium text-[11px] text-rose-500">{validationErrors.name}</p>
                )}
                <ReadRow
                  label="Phone #"
                  required
                  value={
                    recipPhone ? fmtPhone(recipPhone) : full?.recipient.phone ? fmtPhone(full.recipient.phone) : null
                  }
                  editable
                  onChange={(v) => {
                    const formatted = fmtPhone(v);
                    setRecipPhone(formatted);
                    setValidationErrors((e) => {
                      const n = { ...e };
                      delete n.phone;
                      return n;
                    });
                    const e164 = phoneToE164(formatted);
                    if (e164) {
                      scheduleAutoSave({ recipient: { phone: e164 } });
                      onBasicInfoChange?.({ recipient_phone: e164 });
                    }
                  }}
                  placeholder="(555) 123-4567"
                  inputMode="tel"
                />
                {validationErrors.phone && (
                  <p className="px-3 pt-0.5 font-medium text-[11px] text-rose-500">{validationErrors.phone}</p>
                )}
                <ReadRow
                  label="Email"
                  value={recipEmail || full?.recipient.email || null}
                  editable
                  onChange={(v) => {
                    setRecipEmail(v);
                    setValidationErrors((e) => {
                      const n = { ...e };
                      delete n.email;
                      return n;
                    });
                    if (!v || isValidEmail(v)) scheduleAutoSave({ recipient: { email: v || null } });
                  }}
                  placeholder="email@example.com"
                />
                {validationErrors.email && (
                  <p className="px-3 pt-0.5 font-medium text-[11px] text-rose-500">{validationErrors.email}</p>
                )}
                {!validationErrors.email && recipEmail && !isValidEmail(recipEmail) && (
                  <p className="-mt-1 px-3 font-medium text-[10px] text-rose-500">Invalid email format</p>
                )}
                <ReadRow
                  label="Date of Birth"
                  value={recipDob || full?.recipient.dob || null}
                  editable
                  inputMode="numeric"
                  onChange={(v) => {
                    const formatted = fmtDob(v);
                    setRecipDob(formatted);
                    setValidationErrors((e) => {
                      const n = { ...e };
                      delete n.dob;
                      return n;
                    });
                    if (formatted.length === 10 && isValidDob(formatted)) {
                      scheduleAutoSave({ recipient: { dob: formatted } });
                    }
                  }}
                  placeholder="MM/DD/YYYY"
                />
                {validationErrors.dob && (
                  <p className="px-3 pt-0.5 font-medium text-[11px] text-rose-500">{validationErrors.dob}</p>
                )}
                {/* Stop Type + Pkg Type moved here from Package section */}
                <FieldRow label="Stop Type">
                  <Select
                    value={stopType}
                    onValueChange={(v) => {
                      setStopType(v as "delivery" | "pickup");
                      scheduleAutoSave({ stop_type: v });
                    }}
                  >
                    <SelectTrigger className="h-7 w-[130px] justify-end gap-1 border-0 bg-transparent pr-1 font-medium text-xs text-foreground focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="delivery" className="text-xs">
                        Delivery
                      </SelectItem>
                      <SelectItem value="pickup" className="text-xs">
                        Pickup
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>
                <FieldRow label="Package Type">
                  <Select
                    value={pkg}
                    onValueChange={(v) => {
                      setPkg(v);
                      scheduleAutoSave({ package: { type: v } });
                    }}
                  >
                    <SelectTrigger className="h-7 w-[130px] justify-end gap-1 border-0 bg-transparent pr-1 font-medium text-xs text-foreground focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {PKG_TYPES.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
                {/* Service Type + Delivery Date — moved here from the (removed)
                  Service section; behavior and data mapping unchanged. */}
                <FieldRow label="Service Type">
                  <Select
                    value={serviceType}
                    onValueChange={(v) => {
                      setServiceType(v);
                      // Auto-derive Delivery Date based on service tier.
                      // - local / nextday → tomorrow
                      // - same_day / express → today
                      // - return → leave the existing date untouched
                      const today = new Date();
                      const local = (d: Date) => {
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, "0");
                        const day = String(d.getDate()).padStart(2, "0");
                        return `${y}-${m}-${day}`;
                      };
                      let nextDate: string | null = null;
                      if (v === "local" || v === "nextday") {
                        const tmrw = new Date(today);
                        tmrw.setDate(tmrw.getDate() + 1);
                        nextDate = local(tmrw);
                      } else if (v === "same_day" || v === "express") {
                        nextDate = local(today);
                      }
                      if (nextDate) {
                        setServiceDate(nextDate);
                        scheduleAutoSave({ service: { type: v, date: nextDate } });
                      } else {
                        scheduleAutoSave({ service: { type: v } });
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 w-[140px] justify-end gap-1 border-0 bg-transparent pr-1 font-medium text-xs text-foreground focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="local" className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <Truck className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> Next Day
                        </span>
                      </SelectItem>
                      <SelectItem value="same_day" className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <Zap className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> Same Day
                        </span>
                      </SelectItem>
                      <SelectItem value="express" className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <Flame className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> Express
                        </span>
                      </SelectItem>
                      <SelectItem value="return" className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <RotateCcw className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> Return
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>
                <FieldRow label="Delivery Date">
                  {(() => {
                    const t = new Date();
                    const todayLocal = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
                    return (
                      <input
                        type="date"
                        value={serviceDate}
                        min={todayLocal}
                        onChange={(e) => {
                          const v = e.target.value;
                          setServiceDate(v);
                          if (v === todayLocal && serviceType !== "same_day") {
                            setServiceType("same_day");
                            scheduleAutoSave({ service: { date: v, type: "same_day" } });
                          } else {
                            scheduleAutoSave({ service: { date: v || null } });
                          }
                        }}
                        className="cursor-pointer border-0 bg-transparent font-medium text-xs text-foreground outline-none focus:ring-0"
                      />
                    );
                  })()}
                </FieldRow>
                {/* Route Zone — READ ONLY. Backfilled on the record; never computed
                  or sent from the UI. Resolves for submitted stops and drafts alike
                  via routeZone (full.route_zone ?? summary.zone). */}
                <FieldRow label="Route Zone">
                  {routeZone ? (
                    <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-medium text-[11px] text-foreground leading-snug">
                      {routeZone}
                    </span>
                  ) : (
                    <span className="font-medium text-xs text-muted-foreground">—</span>
                  )}
                </FieldRow>
                {/* Payment / COD — moved here from the standalone Payment section.
                  Same state + autosave bindings: writes service.collect_payment /
                  service.cod_amount (the PATCH proxy maps them under body.service). */}
                <div className="mt-2 px-3 pb-2">
                  <button
                    type="button"
                    onClick={() => setPayOpen((v) => !v)}
                    className="mb-2 flex items-center gap-1 font-semibold text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronDown className={cn("size-3 transition-transform", payOpen && "rotate-180")} />
                    Payment / COD
                  </button>
                  <AnimatePresence initial={false}>
                    {payOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        <FieldRow label="Collect on Delivery">
                          <Toggle
                            color="teal"
                            value={cod}
                            onChange={(v) => {
                              setCod(v);
                              scheduleAutoSave({
                                service: { collect_payment: v, cod_amount: v ? parseFloat(codAmt) || 0 : 0 },
                              });
                            }}
                          />
                        </FieldRow>
                        <AnimatePresence initial={false}>
                          {cod && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              <FieldRow label="COD Amount">
                                <div className="flex items-center gap-1">
                                  <span className="font-bold text-[13px] text-muted-foreground">$</span>
                                  <input
                                    value={codAmt}
                                    inputMode="decimal"
                                    min="0"
                                    max="9999"
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/[^0-9.]/g, "");
                                      setCodAmt(v);
                                      setValidationErrors((er) => {
                                        const n = { ...er };
                                        delete n.cod;
                                        return n;
                                      });
                                      scheduleAutoSave({ service: { cod_amount: parseFloat(v) || 0 } });
                                    }}
                                    onBlur={(e) => {
                                      const num = parseFloat(e.target.value);
                                      if (!Number.isNaN(num)) setCodAmt(num.toFixed(2));
                                    }}
                                    placeholder="0.00"
                                    className="h-7 w-24 rounded-none border-0 border-transparent border-b bg-transparent text-right font-semibold text-xs text-foreground outline-none transition-colors focus:border-primary/40 focus:ring-0"
                                  />
                                </div>
                              </FieldRow>
                              {validationErrors.cod && (
                                <p className="px-3 pt-0.5 font-medium text-[11px] text-rose-500">
                                  {validationErrors.cod}
                                </p>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </FormSection>

              {/* Pickup Location — collapsible to match the other sections */}
              <FormSection
                title="Pickup Location"
                icon="🏥"
                defaultOpen={false}
                summary={toTitle(localPickup?.name || "")}
              >
                <div className="pt-1">
                  {isDraft ? (
                    <PickupSelector
                      locations={pickupLocations ?? []}
                      selected={localPickup}
                      onSelect={(l) => {
                        setLocalPickup(l);
                        onPickupChange?.(l);
                        fetch("/api/client/draft-stops", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            draft_id: draftData?.draft_id,
                            pickup_address: l.address,
                            pickup_location_id: l.id,
                            pickup_name: l.name,
                            pickup_city: l.city ?? "",
                            pickup_state: l.state ?? "FL",
                            pickup_zip: l.zip ?? "",
                            pickup_code: l.code ?? undefined,
                          }),
                        })
                          .then(() => toast.success("Pickup updated"))
                          .catch(() => {});
                      }}
                    />
                  ) : (
                    <div className="flex items-start gap-2 rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
                      <MapPin className="mt-0.5 size-3 shrink-0 text-primary/60" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-xs text-foreground">{localPickup?.name || "—"}</p>
                        {localPickup?.address && (
                          <p className="truncate text-[11px] text-muted-foreground">{localPickup.address}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </FormSection>

              {/* Delivery Address — summary surfaces drop-off (emoji + label) when chosen, falls back to street */}
              <FormSection
                title="Delivery Address"
                icon="🎯"
                defaultOpen={false}
                summary={dropLabel(dropPref) || (localDeliveryStreet || street || "").split(",")[0]}
              >
                <div className="pt-1 pb-1">
                  {editingDeliveryAddr && !addressLocked ? (
                    <div className="space-y-1">
                      <AddrSearch
                        placeholder="Search new delivery address…"
                        autoFocus
                        /* Pre-fill with the current saved address so the user can
                         see + edit what's there. Local state is NEVER touched
                         while they type — only onSelect (valid place pick)
                         updates it + autosaves. The X clears the input text
                         (so users can clear-and-retype to see Google
                         autocomplete) but does NOT exit edit mode and does
                         NOT touch saved state. Partial / blurred / cleared
                         text therefore never overwrites a valid stored
                         address. */
                        defaultValue={[
                          localDeliveryStreet || street,
                          localDeliveryCity || city,
                          localDeliveryState || state,
                          localDeliveryZip || zip,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                        onSelect={(rawAddr) => {
                          // Normalize first — strips blob city/state/zip out of street,
                          // dedupes a trailing standalone state, canonicalizes FL + 5-digit zip.
                          const addr = normalizeAddress(rawAddr);
                          // Guard: only accept a place result that parsed at least a street
                          // (Google sometimes returns predictions w/ no street component —
                          //  those shouldn't overwrite the saved address).
                          if (!addr.street || addr.street.trim().length < 3) {
                            setEditingDeliveryAddr(false);
                            return;
                          }
                          const normState = addr.state || "FL";
                          setLocalDeliveryStreet(addr.street);
                          setLocalDeliveryCity(addr.city);
                          setLocalDeliveryState(normState);
                          setLocalDeliveryZip(addr.zip);
                          // Clear stale address validation errors now that a valid pick landed.
                          setValidationErrors((e) => {
                            const n = { ...e };
                            delete n.delivery_address;
                            delete n.delivery_city;
                            delete n.delivery_zip;
                            return n;
                          });
                          // Sync the FullStop snapshot the header reads from so
                          // the in-panel header reflects the change immediately
                          // (without waiting for a re-fetch).
                          setFull((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  address: {
                                    ...prev.address,
                                    street: addr.street,
                                    city: addr.city,
                                    state: normState,
                                    zip: addr.zip,
                                  },
                                }
                              : prev,
                          );
                          // Propagate up so the parent can sync activeDraft/selected
                          // AND the corresponding drafts/stops left-list row.
                          onAddressChange?.({ ...addr, state: normState });
                          toast.success("Address updated");
                          // Immediate save (no debounce) so header updates instantly
                          fetch(
                            isDraft ? "/api/client/draft-stops" : `/api/client/stops/${encodeURIComponent(stopId)}`,
                            {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(
                                isDraft
                                  ? {
                                      draft_id: draftData?.draft_id,
                                      delivery_address: addr.street,
                                      delivery_city: addr.city,
                                      delivery_state: normState,
                                      delivery_zip: addr.zip,
                                    }
                                  : {
                                      address: {
                                        street: addr.street,
                                        city: addr.city,
                                        state: normState,
                                        zip: addr.zip,
                                        lat: addr.lat,
                                        lng: addr.lng,
                                      },
                                    },
                              ),
                            },
                          ).catch(() => {});
                          setEditingDeliveryAddr(false);
                        }}
                        /* Intentionally NO onClear — X just clears the input
                         text so the user can type a fresh search. Cancel
                         button below provides the exit. */
                      />
                      <button
                        type="button"
                        onClick={() => setEditingDeliveryAddr(false)}
                        className="font-medium text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => (addressLocked ? setAddrLockedOpen(true) : setEditingDeliveryAddr(true))}
                      onFocus={() => {
                        if (addressLocked) setAddrLockedOpen(true);
                      }}
                      className={cn(
                        "group mb-2 flex w-full items-center gap-2 rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-left transition-colors",
                        addressLocked ? "cursor-not-allowed opacity-60" : "hover:border-primary/40 hover:bg-accent/20",
                      )}
                    >
                      <MapPin
                        className={cn(
                          "size-3 shrink-0",
                          addressLocked ? "text-muted-foreground/50" : "text-primary/60",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate font-semibold text-xs",
                            addressLocked ? "text-muted-foreground" : "text-foreground",
                          )}
                        >
                          {toTitle(localDeliveryStreet || street || "—")}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {[toTitle(localDeliveryCity || city), localDeliveryState || state, localDeliveryZip || zip]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      </div>
                      {addressLocked ? (
                        <Lock className="size-3 shrink-0 text-muted-foreground/40" />
                      ) : (
                        <PenLine className="size-3 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary/60" />
                      )}
                    </button>
                  )}
                </div>
                <FieldRow label="Gate Code">
                  <input
                    value={gate}
                    maxLength={20}
                    onChange={(e) => {
                      const v = e.target.value.slice(0, 20);
                      setGate(v);
                      setValidationErrors((er) => {
                        const n = { ...er };
                        delete n.gate;
                        return n;
                      });
                      scheduleAutoSave({ address: { gate_code: v || null } });
                    }}
                    placeholder="Access code…"
                    className={INPUT_CLS}
                  />
                </FieldRow>
                {validationErrors.gate && (
                  <p className="px-3 pt-0.5 font-medium text-[11px] text-rose-500">{validationErrors.gate}</p>
                )}
                <FieldRow label="Drop-off">
                  <Select
                    value={dropPref || undefined}
                    onValueChange={(v) => {
                      setDropPref(v);
                      scheduleAutoSave({ address: { drop_preference: v } });
                    }}
                  >
                    <SelectTrigger className="h-7 w-[140px] justify-end gap-1 border-0 bg-transparent pr-1 font-medium text-xs text-foreground focus:ring-0">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {DROP_OPTIONS.map((o) => (
                        <SelectItem key={o.v} value={o.v} className="text-xs">
                          <span className="flex items-center gap-1.5">
                            <o.icon className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> {o.v}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
              </FormSection>

              {/* Package */}
              <FormSection
                title="Package"
                icon="📦"
                defaultOpen={false}
                summary={PKG_TYPES.find((p) => p.id === pkg)?.l ?? toTitle(pkg)}
              >
                <div className="mt-2">
                  <FieldRow label="Rx #">
                    <input
                      value={rxNumber}
                      maxLength={30}
                      onChange={(e) => {
                        const v = e.target.value.slice(0, 30);
                        setRxNumber(v);
                        scheduleAutoSave({ package: { rx_number: v || null } });
                      }}
                      className={INPUT_CLS}
                    />
                  </FieldRow>
                  <FieldRow label="Internal Note">
                    <input
                      value={dpNote}
                      onChange={(e) => {
                        setDpNote(e.target.value);
                        scheduleAutoSave({ package: { dp_note: e.target.value || null } });
                      }}
                      placeholder="Internal note…"
                      className={INPUT_CLS}
                    />
                  </FieldRow>
                  <FieldRow label="Cold Chain">
                    <Toggle
                      value={coldChain}
                      onChange={(v) => {
                        setColdChain(v);
                        scheduleAutoSave({ package: { cold_chain: v } });
                      }}
                    />
                  </FieldRow>
                  <FieldRow label="Sig. Required">
                    <Toggle
                      value={sig}
                      onChange={(v) => {
                        setSig(v);
                        scheduleAutoSave({ package: { requires_signature: v } });
                      }}
                    />
                  </FieldRow>
                </div>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setDimsOpen((v) => !v)}
                    className="mb-2 flex items-center gap-1 font-semibold text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronDown className={cn("size-3 transition-transform", dimsOpen && "rotate-180")} />
                    Dimensions
                  </button>
                  <AnimatePresence initial={false}>
                    {dimsOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2">
                          <FieldRow label="Weight">
                            <div className="flex items-center gap-1">
                              <input
                                value={weightOz}
                                onChange={(e) => {
                                  setWeightOz(e.target.value);
                                  scheduleAutoSave({ package: { weight_oz: Number(e.target.value) || 8 } });
                                }}
                                className="h-7 w-16 rounded-none border-0 border-transparent border-b bg-transparent text-right font-medium text-xs text-foreground outline-none transition-colors focus:border-primary/40 focus:ring-0"
                              />
                              <span className="text-muted-foreground text-xs">oz</span>
                            </div>
                          </FieldRow>
                          <FieldRow label="Dimensions">
                            <div className="flex items-center gap-1">
                              <input
                                value={lengthIn}
                                onChange={(e) => {
                                  setLengthIn(e.target.value);
                                  scheduleAutoSave({ package: { length_in: Number(e.target.value) || 10 } });
                                }}
                                className="h-7 w-12 rounded-none border-0 border-transparent border-b bg-transparent text-right font-medium text-xs text-foreground outline-none transition-colors focus:border-primary/40 focus:ring-0"
                              />
                              <span className="text-muted-foreground text-xs">×</span>
                              <input
                                value={widthIn}
                                onChange={(e) => {
                                  setWidthIn(e.target.value);
                                  scheduleAutoSave({ package: { width_in: Number(e.target.value) || 7 } });
                                }}
                                className="h-7 w-12 rounded-none border-0 border-transparent border-b bg-transparent text-right font-medium text-xs text-foreground outline-none transition-colors focus:border-primary/40 focus:ring-0"
                              />
                              <span className="text-muted-foreground text-xs">×</span>
                              <input
                                value={heightIn}
                                onChange={(e) => {
                                  setHeightIn(e.target.value);
                                  scheduleAutoSave({ package: { height_in: Number(e.target.value) || 2 } });
                                }}
                                className="h-7 w-12 rounded-none border-0 border-transparent border-b bg-transparent text-right font-medium text-xs text-foreground outline-none transition-colors focus:border-primary/40 focus:ring-0"
                              />
                              <span className="text-muted-foreground text-xs">in</span>
                            </div>
                          </FieldRow>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </FormSection>

              {/* Service */}
              {/* Service section removed — Service Type + Delivery Date now live in
                the Recipient section under Package Type (same state + autosave). */}

              {/* Payment section removed — Collect on Delivery + COD Amount now
                live in the Recipient section as the "Payment / COD" collapsible
                (same state + autosave; still writes service.collect_payment /
                service.cod_amount). */}

              {/* Order Info — read only */}
              <FormSection title="Order Info" icon="🔍" defaultOpen={false}>
                <ReadRow label="Tracking #" value={tid} mono />
                <ReadRow label="Status" value={statusLabel(status)} />
                <ReadRow label="Stop Type" value={toTitle(full?.stop_type ?? summary.stop_type)} />
                <ReadRow label="Order Ref" value={full?.order_ref ?? undefined} mono />
                <ReadRow label="Created At" value={`${fmtTime(full?.created_at ?? summary.created_at)}`} />
                <ReadRow
                  label="Order Total"
                  value={
                    (full?.total_price ?? summary.total_price) > 0
                      ? `$${(full?.total_price ?? summary.total_price).toFixed(2)}`
                      : undefined
                  }
                />
              </FormSection>
            </>
          ))}

        {/* ── Notes tab ── */}
        {panelTab === "notes" && (
          <div className="flex flex-col bg-card">
            {/* Compose */}
            <div className="border-b border-border/50 px-3 py-2.5">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlePostNote();
                }}
                placeholder="Add a note, instruction, or update…"
                rows={2}
                maxLength={500}
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground/40">{noteText.length}/500 · Cmd+Enter to send</span>
                <Button
                  type="button"
                  size="sm"
                  className="h-6 gap-1 px-2.5 text-[11px]"
                  disabled={!noteText.trim() || postingNote}
                  onClick={handlePostNote}
                >
                  {postingNote ? (
                    <Loader2 className="size-2.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ArrowUp className="size-2.5" aria-hidden="true" />
                  )}
                  Post
                </Button>
              </div>
            </div>

            {/* Timeline */}
            {internalNotes.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[11px] text-muted-foreground/50">No notes yet</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/35">Add an instruction or update above</p>
              </div>
            ) : (
              <div className="relative px-3 py-2">
                {/* Vertical connector */}
                <div className="absolute bottom-2 left-[14px] top-5 w-px bg-primary/60" />
                <div className="space-y-0">
                  {[...internalNotes].reverse().map((note, noteIdx) => {
                    const isRoutely = note.role === "dispatch" || note.role === "system";
                    const initials = note.author
                      .split(" ")
                      .map((w: string) => w[0] ?? "")
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();
                    const isLatest = noteIdx === 0;
                    return (
                      <div key={note.id} className="relative flex gap-2 pb-3 last:pb-0">
                        {/* Avatar with live pulse on most recent */}
                        <div className="relative mt-0.5 size-5 shrink-0">
                          {isLatest && (
                            <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 [animation-duration:2.5s]" />
                          )}
                          <div
                            className={cn(
                              "relative z-10 flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                              isRoutely ? "bg-primary text-white" : "bg-primary text-white",
                            )}
                          >
                            {initials}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          {/* Meta: name · company · time */}
                          <div className="mb-0.5 flex min-w-0 items-center gap-1">
                            <span className="truncate text-[11px] font-semibold capitalize text-foreground/80">
                              {note.author.toLowerCase()}
                            </span>
                            {isRoutely && note.role !== "system" && (
                              <>
                                <span className="shrink-0 text-muted-foreground/25">·</span>
                                <span className="shrink-0 text-[10px] font-medium text-primary/60">Routely</span>
                              </>
                            )}
                            {note.role === "system" && (
                              <>
                                <span className="shrink-0 text-muted-foreground/25">·</span>
                                <span className="shrink-0 text-[10px] text-muted-foreground/50">System</span>
                              </>
                            )}
                            {!isRoutely && tenantCompanyName && (
                              <>
                                <span className="shrink-0 text-muted-foreground/25">·</span>
                                <span className="shrink-0 text-[10px] font-medium capitalize text-amber-600/65">
                                  {tenantCompanyName.toLowerCase()}
                                </span>
                              </>
                            )}
                            <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground/35">
                              {fmtNoteTime(note.created_at)}
                            </span>
                          </div>
                          {/* Content */}
                          <p className="text-[11px] leading-snug text-foreground/75">{note.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── History tab ── */}
        {panelTab === "history" && <StopHistoryTimeline stopId={stopId} isDraft={isDraft} />}

        {/* ── Gate Codes tab ── */}
        {panelTab === "gate-codes" && (
          <div className="flex flex-col bg-card">
            {/* Compose */}
            <div className="border-b border-border/50 px-3 py-2.5">
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={gateCodeInput}
                  onChange={(e) => setGateCodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveGateCode();
                  }}
                  placeholder="*1234 or Call Maria at gate…"
                  maxLength={50}
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/35 focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 px-3 text-[11px] bg-primary text-white hover:bg-primary/90"
                  disabled={!gateCodeInput.trim() || savingGateCode}
                  onClick={handleSaveGateCode}
                >
                  {savingGateCode ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="size-3" aria-hidden="true" />
                  )}
                  Save
                </Button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground/40">
                Short code (e.g. *1234) or brief note (e.g. Call front desk) · {gateCodeInput.length}/50
              </p>
            </div>
            {/* Address header */}
            {gateCodesStreet && (
              <div className="border-b border-border/50 bg-muted/20 px-3 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/55">
                  Building:{" "}
                  <span className="font-mono normal-case tracking-normal text-foreground/70">{gateCodesStreet}</span>
                </p>
              </div>
            )}
            {gateCodesLoading ? (
              <div className="flex items-center justify-center gap-2 py-10">
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="text-[11px] text-muted-foreground">Looking up access codes…</span>
              </div>
            ) : gateCodesData.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[11px] text-muted-foreground/50">No access codes on file</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/35">for this address</p>
              </div>
            ) : (
              <div className="relative px-3 py-2">
                {/* Vertical connector */}
                <div className="absolute bottom-2 left-[14px] top-5 w-px bg-primary/60" />
                <div className="space-y-0">
                  {gateCodesData.map((gc, gcIdx) => {
                    const code = String(gc.gate_code ?? gc.code ?? gc.access_code ?? "");
                    const notes = String(gc.notes ?? gc.note ?? gc.description ?? "");
                    const addedBy = String(gc.added_by ?? gc.created_by ?? "Routely").toLowerCase();
                    const createdAt = String(gc.created_at ?? gc.updated_at ?? "");
                    const isLatestCode = gcIdx === 0;
                    return (
                      <div key={gcIdx} className="relative flex gap-2 pb-3 last:pb-0">
                        {/* Avatar */}
                        <div className="relative mt-0.5 size-5 shrink-0">
                          {isLatestCode && (
                            <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 [animation-duration:2.5s]" />
                          )}
                          <div className="relative z-10 flex size-5 items-center justify-center rounded-full bg-primary text-white">
                            <Hash className="size-2.5" aria-hidden="true" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          {/* Meta: added_by · building · time */}
                          <div className="mb-0.5 flex min-w-0 items-center gap-1">
                            <span className="truncate text-[11px] font-semibold capitalize text-foreground/80">
                              {addedBy}
                            </span>
                            {gateCodesStreet && (
                              <>
                                <span className="shrink-0 text-muted-foreground/25">·</span>
                                <span className="max-w-[80px] shrink-0 truncate text-[10px] text-muted-foreground/50">
                                  {gateCodesStreet.split(" ").slice(0, 3).join(" ")}
                                </span>
                              </>
                            )}
                            <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground/35">
                              {createdAt ? fmtNoteTime(createdAt) : ""}
                            </span>
                          </div>
                          {/* Code */}
                          <p className="font-mono text-[13px] font-semibold tracking-wider text-foreground">{code}</p>
                          {notes && <p className="text-[11px] leading-snug text-muted-foreground/70">{notes}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      {/* Mobile pad-bottom clears the fixed sm:hidden bottom nav (~64px) + iOS safe area */}
      {/* Dark mode: subtle top border + 1px inset highlight separates footer from dark body */}
      <div
        className={cn(
          "shrink-0 space-y-2 border-t border-border/60 bg-card px-4",
          isDraft
            ? "py-2.5 pb-[calc(72px+env(safe-area-inset-bottom,0px))] sm:pb-2.5"
            : "pt-1 pb-[calc(72px+env(safe-area-inset-bottom,0px))] sm:pb-1",
        )}
      >
        {isDraft ? (
          <>
            {submitError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-1.5 font-semibold text-[11px] text-destructive dark:bg-destructive/15">
                {submitError}
              </p>
            )}
            {!submitDone &&
              (() => {
                // Compact Review Bar above Submit Order.
                // 4 pill checks (Pickup / Recipient / Address / Service) + a small
                // completion % computed over the 6 required fields the task lists:
                //   Pickup, Full Name, Phone, Delivery Address, Service Type, Delivery Date.
                const hasPickup = Boolean(localPickup?.address || pickup?.address);
                const hasName = Boolean(recipName || full?.recipient.name);
                const hasPhone = Boolean(recipPhone || full?.recipient.phone);
                // Address counts as complete only if it normalizes to a valid
                // street + city + 5-digit zip — same rule validateForm/submit use.
                // A blob street with empty city/zip no longer shows 100%.
                const addrCheck = normalizeAddress({
                  street: localDeliveryStreet || street,
                  city: localDeliveryCity || city,
                  state: localDeliveryState || state,
                  zip: localDeliveryZip || zip,
                });
                const hasAddress = Boolean(addrCheck.street && addrCheck.city && /^\d{5}$/.test(addrCheck.zip));
                const hasSvcType = Boolean(serviceType);
                const hasSvcDate = Boolean(serviceDate);
                const checks = [
                  { label: "Pickup", ok: hasPickup },
                  { label: "Recipient", ok: hasName && hasPhone },
                  { label: "Address", ok: hasAddress },
                  { label: "Service", ok: hasSvcType && hasSvcDate },
                ];
                const required = [hasPickup, hasName, hasPhone, hasAddress, hasSvcType, hasSvcDate];
                const pct = Math.round((required.filter(Boolean).length / required.length) * 100);
                return (
                  <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 dark:bg-muted/20">
                    <div className="flex items-center gap-2 overflow-x-auto">
                      {checks.map((c) => (
                        <span
                          key={c.label}
                          className={cn(
                            "flex shrink-0 items-center gap-1 font-medium text-[10px]",
                            c.ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/60",
                          )}
                        >
                          {c.ok ? (
                            <CheckCircle2 className="size-2.5" aria-hidden="true" />
                          ) : (
                            <span
                              className="size-2 rounded-full border border-muted-foreground/40"
                              aria-hidden="true"
                            />
                          )}
                          {c.label}
                        </span>
                      ))}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 font-semibold text-[10px] tabular-nums",
                        pct === 100 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/80",
                      )}
                    >
                      {pct}% complete
                    </span>
                  </div>
                );
              })()}
            {submitDone ? (
              <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 dark:bg-emerald-500/15 dark:ring-1 dark:ring-emerald-500/30">
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-xs text-emerald-700 dark:text-emerald-300">
                  Stop submitted!
                </span>
              </div>
            ) : (
              <Button
                onClick={submitDraft}
                disabled={submitting}
                className="h-8 w-full gap-1.5 rounded-lg bg-primary font-semibold text-xs text-primary-foreground shadow-sm ring-1 ring-primary/20 hover:brightness-110 dark:ring-primary/40"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Plus className="size-3" />
                    Submit Order
                  </>
                )}
              </Button>
            )}
          </>
        ) : (
          /* Submitted/assigned stops: autosave only — no Save/Cancel buttons */
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AnimatePresence>
                {autoSaved && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5"
                  >
                    <CheckCircle2 className="size-3 text-emerald-600" />
                    <span className="font-semibold text-[11px] text-emerald-700">Saved</span>
                  </motion.div>
                )}
              </AnimatePresence>
              {!autoSaved && <span className="text-[11px] text-muted-foreground/50">Changes save automatically</span>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Print Label dialog — opened from the header Printer icon.
          Two label modes (Rx 2×1 / Shipping 4×6) live inside; this caller
          just supplies whatever fields it has. DropOff overrides force the
          From line and service chip to "Routely DropOff" / "DropOff"
          regardless of the panel's stopType state. */}
      {/* D20 explainer — why the delivery address is locked on submitted stops */}
      <AlertDialog open={addrLockedOpen} onOpenChange={setAddrLockedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Address can’t be edited</AlertDialogTitle>
            <AlertDialogDescription>
              This stop was already submitted to dispatch. To change the delivery address: delete this stop, create a
              new draft with the correct address, and approve it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setAddrLockedOpen(false)}>Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PrintLabelDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        trackingId={!isDraft && tid ? tid : ""}
        recipientName={toTitle(recipName || full?.recipient.name || summary.recipient_name || "")}
        recipientAddress={[street, city, state, zip].filter(Boolean).join(", ")}
        recipientPhone={recipPhone || (full?.recipient.phone ? fmtPhone(full.recipient.phone) : "")}
        // FROM on labels is the TENANT COMPANY NAME (constant per tenant),
        // not the pickup location (which can be one of many sites per tenant).
        fromName={tenantCompanyName}
        fromAddress={
          pickup?.id === "__dropoff__" ? "12156 W Sample Rd, Coral Springs, FL 33065" : pickup?.address || ""
        }
        serviceType={pickup?.id === "__dropoff__" ? "dropoff" : stopType}
        serviceDate={serviceDate || full?.service.date || ""}
        packageType={pkg || full?.package.type || ""}
        requiresSignature={sig}
        coldChain={coldChain}
        collectCod={cod}
        codAmount={codAmt}
        notes={full?.package.notes || ""}
        isDraft={isDraft}
      />

      {/* Quick Note — confirm-on-blur modal (no inline save button by design:
          it would compete with the draft approve CTA). */}
      <Dialog open={quickNoteModalOpen} onOpenChange={(o) => !savingQuickNote && setQuickNoteModalOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Save this note?</DialogTitle>
          </DialogHeader>
          <p className="max-h-32 overflow-y-auto whitespace-pre-line rounded-lg bg-muted/30 px-3 py-2 text-xs text-foreground/80">
            {quickNote}
          </p>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={savingQuickNote}
              onClick={() => setQuickNoteModalOpen(false)}
            >
              Keep editing
            </Button>
            <Button type="button" size="sm" disabled={savingQuickNote} onClick={handleSaveQuickNote}>
              {savingQuickNote && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — no delete happens without this modal. */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Delete this stop?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs">
            <div className="rounded-lg bg-muted/40 p-3 ring-1 ring-border/40">
              {!isDraft && tid && <p className="font-mono text-[11px] text-muted-foreground">{tid}</p>}
              <p className="font-semibold text-foreground">
                {toTitle(recipName || full?.recipient.name || summary.recipient_name || "—")}
              </p>
              <p className="text-muted-foreground">{fullAddr || "—"}</p>
            </div>
            {isDraft ? (
              <p className="text-muted-foreground">This draft will be removed. This cannot be undone.</p>
            ) : (
              <p className="text-muted-foreground">
                Both this delivery <span className="font-semibold text-foreground">and its paired pickup</span> will be
                removed from dispatch. This cannot be undone.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteOpen(false)} className="h-9">
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={confirmDelete} className="h-9">
              {deleting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete stop"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Bulk Edit Dialog ─────────────────────────────────────────────────────── */
type BulkProperty =
  | "pickup"
  | "service_type"
  | "package_type"
  | "stop_type"
  | "cold_chain"
  | "sig"
  | "delivery_date"
  | "drop_off";

const BULK_PROPS: { value: BulkProperty; label: string; icon: React.ElementType }[] = [
  { value: "pickup", label: "Pickup Location", icon: Building2 },
  { value: "service_type", label: "Service Type", icon: Truck },
  { value: "package_type", label: "Package Type", icon: Package },
  { value: "stop_type", label: "Stop Type", icon: MapPin },
  { value: "cold_chain", label: "Cold Chain", icon: Snowflake },
  { value: "sig", label: "Sig. Required", icon: PenLine },
  { value: "delivery_date", label: "Delivery Date", icon: CalendarIcon },
  { value: "drop_off", label: "Drop-off", icon: DoorOpen },
];

function BulkEditDialog({
  open,
  onOpenChange,
  draftIds,
  locations,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draftIds: string[];
  locations: PickupLocation[];
  /** Called once after a successful apply. `applied` tells the parent what
   *  was changed so it can update optimistic state (e.g. activeDraft) without
   *  waiting for the next loadDrafts round-trip. */
  onApplied: (applied: { prop: BulkProperty; pickupLocation?: PickupLocation }) => void;
}) {
  const [prop, setProp] = useState<BulkProperty>("pickup");
  const [pickupId, setPickupId] = useState<string>("");
  const [serviceType, setServiceType] = useState<string>("local");
  const [pkgType, setPkgType] = useState<PackageType>("rx");
  const [stopType, setStopType] = useState<"delivery" | "pickup" | "return">("delivery");
  const [coldChain, setColdChain] = useState(false);
  const [sig, setSig] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [dropOff, setDropOff] = useState("");
  const [applying, setApplying] = useState(false);

  // Reset every transient picker when the dialog closes so reopening starts
  // clean (was only resetting `prop` and `applying` — pickupId etc. lingered
  // and made the form look like it remembered the prior choice).
  useEffect(() => {
    if (!open) {
      setProp("pickup");
      setApplying(false);
      setPickupId("");
      setServiceType("local");
      setPkgType("rx");
      setStopType("delivery");
      setColdChain(false);
      setSig(false);
      setDeliveryDate("");
      setDropOff("");
    }
  }, [open]);

  // Default first, then everything else. Display-only sort; tenant data is not
  // mutated, just like the regular PickupSelector does.
  const sortedLocations = [...locations].sort((a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)));

  async function apply() {
    if (draftIds.length === 0) return;
    setApplying(true);
    try {
      // Build PATCH body matching the existing /api/client/draft-stops PATCH whitelist.
      // Each call updates one draft; the route's $set never touches keys not sent.
      let body: Record<string, unknown> = {};
      switch (prop) {
        case "pickup": {
          const loc = locations.find((l) => l.id === pickupId);
          if (!loc) {
            toast.error("Pick a location");
            setApplying(false);
            return;
          }
          body = {
            pickup_location_id: loc.id,
            pickup_name: loc.name,
            pickup_address: loc.address,
            pickup_city: loc.city ?? "",
            pickup_state: loc.state ?? "FL",
            pickup_zip: loc.zip ?? "",
            pickup_code: loc.code ?? undefined,
          };
          break;
        }
        case "service_type":
          body = { service: { type: serviceType } };
          break;
        case "package_type":
          body = { package: { type: pkgType } };
          break;
        case "stop_type":
          body = { stop_type: stopType };
          break;
        case "cold_chain":
          body = { package: { cold_chain: coldChain } };
          break;
        case "sig":
          body = { package: { requires_signature: sig } };
          break;
        case "delivery_date": {
          if (!deliveryDate) {
            toast.error("Pick a date");
            setApplying(false);
            return;
          }
          body = { service: { date: deliveryDate } };
          break;
        }
        case "drop_off": {
          if (!dropOff) {
            toast.error("Pick a drop-off option");
            setApplying(false);
            return;
          }
          body = { address: { drop_preference: dropOff } };
          break;
        }
      }
      const results = await Promise.allSettled(
        draftIds.map((id) =>
          fetch("/api/client/draft-stops", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ draft_id: id, ...body }),
          }).then((r) => {
            if (!r.ok) throw new Error();
          }),
        ),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const fail = results.length - ok;
      if (ok > 0) toast.success(`Updated ${ok} ${ok === 1 ? "draft" : "drafts"}`);
      if (fail > 0) toast.error(`${fail} ${fail === 1 ? "draft" : "drafts"} failed to update`);
      const pickupLocation =
        prop === "pickup" ? (sortedLocations.find((l) => l.id === pickupId) ?? undefined) : undefined;
      onApplied({ prop, pickupLocation });
      onOpenChange(false);
    } catch {
      toast.error("Bulk update failed");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Bulk edit · {draftIds.length} {draftIds.length === 1 ? "draft" : "drafts"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex min-h-[260px] gap-3">
          {/* Left: property list */}
          <div className="w-44 shrink-0 space-y-0.5 border-border/40 border-r pr-2">
            {BULK_PROPS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setProp(p.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium text-xs transition-colors",
                  prop === p.value ? "bg-primary/10 text-primary" : "text-foreground/85 hover:bg-accent",
                )}
              >
                <p.icon className="size-3.5 opacity-90" aria-hidden="true" />
                {p.label}
              </button>
            ))}
          </div>
          {/* Right: control for selected property — min-w-0 lets the flex
              child shrink so long SelectValue content can truncate instead
              of pushing the column past the dialog edge. */}
          <div className="min-w-0 flex-1 overflow-hidden px-1 pt-1 text-xs">
            {prop === "pickup" && (
              <div className="min-w-0 space-y-2">
                <label className="block font-medium text-[11px] text-muted-foreground">New pickup location</label>
                {/* Compact Select — trigger truncates, dropdown items render
                    name + address on TWO lines so long combined strings can't
                    overflow horizontally. SelectContent uses the Radix portal
                    so it never gets clipped by the dialog. */}
                <Select value={pickupId} onValueChange={setPickupId}>
                  <SelectTrigger className="h-9 w-full max-w-full text-xs">
                    <SelectValue placeholder="Choose a pickup…" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[min(420px,calc(100vw-2rem))]">
                    {sortedLocations.map((l) => (
                      <SelectItem key={l.id} value={l.id} className="text-xs">
                        <div className="flex min-w-0 flex-col">
                          <span className="flex items-center gap-1.5 truncate font-medium">
                            {toTitle(l.name)}
                            {l.is_default && (
                              <span className="rounded bg-primary/10 px-1 py-0 font-semibold text-[10px] text-primary">
                                Default
                              </span>
                            )}
                          </span>
                          {l.address && (
                            <span className="truncate text-[11px] text-muted-foreground">{l.address}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {prop === "service_type" && (
              <div className="space-y-2">
                <label className="block font-medium text-[11px] text-muted-foreground">New service type</label>
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local" className="text-xs">
                      <span className="flex items-center gap-1.5">
                        <Truck className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> Next Day
                      </span>
                    </SelectItem>
                    <SelectItem value="same_day" className="text-xs">
                      <span className="flex items-center gap-1.5">
                        <Zap className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> Same Day
                      </span>
                    </SelectItem>
                    <SelectItem value="express" className="text-xs">
                      <span className="flex items-center gap-1.5">
                        <Flame className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> Express
                      </span>
                    </SelectItem>
                    <SelectItem value="return" className="text-xs">
                      <span className="flex items-center gap-1.5">
                        <RotateCcw className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> Return
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {prop === "package_type" && (
              <div className="space-y-2">
                <label className="block font-medium text-[11px] text-muted-foreground">New package type</label>
                <Select value={pkgType} onValueChange={(v) => setPkgType(v as PackageType)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PKG_TYPES.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <p.icon className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> {p.l}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {prop === "stop_type" && (
              <div className="space-y-2">
                <label className="block font-medium text-[11px] text-muted-foreground">New stop type</label>
                <Select value={stopType} onValueChange={(v) => setStopType(v as "delivery" | "pickup")}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delivery" className="text-xs">
                      <span className="flex items-center gap-1.5">
                        <Truck className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> Delivery
                      </span>
                    </SelectItem>
                    <SelectItem value="pickup" className="text-xs">
                      <span className="flex items-center gap-1.5">
                        <Package className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> Pickup
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {prop === "cold_chain" && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
                <div>
                  <p className="flex items-center gap-1.5 font-medium text-xs">
                    <Snowflake className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> Cold Chain
                  </p>
                  <p className="text-[11px] text-muted-foreground">Mark every selected draft as cold-chain.</p>
                </div>
                <Switch checked={coldChain} onCheckedChange={setColdChain} />
              </div>
            )}
            {prop === "sig" && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
                <div>
                  <p className="flex items-center gap-1.5 font-medium text-xs">
                    <PenLine className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> Signature Required
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Require driver to capture signature on delivery.
                  </p>
                </div>
                <Switch checked={sig} onCheckedChange={setSig} />
              </div>
            )}
            {prop === "delivery_date" && (
              <div className="space-y-2">
                <label className="block font-medium text-[11px] text-muted-foreground">New delivery date</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </div>
            )}
            {prop === "drop_off" && (
              <div className="space-y-2">
                <label className="block font-medium text-[11px] text-muted-foreground">New drop-off preference</label>
                <Select value={dropOff} onValueChange={setDropOff}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {DROP_OPTIONS.map((o) => (
                      <SelectItem key={o.v} value={o.v} className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <o.icon className="size-3.5 text-muted-foreground/70" aria-hidden="true" /> {o.v}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={applying} className="bg-primary text-primary-foreground">
            {applying ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Applying…
              </>
            ) : (
              "Apply changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */
export default function StopsPage() {
  const [stops, setStops] = useState<TodayStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TodayStop | null>(null);
  const [locations, setLocations] = useState<PickupLocation[]>([]);
  const [pickup, setPickup] = useState<PickupLocation | null>(null);
  // Tenant company_name — used as FROM on printed labels (NOT the pickup
  // location, which can be one of many sites per tenant).
  const [tenantCompanyName, setTenantCompanyName] = useState<string>("Routely");
  const [pricing, setPricing] = useState<Pricing>({ price_per_stop: 14, price_per_mile: 1.5, postpay_enabled: false });
  const [statusTab, setStatusTab] = useState<"all" | "draft" | "submitted">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newAddr, setNewAddr] = useState<AddressResult | null>(null);
  // Apt / Suite / Unit — kept out of the Google-validated street; combined into
  // the delivery address on save (driver-visible) + stored as apt_unit.
  const [newApt, setNewApt] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const [activeDraft, setActiveDraft] = useState<DraftStop | null>(null);
  const [mobileTab, setMobileTab] = useState<"list" | "detail" | "map">("list");
  const _addrInputRef = useRef<HTMLInputElement>(null);

  // When 2+ stops get multi-selected, the Details/Map mobile tabs are disabled
  // (they show a single stop). If the user is sitting on one of them, fall back
  // to the Stops list so they're never stranded on a disabled tab.
  useEffect(() => {
    if (selectedIds.size >= 2 && mobileTab !== "list") setMobileTab("list");
  }, [selectedIds, mobileTab]);

  useEffect(() => {
    fetch("/api/client/tenant")
      .then((r) => r.json())
      .then((d) => {
        setPricing({
          price_per_stop: d.price_per_stop ?? 14,
          price_per_mile: d.price_per_mile ?? 1.5,
          postpay_enabled: d.postpay_enabled ?? false,
        });
        if (typeof d.company_name === "string" && d.company_name.trim()) {
          setTenantCompanyName(d.company_name.trim());
        }
        const locs: PickupLocation[] = (d.pickup_locations ?? []).map((l: Record<string, unknown>) => {
          // tenant.pickup_locations[].address may be:
          //   - a combined string "Street, City, FL ZIP" (legacy seeds)
          //   - or an object { street, city, state, zip } (current schema)
          //   - plus top-level street/city/state/zip from some seeds.
          // Coerce to a SAFE formatted string so the UI never renders "[object Object]".
          const a = l.address;
          const isAddrObj = a !== null && typeof a === "object" && !Array.isArray(a);
          const addrObj = isAddrObj ? (a as Record<string, unknown>) : {};
          const street = String(addrObj.street ?? l.street ?? "");
          const city = String(addrObj.city ?? l.city ?? "");
          const state = String(addrObj.state ?? l.state ?? "FL");
          const zip = String(addrObj.zip ?? l.zip ?? "");
          const stateZip = [state, zip].filter(Boolean).join(" ");
          const formatted = [street, city, stateZip].filter(Boolean).join(", ");
          const fullAddress = formatted || (typeof a === "string" ? a : "");
          return {
            id: String(l.location_id ?? l.id ?? ""),
            name: String(l.name ?? ""),
            address: fullAddress,
            city,
            state,
            zip,
            code: l.code ? String(l.code) : undefined,
            is_default: Boolean(l.is_default),
          };
        });
        setLocations(locs);
        setPickup(locs.find((l) => l.is_default) ?? locs[0] ?? null);
      })
      .catch(() => {});
  }, []);

  // Load today's stops AND today's drafts, merge them
  const [drafts, setDrafts] = useState<TodayStop[]>([]);

  const loadDrafts = useCallback(async () => {
    try {
      // Recovered drafts: submits that failed fell back to status "draft" +
      // submit_error in the `stops` collection (real stop_id). Surface them in
      // the Drafts list so they're visible, editable, and resubmittable.
      const [d, recoveredJson] = await Promise.all([
        fetchJsonSafe("/api/client/draft-stops?status=draft"),
        // Recovered list is auxiliary — its failure must never block drafts.
        fetchJsonSafe("/api/client/stops?filter=recovered&limit=200").catch(() => ({ stops: [] })),
      ]);
      const recovered: TodayStop[] = (((recoveredJson as { stops?: unknown[] }).stops ?? []) as Record<string, unknown>[]).map(
        (s: Record<string, unknown>) =>
          ({
            id: String(s.stop_id ?? s.id),
            stop_id: String(s.stop_id ?? s.id),
            stop_type: String(s.stop_type ?? "delivery"),
            status: "draft",
            recipient_name: String(s.recipient_name ?? ""),
            recipient_phone: String(s.recipient_phone ?? ""),
            address: String(s.delivery_address ?? ""),
            city: String(s.delivery_city ?? ""),
            state: String(s.delivery_state ?? "FL"),
            zip: String(s.delivery_zip ?? ""),
            package_type: String(s.package_type ?? "rx"),
            driver_name: null,
            route_title: null,
            // Read-only zone from the record (shapeStopForList → zone).
            zone: (s.zone as string | null) ?? null,
            total_price: 0,
            created_at: String(s.created_at ?? new Date().toISOString()),
            submit_error: (s.submit_error as { reason?: string } | null) ?? { reason: "Submit failed" },
          }) as TodayStop,
      );
      const ds: TodayStop[] = (((d as { drafts?: unknown[] }).drafts ?? []) as Record<string, unknown>[]).map(
        (dr: Record<string, unknown>) =>
          ({
            id: String(dr.draft_id),
            stop_id: String(dr.tracking_id || dr.draft_id), // show RTL-xxx if available
            stop_type: "delivery",
            status: "draft",
            recipient_name: String(dr.recipient_name || ""),
            recipient_phone: String(dr.recipient_phone || ""),
            address: String(dr.delivery_address || ""),
            city: String(dr.delivery_city || ""),
            state: String(dr.delivery_state || "FL"),
            zip: String(dr.delivery_zip || ""),
            package_type: String(dr.package_type || "rx"),
            driver_name: null,
            route_title: null,
            // Read-only zone from the draft record (/api/client/draft-stops → route_zone).
            zone: (dr.route_zone as string | null) ?? null,
            total_price: 0,
            created_at: String(dr.created_at || new Date().toISOString()),
            // Saved pickup ref — used to show the draft's actual pickup in the panel
            pickup_location_id: String(dr.pickup_location_id || ""),
            pickup_address: String(dr.pickup_address || ""),
            pickup_name: String(dr.pickup_name || ""),
          }) as TodayStop,
      );
      // Recovered (failed-submit) drafts on top so the error is seen first.
      setDrafts([...recovered, ...ds]);
    } catch {
      /* ignore */
    }
  }, []);

  // Date filter — defaults to "today" so users see today's operational queue,
  // not historical clutter. "all" returns everything; otherwise a literal
  // YYYY-MM-DD string filters drafts/stops created on that date.
  type DateFilter = "today" | "yesterday" | "tomorrow" | "all" | string;
  const localDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dateFilterToYMD = (f: DateFilter): string | null => {
    if (f === "all") return null;
    if (f === "today") return localDateStr(new Date());
    if (f === "yesterday") return localDateStr(new Date(Date.now() - 86400000));
    if (f === "tomorrow") return localDateStr(new Date(Date.now() + 86400000));
    return f; // already YYYY-MM-DD
  };
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const filterYMD = dateFilterToYMD(dateFilter);
  const filterLabel =
    dateFilter === "today"
      ? "Today"
      : dateFilter === "yesterday"
        ? "Yesterday"
        : dateFilter === "tomorrow"
          ? "Tomorrow"
          : dateFilter === "all"
            ? "All"
            : dateFilter;

  // Sequence guard: realtime catch-ups + visibility refreshes can overlap the
  // mount load; without this, a SLOWER older response lands last and
  // overwrites the newest list (stale/empty flash).
  const loadStopsSeqRef = useRef(0);
  const loadStops = useCallback(
    async (opts?: { silent?: boolean }) => {
      // Background refreshes (after a post / batch complete) skip the skeleton.
      if (!opts?.silent) setLoading(true);
      const seq = ++loadStopsSeqRef.current;
      try {
        // Server-side: route supports filter=today|week|all. For custom dates
        // we fetch all and apply the day filter on the client.
        const apiFilter = dateFilter === "today" ? "today" : "all";
        const d = await fetchJsonSafe(`/api/client/stops?filter=${apiFilter}&limit=200`);
        if (seq !== loadStopsSeqRef.current) return; // a newer load owns the list
        if (Array.isArray(d.stops)) setStops(d.stops as TodayStop[]);
      } catch {
        /* timeout / HTTP error — keep the current list on screen, never blank it */
      } finally {
        // ALWAYS drop the skeleton (fetch now has a hard 15s timeout, so this
        // is guaranteed to run — the old code could hang here forever).
        if (!opts?.silent) setLoading(false);
      }
    },
    [dateFilter],
  );

  // Submitted tab data: server-side unassigned filter (PENDING bucket +
  // no driver + no route in the Mongo query). Separate from `stops` so KPI /
  // duplicate-awareness consumers keep seeing the full set.
  const [unassignedStops, setUnassignedStops] = useState<TodayStop[]>([]);
  const loadUnassigned = useCallback(async () => {
    try {
      const d = await fetchJsonSafe("/api/client/stops?filter=unassigned&limit=200");
      if (Array.isArray(d.stops)) setUnassignedStops(d.stops as TodayStop[]);
    } catch {
      /* timeout / HTTP error — keep the current list, never blank it */
    }
  }, []);

  // One call to refresh everything the lists/tabs render after a post or a batch
  // completes — drafts, the main stops list, and the Submitted (unassigned) tab —
  // so the user never has to manually reload to see what they just submitted.
  const refreshAllLists = useCallback(() => {
    loadDrafts();
    loadUnassigned();
    loadStops({ silent: true });
  }, [loadDrafts, loadUnassigned, loadStops]);

  useEffect(() => {
    loadStops();
    loadDrafts();
    loadUnassigned();
  }, [loadStops, loadDrafts, loadUnassigned]);

  // Declared here (above the realtime hook) because the hook's `enabled` gate
  // depends on it. Batch state itself belongs to Phase D below.
  const [batchFiles, setBatchFiles] = useState<File[] | null>(null);
  // Bulk-submit state ALSO lives above the hook: while a bulk submit runs, the
  // board realtime must be OFF (same protection the OCR batch already has).
  // Measured 2026-07-12 with just 2 stops: every submitted stop fired realtime
  // events → refreshAllLists → waves of 3× /stops fetches that degraded from
  // 3s to 9.6s while COMPETING with the submits themselves (create #2 took
  // 5.4s vs 0.5s for #1). At 28 stops that's a ~300-call self-inflicted storm
  // → "1 minute per stop" + frozen UI. One refresh at the end replaces it all.
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  useRoutelyRealtime({
    channelName: "stops-board",
    tables: STOPS_REALTIME_TABLES,
    onChange: refreshAllLists,
    // Board lists are heavy (3 fetches × 2-3s): batch bursts arrive as several
    // events per stop, so amortize them harder than the 350ms default.
    debounceMs: 1200,
    refreshOnVisible: true,
    // While a batch scan is running, every draft INSERT would trigger a full
    // 4-endpoint refetch (×33 labels = self-inflicted API storm that starves
    // the very POSTs creating the drafts). Pause realtime during the batch;
    // closing the modal does ONE refreshAllLists() for the whole run.
    enabled: !batchFiles && !bulkSubmitting,
  });

  // Safety net: if the active center-panel item disappears from the list (e.g.
  // refreshed after an out-of-band delete, status filtered out, etc.), null it
  // so the panel never renders a stale form. Skips the check on initial empty
  // arrays so freshly-clicked items aren't wiped before loadDrafts finishes.
  useEffect(() => {
    if (activeDraft && drafts.length > 0 && !drafts.some((d) => d.id === activeDraft.draft_id)) {
      setActiveDraft(null);
    }
  }, [drafts, activeDraft]);
  useEffect(() => {
    // Submitted/unassigned stops live in `unassignedStops`, NOT `stops` (the
    // Submitted tab fetches filter=unassigned separately). Only clear the
    // selection when the stop is gone from BOTH lists. Previously this checked
    // `stops` only, which wiped every Submitted-tab selection the instant it
    // was clicked, since unassigned rows never live in `stops`.
    if (
      selected &&
      (stops.length > 0 || unassignedStops.length > 0) &&
      !stops.some((s) => s.id === selected.id) &&
      !unassignedStops.some((s) => s.id === selected.id)
    ) {
      setSelected(null);
    }
  }, [stops, unassignedStops, selected]);

  // All items = drafts + stops, sorted newest first
  // Pickup the panel should display for the currently open item — prefers the
  // saved pickup_location_id over the global tenant default so a bulk-updated
  // draft (or any draft that explicitly saved a non-default pickup) shows the
  // RIGHT pickup, not the global default.
  const effectivePickup = useMemo<PickupLocation | null>(() => {
    const id = activeDraft?.pickup_location_id || selected?.pickup_location_id;
    // DropOff is a synthetic option (not in tenant.pickup_locations).
    // Resolve to the same object the PickupSelector renders so the panel
    // shows "DropOff" instead of falling back to the tenant default.
    if (id === "__dropoff__") {
      return { id: "__dropoff__", name: "DropOff", address: "" };
    }
    if (id) {
      const found = locations.find((l) => l.id === id);
      if (found) return found;
    }
    return pickup;
  }, [activeDraft, selected, locations, pickup]);

  const allItems = useMemo(() => {
    return [...drafts, ...stops].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [drafts, stops]);

  // Client-side date filter applied uniformly across drafts + submitted stops.
  // Server already narrows submitted to today when filter=today; this guarantees
  // drafts respect the same window, plus supports yesterday/tomorrow/custom dates.
  const filteredAllItems = useMemo(() => {
    if (!filterYMD) return allItems;
    return allItems.filter((s) => {
      if (!s.created_at) return false;
      return localDateStr(new Date(s.created_at)) === filterYMD;
    });
  }, [allItems, filterYMD, localDateStr]);

  // ALWAYS-today snapshot for the address-duplicate awareness in the new-stop
  // input — operational intent is "have we already processed this address
  // TODAY?", independent of what the list filter shows.
  const todayAwareItems = useMemo(() => {
    const today = localDateStr(new Date());
    return allItems.filter((s) => s.created_at && localDateStr(new Date(s.created_at)) === today);
  }, [allItems, localDateStr]);

  const [listSearch, setListSearch] = useState("");

  // Submitted tab = ONLY unassigned (server-filtered), with the same
  // client-side date narrowing every tab applies.
  const filteredUnassigned = useMemo(() => {
    if (!filterYMD) return unassignedStops;
    return unassignedStops.filter((s) => s.created_at && localDateStr(new Date(s.created_at)) === filterYMD);
  }, [unassignedStops, filterYMD, localDateStr]);

  const filteredStops = useMemo(() => {
    let items: TodayStop[];
    switch (statusTab) {
      case "submitted":
        items = filteredUnassigned;
        break;
      default:
        items = filteredAllItems.filter((s) => s.status === "draft");
    }
    if (listSearch.trim()) {
      const q = listSearch.toLowerCase();
      items = items.filter(
        (s) =>
          s.recipient_name?.toLowerCase().includes(q) ||
          s.address?.toLowerCase().includes(q) ||
          s.stop_id?.toLowerCase().includes(q) ||
          s.city?.toLowerCase().includes(q),
      );
    }
    return items;
  }, [filteredAllItems, filteredUnassigned, statusTab, listSearch]);

  // Tab counts respect the active date filter
  const tabCounts = useMemo(() => {
    const ds = filteredAllItems.filter((s) => s.status === "draft");
    return {
      all: ds.length + filteredUnassigned.length,
      draft: ds.length,
      submitted: filteredUnassigned.length,
    };
  }, [filteredAllItems, filteredUnassigned]);

  const allFilteredSelected = filteredStops.length > 0 && filteredStops.every((s) => selectedIds.has(s.id));
  const someSelected = selectedIds.size > 0;
  // Soft cap per bulk action (submit AND delete). Over the cap we confirm and
  // process the first N — keeps a single batch bounded (Spoke rate limit, blast
  // radius) without hard-blocking the user.
  const BULK_ACTION_CAP = 50;
  function toggleSelectAll() {
    if (allFilteredSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredStops.map((s) => s.id)));
  }
  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  // Deep-link: the top-bar "Scan label (OCR)" button sends users here with
  // ?ocr=1 → auto-open the OCR scan modal, then clean the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("ocr") === "1") {
      setOcrOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Phase D — batch label scan: queue handed over by the single modal when
  // the gallery picker returns 2+ images (cap 20, CEO-confirmed 2026-06-10).
  const BATCH_MAX_IMAGES = 200;
  const BATCH_MAX_FILE_MB = 15;
  // Files beyond the 20-cap — shown in the batch modal's cap-warning screen.
  const [batchOverflow, setBatchOverflow] = useState<File[]>([]);
  // "Review failed one by one": failed batch images re-opened in the single
  // scan review UI, one at a time as the modal closes.
  const [failedReviewQueue, setFailedReviewQueue] = useState<File[]>([]);
  const [reviewFile, setReviewFile] = useState<File | null>(null);

  // Bulletproof same-day failed scans (persisted in Mongo, 24h TTL). The list +
  // resolve flow now live INSIDE the OCR window's "Failed Scans" tab; the page
  // only tracks the badge count.
  const [failedCount, setFailedCount] = useState(0);

  const refreshFailedCount = useCallback(() => {
    void fetchFailedScansCount().then(setFailedCount);
  }, []);

  // Load the badge count on mount + whenever a batch closes (new failures may
  // have been persisted). The tray re-fetches its own full list when opened.
  useEffect(() => {
    refreshFailedCount();
  }, [refreshFailedCount]);

  useEffect(() => {
    if (ocrOpen || failedReviewQueue.length === 0) return;
    const [next, ...rest] = failedReviewQueue;
    setFailedReviewQueue(rest);
    setReviewFile(next);
    setOcrOpen(true);
  }, [ocrOpen, failedReviewQueue]);

  // Shared OCR→draft creator (single scan AND batch). normalizeAddress() at
  // the OCR→draft boundary so blob output can never regress address fields.
  // silent: batch queue owns its own UX — no toast, no modal close, no
  // per-draft background sync (one refresh when the batch closes).
  async function submitOcrDraft(
    {
      address,
      addressLine2,
      name,
      phone,
      packageType,
      requiresSignature,
      isSameDay,
      collectCod,
      codAmount,
      dob,
      orderIds,
      gateCode,
      addressVerified,
      scanId,
    }: OCRSubmitData,
    opts?: { silent?: boolean; signal?: AbortSignal },
  ): Promise<{ ok: boolean; error?: string }> {
    const normAddr = normalizeAddress(address);
    // Apt/Suite was validated SEPARATELY (Google saw the base street). Combine it
    // back into the delivery address so Spoke/the driver gets the complete unit;
    // also stored separately as apt_unit on the draft.
    const apt = (addressLine2 ?? "").trim();
    const deliveryLine = [normAddr.street, apt].filter(Boolean).join(" ");
    // Random suffix prevents draft_id collisions when two stops are created in
    // the same millisecond (rapid entry / many concurrent users).
    const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const capturedName = name.trim().toUpperCase() || "";
    // OCR has no date picker → every scanned stop delivers today (ET). Same-day
    // and standard alike carry today's ET date so service.date is never null.
    const todayDate = todayYmdET();
    try {
      const res = await fetch("/api/client/draft-stops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: opts?.signal,
        body: JSON.stringify({
          draft_id: draftId,
          delivery_address: deliveryLine,
          delivery_city: normAddr.city || "",
          delivery_state: normAddr.state || "FL",
          delivery_zip: normAddr.zip || "",
          apt_unit: apt || undefined,
          pickup_location_id: pickup?.id ?? "",
          pickup_name: pickup?.name ?? "",
          pickup_address: pickup?.address ?? "",
          pickup_city: pickup?.city ?? "",
          pickup_state: pickup?.state ?? "FL",
          pickup_zip: pickup?.zip ?? "",
          package_type: packageType,
          recipient_name: capturedName,
          recipient_phone: phone.trim(),
          requires_signature: requiresSignature,
          is_same_day: isSameDay,
          service_type: isSameDay ? "same_day" : "local",
          // OCR delivers today (ET) regardless of same-day flag — never null.
          delivery_date: todayDate,
          collect_cod: collectCod,
          collect_amount: collectCod ? parseFloat(codAmount.replace(/,/g, "")) || 0 : null,
          total_price: pricing.price_per_stop,
          price_per_stop: pricing.price_per_stop,
          price_per_mile: pricing.price_per_mile,
          source: "ocr_scan",
          // Links this draft back to the OCR/IVY scan (ocr_scans → draft → stop).
          scan_id: scanId || undefined,
          // Hybrid-OCR AI path (Phase 1, storage Option B): order_ids[] is the
          // canonical array; rx_number mirrors it as a display string.
          recipient_dob: dob ?? null,
          order_ids: orderIds ?? [],
          rx_number: (orderIds ?? []).join(", ") || undefined,
          // Captured + stored like other stop fields (NOT sent to Spoke).
          gate_code: gateCode ?? undefined,
          // Guarded-submit flag: false when the user overrode an unverified address.
          address_verified: addressVerified === false ? false : undefined,
        }),
      });
      if (!res.ok) {
        if (!opts?.silent) toast.error("Couldn't create stop — try again", { position: "top-center" });
        return { ok: false, error: `Couldn't create the draft stop (HTTP ${res.status})` };
      }
      // 1. Optimistic insert — new stop appears at top immediately
      const optimisticStop: TodayStop = {
        id: draftId,
        stop_id: draftId,
        stop_type: "delivery",
        status: "draft",
        recipient_name: capturedName,
        address: normAddr.street,
        city: normAddr.city || "",
        state: normAddr.state || "FL",
        zip: normAddr.zip || "",
        package_type: packageType,
        driver_name: null,
        route_title: null,
        total_price: 0,
        created_at: new Date().toISOString(),
        pickup_location_id: pickup?.id ?? "",
        pickup_address: pickup?.address ?? "",
        pickup_name: pickup?.name ?? "",
      };
      setDrafts((prev) => [optimisticStop, ...prev]);
      if (!opts?.silent) {
        // 2. Close modal
        setOcrOpen(false);
        // 3. Top-centered notification
        toast.success(capturedName ? `Stop added — ${capturedName}` : "Stop added successfully", {
          position: "top-center",
          duration: 2500,
        });
        // 4. Background sync — drafts + submitted (unassigned) + main list
        refreshAllLists();
      }
      return { ok: true };
    } catch (err) {
      if (opts?.signal?.aborted) {
        // Skipped/cancelled from the batch queue — quiet, no error toast.
        return { ok: false, error: "Cancelled" };
      }
      console.error("OCR submit:", err);
      if (!opts?.silent) toast.error("Couldn't create stop — try again", { position: "top-center" });
      return { ok: false, error: "Network error creating the draft stop" };
    }
  }

  // Bulk Delete handles BOTH drafts and submitted/unassigned stops. Drafts →
  // PATCH draft-stops status:"deleted" (cheap Mongo soft-delete, chunked). Submitted
  // (unassigned) stops → the SAME individual DELETE endpoint as the single-stop
  // delete (/api/client/stops/[id]), which removes the stop from Spoke + soft-deletes
  // Mongo. Submitted deletes run SEQUENTIALLY — we deliberately do NOT open a new
  // concurrency pool against Spoke. The endpoint 409s a stop a dispatcher already
  // picked up; those are reported as skipped, never force-deleted.
  const [bulkDeleting, setBulkDeleting] = useState(false);
  async function deleteSelected() {
    if (selectedIds.size === 0 || bulkDeleting) return;
    const ids = [...selectedIds];
    let draftIds = ids.filter((id) => id.startsWith("draft_"));
    let submittedIds = ids.filter((id) => !id.startsWith("draft_"));

    // Soft cap (50) across the combined selection — drafts first, then submitted.
    const total = draftIds.length + submittedIds.length;
    const capped = total > BULK_ACTION_CAP;
    if (capped) {
      draftIds = draftIds.slice(0, BULK_ACTION_CAP);
      submittedIds = submittedIds.slice(0, Math.max(0, BULK_ACTION_CAP - draftIds.length));
    }
    const count = draftIds.length + submittedIds.length;
    if (count === 0) return;

    const parts: string[] = [];
    if (draftIds.length) parts.push(`${draftIds.length} draft${draftIds.length > 1 ? "s" : ""}`);
    if (submittedIds.length) parts.push(`${submittedIds.length} submitted stop${submittedIds.length > 1 ? "s" : ""}`);
    const capNote = capped ? ` Only the first ${BULK_ACTION_CAP} will be deleted.` : "";
    const spokeNote = submittedIds.length ? " Submitted stops are removed from dispatch (Spoke)." : "";
    if (!window.confirm(`Delete ${parts.join(" + ")}? This cannot be undone.${spokeNote}${capNote}`)) return;

    setBulkDeleting(true);
    let ok = 0;
    let fail = 0;
    let skipped = 0; // submitted stops a dispatcher already picked up (409)
    try {
      // Drafts — chunked Mongo soft-delete (no Spoke).
      if (draftIds.length) {
        const DELETE_CONCURRENCY = 8;
        const deleteDraft = (id: string) =>
          fetch("/api/client/draft-stops", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ draft_id: id, status: "deleted" }),
          })
            .then((r) => r.ok)
            .catch(() => false);
        for (let i = 0; i < draftIds.length; i += DELETE_CONCURRENCY) {
          const res = await Promise.all(draftIds.slice(i, i + DELETE_CONCURRENCY).map(deleteDraft));
          ok += res.filter(Boolean).length;
          fail += res.filter((r) => !r).length;
        }
      }
      // Submitted/unassigned — SEQUENTIAL (no new Spoke concurrency pool), reusing the
      // individual DELETE endpoint so Spoke removal is handled exactly like single delete.
      for (const id of submittedIds) {
        try {
          const r = await fetch(`/api/client/stops/${encodeURIComponent(id)}`, { method: "DELETE" });
          if (r.status === 409) skipped++;
          else if (r.ok) ok++;
          else fail++;
        } catch {
          fail++;
        }
      }
    } catch {
      toast.error("Bulk delete failed");
    }
    if (ok > 0) toast.success(`Deleted ${ok} stop${ok > 1 ? "s" : ""}`);
    if (skipped > 0)
      toast.warning(`${skipped} already picked up by a dispatcher — not deleted`, { position: "top-center" });
    if (fail > 0) toast.error(`${fail} failed to delete`);

    // Clear any open panel pointing at a deleted item, and drop deleted ids from the
    // selection (keep 409-skipped submitted ids selected so the user sees them).
    const deletedSet = new Set([...draftIds, ...submittedIds]);
    setActiveDraft((prev) => (prev && deletedSet.has(prev.draft_id) ? null : prev));
    setSelected((prev) => (prev && deletedSet.has(prev.id) ? null : prev));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      draftIds.forEach((id) => next.delete(id));
      submittedIds.forEach((id) => next.delete(id));
      return next;
    });
    loadDrafts();
    loadStops();
    setBulkDeleting(false);
  }

  // ── Bulk submit selected drafts ─────────────────────────────────────
  // KEEP IN SYNC WITH submitDraft() inside StopDetailPanel. This reproduces the
  // single-stop submit pipeline for a whole selection WITHOUT opening each
  // panel, sourcing every field from the draft's own data:
  //   1. hydrate each draft via GET /api/client/draft-stops/{id} (FullStop shape,
  //      identical to what the panel loads on open),
  //   2. build the SAME orderBody + POST /api/client/orders/create,
  //   3. follow-up PATCH on the new stop for fields orders/create doesn't forward,
  //   4. post internal_notes to the new stop's /notes and the gate_code to its
  //      /gate-codes (the approve-PATCH server copy can't see internal_notes —
  //      its projection excludes them), then PATCH /api/client/draft-stops ->
  //      approved + tracking_id (the server then saves photos / email / usage).
  // If a field that is primordial for submit changes in submitDraft(), mirror it
  // here too (and vice-versa). total_price uses the draft's own stored price
  // (the panel uses live tenant pricing).
  // bulkSubmitting/bulkProgress are declared ABOVE the realtime hook (its
  // `enabled` gate pauses the board subscription during a bulk run).
  const bulkSubmitDrafts = useCallback(async () => {
    const ids = [...selectedIds].filter((id) => id.startsWith("draft_"));
    if (ids.length === 0 || bulkSubmitting) return;
    // Soft cap: confirm + take the first 50 if more are selected.
    if (ids.length > BULK_ACTION_CAP) {
      if (
        !window.confirm(
          `You selected ${ids.length} drafts. You can submit up to ${BULK_ACTION_CAP} at a time — the first ${BULK_ACTION_CAP} will be submitted now. Continue?`,
        )
      )
        return;
      ids.splice(BULK_ACTION_CAP);
    }
    setBulkSubmitting(true);
    setBulkProgress({ done: 0, total: ids.length });
    let ok = 0;
    let failed = 0;
    // Drafts whose FastAPI submit was unreachable and fell to the (untrusted)
    // n8n backup. NOT counted as success — kept as drafts, surfaced separately.
    let queuedCount = 0;
    // Drafts that reached FastAPI but Spoke never accepted (ghost prevented):
    // the stop was saved as submit_failed, the draft consumed — recoverable from
    // the Failed tab via Q-RETRY. Reported distinctly, never as "submitted".
    let spokeFailed = 0;
    // SEQUENTIAL posting — one draft at a time, awaited, with a small inter-item
    // pause. REVERTED from the pool-of-3 (a09cb81): the concurrency pool caused a
    // Spoke token/auth RACE — 3 simultaneous Spoke POSTs contended on the auth
    // header and some went out unauthorized → a 401 "Unauthorized" cascade on bulk
    // (single posts were always fine). One-at-a-time is the known-good path (commit
    // 8722633). Reliability over speed. Per-item verify-accepted + ghost-honesty
    // accounting is preserved unchanged. Re-introducing any pool requires fixing
    // Spoke token handling first (fetch/share once, no per-call refresh) — a
    // separate future task; do NOT add concurrency back here.
    let doneCount = 0;
    const processOne = async (id: string) => {
      try {
        const row = drafts.find((d) => d.id === id) ?? null;
        const hr = await fetch(`/api/client/draft-stops/${encodeURIComponent(id)}`);
        if (!hr.ok) {
          failed++;
          return;
        }
        const hydrated = await hr.json();
        const s = hydrated.stop;
        if (!s) {
          failed++;
          return;
        }
        // Pickup resolved from the draft's saved id (FullStop hydration omits
        // pickup) — mirrors submitDraft's pickup chain + DropOff detection.
        const savedPickupId = row?.pickup_location_id ?? "";
        const submitPickup = savedPickupId ? ((locations ?? []).find((l) => l.id === savedPickupId) ?? null) : null;
        const isDropoff = submitPickup?.id === "__dropoff__" || savedPickupId === "__dropoff__";
        const phoneE164 = phoneToE164(s.recipient?.phone ? fmtPhone(s.recipient.phone) : "");

        const orderBody = {
          recipient_name: s.recipient?.name || row?.recipient_name || "TBD",
          recipient_phone: phoneE164 ?? undefined,
          recipient_email: s.recipient?.email || undefined,
          recipient_dob: s.recipient?.dob || undefined,
          delivery_address: s.address?.street || row?.address,
          delivery_city: s.address?.city || row?.city,
          delivery_state: s.address?.state || row?.state,
          delivery_zip: s.address?.zip || row?.zip,
          pickup_location_id: isDropoff ? "dropoff" : submitPickup?.id || savedPickupId || undefined,
          pickup_name: isDropoff ? "DropOff" : submitPickup?.name || row?.pickup_name || undefined,
          pickup_address: isDropoff ? "" : submitPickup?.address || row?.pickup_address,
          pickup_city: isDropoff ? "" : submitPickup?.city || undefined,
          pickup_state: isDropoff ? "FL" : submitPickup?.state || "FL",
          pickup_zip: isDropoff ? "" : submitPickup?.zip || undefined,
          pickup_code: isDropoff ? undefined : submitPickup?.code || undefined,
          pickup: isDropoff ? { location_id: "dropoff" } : undefined,
          gate_code: s.address?.gate_code || undefined,
          drop_preference: s.address?.drop_preference || undefined,
          stop_type: isDropoff ? "dropoff" : s.stop_type || "delivery",
          package_type: s.package?.type || row?.package_type || "rx",
          rx_number: s.package?.rx_number || undefined,
          dp_note: s.package?.dp_note || undefined,
          notes: s.package?.notes || undefined,
          requires_signature: Boolean(s.package?.requires_signature),
          cold_chain: Boolean(s.package?.cold_chain),
          weight_oz: Number(s.package?.weight_oz) || 8,
          length_in: Number(s.package?.length_in) || 10,
          width_in: Number(s.package?.width_in) || 7,
          height_in: Number(s.package?.height_in) || 2,
          collect_cod: Boolean(s.service?.collect_payment),
          collect_amount: s.service?.collect_payment ? String(s.service?.cod_amount ?? "0") : "0",
          delivery_type: s.service?.type === "same_day" ? "same_day" : "next_day",
          is_same_day: s.service?.type === "same_day",
          delivery_date: s.service?.date || undefined,
          return_to_sender: Boolean(s.service?.return_to_sender),
          payment_status: "paid",
          total_price: Number(s.total_price) || 14,
          total_amount: Number(s.total_price) || 14,
          stops: 1,
          created_from_draft_id: id,
        };

        // POST the order. orders/create is idempotent on created_from_draft_id,
        // so retrying a transient 5xx/network failure is safe (resolves to the
        // same pickup+delivery pair via the idempotency key, never a duplicate).
        // A 202 ("backup_queued") means FastAPI was unreachable and the n8n
        // backup ALREADY fired — n8n is an UNTRUSTED fallback, NOT a confirmed
        // stop, so we must NOT retry (a retry that reaches a recovered FastAPI
        // would create a second order beside the queued backup) and must NOT
        // approve the draft. Leave it as a draft so it stays submit-ready.
        let data: Record<string, unknown> = {};
        let created = false;
        let draftQueued = false;
        let spokeUnconfirmed = false;
        for (let attempt = 0; attempt < 2 && !created; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 600));
          try {
            const res = await fetch("/api/client/orders/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(orderBody),
            });
            try {
              data = await res.json();
            } catch {
              data = {};
            }
            if (res.ok && data.ok !== false) {
              created = true;
              break;
            }
            // 202/backup-queued: untrusted fallback fired — stop here, keep draft.
            if (res.status === 202 || data.dispatch_status === "backup_queued") {
              draftQueued = true;
              break;
            }
            // 409/spoke-unconfirmed: FastAPI created the stop but Spoke never
            // accepted it. The route already marked it submit_failed (ghost
            // prevented). Deterministic — don't retry the create.
            if (res.status === 409 || data.dispatch_status === "spoke_unconfirmed") {
              spokeUnconfirmed = true;
              break;
            }
            // 4xx (e.g. validation) is deterministic — don't waste a retry.
            if (res.status >= 400 && res.status < 500) break;
            // 5xx / network: nothing persisted, fall through and retry once.
          } catch {
            created = false;
          }
        }
        if (!created) {
          if (spokeUnconfirmed) {
            // Consume the draft (approve w/ the failed stop's id) so it doesn't
            // linger as a draft beside the submit_failed stop — NO dual state.
            // The stop is recoverable from the Failed tab via Q-RETRY.
            const failedStopId = String(data.stop_id ?? data.tracking_number ?? "");
            if (failedStopId) {
              await fetch("/api/client/draft-stops", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ draft_id: id, status: "approved", tracking_id: failedStopId }),
              }).catch(() => {});
            }
            spokeFailed++;
            return;
          }
          if (draftQueued) queuedCount++;
          else failed++;
          return;
        }
        const newStopId = String(data.tracking_number ?? data.stop_id ?? "");
        if (!newStopId) {
          failed++;
          return;
        }
        // Follow-up PATCH — fields orders/create doesn't forward to FastAPI.
        await fetch(`/api/client/stops/${encodeURIComponent(newStopId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: {
              name: s.recipient?.name || row?.recipient_name || "",
              phone: phoneE164 ?? undefined,
              email: s.recipient?.email || null,
              dob: s.recipient?.dob || null,
            },
            address: { gate_code: s.address?.gate_code || null, drop_preference: s.address?.drop_preference || null },
            package: {
              type: s.package?.type || "rx",
              notes: s.package?.notes || null,
              rx_number: s.package?.rx_number || null,
              dp_note: s.package?.dp_note || null,
              cold_chain: Boolean(s.package?.cold_chain),
              requires_signature: Boolean(s.package?.requires_signature),
              weight_oz: Number(s.package?.weight_oz) || 8,
              length_in: Number(s.package?.length_in) || 10,
              width_in: Number(s.package?.width_in) || 7,
              height_in: Number(s.package?.height_in) || 2,
            },
            service: {
              type: s.service?.type || "local",
              date: s.service?.date || null,
              collect_payment: Boolean(s.service?.collect_payment),
              cod_amount: s.service?.collect_payment ? Number(s.service?.cod_amount) || 0 : 0,
              return_to_sender: Boolean(s.service?.return_to_sender),
            },
            stop_type: isDropoff ? "dropoff" : s.stop_type || "delivery",
            pickup: {
              location_id: submitPickup?.id ?? null,
              name: submitPickup?.name ?? null,
              address: submitPickup?.address ?? null,
              city: submitPickup?.city ?? null,
              state: submitPickup?.state ?? null,
              zip: submitPickup?.zip ?? null,
              code: submitPickup?.code ?? null,
            },
          }),
        }).catch(() => {});
        // Notes + gate code — mirror submitDraft(): post the draft's internal
        // notes to the new stop (the approve-PATCH server copy can't see them —
        // its projection excludes internal_notes), and persist the gate code to
        // the new stop's address-keyed gate_codes lookup. Exactly like single submit.
        const draftNotes = Array.isArray(s.internal_notes) ? s.internal_notes : [];
        if (draftNotes.length > 0) {
          await Promise.allSettled(
            draftNotes.map((n: { text?: string }) =>
              fetch(`/api/client/stops/${encodeURIComponent(newStopId)}/notes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: n.text }),
              }),
            ),
          );
        }
        const gateCode = String(s.address?.gate_code ?? "").trim();
        if (gateCode) {
          await fetch(`/api/client/stops/${encodeURIComponent(newStopId)}/gate-codes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: gateCode }),
          }).catch(() => {});
        }
        // Approve draft + carry tracking id (server saves photos / sends email / usage).
        // The stop is already created, so retry the transition once rather than
        // swallowing a failure that would leave the draft re-appearing in the list.
        let approved = false;
        for (let attempt = 0; attempt < 2 && !approved; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 400));
          try {
            const ar = await fetch("/api/client/draft-stops", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ draft_id: id, status: "approved", tracking_id: newStopId }),
            });
            approved = ar.ok;
          } catch {
            approved = false;
          }
        }
        ok++;
      } catch {
        failed++;
      } finally {
        doneCount++;
        setBulkProgress({ done: doneCount, total: ids.length });
      }
    };
    // Sequential: post one draft at a time with a ~400ms inter-item pause (the
    // known-good 8722633 pacing). NOT parallel — see the token-race note above.
    for (const [index, id] of ids.entries()) {
      if (index > 0) await new Promise((r) => setTimeout(r, 400));
      await processOne(id);
    }
    setBulkSubmitting(false);
    setBulkProgress(null);
    setSelectedIds(new Set());
    // ONE full refresh replaces the realtime-driven storm that was paused
    // during the run — including the Submitted tab (loadUnassigned was missing
    // here, which is why freshly submitted stops "didn't appear" after a bulk).
    loadStops();
    loadDrafts();
    loadUnassigned();
    // Queued = dispatch service unreachable, handed to the untrusted n8n backup.
    // Those drafts are intentionally KEPT and remain submit-ready — report them
    // distinctly so the user knows to retry, never as "submitted".
    const queuedNote = queuedCount > 0 ? ` · ${queuedCount} queued — retry shortly` : "";
    // Spoke-unconfirmed = saved as a draft (not submitted). Surface honestly so
    // the user retries them from Drafts; never silently a "success".
    const spokeNote = spokeFailed > 0 ? ` · ${spokeFailed} not accepted by Spoke — retry from Drafts` : "";
    if (ok > 0 && failed === 0 && queuedCount === 0 && spokeFailed === 0)
      toast.success(`${ok} stop${ok > 1 ? "s" : ""} submitted`);
    else if (ok > 0) toast.success(`${ok} submitted${failed > 0 ? `, ${failed} failed` : ""}${spokeNote}${queuedNote}`);
    else if (spokeFailed > 0)
      toast.error(
        `${spokeFailed} stop${spokeFailed > 1 ? "s" : ""} not accepted by Spoke — saved as drafts. Find them in Drafts to retry.`,
      );
    else if (queuedCount > 0)
      toast.warning(
        `Dispatch service unreachable — ${queuedCount} draft${queuedCount > 1 ? "s" : ""} queued and kept. Please retry shortly.`,
      );
    else toast.error("Could not submit the selected drafts");
  }, [selectedIds, bulkSubmitting, drafts, locations, loadStops, loadDrafts, loadUnassigned]);

  async function addStop() {
    if (!newAddr) return;
    // Complete-address guard (client): zip (+ city/state/street) must be present.
    if (!newAddr.street?.trim() || !newAddr.city?.trim() || !newAddr.state?.trim() || !newAddr.zip?.trim()) {
      toast.error("Complete the address — ZIP code is required");
      return;
    }
    setCreating(true);
    const apt = newApt.trim();
    const deliveryLine = [newAddr.street, apt].filter(Boolean).join(" ");
    // Detect mobile (< 640px) — changes only apply on mobile
    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
    try {
      // Random suffix prevents draft_id collisions when two stops are created in
      // the same millisecond (rapid entry / many concurrent users).
      const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // No tracking ID — FastAPI assigns the real one on Submit Order
      const res = await fetch("/api/client/draft-stops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_id: draftId,
          // no tracking_id — FastAPI assigns on submit
          delivery_address: deliveryLine,
          delivery_city: newAddr.city || "",
          delivery_state: newAddr.state || "FL",
          delivery_zip: newAddr.zip || "",
          apt_unit: apt || undefined,
          // Tenant default pickup (or first available; falls back to tenant.address
          // when pickup_locations is empty — synthesized in /api/client/tenant).
          pickup_location_id: pickup?.id ?? "",
          pickup_name: pickup?.name ?? "",
          pickup_address: pickup?.address ?? "",
          pickup_city: pickup?.city ?? "",
          pickup_state: pickup?.state ?? "FL",
          pickup_zip: pickup?.zip ?? "",
          pickup_code: pickup?.code ?? undefined,
          package_type: "rx",
          recipient_name: newName.trim().toUpperCase(),
          recipient_phone: phoneToE164(newPhone) ?? "",
          total_price: pricing.price_per_stop,
          price_per_stop: pricing.price_per_stop,
          price_per_mile: pricing.price_per_mile,
        }),
      });
      if (!res.ok) {
        console.error("draft-stops:", res.status);
        toast.error("Couldn’t create stop — please try again");
        return;
      }

      // Capture values BEFORE clearing the form
      const capturedName = newName.trim();
      const capturedAddr = newAddr;

      // Clear form fields (both web + mobile)
      setNewAddr(null);
      setNewApt("");
      setNewName("");
      setNewPhone("");
      setSelected(null);

      if (isMobile) {
        // ── MOBILE ONLY ──
        // 1. Optimistic insert — immediately visible in the list, no page refresh needed
        const optimisticStop: TodayStop = {
          id: draftId,
          stop_id: draftId,
          stop_type: "delivery",
          status: "draft",
          recipient_name: capturedName,
          address: deliveryLine,
          city: capturedAddr.city || "",
          state: capturedAddr.state || "FL",
          zip: capturedAddr.zip || "",
          package_type: "rx",
          driver_name: null,
          route_title: null,
          total_price: 0,
          created_at: new Date().toISOString(),
          pickup_location_id: pickup?.id ?? "",
          pickup_address: pickup?.address ?? "",
          pickup_name: pickup?.name ?? "",
        };
        setDrafts((prev) => [optimisticStop, ...prev]);
        // 2. Stay on stops list tab — do NOT navigate to detail
        // (setMobileTab not called, setActiveDraft not called)
        // 3. Toast confirmation
        toast.success("Stop added successfully!");
        // 4. Sync with server in background
        loadDrafts();
      } else {
        // ── WEB (unchanged behavior) ──
        const draft: DraftStop = {
          draft_id: draftId,
          tracking_id: "", // pending — assigned by FastAPI on submit
          status: "draft",
          delivery_address: deliveryLine,
          delivery_city: newAddr.city || "",
          delivery_state: newAddr.state || "FL",
          delivery_zip: newAddr.zip || "",
          pickup_address: pickup?.address ?? "",
          pickup_location_id: pickup?.id ?? "",
          recipient_name: newName.trim(),
          recipient_phone: newPhone,
          package_type: "rx",
          notes: null,
          created_at: new Date().toISOString(),
        };
        toast.success("Draft created");
        setActiveDraft(draft);
        setMobileTab("detail"); // no-op on desktop
        loadDrafts();
      }
    } catch (e) {
      toast.error("Couldn’t create stop — please try again");
      console.error("addStop:", e);
    } finally {
      setCreating(false);
    }
  }

  // Map origin — for normal pickups it's the tenant pickup location. For
  // DropOff (customer brings the package to a Routely hub) the submitted
  // stop has NO pickup sibling, but the delivery still physically starts
  // from the Routely DropOff hub, so the map renders that fixed origin
  // for dispatcher ETA/miles context. Map-only — submit payload is unchanged.
  const ROUTELY_DROPOFF_ORIGIN = "Routely DropOff, 12156 W Sample Rd, Coral Springs, FL 33065";
  const isDropoffMap = effectivePickup?.id === "__dropoff__" || pickup?.id === "__dropoff__";
  // Map origin priority:
  //   1. DropOff (synthetic) → Routely DropOff hub address.
  //   2. The SELECTED stop's effective pickup (effectivePickup) — tenants
  //      can have many pickup locations, so the route preview must reflect
  //      the one this stop actually uses, not the global header pickup.
  //   3. Global pickup as a last-resort fallback (e.g. brand-new drafts
  //      before effectivePickup is resolved).
  const mapPickup = effectivePickup ?? pickup ?? null;
  const pickupFull = isDropoffMap ? ROUTELY_DROPOFF_ORIGIN : mapPickup ? `${mapPickup.name}, ${mapPickup.address}` : "";
  const pickupMapName = isDropoffMap ? "Routely DropOff" : mapPickup?.name;
  const deliveryFull = activeDraft
    ? `${activeDraft.delivery_address}, ${activeDraft.delivery_city}, ${activeDraft.delivery_state} ${activeDraft.delivery_zip}`
    : selected
      ? `${selected.address}, ${selected.city}, ${selected.state} ${selected.zip}`
      : "";

  const doneCount = stops.filter((s) => DELIVERED.includes(s.status)).length;
  const activeCount = stops.filter((s) => TRANSIT.includes(s.status)).length;

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{
        zoom: "var(--panel-zoom, 1)" as string,
        backgroundColor: "hsl(var(--muted) / 0.4)",
        backgroundImage: "radial-gradient(hsl(var(--border)) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      <style>{`.custom-scroll::-webkit-scrollbar{width:3px}.custom-scroll::-webkit-scrollbar-thumb{background:hsl(var(--border));border-radius:2px}.pb-safe{padding-bottom:calc(0.75rem + env(safe-area-inset-bottom, 60px))}@media(min-width:640px){.pb-safe{padding-bottom:0.75rem}}`}</style>

      {/* ═══ LEFT COLUMN (300px) ═══ */}
      <div
        className={cn(
          "flex h-full flex-col overflow-hidden border-border/50 border-r bg-card shadow-[inset_-1px_0_0_0_hsl(var(--border)/0.6)]",
          mobileTab !== "list"
            ? "hidden sm:flex sm:w-[20%] sm:min-w-[260px] sm:shrink-0"
            : "flex w-full sm:w-[20%] sm:min-w-[260px] sm:shrink-0",
        )}
      >
        {/* Zone A — entry panel (redesigned per enterprise spec).
            All surfaces use the card token (light in light, dark in dark)
            instead of a raw white; all inputs use border-input + bg-background;
            all text uses muted/foreground tokens — no raw white surfaces and no
            slate utilities. Reads correctly in both themes. */}
        <div className="shrink-0 border-b border-border/50 bg-card">
          {/* PICKUP */}
          <div className="px-3 pb-2 pt-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                Pickup
              </span>
              <div className="flex items-center gap-1">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                <span className="text-[10px] font-medium text-emerald-600">Active</span>
              </div>
            </div>
            <PickupSelector locations={locations} selected={pickup} onSelect={setPickup} />
          </div>
          <div className="mx-0 h-px bg-border/50" />

          {/* NEW STOP */}
          <div className="space-y-2 px-3 pt-2.5 pb-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              New Stop
            </span>

            {/* OCR / Scan tiles */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setOcrOpen(true)}
                className="flex h-8 items-center justify-center gap-2 rounded-lg border border-border/60 bg-muted/30 text-[11px] font-medium text-muted-foreground/70 transition-colors hover:bg-primary/10 hover:text-primary hover:border-primary/30 dark:border-border/40 dark:bg-muted/20"
              >
                <Camera className="size-3.5" aria-hidden="true" />
                OCR Label
              </button>
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className="flex h-8 items-center justify-center gap-2 rounded-lg border border-border/60 bg-muted/30 text-[11px] font-medium text-muted-foreground/70 transition-colors hover:bg-primary/10 hover:text-primary hover:border-primary/30 dark:border-border/40 dark:bg-muted/20"
              >
                <ScanLine className="size-3.5" aria-hidden="true" />
                Scan Code
              </button>
            </div>

            {/* Address + submit row */}
            <div className="flex gap-1.5">
              <div className="flex-1">
                <NewStopInput
                  value={newAddr}
                  onChange={setNewAddr}
                  onClear={() => setNewAddr(null)}
                  todayStops={todayAwareItems}
                  onSelectExisting={(s) => {
                    void s;
                  }}
                />
              </div>
              {(() => {
                // Complete-address gate: street + city + state + ZIP all present
                // (a draft with no zip fails downstream — block it at Save).
                const addrComplete =
                  !!newAddr &&
                  !!newAddr.street?.trim() &&
                  !!newAddr.city?.trim() &&
                  !!newAddr.state?.trim() &&
                  !!newAddr.zip?.trim();
                const ready = addrComplete && newName.trim() !== "" && isValidPhone(newPhone) && !creating;
                return (
                  <button
                    type="button"
                    onClick={addStop}
                    disabled={!ready}
                    aria-label="Create draft stop"
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg transition-all",
                      ready
                        ? "bg-primary text-white shadow-sm hover:bg-primary/90 active:scale-95"
                        : "cursor-not-allowed bg-muted/50 text-muted-foreground/40",
                    )}
                  >
                    {creating ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Plus className="size-3.5" aria-hidden="true" />
                    )}
                  </button>
                );
              })()}
            </div>

            {/* Name + Phone — reveal after address */}
            <AnimatePresence initial={false}>
              {(!!newAddr || !!newName || !!newPhone) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1.5 border-l-2 border-primary/20 pl-2 pt-1">
                    <div className="flex h-8 items-center gap-2 rounded-lg border border-input bg-card px-2.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
                      <User className="size-3 shrink-0 text-muted-foreground/40" aria-hidden="true" />
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value.toUpperCase())}
                        placeholder="Full name *"
                        className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/35"
                      />
                    </div>
                    <div className="flex h-8 items-center gap-2 rounded-lg border border-input bg-card px-2.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
                      <Phone className="size-3 shrink-0 text-muted-foreground/40" aria-hidden="true" />
                      <input
                        value={newPhone}
                        onChange={(e) => setNewPhone(fmtPhone(e.target.value))}
                        placeholder="Phone * (555) 123-4567"
                        inputMode="tel"
                        className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/35"
                      />
                    </div>
                    {/* Apt / Suite / Unit (optional) — kept out of the validated street */}
                    <div className="flex h-8 items-center gap-2 rounded-lg border border-input bg-card px-2.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
                      <Building2 className="size-3 shrink-0 text-muted-foreground/40" aria-hidden="true" />
                      <input
                        value={newApt}
                        onChange={(e) => setNewApt(e.target.value)}
                        placeholder="Apt / Suite / Unit (optional)"
                        className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/35"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ready feedback */}
            {newAddr && newName.trim() && isValidPhone(newPhone) && !creating && (
              <p className="flex items-center gap-1 text-[11px] text-emerald-600">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                Ready — press + to create
              </p>
            )}
            {creating && (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                Creating stop…
              </p>
            )}
          </div>
        </div>

        {/* Zone B — list */}
        <div className="custom-scroll min-h-0 flex-1 overflow-y-auto bg-card">
          <div className="sticky top-0 z-10 border-b border-border/50 bg-card">
            {/* ── Stops toolbar: search · OCR · Scan · date · refresh ── */}
            <div className="flex items-center gap-1 px-2 py-1.5">
              {/* Search input — flex-1 fills available space */}
              <div
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border bg-background px-2.5 transition-colors h-8",
                  listSearch ? "border-primary/50 ring-1 ring-primary/15" : "border-border/50 hover:border-border/80",
                )}
              >
                <Search className="size-3 shrink-0 text-muted-foreground/40" aria-hidden="true" />
                <input
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="Search stops…"
                  spellCheck={false}
                  autoComplete="off"
                  className="flex-1 min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/35"
                />
                {listSearch && (
                  <button
                    type="button"
                    onClick={() => setListSearch("")}
                    aria-label="Clear search"
                    className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Action icon buttons — date filter + refresh */}
              <TooltipProvider delayDuration={400}>
                <div className="flex items-center gap-0.5">
                  {/* Date filter */}
                  <Popover>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Date filter: ${filterLabel}`}
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-lg transition-all active:scale-95",
                              dateFilter !== "today"
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground/60 hover:bg-accent hover:text-foreground",
                            )}
                          >
                            <CalendarIcon className="size-3.5" aria-hidden="true" />
                          </button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-[11px]">
                        {filterLabel}
                      </TooltipContent>
                    </Tooltip>
                    <PopoverContent align="end" className="w-48 p-2 text-xs">
                      <div className="grid grid-cols-2 gap-1">
                        {(
                          [
                            ["today", "Today"],
                            ["yesterday", "Yesterday"],
                            ["tomorrow", "Tomorrow"],
                            ["all", "All"],
                          ] as const
                        ).map(([v, l]) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setDateFilter(v)}
                            className={cn(
                              "rounded-lg px-2 py-1.5 text-left font-medium transition-colors",
                              dateFilter === v ? "bg-primary text-white" : "text-foreground hover:bg-accent",
                            )}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                      <Separator className="my-2" />
                      <input
                        type="date"
                        value={dateFilter.match(/^\d{4}-\d{2}-\d{2}$/) ? dateFilter : ""}
                        onChange={(e) => e.target.value && setDateFilter(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary"
                      />
                    </PopoverContent>
                  </Popover>

                  {/* Refresh */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          loadStops();
                          loadDrafts();
                        }}
                        aria-label="Refresh stops"
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg transition-all text-muted-foreground/60 hover:bg-accent hover:text-foreground active:scale-95"
                      >
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-[11px]">
                      Refresh
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </div>
            {/* Tabs row */}
            <div className="flex items-center border-b border-border/50 bg-card">
              <Checkbox
                checked={allFilteredSelected}
                onCheckedChange={toggleSelectAll}
                className="ml-2.5 mr-2 size-3.5 shrink-0"
                aria-label="Select all"
              />
              {(
                [
                  { value: "all", label: "Drafts", count: tabCounts.draft },
                  { value: "submitted", label: "Submitted", count: tabCounts.submitted },
                ] as const
              )
                .filter((t) => t.count > 0 || t.value === "all")
                .map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setStatusTab(t.value as typeof statusTab)}
                    className={cn(
                      "h-9 border-b-2 px-3 text-[11px] font-medium transition-colors",
                      statusTab === t.value
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                    {t.count > 0 && (
                      <span className="ml-1 text-[10px] text-muted-foreground/60 dark:text-muted-foreground/75">
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </div>

          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 border-border/50 border-b px-3 py-2">
                <span className="size-5 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 w-28 animate-pulse rounded-full bg-muted" />
                  <div className="h-2 w-36 animate-pulse rounded-full bg-muted/70" />
                </div>
                <div className="h-5 w-16 shrink-0 animate-pulse rounded-full bg-muted" />
              </div>
            ))
          ) : filteredStops.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-muted">
                <Package className="size-4 text-muted-foreground" />
              </div>
              {statusTab === "submitted" ? (
                <>
                  <p className="font-semibold text-xs text-muted-foreground">All caught up</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                    All submitted stops have been assigned to a driver
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-xs text-muted-foreground">No stops</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                    No stops today — type an address to add one
                  </p>
                </>
              )}
            </div>
          ) : (
            filteredStops.map((s, i) => {
              const isSel = selected?.id === s.id || activeDraft?.draft_id === s.id || selectedIds.has(s.id);
              // Per-row 2px left border carries the status color (per spec) —
              // replaces the inline boxShadow inset trick. Reads as a vertical
              // signal line down the list; scans faster than colored pills.
              const leftBorder =
                s.status === "draft"
                  ? "border-l-violet-400"
                  : DELIVERED.includes(s.status)
                    ? "border-l-emerald-400"
                    : TRANSIT.includes(s.status)
                      ? "border-l-blue-400"
                      : FAILED.includes(s.status)
                        ? "border-l-rose-400"
                        : "border-l-amber-400";
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    // Row click always opens — never toggles selection
                    // (use checkbox to select)
                    const isDraft = s.id.startsWith("draft_"); // id is always draft_xxx
                    if (isDraft) {
                      setActiveDraft({
                        draft_id: s.id,
                        tracking_id: s.stop_id,
                        status: "draft",
                        delivery_address: s.address,
                        delivery_city: s.city,
                        delivery_state: s.state,
                        delivery_zip: s.zip,
                        route_zone: s.zone ?? null,
                        // Prefer the draft's SAVED pickup; fall back to the tenant default.
                        pickup_address: s.pickup_address || pickup?.address || "",
                        pickup_location_id: s.pickup_location_id || pickup?.id || "",
                        recipient_name: s.recipient_name,
                        recipient_phone: "",
                        package_type: s.package_type,
                        notes: null,
                        created_at: s.created_at,
                      });
                      setSelected(null);
                    } else {
                      setSelected((p) => (p?.id === s.id ? null : s));
                      setActiveDraft(null);
                    }
                    setMobileTab("detail");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.currentTarget.click();
                    }
                  }}
                  className={cn(
                    // 2px left status border + bg shifts only on selection. No
                    // inline boxShadow, no per-row hex stripes.
                    "flex w-full cursor-pointer items-start gap-2.5 border-b border-l-2 border-border/50 px-2.5 py-2 text-left transition-colors",
                    leftBorder,
                    isSel ? "bg-blue-50 dark:bg-primary/20" : "bg-card hover:bg-muted/30",
                  )}
                >
                  <Checkbox
                    checked={selectedIds.has(s.id)}
                    onCheckedChange={() => toggleSelectOne(s.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
                      isSel ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {filteredStops.length - i}
                  </span>
                  {/* 3 lines max — Name · Address · TrackingID. City/state/zip
                      dropped (it was already in address). */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-foreground leading-tight">
                      {toTitle(s.recipient_name) || "—"}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-foreground/65 leading-tight">
                      {toTitle(s.address)}
                    </p>
                    {/* Third field: City, State ZIP (CEO 2026-07-13 — replaced phone),
                        SAME type treatment as the address line above. */}
                    <p className="mt-0.5 truncate text-[11px] text-foreground/65 leading-tight">
                      {[toTitle(s.city), `${s.state ?? ""} ${s.zip ?? ""}`.trim()].filter(Boolean).join(", ") || "—"}
                    </p>
                    {/* Tracking ID — brand blue for real ids (CEO 2026-07-13);
                        drafts keep the quiet "pending" tone. */}
                    <p
                      className={cn(
                        "mt-0.5 truncate font-mono text-[10px] tabular-nums",
                        s.id.startsWith("draft_") ? "text-muted-foreground/50" : "text-primary",
                      )}
                    >
                      {s.id.startsWith("draft_") ? "Tracking pending" : s.stop_id || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 self-center">
                    {/* Quieter badges per spec — 9.5pt label, refined ring style */}
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                        s.status === "draft"
                          ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20"
                          : DELIVERED.includes(s.status)
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20"
                            : TRANSIT.includes(s.status)
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20"
                              : FAILED.includes(s.status)
                                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
                      )}
                    >
                      {statusLabel(s.status)}
                    </span>
                    {/* Recovered draft: a submit failed → fell back to draft +
                        submit_error. Flag it so the user knows to fix & resubmit. */}
                    {s.submit_error && (
                      <span
                        className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600 ring-1 ring-rose-200/60 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30"
                        title={s.submit_error.reason ?? "Submit failed — fix & resubmit"}
                      >
                        Submit failed
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                      {fmtStopDate(s.created_at)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Zone C — footer (per enterprise spec).
            Count snapped from font-black/22 → font-bold/16; all meta lives on
            one 10.5px scale; thin vertical separators replace the old
            border-r/border-l block dividers. */}
        <div className="shrink-0 border-t border-border/50 bg-card">
          <div className="px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex items-baseline gap-1.5">
                  <span className="text-base font-bold text-foreground tabular-nums leading-none">
                    {filteredStops.length}
                  </span>
                  <span className="text-[11px] text-muted-foreground/65">
                    {statusTab !== "all" ? `of ${filteredAllItems.length}` : "showing"}
                  </span>
                </span>
                <div className="h-3 w-px bg-border/40" />
                <span className="text-[11px] text-muted-foreground/65">{filterLabel}</span>
                {(doneCount > 0 || activeCount > 0) && (
                  <>
                    <div className="h-3 w-px bg-border/40" />
                    {doneCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        {doneCount} delivered
                      </span>
                    )}
                    {activeCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-blue-600">
                        <motion.span
                          className="size-1.5 rounded-full bg-blue-500"
                          animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        />
                        {activeCount} active
                      </span>
                    )}
                  </>
                )}
              </div>
              <span className="text-[11px] font-medium text-muted-foreground/45 uppercase tracking-widest">
                {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ MIDDLE COLUMN (28%) ═══ */}
      <div
        className={cn(
          "flex h-full flex-col overflow-hidden border-border/50 border-r bg-card",
          mobileTab !== "detail" ? "hidden sm:flex sm:w-[25%] sm:shrink-0" : "flex w-full sm:w-[25%] sm:shrink-0",
        )}
      >
        <AnimatePresence mode="wait">
          {selectedIds.size >= 2 ? (
            // Multi-select mode owns the user's context; suppress single-stop
            // detail so the user can't edit "the wrong one" while the bulk bar
            // is the active surface.
            <motion.div
              key="multi"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center bg-muted/15 px-8 text-center"
            >
              <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border">
                <Checkbox checked className="pointer-events-none size-5" />
              </div>
              <p className="font-bold text-sm text-foreground">{selectedIds.size} stops selected</p>
              <p className="mt-1.5 max-w-[210px] text-muted-foreground text-xs leading-relaxed">
                Use the bulk action bar below to edit or delete selected drafts.
              </p>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="mt-3 inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-3" /> Clear selection
              </button>
            </motion.div>
          ) : activeDraft ? (
            <motion.div
              key={activeDraft.draft_id}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full min-h-0 overflow-hidden"
            >
              <StopDetailPanel
                stopId={activeDraft.draft_id}
                summary={{
                  id: activeDraft.draft_id,
                  stop_id: activeDraft.draft_id,
                  stop_type: "delivery",
                  status: "draft",
                  recipient_name: activeDraft.recipient_name,
                  address: activeDraft.delivery_address,
                  city: activeDraft.delivery_city,
                  state: activeDraft.delivery_state,
                  zip: activeDraft.delivery_zip,
                  package_type: activeDraft.package_type,
                  driver_name: null,
                  route_title: null,
                  // Read-only zone so the panel's routeZone resolves for drafts too.
                  zone: activeDraft.route_zone ?? null,
                  total_price: 0,
                  created_at: activeDraft.created_at,
                }}
                draftData={activeDraft}
                pickup={effectivePickup}
                pickupLocations={locations}
                onPickupChange={(l) => {
                  // Per-draft pickup change: sync the active draft snapshot and its
                  // left-list row so effectivePickup resolves the NEW id (otherwise
                  // the panel's localPickup gets reset back to the stale saved id —
                  // the "pickup reverts" bug). Deliberately does NOT touch the
                  // global `pickup` default used when creating new orders.
                  setActiveDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          pickup_location_id: l.id,
                          pickup_address: l.address,
                        }
                      : prev,
                  );
                  setDrafts((prev) =>
                    prev.map((d) =>
                      d.id === activeDraft.draft_id
                        ? { ...d, pickup_location_id: l.id, pickup_address: l.address, pickup_name: l.name }
                        : d,
                    ),
                  );
                }}
                pricing={pricing}
                tenantCompanyName={tenantCompanyName}
                onClose={() => setActiveDraft(null)}
                onDraftSubmitted={() => {
                  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
                  setActiveDraft(null);
                  loadStops();
                  loadDrafts();
                  loadUnassigned(); // newly submitted stops land in the Submitted (unassigned) tab
                  if (isMobile) setMobileTab("list");
                }}
                onAddressChange={(a) => {
                  // Optimistically sync the active draft snapshot (header + draftData reads)
                  setActiveDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          delivery_address: a.street,
                          delivery_city: a.city,
                          delivery_state: a.state || "FL",
                          delivery_zip: a.zip,
                        }
                      : prev,
                  );
                  // Optimistically sync the left-list draft row (TodayStop shape)
                  setDrafts((prev) =>
                    prev.map((d) =>
                      d.id === activeDraft.draft_id
                        ? {
                            ...d,
                            address: a.street,
                            city: a.city,
                            state: a.state || "FL",
                            zip: a.zip,
                          }
                        : d,
                    ),
                  );
                  // Re-resolve the delivery zone live so the "Route Zone" field
                  // (summary.zone = activeDraft.route_zone) refreshes without a
                  // reload. The DB trigger already persists route_zone on save;
                  // this is display-only. Capture the draft id BEFORE the fetch so
                  // a mid-flight draft switch can't stamp the wrong row. Fully
                  // non-fatal — any failure leaves the shown zone untouched.
                  const draftIdAtCall = activeDraft.draft_id;
                  const zip5 = String(a.zip ?? "")
                    .replace(/\D/g, "")
                    .slice(0, 5);
                  const applyZone = (zoneName: string | null) => {
                    setActiveDraft((prev) =>
                      prev && prev.draft_id === draftIdAtCall ? { ...prev, route_zone: zoneName } : prev,
                    );
                    setDrafts((prev) =>
                      prev.map((d) => (d.id === draftIdAtCall ? { ...d, zone: zoneName } : d)),
                    );
                  };
                  if (zip5.length !== 5) {
                    applyZone(null);
                  } else {
                    fetch(`/api/client/zones/lookup?zip=${encodeURIComponent(zip5)}`)
                      .then((r) => (r.ok ? r.json() : null))
                      .then((json) => {
                        applyZone(json?.zone_name ?? null);
                      })
                      .catch(() => {});
                  }
                }}
                onBasicInfoChange={(patch) => {
                  // Same optimistic pattern as onAddressChange — keep the
                  // panel snapshot and the left list row in sync with the
                  // debounced PATCH so neither shows a stale name/phone.
                  setActiveDraft((prev) => (prev ? { ...prev, ...patch } : prev));
                  setDrafts((prev) => prev.map((d) => (d.id === activeDraft.draft_id ? { ...d, ...patch } : d)));
                }}
              />
            </motion.div>
          ) : selected ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full min-h-0 overflow-hidden"
            >
              <StopDetailPanel
                stopId={selected.stop_id}
                summary={selected}
                pickup={effectivePickup}
                pickupLocations={locations}
                tenantCompanyName={tenantCompanyName}
                onClose={() => setSelected(null)}
                onDraftSubmitted={() => {
                  setSelected(null);
                  loadStops();
                  loadDrafts();
                  loadUnassigned();
                }}
                onNoLongerUnassigned={() => {
                  setSelected(null);
                  loadStops();
                  loadUnassigned();
                }}
                onAddressChange={(a) => {
                  // Optimistically sync the selected submitted-stop summary (header reads)
                  setSelected((prev) =>
                    prev
                      ? {
                          ...prev,
                          address: a.street,
                          city: a.city,
                          state: a.state || "FL",
                          zip: a.zip,
                        }
                      : prev,
                  );
                  // Optimistically sync the left-list submitted-stop row
                  setStops((prev) =>
                    prev.map((s) =>
                      s.id === selected.id
                        ? {
                            ...s,
                            address: a.street,
                            city: a.city,
                            state: a.state || "FL",
                            zip: a.zip,
                          }
                        : s,
                    ),
                  );
                  setUnassignedStops((prev) =>
                    prev.map((s) =>
                      s.id === selected.id
                        ? { ...s, address: a.street, city: a.city, state: a.state || "FL", zip: a.zip }
                        : s,
                    ),
                  );
                }}
                onBasicInfoChange={(patch) => {
                  // Same optimistic pattern as onAddressChange for name/phone —
                  // mirrored into the Submitted-tab (unassigned) list too.
                  setSelected((prev) => (prev ? { ...prev, ...patch } : prev));
                  setStops((prev) => prev.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)));
                  setUnassignedStops((prev) => prev.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)));
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center bg-muted/15 px-8 text-center"
            >
              <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border">
                <Package className="size-7 text-muted-foreground/30" />
              </div>
              <p className="font-bold text-sm text-foreground">No stop selected</p>
              <p className="mt-1.5 max-w-[180px] text-muted-foreground text-xs leading-relaxed">
                Click a stop from the list to view and edit details
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ MAP COLUMN (flex-1) ═══ */}
      <div
        className={cn(
          "overflow-hidden bg-muted/20",
          mobileTab !== "map" ? "hidden sm:block sm:flex-1" : "block w-full sm:flex-1",
        )}
      >
        {selectedIds.size >= 2 ? (
          // Multi-select: suppress single-stop route preview so users don't
          // edit/look at "the wrong one" while the bulk bar is the active surface.
          <div className="flex h-full flex-col items-center justify-center bg-muted/15 px-8 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border">
              <MapIcon className="size-7 text-muted-foreground/40" />
            </div>
            <p className="font-bold text-sm text-foreground">Multiple stops selected</p>
            <p className="mt-1.5 max-w-[240px] text-muted-foreground text-xs leading-relaxed">
              Map preview is hidden while bulk editing. Clear selection or pick one stop to view route details.
            </p>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="mt-3 inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3" /> Clear selection
            </button>
          </div>
        ) : (
          // Map always renders for single-stop selection. DropOff swaps the
          // origin to the fixed Routely DropOff hub (see pickupFull above) so
          // the dispatcher still gets ETA / miles / route geography — the
          // delivery physically starts from that hub even though no pickup
          // sibling stop exists.
          <GoogleMap
            active={mobileTab === "map"}
            pickupAddr={pickupFull}
            deliveryAddr={deliveryFull}
            pickupName={pickupMapName}
            deliveryName={activeDraft?.recipient_name || selected?.recipient_name}
          />
        )}
      </div>

      {/* Mobile bottom nav */}
      <div className="fixed right-0 bottom-0 left-0 z-50 flex border-border border-t bg-card/95 shadow-lg backdrop-blur sm:hidden">
        {[
          { key: "list" as const, label: "Stops", Icon: Package },
          { key: "detail" as const, label: "Details", Icon: User },
          { key: "map" as const, label: "Map", Icon: MapIcon },
        ].map(({ key, label, Icon }) => {
          // Details & Map show a SINGLE stop's info — keep them locked when no
          // stop is open (no submitted selection / draft) AND when 2+ stops are
          // multi-selected (those tabs can't represent multiple stops). The
          // Stops list is always reachable.
          const needsSelection = key === "detail" || key === "map";
          const multiSelected = selectedIds.size >= 2;
          const navDisabled = needsSelection && (multiSelected || (!selected && !activeDraft));
          const disabledHint = multiSelected ? "Select a single stop to view its details" : "Open a stop first";
          return (
            <button
              key={key}
              type="button"
              disabled={navDisabled}
              title={navDisabled ? disabledHint : undefined}
              aria-disabled={navDisabled}
              onClick={() => {
                if (navDisabled) return;
                setMobileTab(key);
              }}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 font-semibold text-[11px] transition-colors",
                navDisabled
                  ? "cursor-not-allowed text-muted-foreground/30"
                  : mobileTab === key
                    ? "text-primary"
                    : "text-muted-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-5",
                  navDisabled
                    ? "text-muted-foreground/30"
                    : mobileTab === key
                      ? "text-primary"
                      : "text-muted-foreground",
                )}
              />
              {label}
            </button>
          );
        })}
      </div>

      {/* Floating bulk action bar — shadcn-style card surface, dark-mode aware */}
      <AnimatePresence>
        {someSelected &&
          (selectedIds.size >= 2 || allFilteredSelected) &&
          (() => {
            const selectedDraftIds = [...selectedIds].filter((id) => id.startsWith("draft_"));
            const selectedSubmittedCount = selectedIds.size - selectedDraftIds.length;
            const onlySubmitted = selectedDraftIds.length === 0;
            const mixed = selectedDraftIds.length > 0 && selectedSubmittedCount > 0;
            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2 }}
                className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 sm:bottom-4"
              >
                <div className="flex max-w-[calc(100vw-1rem)] items-center gap-1.5 rounded-2xl border border-border/60 bg-card/95 px-2 py-1.5 shadow-2xl backdrop-blur-sm sm:gap-2 sm:px-3 sm:py-2 dark:border-border/80 dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="flex items-center gap-1.5 rounded-md px-1.5 py-1 font-semibold text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Clear selection"
                  >
                    <X className="size-3.5" />
                    <span className="tabular-nums">{selectedIds.size}</span> selected
                  </button>
                  <div className="h-4 w-px bg-border/60" />
                  <div className="flex items-center gap-1">
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={onlySubmitted ? 0 : -1}>
                            <button
                              type="button"
                              disabled={onlySubmitted}
                              onClick={() => setBulkEditOpen(true)}
                              className="rounded-lg px-2.5 py-1 font-semibold text-[11px] text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                            >
                              Edit
                            </button>
                          </span>
                        </TooltipTrigger>
                        {onlySubmitted && <TooltipContent>Bulk edit is available for drafts only</TooltipContent>}
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={onlySubmitted ? 0 : -1}>
                            <button
                              type="button"
                              disabled={onlySubmitted || bulkSubmitting}
                              onClick={bulkSubmitDrafts}
                              className="rounded-lg bg-primary px-3 py-1 font-bold text-[11px] text-primary-foreground shadow-sm transition-opacity hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {bulkSubmitting
                                ? bulkProgress
                                  ? `Submitting ${bulkProgress.done}/${bulkProgress.total}\u2026`
                                  : "Submitting\u2026"
                                : "Submit"}
                            </button>
                          </span>
                        </TooltipTrigger>
                        {onlySubmitted && <TooltipContent>Submit is available for drafts only</TooltipContent>}
                      </Tooltip>
                    </TooltipProvider>
                    {/* Delete now works for drafts AND submitted/unassigned stops
                        (submitted route through the Spoke-safe individual DELETE). */}
                    <button
                      type="button"
                      disabled={bulkDeleting}
                      onClick={deleteSelected}
                      className="rounded-lg px-2.5 py-1 font-semibold text-[11px] text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      {bulkDeleting ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                  {mixed && (
                    <span className="hidden text-[10px] text-muted-foreground/70 sm:inline">
                      Edit &amp; Submit apply to {selectedDraftIds.length} draft{selectedDraftIds.length > 1 ? "s" : ""}{" "}
                      only
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })()}
      </AnimatePresence>

      {/* OCR Scan Modal */}
      <AnimatePresence>
        {ocrOpen && (
          <OCRScanModal
            open={ocrOpen}
            onOpenChange={(o) => {
              setOcrOpen(o);
              if (!o) setReviewFile(null);
            }}
            initialFile={reviewFile}
            onBatchFiles={(files) => {
              setOcrOpen(false);
              const overflow = files.length > BATCH_MAX_IMAGES ? files.slice(BATCH_MAX_IMAGES) : [];
              setBatchOverflow(overflow);
              const valid = files.filter((f) => f.size <= BATCH_MAX_FILE_MB * 1024 * 1024).slice(0, BATCH_MAX_IMAGES);
              if (valid.length < files.slice(0, BATCH_MAX_IMAGES).length) {
                toast.error(`Some images exceed ${BATCH_MAX_FILE_MB} MB and were skipped`, { position: "top-center" });
              }
              if (valid.length === 0) return;
              setBatchFiles(valid);
            }}
            onSubmit={async (data) => {
              await submitOcrDraft(data);
            }}
            failedCount={failedCount}
            onFailedCountChange={setFailedCount}
            onResolveSubmit={async (scan, data) => {
              // SILENT: the non-silent path calls setOcrOpen(false), which closed
              // the whole OCR window on Submit (the real reason the prior
              // "return to Failed list" fix never took). Silent posts the draft +
              // optimistic insert WITHOUT closing, so the form returns to the
              // Failed Scans list. We refresh the lists + badge ourselves.
              const r = await submitOcrDraft(data, { silent: true });
              if (r.ok) {
                void resolveFailedScan(scan.id, "resolved");
                refreshFailedCount();
                refreshAllLists();
                toast.success("Stop created from failed scan", { position: "top-center", duration: 2000 });
              }
              return r;
            }}
          />
        )}
      </AnimatePresence>

      {/* OCR Batch Scan Modal (Phase D) — sequential auto-advance queue */}
      <AnimatePresence>
        {batchFiles && (
          <OCRBatchModal
            open
            files={batchFiles}
            overflowFiles={batchOverflow.length > 0 ? batchOverflow : undefined}
            onOpenChange={(o) => {
              if (!o) {
                setBatchFiles(null);
                setBatchOverflow([]);
                refreshAllLists(); // one refresh for the whole batch — drafts + submitted + list
                refreshFailedCount(); // the batch may have persisted new failed scans
              }
            }}
            onSubmitDraft={(data, signal) => submitOcrDraft(data, { silent: true, signal })}
            onReviewFailed={(files) => {
              setBatchFiles(null);
              loadDrafts();
              setFailedReviewQueue(files);
            }}
          />
        )}
      </AnimatePresence>

      {/* Barcode Scan Modal — drops the decoded value into the search box so the
          list filters automatically. Barcodes are printed on submitted labels
          (drafts show "Tracking Pending"), so we also flip to the Submitted tab
          where the scanned stop actually lives. */}
      <AnimatePresence>
        {scanOpen && (
          <BarcodeScanModal
            open={scanOpen}
            onOpenChange={setScanOpen}
            onDetected={(value) => {
              setListSearch(value);
              setStatusTab("submitted");
              setScanOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Bulk edit dialog */}
      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        draftIds={[...selectedIds].filter((id) => id.startsWith("draft_"))}
        locations={locations}
        onApplied={({ prop, pickupLocation }) => {
          // Optimistic update for Pickup: reflect the new pickup in the open
          // panel and in the left list immediately, before loadDrafts returns.
          if (prop === "pickup" && pickupLocation) {
            const affected = new Set([...selectedIds].filter((id) => id.startsWith("draft_")));
            setActiveDraft((prev) =>
              prev && affected.has(prev.draft_id)
                ? {
                    ...prev,
                    pickup_location_id: pickupLocation.id,
                    pickup_address: pickupLocation.address ?? prev.pickup_address,
                  }
                : prev,
            );
            setDrafts((prev) =>
              prev.map((d) =>
                affected.has(d.id)
                  ? {
                      ...d,
                      pickup_location_id: pickupLocation.id,
                      pickup_address: pickupLocation.address ?? d.pickup_address,
                      pickup_name: pickupLocation.name ?? d.pickup_name,
                    }
                  : d,
              ),
            );
          }
          // Always refresh to converge with Mongo
          loadDrafts();
        }}
      />
    </div>
  );
}
