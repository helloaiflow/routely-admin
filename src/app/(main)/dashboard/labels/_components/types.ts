/** Shape of a label_orders document as served by GET /api/client/labels.
 *  Mirrors production data — see the checkout/purchase routes for the writers.
 *  BUSINESS RULE: rate.raw_price / margin are NEVER shown in the UI. */

export type LabelStatus = "pending_payment" | "purchased" | "refunded" | "refund_failed" | "failed";

export interface LabelAddress {
  name?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  email?: string;
  phone?: string;
}

export interface LabelOrder {
  order_id: string;
  tenant_id: string;
  created_by?: string;
  created_at: string;
  purchased_at?: string;
  status: LabelStatus;
  from_address?: LabelAddress;
  to_address?: LabelAddress;
  package_type?: "standard" | "rx" | "cold" | "internal" | null;
  rate?: {
    rate_id?: string;
    provider?: string;
    service?: string;
    days?: number | null;
    client_price?: number;
    currency?: string;
  };
  payment?: {
    type?: "card" | "postpay";
    amount_cents?: number;
    payment_intent_id?: string;
    refund_id?: string;
    /** Non-sensitive display metadata captured at purchase (design 6). */
    card_brand?: string | null;
    card_last4?: string | null;
  };
  shippo?: {
    transaction_id?: string;
    tracking_number?: string;
    tracking_url?: string;
    label_url?: string;
  };
  recipient_notified_at?: string;
  error?: string;
}

export type RangeKey = "7d" | "30d" | "90d" | "all";

export const RANGE_DAYS: Record<Exclude<RangeKey, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** Status → semantic badge treatment (tokens only — gate-compliant). */
export const STATUS_META: Record<LabelStatus, { label: string; cls: string; dot: string }> = {
  purchased: {
    label: "Purchased",
    cls: "bg-success/10 text-success border-success/25",
    dot: "bg-success",
  },
  pending_payment: {
    label: "Pending",
    cls: "bg-warning/15 text-warning-foreground border-warning/30 dark:text-warning",
    dot: "bg-warning",
  },
  refunded: {
    label: "Refunded",
    cls: "bg-destructive/10 text-destructive border-destructive/25",
    dot: "bg-destructive",
  },
  refund_failed: {
    label: "Refund failed",
    cls: "bg-destructive/15 text-destructive border-destructive/40",
    dot: "bg-destructive",
  },
  failed: {
    label: "Failed",
    cls: "bg-destructive/10 text-destructive border-destructive/25",
    dot: "bg-destructive",
  },
};

export const CARRIER_LOGOS: Record<string, string> = {
  usps: "/img/carriers/usps.svg",
  ups: "/img/carriers/ups.svg",
  fedex: "/img/carriers/fedex.svg",
};

export const PACKAGE_TYPE_LABELS: Record<string, string> = {
  standard: "Standard",
  rx: "RX Prescription",
  cold: "Cold Package",
  internal: "Internal",
};

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

const RTF = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;

export function relTime(iso: string | undefined): string {
  if (!iso || !RTF) return "—";
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return RTF.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return RTF.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return RTF.format(Math.round(diff / 86400), "day");
  return shortDate(iso);
}

/** purchased_at + N BUSINESS days (skips Sat/Sun) → estimated arrival Date.
 *  It is an ESTIMATE from rate.days — always label it "Est." in the UI. */
export function estArrival(order: LabelOrder): Date | null {
  const days = order.rate?.days;
  const base = order.purchased_at ?? (order.status === "purchased" ? order.created_at : undefined);
  if (days == null || days <= 0 || !base) return null;
  const d = new Date(base);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return d;
}

export const estArrivalLabel = (order: LabelOrder): string | null => {
  const d = estArrival(order);
  return d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : null;
};
