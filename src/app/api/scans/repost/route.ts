/**
 * POST /api/scans/repost
 *
 * Isolated, non-breaking endpoint.
 * Re-submits an existing scan's structured data to the FastAPI stop creation endpoint.
 * Wraps the same flow that IVY uses — does NOT rewrite any pipeline logic.
 *
 * Accepts:
 *   { stop_id: string }         — find scan by stop_id and repost
 *   { rtscan_id: number }       — find scan by rtscan_id and repost
 *   { image_url: string, ... }  — optional override for the image reference
 *
 * Calls: POST https://api.routelypro.com/v1/stops/scan/   (same as IVY)
 */
import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "https://api.routelypro.com";
const API_KEY = process.env.ROUTELY_API_KEY ?? "routely_api_secret_2026";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { stop_id, rtscan_id } = body as { stop_id?: string; rtscan_id?: number };

    if (!stop_id && !rtscan_id) {
      return NextResponse.json({ success: false, error: "stop_id or rtscan_id is required" }, { status: 400 });
    }

    const db = await getDb();

    // Find the original scan
    const filter = stop_id ? { stop_id } : { rtscan_id: Number(rtscan_id) };
    const scan = await db.collection("package_scans").findOne(filter, { sort: { created_at: -1 } });

    if (!scan) {
      return NextResponse.json({ success: false, error: "Original scan not found" }, { status: 404 });
    }

    // Build the same apiBody structure that IVY uses
    const newRtscanId = Date.now();
    const apiBody = {
      tenant_id: scan.tenant_id ?? 1,
      source: "manual_repost",
      rtscan_id: newRtscanId,
      original_rtscan_id: scan.rtscan_id,
      actor: {
        name: body.reposted_by ?? "Admin Repost",
        id: body.reposted_by_id ?? "admin",
        source_detail: "Manual repost via admin panel",
      },
      recipient: {
        name: scan.full_name ?? "",
        phone: scan.phone ?? "",
        street: scan.address ?? "",
        city: scan.city ?? "",
        state: scan.state ?? "",
        zip: scan.zipcode ?? "",
        dob: scan.dob ?? "",
      },
      package: {
        type: scan.type ?? "rx",
        rx_number: scan.rx_pharma_id ?? "",
        rx_creation_date: scan.rx_creation_date ?? null,
        dp_note: scan.dp_note ?? null,
        notes: scan.dp_note ?? null,
      },
      delivery: {
        type: "local",
        collect_payment: scan.collect_payment ?? false,
        cod_amount: scan.collect_amount ?? 0,
      },
      ...(scan.client_location && {
        pickup: {
          location_id: scan.client_location,
        },
      }),
    };

    // Call the same FastAPI endpoint that IVY calls
    const fastapiRes = await fetch(`${FASTAPI_URL}/v1/stops/scan/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify(apiBody),
    });

    const fastapiData = await fastapiRes.json().catch(() => ({}));

    // Log the repost in package_scans (non-breaking — new document)
    const now = new Date();
    await db.collection("package_scans").insertOne({
      rtscan_id: newRtscanId,
      status: fastapiRes.ok ? "PROCESSING" : "ERROR",
      stage: fastapiRes.ok ? "REPOST_SUBMITTED" : "REPOST_FAILED",
      tenant_id: scan.tenant_id ?? 1,
      client_id: scan.client_id ?? 1,
      source: "manual_repost",
      original_rtscan_id: scan.rtscan_id,
      full_name: scan.full_name ?? "",
      phone: scan.phone ?? "",
      address: scan.address ?? "",
      city: scan.city ?? "",
      state: scan.state ?? "",
      zipcode: scan.zipcode ?? "",
      rx_pharma_id: scan.rx_pharma_id ?? "",
      image_url: scan.image_url ?? "",
      stop_id: fastapiData?.stop_id ?? "",
      scanned_by: body.reposted_by ?? "Admin",
      started_at: now,
      created_at: now,
      updated_at: now,
      error_message: fastapiRes.ok ? null : (fastapiData?.detail ?? fastapiData?.error ?? "FastAPI error"),
    });

    if (!fastapiRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: fastapiData?.detail ?? fastapiData?.error ?? `FastAPI error ${fastapiRes.status}`,
          fastapi_status: fastapiRes.status,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      new_rtscan_id: newRtscanId,
      stop_id: fastapiData?.stop_id ?? "",
      fastapi: fastapiData,
    });
  } catch (err) {
    console.error("[POST /api/scans/repost]", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
