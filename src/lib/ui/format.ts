// ── Formatting helpers — single source of truth ────────────────────────────
// Every display formatter lives here. Do NOT reimplement toTitleCase /
// formatPhone / formatDate / formatTime / formatCurrency anywhere else; import
// from "@/lib/ui/format". (search/_helpers + default/_helpers re-export these.)

import { formatDisplayCase } from "@/lib/format-display";

// Canonical display casing for DB ALL-CAPS data. Delegates to
// formatDisplayCase: preserves FL/directionals/LLC, ordinals (12th), name
// particles (de la), and leaves already-mixed-case input untouched.
export function toTitleCase(s: string): string {
  return formatDisplayCase(s);
}

export { formatDisplayCase };

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return phone;
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s.includes("T") ? s : `${s}T12:00:00`);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return s;
  }
}

export function formatTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

// Every money value in the billing module is stored/transmitted in integer
// cents (FastAPI owns the calculation); this is the ONE place that divides
// by 100 for display, so a `$1963.00`-style missing-thousands-separator bug
// can't recur in one surface while another correctly uses formatCurrency.
export function formatCurrencyCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return formatCurrency(cents / 100);
}
