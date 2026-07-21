import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext } from "@/lib/tenant";

/* ── /api/client/hubs ─────────────────────────────────────────────────────────
 * Command Center · Fleet (CC1). Hubs = Routely's dispatch origins (depots).
 * The fleet belongs to Routely OPS (tenant_id=1 = Routely LLC), shared across
 * client pharmacies — NOT per-pharmacy — so we scope to the ops tenant.
 * READS come straight from Supabase (fast, work immediately). WRITES proxy to
 * FastAPI /v1/hubs so the domain mutation emits its outbox event (single source
 * of the event-driven pipeline). Admin-only (ops surface).
 * ─────────────────────────────────────────────────────────────────────────── */

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";
// Routely LLC = the ops tenant that owns the courier fleet.
export const ROUTELY_OPS_TENANT_ID = 1;

// ── GET — list hubs (Supabase, ops tenant) ──────────────────────────────────
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("hubs")
    .select("id, tenant_id, name, address, geo, timezone, is_default, external_circuit_id, route_defaults, created_at, updated_at")
    .eq("tenant_id", ROUTELY_OPS_TENANT_ID)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) {
    console.error("[hubs GET]", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({ hubs: data ?? [] });
}

// ── POST — create a hub (proxy to FastAPI so the event fires) ────────────────
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
    upstream = await fetch(`${FASTAPI_BASE}/v1/hubs?tenant_id=${ROUTELY_OPS_TENANT_ID}`, {
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
