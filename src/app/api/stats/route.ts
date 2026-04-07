import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "today";
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

    const dateFilter = { created_at: { $gte: from, $lte: now } };

    const [scans, stops, recentStops] = await Promise.all([
      db.collection("package_scans").find(dateFilter).toArray(),
      db.collection("spoke_stops").find(dateFilter).toArray(),
      db.collection("spoke_stops").find({}).sort({ created_at: -1 }).limit(20).toArray(),
    ]);

    const matched = stops.filter((s) => s.label_status === "Match").length;
    const unmatched = stops.filter((s) => s.label_status === "Unmatch").length;
    const human = stops.filter((s) => s.label_status === "Human").length;
    const delivered = stops.filter((s) => s.delivery_succeeded === true).length;
    const attempted = stops.filter((s) => s.delivery_state === "attempted").length;
    const collectTotal = scans.reduce((sum, s) => sum + (s.collect_amount || 0), 0);

    const byRoute: Record<string, number> = {};
    stops.forEach((s) => {
      const r = s.route_title || "Unknown";
      byRoute[r] = (byRoute[r] || 0) + 1;
    });

    const byStatus = { Match: matched, Unmatch: unmatched, Human: human };

    const byBranch: Record<string, number> = {};
    scans.forEach((s) => {
      const b = s.client_location || "OTHER";
      byBranch[b] = (byBranch[b] || 0) + 1;
    });

    const flags = {
      delivery: scans.filter((s) => s.delivery_today).length,
      collect: scans.filter((s) => s.collect_payment).length,
      cold: scans.filter((s) => s.type === "cold package").length,
      sig: scans.filter((s) => s.signature_required).length,
    };

    const failed = stops.filter((s) => s.delivery_state === "failed" || s.delivery_succeeded === false).length;

    const pipeline = {
      allocated: stops.length,
      outForDelivery: stops.filter((s) => s.event_type === "stop.out_for_delivery").length,
      attempted,
      delivered,
      failed,
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

    // Build recent activity from recent stops
    const recentActivity = recentStops.slice(0, 10).map((s) => ({
      type: "stop",
      description: `Stop ${s.delivery_state === "delivered" ? "delivered" : "created"} for ${s.recipient_name || "Unknown"}${s.route_title ? ` on ${s.route_title}` : ""}`,
      timestamp: s.updated_at || s.created_at,
      icon: s.delivery_state === "delivered" ? "check" : "plus",
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
      kpi: { scans: scans.length, matched, unmatched, human, delivered, attempted, collectTotal },
      byRoute,
      byStatus,
      byBranch,
      flags,
      pipeline,
      collectQueue,
      coldPackages,
      recentActivity,
      trend,
      recentStops,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
