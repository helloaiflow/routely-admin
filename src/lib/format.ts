/* Shared address/phone form helpers — single home (density Phase 1d).
 * Display-casing lives in lib/format-display; currency/date in lib/ui/format.
 * These were duplicated across hubs-tab / drivers-tab / new-pickup-dialog. */

export type Address = { line1?: string; city?: string; state?: string; zip?: string };

/** Joined display string used to pre-fill an address autocomplete on edit. */
export function formatAddr(a?: Address | null): string {
  if (!a) return "";
  return [a.line1, a.city, a.state, a.zip].filter(Boolean).join(", ");
}

export function hasAddr(a?: Address | null): boolean {
  return Boolean(a && (a.line1 || a.city || a.state || a.zip));
}

/** Full one-line address for map queries: "line1, City, ST zip". */
export function fullAddress(a?: Address | null): string {
  if (!a) return "";
  const cityState = [a.city, a.state].filter(Boolean).join(", ");
  const tail = [cityState, a.zip].filter(Boolean).join(" ").trim();
  return [a.line1, tail].filter(Boolean).join(", ");
}

/** Build an Address from four inputs, or undefined when they're all empty. */
export function buildAddress(line1: string, city: string, state: string, zip: string): Address | undefined {
  const addr: Address = {
    line1: line1.trim() || undefined,
    city: city.trim() || undefined,
    state: state.trim() || undefined,
    zip: zip.trim() || undefined,
  };
  return Object.values(addr).some(Boolean) ? addr : undefined;
}

/** Human one-line "line1 · City, ST zip" for list rows. */
export function addressLine(a?: Address | null): string {
  if (!a) return "";
  const cityLine = [a.city, a.state, a.zip].filter(Boolean).join(", ").replace(/, (\d)/, " $1");
  return [a.line1, cityLine].filter(Boolean).join(" · ");
}

/** Progressive (XXX) XXX-XXXX mask while typing; digits only, capped at 10.
 * Submit paths strip to digits — this is display-while-typing only. */
export function formatPhoneInput(raw: string): string {
  const d = (raw || "").replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Canonical display formatter re-exported from the ui/format home. */
export { formatPhone } from "@/lib/ui/format";
