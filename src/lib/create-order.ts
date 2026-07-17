import type { Db, ObjectId } from "mongodb";

import { logExternalCall } from "@/lib/api-log";
import { getDb } from "@/lib/tenant";

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
  /** Idempotency key — links a backup-queued order back to its draft so the
   *  n8n backup workflow can dedupe against FastAPI and bind the resulting
   *  stop to the originating draft (mirrors FastAPI's dedupe key). */
  created_from_draft_id?: string;
  tenant_id?: number;
};

export type CreateOrderResult = {
  ok: boolean;
  rtscan_id: number;
  rtstop_id: number;
  tracking_number: string;
  dispatch_status: "dispatched" | "spoke_error" | "backup_queued" | "blocked";
  spoke_stop_id?: string;
  total_amount: number;
  label_url: string;
  message: string;
};

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

async function nextRtstop(db: Db): Promise<number> {
  const result = await db
    .collection("counters")
    .findOneAndUpdate(
      { _id: "rtstop" as unknown as ObjectId },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return (result?.seq as number) ?? 1;
}

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

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// ─────────────────────────────────────────────────────────
// Main: create order with Mongo writes + Spoke dispatch
// ─────────────────────────────────────────────────────────

export async function createOrder(tenantId: number, body: OrderBody): Promise<CreateOrderResult> {
  const db = await getDb();
  const tenant = await db.collection("tenants").findOne({ tenant_id: tenantId });
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  const now = new Date();
  const rtscan_id = Date.now();
  const rtstop_id = await nextRtstop(db);
  // Use provided tracking_id (from draft) or generate a new one
  const tracking_number = body.tracking_id ? String(body.tracking_id) : genTracking();

  // Normalize inputs
  const recipientName = String(body.recipient_name || "").trim();
  const recipientPhone = String(body.recipient_phone || "").replace(/\D/g, "");
  const recipientEmail = String(body.recipient_email || "").trim();
  const pickupAddr = String(body.pickup_address || "").trim();
  const deliveryAddr = String(body.delivery_address || "").trim();
  const deliveryCity = String(body.delivery_city || "").trim();
  const deliveryState = String(body.delivery_state || "FL").trim();
  const deliveryZip = String(body.delivery_zip || "").trim();
  const packageType = String(body.package_type || "rx");
  const rxNumber = String(body.rx_number || "").trim();
  const gateCode = String(body.gate_code || "");
  const notes = String(body.notes || "");
  const deliveryDate = String(body.delivery_date || "");
  const deliveryType = String(body.delivery_type || "next_day");
  const paymentStatus = String(body.payment_status || "paid");
  const sameDayFee = Number(body.same_day_fee || 0);
  const stops = Number(body.stops || 2);
  const actualMiles = Number(body.miles || body.estimated_miles || 0);
  const totalAmount = Number(body.total_amount || 0);

  const full_address = `${deliveryAddr}, ${deliveryCity}, ${deliveryState} ${deliveryZip}`;
  const rx_pharma_id = rxNumber || `RT-${rtscan_id}`;

  // 1. package_scans
  await db.collection("package_scans").insertOne({
    rtscan_id,
    tracking_number,
    tenant_id: tenantId,
    client_id: tenantId,
    full_name: recipientName,
    phone: recipientPhone,
    email: recipientEmail,
    dob: "01/01/1900",
    address: deliveryAddr,
    city: deliveryCity,
    state: deliveryState,
    zipcode: deliveryZip,
    full_address,
    address_normalized: normalizeText(full_address),
    name_normalized: normalizeText(recipientName),
    rx_pharma_id,
    rx_creation_date: now.toISOString(),
    type: packageType,
    package_type: packageType,
    gate_code: gateCode,
    note: notes,
    client_location: pickupAddr || tenant.address?.street || "",
    pickup_address: pickupAddr,
    delivery_date: deliveryDate,
    delivery_type: deliveryType,
    same_day_fee: sameDayFee,
    requires_signature: Boolean(body.requires_signature),
    collect_cod: Boolean(body.collect_cod),
    collect_amount: body.collect_amount || "",
    label_status: "pending",
    route_status: "pending",
    dispatch_status: paymentStatus === "paid" ? "ready" : "blocked",
    payment_status: paymentStatus,
    total_amount: totalAmount,
    stripe_payment_intent_id: body.stripe_payment_intent_id || null,
    stripe_checkout_session_id: body.stripe_checkout_session_id || null,
    source: "client_portal",
    created_at: now,
    updated_at: now,
  });

  // 2. stops — nested structure read by client portal + admin portal
  await db.collection("stops").insertOne({
    stop_id: tracking_number,
    stop_type: "delivery",
    status: paymentStatus === "paid" ? "unassigned" : "blocked",
    order_ref: rx_pharma_id,
    total_price: totalAmount,
    tenant_id: tenantId,
    rtscan_id,
    rtstop_id,
    recipient: {
      name: recipientName,
      phone: recipientPhone,
      email: recipientEmail || null,
      dob: null,
    },
    address: {
      street: deliveryAddr,
      city: deliveryCity,
      state: deliveryState,
      zip: deliveryZip,
      gate_code: gateCode || null,
      drop_preference: null,
      lat: null,
      lng: null,
    },
    package: {
      type: packageType,
      rx_number: rxNumber || null,
      dp_note: null,
      notes: notes || null,
      cold_chain: false,
      requires_signature: Boolean(body.requires_signature),
      weight_oz: 8,
      length_in: 10,
      width_in: 7,
      height_in: 2,
    },
    service: {
      type: deliveryType === "same_day" ? "same_day" : "local",
      date: deliveryDate || null,
      collect_payment: Boolean(body.collect_cod),
      cod_amount: body.collect_cod ? parseFloat(String(body.collect_amount || "0")) : 0,
      return_to_sender: false,
    },
    assignment: {
      driver_name: null,
      route_title: null,
      eta_at: null,
    },
    rates: { ups: null, usps: null, fedex: null, selected: null },
    pickup_address: pickupAddr,
    dispatch_status: paymentStatus === "paid" ? "ready" : "blocked",
    payment_status: paymentStatus,
    source: "client_portal",
    created_at: now,
    updated_at: now,
  });

  // 3. usage_events
  const PLAN_PRICES: Record<string, { stop: number; mile: number }> = {
    trial: { stop: 0, mile: 0 },
    free: { stop: 0, mile: 0 },
    starter: { stop: 16, mile: 1.65 },
    professional: { stop: 14, mile: 1.5 },
    enterprise: { stop: 12, mile: 1.35 },
  };
  const planKey = String(tenant.plan_type || "trial");
  const prices = PLAN_PRICES[planKey] ?? PLAN_PRICES.trial;
  const pricePerStop = (tenant.price_per_stop as number) > 0 ? (tenant.price_per_stop as number) : prices.stop;
  const pricePerMile = (tenant.price_per_mile as number) > 0 ? (tenant.price_per_mile as number) : prices.mile;
  const billingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const billed = String(tenant.billing_method || "prepaid") === "prepaid";

  await db.collection("usage_events").insertMany([
    {
      tenant_id: tenantId,
      rtscan_id,
      rtstop_id,
      tracking_number,
      event_type: "stop",
      quantity: stops,
      unit_price: pricePerStop,
      amount: stops * pricePerStop,
      billing_method: tenant.billing_method,
      billing_period: billingPeriod,
      plan_type: planKey,
      billed,
      stripe_invoice_id: null,
      source: "client_portal",
      event_date: now,
      created_at: now,
    },
    {
      tenant_id: tenantId,
      rtscan_id,
      rtstop_id,
      tracking_number,
      event_type: "mile",
      quantity: actualMiles,
      unit_price: pricePerMile,
      amount: actualMiles * pricePerMile,
      billing_method: tenant.billing_method,
      billing_period: billingPeriod,
      plan_type: planKey,
      billed,
      stripe_invoice_id: null,
      source: "client_portal",
      event_date: now,
      created_at: now,
    },
  ]);

  // 4. Update tenant stats
  await db.collection("tenants").updateOne(
    { tenant_id: tenantId },
    {
      $inc: { packages_this_month: stops, miles_this_month: actualMiles },
      $set: { updated_at: now },
    },
  );

  // 5. Dispatch to Spoke (primary path)
  let dispatch_status: CreateOrderResult["dispatch_status"] = "blocked";
  let spoke_stop_id: string | undefined;

  if (paymentStatus === "paid") {
    const dispatchResult = await dispatchToSpoke({
      db,
      tenant,
      rtscan_id,
      recipientName,
      recipientPhone,
      recipientEmail,
      deliveryAddr,
      deliveryCity,
      deliveryState,
      deliveryZip,
      notes,
      gateCode,
      deliveryType,
      rx_pharma_id,
      rxNumber,
      tenantId,
      requiresSignature: Boolean(body.requires_signature),
      collectCod: Boolean(body.collect_cod),
      collectAmount: String(body.collect_amount || "0.00"),
    });
    dispatch_status = dispatchResult.status;
    spoke_stop_id = dispatchResult.spoke_stop_id;
  }

  const label_url = `https://app.routelypro.com/api/labels/${rtscan_id}`;

  console.log(`[orders/create] ✓ rtscan=${rtscan_id} tracking=${tracking_number} dispatch=${dispatch_status}`);

  return {
    ok: true,
    rtscan_id,
    rtstop_id,
    tracking_number,
    dispatch_status,
    spoke_stop_id,
    total_amount: totalAmount,
    label_url,
    message:
      paymentStatus === "paid"
        ? dispatch_status === "dispatched"
          ? "Order created and dispatched"
          : "Order created — Spoke dispatch pending"
        : "Order created — awaiting payment",
  };
}

// ─────────────────────────────────────────────────────────
// Spoke API dispatch
// ─────────────────────────────────────────────────────────

async function dispatchToSpoke(params: {
  db: Db;
  tenant: Record<string, unknown>;
  rtscan_id: number;
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  deliveryAddr: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryZip: string;
  notes: string;
  gateCode: string;
  deliveryType: string;
  rx_pharma_id: string;
  rxNumber: string;
  tenantId: number;
  requiresSignature: boolean;
  collectCod: boolean;
  collectAmount: string;
}): Promise<{ status: "dispatched" | "spoke_error"; spoke_stop_id?: string }> {
  const spokeKey = process.env.SPOKE_API_KEY ?? "";
  if (!spokeKey) {
    console.error("[Spoke] SPOKE_API_KEY missing");
    await params.db
      .collection("stops")
      .updateOne({ rtscan_id: params.rtscan_id }, { $set: { dispatch_status: "spoke_error", updated_at: new Date() } });
    return { status: "spoke_error" };
  }

  try {
    const SPOKE_BASE = "https://api.getcircuit.com/public/v0.2b";
    const spokeAuth = `Basic ${Buffer.from(`${spokeKey}:`).toString("base64")}`;

    const deliveryLines: string[] = [];
    if (params.deliveryType === "same_day") deliveryLines.push("📦 Delivery Today: YES");
    if (params.requiresSignature) deliveryLines.push("✍️ Signature Required");
    if (params.gateCode) deliveryLines.push(`Gate Code: ${params.gateCode}`);
    if (params.collectCod) deliveryLines.push(`💵 Collect on Delivery: $${params.collectAmount || "0.00"}`);

    const extraNote = deliveryLines.length > 0 ? `\n\n${deliveryLines.join("\n")}` : "";
    const finalNote = (params.notes + extraNote).trim() || null;

    const phoneE164 = normalizePhoneE164(params.recipientPhone);

    const spokePayload: Record<string, unknown> = {
      address: {
        addressLineOne: params.deliveryAddr,
        city: params.deliveryCity,
        state: params.deliveryState,
        zip: params.deliveryZip,
        country: "US",
      },
      recipient: {
        name: params.recipientName,
        ...(phoneE164 ? { phone: phoneE164 } : {}),
        ...(params.recipientEmail ? { email: params.recipientEmail } : {}),
      },
      orderInfo: {
        sellerOrderId: params.rx_pharma_id,
        sellerName: String(params.tenantId),
        products: params.rxNumber ? [`Rx: ${params.rxNumber}`] : [],
      },
      notes: finalNote,
      barcodes: [],
      packageCount: 1,
      activity: "delivery",
      proofOfAttemptRequirements: { enabled: true },
    };

    console.log("[Spoke] payload:", JSON.stringify(spokePayload, null, 2));

    const startedSpoke = Date.now();
    const res = await fetch(`${SPOKE_BASE}/unassignedStops`, {
      method: "POST",
      headers: { Authorization: spokeAuth, "Content-Type": "application/json" },
      body: JSON.stringify(spokePayload),
    });

    if (res.ok) {
      const spokeStop = (await res.json()) as { id: string };
      logExternalCall({
        provider: "spoke",
        operation: "spoke.create_stop",
        method: "POST",
        status_code: res.status,
        ok: true,
        latency_ms: Date.now() - startedSpoke,
        tenant_id: params.tenantId,
        stop_id: spokeStop.id,
        request_summary: { packageCount: 1, sameDay: params.deliveryType === "same_day" },
      });
      await params.db.collection("stops").updateOne(
        { rtscan_id: params.rtscan_id },
        {
          $set: {
            "assignment.spoke_stop_id": spokeStop.id,
            dispatch_status: "dispatched",
            status: "unassigned",
            updated_at: new Date(),
          },
        },
      );
      await params.db.collection("package_scans").updateOne(
        { rtscan_id: params.rtscan_id },
        {
          $set: {
            spoke_stop_id: spokeStop.id,
            dispatch_status: "dispatched",
            updated_at: new Date(),
          },
        },
      );
      console.log(`[Spoke] ✓ dispatched stop ${spokeStop.id}`);
      return { status: "dispatched", spoke_stop_id: spokeStop.id };
    }

    const errText = await res.text();
    // AUDIT: the real Spoke status + body — this is what tells us 429 (rate
    // limit) vs 401 (auth) vs 422 (validation) for a failed post.
    logExternalCall({
      provider: "spoke",
      operation: "spoke.create_stop",
      method: "POST",
      status_code: res.status,
      ok: false,
      error_message: errText,
      latency_ms: Date.now() - startedSpoke,
      tenant_id: params.tenantId,
    });
    console.error(`[Spoke] ✗ status=${res.status} body=${errText}`);
    await params.db
      .collection("stops")
      .updateOne(
        { rtscan_id: params.rtscan_id },
        { $set: { dispatch_status: "spoke_error", spoke_error: errText.slice(0, 500), updated_at: new Date() } },
      );
    return { status: "spoke_error" };
  } catch (err) {
    console.error("[Spoke] exception:", err);
    await params.db
      .collection("stops")
      .updateOne({ rtscan_id: params.rtscan_id }, { $set: { dispatch_status: "spoke_error", updated_at: new Date() } });
    return { status: "spoke_error" };
  }
}

// ─────────────────────────────────────────────────────────
// Repost an EXISTING stop to Spoke (ghost recovery / retry fallback)
// ─────────────────────────────────────────────────────────
//
// Used to heal a "ghost" — a stop that exists in Mongo with an in-Spoke status
// (unassigned/…) but NO assignment.spoke_stop_id, because the original Spoke
// POST failed/timed-out after the doc was already written. This is the exact
// failure the "verify Spoke accepted before trusting Mongo" rule guards against.
//
// SELF-CONTAINED + keyed by stop_id + tenant_id (NOT rtscan_id): FastAPI-created
// docs may not carry an rtscan_id, and an `{ rtscan_id: undefined }` filter would
// match unrelated docs. This function never double-posts (returns the existing
// spoke id if already present) and only flips status→unassigned on a VERIFIED
// Spoke acceptance.
export async function repostStopToSpoke(
  db: Db,
  stop: Record<string, unknown>,
): Promise<{ status: "dispatched" | "spoke_error" | "already"; spoke_stop_id?: string }> {
  const assignment = (stop.assignment as Record<string, unknown> | undefined) ?? {};
  const existing = assignment.spoke_stop_id;
  if (existing) return { status: "already", spoke_stop_id: String(existing) };

  const stopId = String(stop.stop_id ?? "");
  const tenantId = Number(stop.tenant_id);
  if (!stopId || !Number.isFinite(tenantId)) return { status: "spoke_error" };

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
      await db.collection("stops").updateOne(
        { stop_id: stopId, tenant_id: tenantId },
        {
          $set: {
            "assignment.spoke_stop_id": spokeStop.id,
            dispatch_status: "dispatched",
            status: "unassigned",
            spoke_unconfirmed: false,
            updated_at: new Date(),
          },
        },
      );
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
    await db.collection("stops").updateOne(
      { stop_id: stopId, tenant_id: tenantId },
      {
        $set: {
          // Honesty rule: a failed re-post is NOT in Spoke → fall back to draft +
          // submit_error so it's recoverable in the Drafts flow, not stranded.
          status: "draft",
          submit_error: { at: new Date(), reason: errText.slice(0, 300), spoke_status: res.status, attempt_count: 1 },
          dispatch_status: "spoke_error",
          spoke_error: errText.slice(0, 500),
          updated_at: new Date(),
        },
      },
    );
    return { status: "spoke_error" };
  } catch (err) {
    console.error("[repost] exception:", err);
    await db
      .collection("stops")
      .updateOne(
        { stop_id: stopId, tenant_id: tenantId },
        {
          $set: {
            status: "draft",
            submit_error: { at: new Date(), reason: String(err).slice(0, 300), spoke_status: null, attempt_count: 1 },
            dispatch_status: "spoke_error",
            updated_at: new Date(),
          },
        },
      );
    return { status: "spoke_error" };
  }
}

// ─────────────────────────────────────────────────────────
// n8n backup — fires when primary flow fails
// ─────────────────────────────────────────────────────────

export async function fireN8nBackup(tenantId: number, body: OrderBody): Promise<void> {
  const webhookUrl = process.env.N8N_CLIENT_ORDER_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[n8n-backup] N8N_CLIENT_ORDER_WEBHOOK_URL not set — skipping");
    return;
  }

  const phoneE164 = normalizePhoneE164(String(body.recipient_phone || ""));

  const payload = {
    rtscan_id: Date.now(),
    tenant_id: tenantId,
    full_name: String(body.recipient_name || "").trim(),
    address_line1: String(body.delivery_address || "").trim(),
    city: String(body.delivery_city || "").trim(),
    state: String(body.delivery_state || "FL").trim(),
    zip_code: String(body.delivery_zip || "").trim(),
    phone_e164: phoneE164,
    email: String(body.recipient_email || ""),
    note: String(body.notes || ""),
    gate_code: String(body.gate_code || ""),
    RxPharmaID: String(body.rx_number || "").trim(),
    ClientID: String(tenantId),
    DeliveryToday: body.delivery_type === "same_day" ? "Yes" : "No",
    requireSignature: body.requires_signature ? "Yes" : "No",
    package_type: String(body.package_type || "rx"),
    pickup_address: String(body.pickup_address || ""),
    // Idempotency + linkage: carry the draft id and any pre-assigned tracking
    // id into the backup so the n8n workflow can dedupe (against a retry or a
    // partially-succeeded FastAPI call) and bind the resulting stop to its draft.
    created_from_draft_id: body.created_from_draft_id ? String(body.created_from_draft_id) : null,
    tracking_id: body.tracking_id ? String(body.tracking_id) : null,
    source: "client_portal_backup",
    payment_status: String(body.payment_status || "paid"),
    stripe_payment_intent_id: body.stripe_payment_intent_id ?? null,
    total_amount: Number(body.total_amount || 0),
  };

  console.warn(`[n8n-backup] → firing backup for tenant=${tenantId}`);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`n8n backup webhook returned ${res.status}`);
  }

  console.warn("[n8n-backup] ✓ backup queued");
}
