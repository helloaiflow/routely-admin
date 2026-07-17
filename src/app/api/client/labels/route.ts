import { NextResponse } from "next/server";

import clientPromise from "@/lib/mongodb";
import { requirePagePermission } from "@/lib/tenant";

/** Tenant-scoped label order history (newest first). */
export async function GET() {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const client = await clientPromise;
    const orders = await client
      .db("routely_prod")
      .collection("label_orders")
      .find(ctx.isAdmin && ctx.tenantScope === "all" ? {} : { tenant_id: String(ctx.tenantId ?? "1") })
      .sort({ created_at: -1 })
      .limit(100)
      .project({ _id: 0 })
      .toArray();
    return NextResponse.json({ orders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Query error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
