import { logExternalCall } from "@/lib/api-log";
import { spokeDispatchEnabled } from "@/lib/spoke-dispatch";
import { patchStopDoc } from "@/lib/stops-store";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export type OrderBody = {
  pickup_address?: string;
  pickup_city?: string;
  pickup_state?: string;
  pickup_zip?: string;
  pickup_code?: string;
  pickup_name?: string;
  pickup_location_id?: string;
  /** Nested pickup object — FastAPI accepts this shape for DropOff
   *  detection (pickup.location_id === "dropoff"). */
  pickup?: {
    location_id?: string;
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    code?: string;
  };
  /** "delivery" (default) | "pickup" | "return" | "dropoff" — FastAPI's
   *  preferred DropOff signal. Forwarded as-is. */
  stop_type?: string;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_email?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_state?: string;
  delivery_zip?: string;
  delivery_date?: string;
  delivery_type?: "same_day" | "next_day" | string;
  package_type?: "rx" | "cold" | "regular" | string;
  rx_number?: string;
  gate_code?: string;
  notes?: string;
  requires_signature?: boolean;
  collect_cod?: boolean;
  collect_amount?: string;
  estimated_miles?: number;
  miles?: number;
  stops?: number;
  same_day_fee?: number;
  total_amount?: number;
  payment_status?: "paid" | "pending" | "failed";
  stripe_payment_intent_id?: string;
  stripe_checkout_session_id?: string;
  tracking_id?: string;
  /** Idempotency key — FastAPI dedupes on it so a retried submit of the same
   *  draft resolves to the same stop pair, and binds the resulting stop to the
   *  originating draft. */
  created_from_draft_id?: string;
  tenant_id?: number;
};

export function genTracking(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = "RTL-";
  for (let i = 0; i < 8; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function normalizePhoneE164(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length > 0) return `+${digits}`;
  return null;
}

// ─────────────────────────────────────────────────────────
// Main: create order with Mongo writes + Spoke dispatch
// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────
// Repost an EXISTING stop to Spoke (ghost recovery / retry fallback)
// ─────────────────────────────────────────────────────────
//
// Used to heal a "ghost" — a stop in public.stops with an in-Spoke status
// (unassigned/…) but NO assignment.spoke_stop_id, because the original Spoke
// POST failed/timed-out after the doc was already written. This is the exact
// failure the "verify Spoke accepted before trusting the stop record" rule guards against.
//
// SELF-CONTAINED + keyed by stop_id + tenant_id (NOT rtscan_id): FastAPI-created
// docs may not carry an rtscan_id, and an `{ rtscan_id: undefined }` filter would
// match unrelated docs. This function never double-posts (returns the existing
// spoke id if already present) and only flips status→unassigned on a VERIFIED
// Spoke acceptance.
export async function repostStopToSpoke(
  stop: Record<string, unknown>,
): Promise<{ status: "dispatched" | "spoke_error" | "already"; spoke_stop_id?: string }> {
  const assignment = (stop.assignment as Record<string, unknown> | undefined) ?? {};
  const existing = assignment.spoke_stop_id;
  if (existing) return { status: "already", spoke_stop_id: String(existing) };

  const stopId = String(stop.stop_id ?? "");
  const tenantId = Number(stop.tenant_id);
  if (!stopId || !Number.isFinite(tenantId)) return { status: "spoke_error" };
  const saveFields = (set: Record<string, unknown>) => patchStopDoc(stopId, tenantId, set);
  // Misión 8 (D56): Spoke dispatch off — never post (callers already refuse first).
  if (!spokeDispatchEnabled()) {
    console.warn("[repost] SPOKE_DISPATCH_ENABLED=false — not posting", stopId);
    return { status: "spoke_error" };
  }

  const spokeKey = process.env.SPOKE_API_KEY ?? "";
  if (!spokeKey) {
    console.error("[repost] SPOKE_API_KEY missing");
    return { status: "spoke_error" };
  }

  const recipient = (stop.recipient as Record<string, unknown> | undefined) ?? {};
  const address = (stop.address as Record<string, unknown> | undefined) ?? {};
  const pkg = (stop.package as Record<string, unknown> | undefined) ?? {};
  const service = (stop.service as Record<string, unknown> | undefined) ?? {};

  const recipientName = String(recipient.name ?? "");
  const recipientPhone = String(recipient.phone ?? "");
  const recipientEmail = String(recipient.email ?? "");
  const deliveryAddr = String(address.street ?? "");
  const deliveryCity = String(address.city ?? "");
  const deliveryState = String(address.state ?? "FL");
  const deliveryZip = String(address.zip ?? "");
  const gateCode = String(address.gate_code ?? "");
  const notes = String(pkg.notes ?? "");
  const rxNumber = String(pkg.rx_number ?? "");
  const rx_pharma_id = String(stop.order_ref ?? rxNumber ?? stopId);
  const isSameDay = service.type === "same_day";
  const requiresSignature = Boolean(pkg.requires_signature);
  const collectCod = Boolean(service.collect_payment);
  const collectAmount = String(service.cod_amount ?? "0");

  try {
    const SPOKE_BASE = "https://api.getcircuit.com/public/v0.2b";
    const spokeAuth = `Basic ${Buffer.from(`${spokeKey}:`).toString("base64")}`;

    const deliveryLines: string[] = [];
    if (isSameDay) deliveryLines.push("📦 Delivery Today: YES");
    if (requiresSignature) deliveryLines.push("✍️ Signature Required");
    if (gateCode) deliveryLines.push(`Gate Code: ${gateCode}`);
    if (collectCod) deliveryLines.push(`💵 Collect on Delivery: $${collectAmount || "0.00"}`);
    const extraNote = deliveryLines.length > 0 ? `\n\n${deliveryLines.join("\n")}` : "";
    const finalNote = (notes + extraNote).trim() || null;
    const phoneE164 = normalizePhoneE164(recipientPhone);

    const spokePayload: Record<string, unknown> = {
      address: {
        addressLineOne: deliveryAddr,
        city: deliveryCity,
        state: deliveryState,
        zip: deliveryZip,
        country: "US",
      },
      recipient: {
        name: recipientName,
        ...(phoneE164 ? { phone: phoneE164 } : {}),
        ...(recipientEmail ? { email: recipientEmail } : {}),
      },
      orderInfo: {
        sellerOrderId: rx_pharma_id,
        sellerName: String(tenantId),
        products: rxNumber ? [`Rx: ${rxNumber}`] : [],
      },
      notes: finalNote,
      barcodes: [],
      packageCount: 1,
      activity: "delivery",
      proofOfAttemptRequirements: { enabled: true },
    };

    const startedRepost = Date.now();
    const res = await fetch(`${SPOKE_BASE}/unassignedStops`, {
      method: "POST",
      headers: { Authorization: spokeAuth, "Content-Type": "application/json" },
      body: JSON.stringify(spokePayload),
    });

    if (res.ok) {
      const spokeStop = (await res.json()) as { id: string };
      logExternalCall({
        provider: "spoke",
        operation: "spoke.create_stop.repost",
        method: "POST",
        status_code: res.status,
        ok: true,
        latency_ms: Date.now() - startedRepost,
        tenant_id: tenantId,
        stop_id: stopId,
      });
      // Verified acceptance — NOW it is truly in Spoke. Flip status honestly.
      await saveFields({
        "assignment.spoke_stop_id": spokeStop.id,
        dispatch_status: "dispatched",
        status: "unassigned",
        spoke_unconfirmed: false,
        updated_at: new Date(),
      });
      console.log(`[repost] ✓ healed ghost ${stopId} → spoke ${spokeStop.id}`);
      return { status: "dispatched", spoke_stop_id: spokeStop.id };
    }

    const errText = await res.text().catch(() => "");
    logExternalCall({
      provider: "spoke",
      operation: "spoke.create_stop.repost",
      method: "POST",
      status_code: res.status,
      ok: false,
      error_message: errText,
      latency_ms: Date.now() - startedRepost,
      tenant_id: tenantId,
      stop_id: stopId,
    });
    console.error(`[repost] ✗ stop=${stopId} status=${res.status} body=${errText.slice(0, 300)}`);
    await saveFields({
      // Honesty rule: a failed re-post is NOT in Spoke → fall back to draft +
      // submit_error so it's recoverable in the Drafts flow, not stranded.
      status: "draft",
      submit_error: { at: new Date(), reason: errText.slice(0, 300), spoke_status: res.status, attempt_count: 1 },
      dispatch_status: "spoke_error",
      spoke_error: errText.slice(0, 500),
      updated_at: new Date(),
    });
    return { status: "spoke_error" };
  } catch (err) {
    console.error("[repost] exception:", err);
    await saveFields({
      status: "draft",
      submit_error: { at: new Date(), reason: String(err).slice(0, 300), spoke_status: null, attempt_count: 1 },
      dispatch_status: "spoke_error",
      updated_at: new Date(),
    });
    return { status: "spoke_error" };
  }
}
