import { NextResponse } from "next/server";

import { getDb, requirePagePermission } from "@/lib/tenant";

// ── POST /api/client/submit-stop ─────────────────────────────────────────────
// Proxy to FastAPI POST /v1/stops/
// usage_events are written by FastAPI directly — do NOT write them here.
//
// FastAPI creates the canonical stop in Mongo and mirrors it into Supabase
// itself (app/services/supabase_mirror.py). This route is a thin proxy that
// also stamps the Clerk actor (created_by) onto the Mongo doc.
// ─────────────────────────────────────────────────────────────────────────────

const ROUTELY_API_URL    = process.env.ROUTELY_API_URL    ?? "https://api.routelypro.com";
const ROUTELY_API_SECRET = process.env.ROUTELY_API_SECRET ?? "";

function buildNotes(body: Record<string, unknown>): string {
  const lines: string[] = [];
  if (body.is_same_day)        lines.push("⚡ SAME DAY DELIVERY");
  if (body.requires_signature) lines.push("✍️ Signature Required");
  if (body.collect_cod)        lines.push(`💵 COD: $${body.collect_amount || "0.00"}`);
  if (Array.isArray(body.dropoff_instructions) && body.dropoff_instructions.length > 0) {
    lines.push(`Drop-off: ${(body.dropoff_instructions as string[]).join(", ")}`);
  }
  if (body.notes) lines.push(String(body.notes));
  return lines.join("\n").trim();
}

export async function POST(request: Request) {
  if (!ROUTELY_API_SECRET) {
    console.error("[submit-stop] ROUTELY_API_SECRET is not set — refusing to call FastAPI without a key");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;

  const payload = {
    tenant_id: ctx.tenantId,
    stop_type: String(body.stop_type ?? "delivery"),   // pickup | delivery | dropoff | on_demand
    order_ref: body.order_ref ? String(body.order_ref) : undefined,
    source:    "client_portal",
    tracking_id: body.tracking_id ? String(body.tracking_id) : undefined, // from tracking_pool

    pickup: {
      location_id: String(body.pickup_location_id ?? ""),
    },

    recipient: {
      name:   String(body.recipient_name  ?? "").trim().toUpperCase(),
      phone:  body.recipient_phone
        ? String(body.recipient_phone).replace(/\D/g, "").padEnd(10, "0").slice(0, 10)
        : "0000000000",
      email:  String(body.recipient_email ?? "").trim().toLowerCase() || "",
      street: String(body.delivery_address ?? "").trim().toUpperCase(),
      city:   String(body.delivery_city   ?? "").trim().toUpperCase(),
      state:  String(body.delivery_state  ?? "FL").trim().toUpperCase(),
      zip:    String(body.delivery_zip    ?? "").trim(),
    },

    package: {
      type:      String(body.package_type ?? "rx"),
      notes:     buildNotes(body) || "",
      gate_code: String(body.gate_code ?? "").trim() || null,
      rx_creation_date: new Date().toLocaleDateString("en-US", {
        month: "2-digit", day: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }),
    },

    delivery: {
      type:            Boolean(body.is_same_day) ? "same_day" : "local",
      date:            (() => {
        if (body.delivery_date) return String(body.delivery_date);
        const d = new Date();
        if (!Boolean(body.is_same_day)) d.setDate(d.getDate() + 1);
        return d.toISOString().split("T")[0];
      })(),
      collect_payment: Boolean(body.collect_cod),
      cod_amount:      body.collect_cod
        ? parseFloat(String(body.collect_amount ?? "0").replace(/,/g, "")) || 0
        : 0,
    },

    total_price: body.total_price != null
      ? parseFloat(String(body.total_price))
      : undefined,

    // Payment (for immediate-charge flows)
    payment_method:           body.payment_method ? String(body.payment_method) : undefined,
    stripe_payment_intent_id: body.stripe_payment_intent_id ? String(body.stripe_payment_intent_id) : undefined,
    stripe_customer_id:       body.stripe_customer_id ? String(body.stripe_customer_id) : undefined,
  };

  try {
    const res = await fetch(`${ROUTELY_API_URL}/v1/stops/`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key":    ROUTELY_API_SECRET,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      console.error("[submit-stop] FastAPI error:", res.status, data);
      return NextResponse.json(
        { ok: false, error: data.detail ?? "Stop creation failed" },
        { status: res.status }
      );
    }

    // Member-system Phase 5: stamp the Clerk actor on the canonical Mongo stop
    // doc (only the portal knows who submitted). Additive AFTER FastAPI created
    // the stop — tenant-scoped, never fatal. FastAPI mirrors the stop into
    // Supabase on its own (app/services/supabase_mirror.py), so the portal no
    // longer writes Supabase here.
    if (data.stop_id) {
      const stopId = String(data.stop_id);
      const createdBy = {
        type: ctx.role === "member" ? "tenant_member" : "tenant_owner",
        clerk_user_id: ctx.userId,
        name:
          [ctx.user?.firstName, ctx.user?.lastName].filter(Boolean).join(" ") ||
          ctx.user?.emailAddresses?.[0]?.emailAddress ||
          "",
        tenant_role: ctx.role,
        source: "client_portal",
        stamped_at: new Date(),
      };

      try {
        const db = await getDb();
        await db.collection("stops").updateMany(
          { stop_id: stopId, tenant_id: ctx.tenantId },
          { $set: { created_by: createdBy } },
        );
      } catch (stampErr) {
        console.error("[submit-stop] created_by stamp failed (non-fatal):", stampErr);
      }
    }

    return NextResponse.json({
      ok:              true,
      stop_id:         data.stop_id,
      tracking_number: data.stop_id,
      status:          data.status,
      mongo_id:        data.mongo_id,
    });

  } catch (err) {
    console.error("[submit-stop] Network error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to reach Routely API" },
      { status: 502 }
    );
  }
}
