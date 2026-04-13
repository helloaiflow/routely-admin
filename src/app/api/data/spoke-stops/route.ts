import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "500", 10);
    const db = await getDb();
    const stops = await db.collection("spoke_stops").find({}).sort({ created_at: -1 }).limit(limit).toArray();

    // Build driver lookup map
    const drivers = await db
      .collection("spoke_drivers")
      .find({}, { projection: { spoke_driver_id: 1, full_name: 1 } })
      .toArray();
    const driverMap = new Map<string, string>();
    for (const d of drivers) {
      if (d.spoke_driver_id) driverMap.set(d.spoke_driver_id, d.full_name || "");
    }

    // Enrich stops with driver_name
    const enriched = stops.map((s) => ({
      ...s,
      driver_name: s.driver_id ? driverMap.get(s.driver_id) || "" : "",
    }));

    return NextResponse.json({ list: enriched, total: enriched.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await getDb();
    const col = db.collection("spoke_stops");

    const spokeStopId = body.spoke_stop_id || body.rtstop_id || "";
    const existing = spokeStopId ? await col.findOne({ spoke_stop_id: spokeStopId }) : null;

    if (existing) {
      // UPDATE
      await col.updateOne(
        { _id: existing._id },
        {
          $set: {
            spoke_stop_id: spokeStopId,
            tenant_id: body.tenant_id ?? existing.tenant_id ?? 1,
            rtstop_id: body.rtstop_id ?? existing.rtstop_id ?? "",
            recipient_name: body.recipient_name ?? existing.recipient_name ?? "",
            rx_pharma_id: body.rx_pharma_id ?? existing.rx_pharma_id ?? "",
            rx_creation_date: body.rx_creation_date ?? existing.rx_creation_date ?? "",
            address: body.address ?? existing.address ?? "",
            city: body.city ?? existing.city ?? "",
            state: body.state ?? existing.state ?? "",
            zipcode: body.zipcode ?? existing.zipcode ?? "",
            phone: body.phone ?? existing.phone ?? "",
            dob: body.dob ?? existing.dob ?? "",
            route_title: body.route_title ?? existing.route_title ?? "",
            label_status: body.label_status ?? existing.label_status ?? "",
            delivery_state: body.delivery_state ?? existing.delivery_state ?? "",
            delivery_succeeded: body.delivery_succeeded ?? existing.delivery_succeeded ?? false,
            stop_position: body.stop_position ?? existing.stop_position ?? null,
            stop_notes: body.stop_notes ?? existing.stop_notes ?? "",
            driver_notes: body.driver_notes ?? existing.driver_notes ?? "",
            package_id: body.package_id ?? existing.package_id ?? "",
            eta: body.eta ?? existing.eta ?? null,
            event_type: body.event_type ?? existing.event_type ?? "",
            is_branch_address: body.is_branch_address ?? existing.is_branch_address ?? false,
            plan_id: body.plan_id ?? existing.plan_id ?? "",
            route_id: body.route_id ?? existing.route_id ?? "",
            driver_id: body.driver_id ?? existing.driver_id ?? "",
            latitude: body.latitude ?? existing.latitude ?? null,
            longitude: body.longitude ?? existing.longitude ?? null,
            attempted_latitude: body.attempted_latitude ?? existing.attempted_latitude ?? null,
            attempted_longitude: body.attempted_longitude ?? existing.attempted_longitude ?? null,
            estimated_travel_distance: body.estimated_travel_distance ?? existing.estimated_travel_distance ?? null,
            estimated_travel_duration: body.estimated_travel_duration ?? existing.estimated_travel_duration ?? null,
            route_stop_count: body.route_stop_count ?? existing.route_stop_count ?? null,
            route_started_at: body.route_started_at ?? existing.route_started_at ?? null,
            route_distributed_at: body.route_distributed_at ?? existing.route_distributed_at ?? null,
            delivery_failed_reason: body.delivery_failed_reason ?? existing.delivery_failed_reason ?? "",
            driver_recipient_notes: body.driver_recipient_notes ?? existing.driver_recipient_notes ?? "",
            recipient_provided_notes: body.recipient_provided_notes ?? existing.recipient_provided_notes ?? "",
            signature_url: body.signature_url ?? existing.signature_url ?? "",
            signee_name: body.signee_name ?? existing.signee_name ?? "",
            package_count: body.package_count ?? existing.package_count ?? 1,
            web_app_link: body.web_app_link ?? existing.web_app_link ?? "",
            eta_at: body.eta_at ?? existing.eta_at ?? null,
            eta_latest_at: body.eta_latest_at ?? existing.eta_latest_at ?? null,
            eta_earliest_at: body.eta_earliest_at ?? existing.eta_earliest_at ?? null,
            updated_at: new Date(),
          },
        },
      );
      return NextResponse.json({ success: true, action: "updated", spoke_stop_id: spokeStopId });
    }

    // CREATE
    const doc = {
      spoke_stop_id: spokeStopId,
      tenant_id: body.tenant_id ?? 1,
      rtstop_id: body.rtstop_id ?? "",
      recipient_name: body.recipient_name ?? "",
      rx_pharma_id: body.rx_pharma_id ?? "",
      rx_creation_date: body.rx_creation_date ?? "",
      address: body.address ?? "",
      city: body.city ?? "",
      state: body.state ?? "",
      zipcode: body.zipcode ?? "",
      phone: body.phone ?? "",
      dob: body.dob ?? "",
      route_title: body.route_title ?? "",
      label_status: body.label_status ?? "",
      delivery_state: body.delivery_state ?? "",
      delivery_succeeded: body.delivery_succeeded ?? false,
      stop_position: body.stop_position ?? null,
      stop_notes: body.stop_notes ?? "",
      driver_notes: body.driver_notes ?? "",
      package_id: body.package_id ?? "",
      eta: body.eta ?? null,
      event_type: body.event_type ?? "",
      is_branch_address: body.is_branch_address ?? false,
      plan_id: body.plan_id ?? "",
      route_id: body.route_id ?? "",
      driver_id: body.driver_id ?? "",
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      attempted_latitude: body.attempted_latitude ?? null,
      attempted_longitude: body.attempted_longitude ?? null,
      estimated_travel_distance: body.estimated_travel_distance ?? null,
      estimated_travel_duration: body.estimated_travel_duration ?? null,
      route_stop_count: body.route_stop_count ?? null,
      route_started_at: body.route_started_at ?? null,
      route_distributed_at: body.route_distributed_at ?? null,
      delivery_failed_reason: body.delivery_failed_reason ?? "",
      driver_recipient_notes: body.driver_recipient_notes ?? "",
      recipient_provided_notes: body.recipient_provided_notes ?? "",
      signature_url: body.signature_url ?? "",
      signee_name: body.signee_name ?? "",
      package_count: body.package_count ?? 1,
      web_app_link: body.web_app_link ?? "",
      eta_at: body.eta_at ?? null,
      eta_latest_at: body.eta_latest_at ?? null,
      eta_earliest_at: body.eta_earliest_at ?? null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    await col.insertOne(doc);
    return NextResponse.json({ success: true, action: "created", spoke_stop_id: spokeStopId }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/data/spoke-stops]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
