import { NextResponse } from "next/server";

import clientPromise from "@/lib/mongodb";
import { requirePagePermission } from "@/lib/tenant";

export async function GET() {
  // Member-system Phase 4: reports page permission. Owners pass for free;
  // tenant resolves from the session's tenant_id so members (whose
  // clerk_user_id is not on the tenant doc) get their tenant's stats.
  const ctx = await requirePagePermission("reports");
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const client = await clientPromise;
    const db = client.db();

    const tenant = await db.collection("tenants").findOne({ tenant_id: ctx.tenantId });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const tenantId = tenant._id.toString();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayTotal, inTransit, deliveredToday, monthTotal, recentStops] = await Promise.all([
      db.collection("spoke_stops").countDocuments({
        tenant_id: tenantId,
        created_at: { $gte: today },
      }),
      db.collection("spoke_stops").countDocuments({
        tenant_id: tenantId,
        status: { $in: ["in_transit", "picked_up", "pending"] },
      }),
      db.collection("spoke_stops").countDocuments({
        tenant_id: tenantId,
        status: "delivered",
        created_at: { $gte: today },
      }),
      db.collection("spoke_stops").countDocuments({
        tenant_id: tenantId,
        created_at: { $gte: monthStart },
      }),
      db.collection("spoke_stops").find({ tenant_id: tenantId }).sort({ created_at: -1 }).limit(8).toArray(),
    ]);

    return NextResponse.json({
      todayTotal,
      inTransit,
      deliveredToday,
      monthTotal,
      recentStops: recentStops.map((s) => ({
        id: s._id.toString(),
        rtstop_id: s.rtstop_id,
        recipient: s.recipient_name || s.name || "Unknown",
        address: s.address || "",
        status: s.status || "pending",
        created_at: s.created_at,
      })),
      tenant: {
        company_name: tenant.company_name,
        plan: tenant.plan_type || tenant.plan,
        trial_ends_at: tenant.trial_ends_at,
      },
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
