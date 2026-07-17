/** Shared config + types for the Settings experience. */

export type SettingsTab =
  | "account"
  | "billing"
  | "notifications"
  | "plans"
  | "pickup"
  | "invoices"
  | "team";

export type BillingData = {
  plan: string;
  paymentTerm: string;
  paymentType: string;
  stripeCustomerId: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null;
};

/* ── Billing charges API shapes (GET /api/client/billing/charges) ── */
export type ChargeRow = {
  id: string;
  date: string;
  kind: "shipping_label";
  title: string;
  subtitle: string;
  amount: number;
  status: string;
  carrier: string | null;
  service: string | null;
  tracking: string | null;
  tracking_url: string | null;
};

export type BillTo = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  full_address: string;
  phone: string;
  email: string;
};

export type BillingCharges = {
  bill_to?: BillTo;
  month: {
    label: string;
    package_expense: number;
    delivery_expense: number;
    miles_expense: number;
    total: number;
    outstanding: number;
    packages: number;
    miles: number;
  };
  pricing: {
    price_per_stop: number;
    price_per_mile: number;
    plan_type: string;
    billing_method: string;
    billing_status: string | null;
  };
  projection: { run_rate: number; projected_total: number; days_in_month: number; day_of_month: number };
  series: { date: string; spend: number; count: number }[];
  charges: ChargeRow[];
};

/* ── Pickup locations (GET/POST/PATCH/DELETE /api/client/pickup-locations) ──
 * Canonical shape: address is a NESTED object. Older/seeded entries may also
 * carry flat fields or a string address, so always read via `pickupParts`. */
export type PickupLocation = {
  id: string;
  location_id: string;
  name: string;
  address?: { street?: string; city?: string; state?: string; zip?: string } | string;
  // Some seeded/legacy entries store these flat instead of under address.
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  contact_name?: string;
  contact_phone?: string;
  hours?: string;
  notes?: string;
  is_default?: boolean;
  active?: boolean;
  code?: string;
  legacy_id?: string;
};

/** Normalize a pickup entry (nested object, flat fields, or string) into parts
 *  plus a display string — mirrors the order flow's own normalizer. */
export function pickupParts(loc: PickupLocation): {
  street: string;
  city: string;
  state: string;
  zip: string;
  display: string;
} {
  const a = loc.address;
  const obj = a && typeof a === "object" ? a : {};
  const street = String(obj.street ?? loc.street ?? "");
  const city = String(obj.city ?? loc.city ?? "");
  const state = String(obj.state ?? loc.state ?? "");
  const zip = String(obj.zip ?? loc.zip ?? "");
  const stateZip = [state, zip].filter(Boolean).join(" ");
  const formatted = [street, city, stateZip].filter(Boolean).join(", ");
  const display = formatted || (typeof a === "string" ? a : "");
  return { street, city, state, zip, display };
}

export type NotificationPrefs = {
  delivery_confirmed: boolean;
  pickup_notification: boolean;
  delivery_failed: boolean;
  weekly_summary: boolean;
  monthly_report: boolean;
  email_channel: boolean;
  sms_channel: boolean;
};

export const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    unit: "",
    desc: "Try Routely risk-free with up to 3 stops.",
    features: ["3 stops total", "1 route", "Real-time GPS", "Proof of delivery"],
  },
  {
    id: "starter",
    name: "Starter",
    price: "$16",
    unit: "/stop",
    desc: "For small clinics and pharmacies.",
    features: ["Unlimited routes", "POD photos", "HIPAA handling", "3 users", "Email support"],
  },
  {
    id: "professional",
    name: "Professional",
    price: "$14",
    unit: "/stop",
    desc: "For growing practices with higher volume.",
    features: ["Sofia AI dispatcher", "Web order portal", "Advanced analytics", "10 users", "Priority support"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "$12",
    unit: "/stop",
    desc: "For hospital networks and large operations.",
    features: ["API & webhooks", "Custom integrations", "SLA guarantee", "Unlimited users", "Dedicated manager"],
  },
] as const;

export const PAYMENT_TERMS = [
  { id: "on_demand", label: "On Demand", desc: "Charged per delivery. Best for variable volume.", tier: "all" },
  { id: "weekly", label: "Weekly", desc: "Invoiced every Friday. Standard recurring billing.", tier: "all" },
  { id: "biweekly_net7", label: "Bi-Weekly Net 7", desc: "Invoiced bi-weekly with 7-day payment terms.", tier: "pro" },
  { id: "monthly_net5", label: "Monthly Net 5", desc: "Monthly invoice with 5-day payment terms.", tier: "pro" },
] as const;

export const money = (n: number | undefined | null) =>
  typeof n === "number" ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—";

export const shortDate = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

export const fullDate = (iso: string | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
