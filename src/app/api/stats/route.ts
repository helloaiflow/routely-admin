import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "today";
    const tenantId = Number.parseInt(searchParams.get("tenant_id") || "1", 10);
    const db = await getDb();

    const now = new Date();
    const from = new Date();
    switch (range) {
      case "yesterday":
        from.setDate(now.getDate() - 1);
        from.setHours(0, 0, 0, 0);
        break;
      case "week":
        from.setDate(now.getDate() - 7);
        from.setHours(0, 0, 0, 0);
        break;
      case "month":
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
        break;
      case "last30":
        from.setDate(now.getDate() - 30);
        from.setHours(0, 0, 0, 0);
        break;
      default:
        from.setHours(0, 0, 0, 0);
    }

    const tenantFilter = { tenant_id: tenantId };
    const dateFilter = { ...tenantFilter, created_at: { $gte: from, $lte: now } };
    const nowEpoch = Math.floor(Date.now() / 1000);

    const [scans, stops, allTenants] = await Promise.all([
      db.collection("package_scans").find(dateFilter).toArray(),
      db.collection("spoke_stops").find(dateFilter).toArray(),
      db.collection("tenants").find({}).sort({ tenant_id: 1 }).toArray(),
    ]);

    const matched = stops.filter((s) => s.label_status === "Match").length;
    const unmatched = stops.filter((s) => s.label_status === "Unmatch").length;
    const human = stops.filter((s) => s.label_status === "Human").length;
    const delivered = stops.filter((s) => s.delivery_succeeded === true).length;
    const attempted = stops.filter((s) => s.delivery_state === "attempted").length;
    const collectTotal = scans.reduce((sum, s) => sum + (s.collect_amount || 0), 0);
    const totalDistanceM = stops.reduce((s, stop) => s + (stop.estimated_travel_distance || 0), 0);
    const totalDistanceMi = Math.round(totalDistanceM * 0.00062137 * 10) / 10;
    const withSignature = scans.filter((s) => s.signature_required).length;
    const activeDrivers = [...new Set(stops.map((s) => s.driver_id).filter(Boolean))].length;

    const byRoute: Record<string, number> = {};
    for (const s of stops) {
      const r = s.route_title || "Unknown";
      byRoute[r] = (byRoute[r] || 0) + 1;
    }

    const byStatus = { Match: matched, Unmatch: unmatched, Human: human };

    const byBranch: Record<string, number> = {};
    for (const s of scans) {
      const b = s.client_location || "OTHER";
      byBranch[b] = (byBranch[b] || 0) + 1;
    }

    const flags = {
      delivery: scans.filter((s) => s.delivery_today).length,
      collect: scans.filter((s) => s.collect_payment).length,
      cold: scans.filter((s) => s.type === "cold package").length,
      sig: scans.filter((s) => s.signature_required).length,
    };

    const pipeline = {
      allocated: stops.length,
      outForDelivery: stops.filter((s) => s.event_type === "stop.out_for_delivery").length,
      attempted,
      delivered,
      failed: stops.filter((s) => s.delivery_state === "failed").length,
    };

    const collectQueue = scans
      .filter((s) => s.collect_payment && s.collect_amount > 0)
      .map((s) => ({ name: s.full_name, amount: s.collect_amount, route: s.route }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    const coldPackages = scans
      .filter((s) => s.type === "cold package")
      .map((s) => ({ name: s.full_name, route: s.route }))
      .slice(0, 8);

    const upcomingStops = stops
      .filter(
        (s) =>
          s.eta_at && s.eta_at > nowEpoch - 3600 && s.delivery_state !== "delivered" && s.delivery_succeeded !== true,
      )
      .sort((a, b) => (a.eta_at || 0) - (b.eta_at || 0))
      .slice(0, 10)
      .map((s) => ({
        rtstop_id: s.rtstop_id,
        recipient_name: s.recipient_name,
        full_address: s.full_address,
        route_title: s.route_title,
        eta_arrival: s.eta_arrival,
        eta_at: s.eta_at,
        driver_id: s.driver_id,
        delivery_state: s.delivery_state,
        label_status: s.label_status,
        stop_notes: s.stop_notes || "",
        tracking_link: s.tracking_link,
      }));

    const trend = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return stops.filter((s) => {
        const t = new Date(s.created_at);
        return t >= d && t <= end;
      }).length;
    });

    return NextResponse.json({
      kpi: {
        scans: scans.length,
        matched,
        unmatched,
        human,
        delivered,
        attempted,
        collectTotal,
        totalDistanceMi,
        withSignature,
        activeDrivers,
      },
      byRoute,
      byStatus,
      byBranch,
      flags,
      pipeline,
      collectQueue,
      coldPackages,
      upcomingStops,
      trend,
      tenants: allTenants.map((t) => ({
        tenant_id: t.tenant_id,
        company_name: t.company_name || t.contact_name || `Tenant ${t.tenant_id}`,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
