/**
 * POST /api/scans/repost
 *
 * Re-submits an existing scan to the FastAPI stop creation endpoint.
 * Uses the EXACT same document structure as IVY (matching routely-web POST).
 * Marks the original scan with sub_status: "reposted".
 */
import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "https://api.routelypro.com";
const API_KEY = process.env.ROUTELY_API_KEY ?? "routely_api_secret_2026";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rtscan_id, full_name, phone, address, city, state, zipcode, rx_pharma_id, client_location } = body as {
      rtscan_id?: number;
      full_name?: string;
      phone?: string;
      address?: string;
      city?: string;
      state?: string;
      zipcode?: string;
      rx_pharma_id?: string;
      client_location?: string;
    };

    if (!rtscan_id) {
      return NextResponse.json({ success: false, error: "rtscan_id is required" }, { status: 400 });
    }

    const db = await getDb();

    // Find the original scan
    const scan = await db.collection("package_scans").findOne({ rtscan_id: Number(rtscan_id) });

    if (!scan) {
      return NextResponse.json({ success: false, error: "Original scan not found" }, { status: 404 });
    }

    // Build the same apiBody that IVY sends to FastAPI
    const newRtscanId = Date.now();
    const apiBody = {
      tenant_id: scan.tenant_id ?? 1,
      source: "manual_repost",
      rtscan_id: newRtscanId,
      actor: {
        name: body.reposted_by ?? "Admin Repost",
        id: body.reposted_by_id ?? "admin",
        source_detail: "Manual repost via admin panel",
      },
      ...((client_location ?? scan.client_location) && {
        pickup: { location_id: client_location ?? scan.client_location },
      }),
      recipient: {
        name: full_name ?? scan.full_name ?? "",
        phone: phone ?? scan.phone ?? "",
        street: address ?? scan.address ?? "",
        city: city ?? scan.city ?? "",
        state: state ?? scan.state ?? "",
        zip: zipcode ?? scan.zipcode ?? "",
        dob: scan.dob ?? "",
      },
      package: {
        type: scan.type ?? "rx",
        rx_number: rx_pharma_id ?? scan.rx_pharma_id ?? "",
        rx_creation_date: scan.rx_creation_date ?? null,
        dp_note: scan.dp_note ?? null,
        notes: scan.dp_note ?? null,
      },
      delivery: {
        type: "local",
        collect_payment: scan.collect_payment ?? false,
        cod_amount: scan.collect_amount ?? 0,
      },
    };

    // Call FastAPI — same endpoint as IVY
    const fastapiRes = await fetch(`${FASTAPI_URL}/v1/stops/scan/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
      body: JSON.stringify(apiBody),
    });

    const fastapiData = await fastapiRes.json().catch(() => ({}));
    const now = new Date();
    const succeeded = fastapiRes.ok && !!fastapiData?.stop_id;

    // ── Insert new scan doc with EXACT same structure as IVY ──────────────────
    const newDoc = {
      // Primary keys
      rtscan_id: newRtscanId,
      stop_id: fastapiData?.stop_id ?? "",
      tenant_id: scan.tenant_id ?? 1,
      client_id: scan.client_id ?? 1,

      // Spoke IDs (filled by FastAPI response)
      spoke_pickup_id: fastapiData?.pickup?.spoke?.stop_id ?? "",
      spoke_delivery_id: fastapiData?.delivery?.spoke?.stop_id ?? "",

      // Recipient (copied from original)
      rx_pharma_id: scan.rx_pharma_id ?? "",
      full_name: scan.full_name ?? "",
      dob: scan.dob ?? "",
      phone: scan.phone ?? "",

      // Address
      address: scan.address ?? "",
      city: scan.city ?? "",
      state: scan.state ?? "",
      zipcode: scan.zipcode ?? "",
      full_address: scan.full_address ?? "",

      // Package
      type: scan.type ?? "regular",
      rx_creation_date: scan.rx_creation_date ?? null,
      dp_note: scan.dp_note ?? "",
      is_cold: scan.is_cold ?? false,
      signature_required: scan.signature_required ?? false,
      requires_signature: scan.signature_required ?? false,

      // Route & enrichment (from FastAPI response or original)
      route: fastapiData?.route_zone ?? scan.route ?? "",
      client_location: scan.client_location ?? "",
      package_vip: fastapiData?.recipient?.is_vip ?? scan.package_vip ?? false,
      gate_code: fastapiData?.address?.gate_code ?? scan.gate_code ?? "",
      address_fix: fastapiData?.address?.was_fixed ? "Yes" : (scan.address_fix ?? ""),
      preset_drop_off: fastapiData?.address?.drop_preference ?? scan.preset_drop_off ?? "",
      new_client: fastapiData?.recipient?.is_new ?? scan.new_client ?? false,
      note: "",

      // Delivery
      delivery_today: scan.delivery_today ?? false,
      collect_payment: scan.collect_payment ?? false,
      collect_amount: scan.collect_amount ?? 0,
      image_url: scan.image_url ?? "", // reuse original image

      // Meta
      source: "manual_repost",
      status: succeeded ? "SUCCESS" : "ERROR",
      scanned_by: body.reposted_by ?? "Admin",
      created_at: now,
      updated_at: now,
      started_at: now,
      completed_at: succeeded ? now : null,

      // Error info
      error_message: succeeded
        ? null
        : (fastapiData?.detail ?? fastapiData?.error ?? `FastAPI error ${fastapiRes.status}`),
      error_stage: succeeded ? null : "API_FAILED",

      // ── Repost reference ─────────────────────────────────────────────────────
      original_rtscan_id: Number(rtscan_id), // links this repost back to origin

      // Timeline
      timeline: [
        {
          status: "created",
          timestamp: now,
          note: "Created via manual_repost",
          actor: body.reposted_by ?? "Admin",
          metadata: { original_rtscan_id: Number(rtscan_id) },
        },
        ...(succeeded
          ? [{ status: "success", timestamp: now, note: "Stop created via repost", actor: "system", metadata: {} }]
          : [{ status: "error", timestamp: now, note: "Repost failed at API", actor: "system", metadata: {} }]),
      ],
    };

    await db.collection("package_scans").insertOne(newDoc);

    // ── Mark original scan with sub_status = "reposted" ──────────────────────
    // Non-breaking: adds sub_status field, never changes the original status
    await db.collection("package_scans").updateOne(
      { rtscan_id: Number(rtscan_id) },
      {
        $set: {
          sub_status: "reposted",
          reposted_at: now,
          reposted_to_rtscan_id: newRtscanId,
          updated_at: now,
        },
      },
    );

    if (!succeeded) {
      return NextResponse.json(
        {
          success: false,
          error: fastapiData?.detail ?? fastapiData?.error ?? `FastAPI error ${fastapiRes.status}`,
          new_rtscan_id: newRtscanId,
          fastapi_status: fastapiRes.status,
          fastapi: fastapiData,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      new_rtscan_id: newRtscanId,
      stop_id: fastapiData?.stop_id ?? "",
      route: fastapiData?.route_zone ?? "",
      recipient_name: scan.full_name,
      address: [scan.address, scan.city, scan.state].filter(Boolean).join(", "),
      fastapi: fastapiData,
    });
  } catch (err) {
    console.error("[POST /api/scans/repost]", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
