import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext } from "@/lib/tenant";

/* ── /api/client/drivers ──────────────────────────────────────────────────────
 * Command Center · Fleet (CC1). Drivers = the people who run deliveries. Single
 * source of truth = public.drivers (split-brain killed in CC1). Fleet belongs to
 * Routely OPS (tenant 1). READS from Supabase; WRITES proxy to FastAPI /v1/drivers
 * so the driver.* events fire. Admin-only.
 * ─────────────────────────────────────────────────────────────────────────── */

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";
const ROUTELY_OPS_TENANT_ID = 1;

// ── GET — list drivers (Supabase, ops tenant) ───────────────────────────────
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("drivers")
    .select(
      "id, tenant_id, name, phone, email, hub_id, all_hubs, vehicle, status, external_circuit_id, doc, driver_hubs(hub_id), created_at, updated_at",
    )
    .eq("tenant_id", ROUTELY_OPS_TENANT_ID)
    .order("status", { ascending: true }) // active before inactive
    .order("name", { ascending: true });
  if (error) {
    console.error("[drivers GET]", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  // Flatten the driver_hubs join to hub_ids[] (multi-hub membership, CC1.1).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drivers = (data ?? []).map((r: any) => {
    const { driver_hubs, ...rest } = r;
    return { ...rest, hub_ids: Array.isArray(driver_hubs) ? driver_hubs.map((x: { hub_id: string }) => x.hub_id) : [] };
  });
  return NextResponse.json({ drivers });
}

// ── POST — create a driver (proxy to FastAPI so the event fires) ─────────────
export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Fleet service unavailable" }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${FASTAPI_BASE}/v1/drivers?tenant_id=${ROUTELY_OPS_TENANT_ID}`, {
      method: "POST",
      headers: { "X-API-Key": FASTAPI_SECRET, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Fleet service unreachable" }, { status: 502 });
  }
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
