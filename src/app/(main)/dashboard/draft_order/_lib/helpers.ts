export type Carrier = "routely" | "fedex" | "usps" | "ups";

export const CARRIER_PRICES: Record<Carrier, number> = {
  routely: 0,
  fedex: 12.99,
  usps: 7.99,
  ups: 11.49,
};

export const CARRIER_LABELS: Record<Carrier, string> = {
  routely: "Routely Local",
  fedex: "FedEx Priority",
  usps: "USPS Ground",
  ups: "UPS Ground",
};

export const DELIVERY_TAGS = [
  { id: "dog", emoji: "🐕", label: "Dog present" },
  { id: "ring", emoji: "🔔", label: "Ring bell" },
  { id: "leave", emoji: "✅", label: "Leave at door" },
  { id: "call", emoji: "📱", label: "Call on arrival" },
  { id: "text_only", emoji: "💬", label: "Text only" },
  { id: "lobby", emoji: "🏢", label: "Leave w/ lobby" },
  { id: "side", emoji: "🚪", label: "Side entrance" },
  { id: "silent", emoji: "🤫", label: "Silent delivery" },
  { id: "elderly", emoji: "🧓", label: "Elderly patient" },
  { id: "access", emoji: "♿", label: "Accessibility" },
  { id: "no_call", emoji: "📵", label: "No calls" },
] as const;

export type DeliveryTagId = (typeof DELIVERY_TAGS)[number]["id"];

export type DraftOrder = {
  id: string;
  status: "draft" | "pending" | "approved";

  // Pickup
  pickup_address: string;
  pickup_location_id?: string;
  pickup_lat?: number;
  pickup_lng?: number;

  // Delivery
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  delivery_lat?: number;
  delivery_lng?: number;
  apt_unit?: string;
  delivery_type?: "same_day" | "next_day";
  is_same_day?: boolean;
  delivery_date?: string;

  // Recipient
  recipient_name: string;
  recipient_phone: string;
  recipient_email?: string;

  // Package
  package_type?: "rx" | "cold" | "regular";
  rx_number?: string;
  weight_oz?: number;
  length_in?: number;
  width_in?: number;
  height_in?: number;

  // Options
  requires_signature?: boolean;
  collect_cod?: boolean;
  collect_amount?: string;

  // Delivery instructions
  notes?: string;
  delivery_tags?: DeliveryTagId[];
  gate_code?: string;

  // Carrier & cost
  carrier?: "routely" | "fedex" | "usps" | "ups";
  carrier_price?: number;
  estimated_miles?: number;
  estimated_cost?: number;

  created_at: string;
  updated_at: string;
};

export type DraftFilter = "all" | "draft" | "pending" | "approved";

export function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function fmtPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
