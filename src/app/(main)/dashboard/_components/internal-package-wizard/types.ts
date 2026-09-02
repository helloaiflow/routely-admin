/* Internal Package wizard — shared types, constants and small helpers.
 * CEO premium-wizard spec, 2026-09-01. One typed state object drives all
 * five steps; nothing is created server-side until Review is confirmed. */

export type Address = { street: string; city: string; state: string; zip: string };

export type PickupLocation = {
  id: string;
  location_id: string;
  name: string;
  address: Address;
  contact_name?: string;
  contact_phone?: string;
  is_default?: boolean;
  active?: boolean;
};

export type NewOfficeDraft = { name: string; street: string; city: string; state: string; zip: string; phone: string };
export const EMPTY_OFFICE: NewOfficeDraft = { name: "", street: "", city: "", state: "FL", zip: "", phone: "" };

/** 1 Route · 2 Recipient · 3 Package · 4 Review · 5 Created */
export type WizardStep = 1 | 2 | 3 | 4 | 5;
export const STEP_LABELS: Record<WizardStep, string> = {
  1: "Route",
  2: "Recipient",
  3: "Package",
  4: "Review",
  5: "Created",
};

/** CONTENTS tiles (CEO set, 2026-09-01). These no longer touch billing:
 *  the posted package_type is ALWAYS "internal" — the tile only rides in
 *  the driver notes ("Contents: …") and on the label tags. */
export const PACKAGE_TILES: { id: string; label: string; hint: string }[] = [
  { id: "document", label: "Document / Envelope", hint: "Paperwork, records, mail" },
  { id: "rx", label: "Prescription", hint: "Rx bags and refills" },
  { id: "cold", label: "Cold Package", hint: "Refrigerated 2–8°C" },
  { id: "flyers", label: "Flyers", hint: "Marketing material" },
  { id: "toners", label: "Toners", hint: "Printer supplies" },
  { id: "other", label: "Others", hint: "Anything else" },
];

/** requires_signature is a REAL API field; the rest ride in the notes the
 *  driver sees (no backend field exists yet — documented deviation). */
export const HANDLING_OPTIONS = [
  { id: "signature", label: "Signature required" },
  { id: "upright", label: "Keep upright" },
  { id: "fragile", label: "Fragile" },
  { id: "cold", label: "Cold 2–8°C" },
] as const;
export type HandlingId = (typeof HANDLING_OPTIONS)[number]["id"];

export const READY_OPTIONS = [
  { id: "now", label: "Ready now" },
  { id: "1h", label: "Ready in 1 hour" },
  { id: "2h", label: "Ready in 2 hours" },
] as const;

/** Maps to orders/create delivery_type (billing service tier). */
export const PRIORITY_OPTIONS = [
  { id: "next_day", label: "Standard" },
  { id: "same_day", label: "Same day" },
  { id: "on_demand", label: "Urgent (on-demand)" },
] as const;

export type WizardState = {
  fromId: string;
  toId: string;
  recipientName: string;
  recipientPhone: string; // display-formatted
  recipientEmail: string;
  deliveryFormatted: string; // single-line verified address
  deliverySuite: string;
  deliveryStreet: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryZip: string;
  addressVerified: boolean;
  lat?: number;
  lng?: number;
  packageType: string;
  handling: HandlingId[];
  readyTime: (typeof READY_OPTIONS)[number]["id"];
  priority: (typeof PRIORITY_OPTIONS)[number]["id"];
  notes: string;
  confirmChecked: boolean;
};

export const EMPTY_WIZARD: WizardState = {
  fromId: "",
  toId: "",
  recipientName: "",
  recipientPhone: "",
  recipientEmail: "",
  deliveryFormatted: "",
  deliverySuite: "",
  deliveryStreet: "",
  deliveryCity: "",
  deliveryState: "FL",
  deliveryZip: "",
  addressVerified: false,
  packageType: "document",
  handling: ["signature"],
  readyTime: "now",
  priority: "next_day",
  notes: "",
  confirmChecked: false,
};

export type RouteEstimate = { miles: number | null; duration: string | null; pending: boolean };

export function digits10(v: string): string {
  return v.replace(/\D/g, "").slice(0, 10);
}

export function formatPhone(raw: string): string {
  const d = digits10(raw);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function fullAddress(a: Address): string {
  return [a.street, [a.city, a.state].filter(Boolean).join(", "), a.zip].filter(Boolean).join(", ");
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "SEP 01 2026" — the label date band. */
export function labelDate(): string {
  return new Date()
    .toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
    .replace(",", "")
    .toUpperCase();
}

export function handlingLabels(handling: HandlingId[]): string[] {
  return HANDLING_OPTIONS.filter((h) => handling.includes(h.id)).map((h) => h.label);
}
