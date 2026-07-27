import { NextResponse, type NextRequest } from "next/server";

import { getTenantContext } from "@/lib/tenant";

/* ── /api/client/hubs/[hub_id]/drivers ───────────────────────────────────────
 * Hub ↔ driver access control (Hubs v2). Proxies FastAPI /v1/hubs/{id}/drivers
 * so relation changes emit their outbox event. Replace semantics; a driver in
 * both lists resolves to BLOCKED (block wins — enforced server-side).
 * Admin-only (ops surface, Routely fleet tenant).
 * ─────────────────────────────────────────────────────────────────────────── */

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";
const ROUTELY_OPS_TENANT_ID = 1;

async function proxy(req: NextRequest, hub_id: string, method: "GET" | "PUT") {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Fleet service unavailable" }, { status: 503 });

  const init: RequestInit = {
    method,
    headers: { "X-API-Key": FASTAPI_SECRET, "Content-Type": "application/json" },
    cache: "no-store",
  };
  if (method === "PUT") {
    try {
      init.body = JSON.stringify(await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
  }
  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/hubs/${encodeURIComponent(hub_id)}/drivers?tenant_id=${ROUTELY_OPS_TENANT_ID}`,
      init,
    );
  } catch {
    return NextResponse.json({ error: "Fleet service unreachable" }, { status: 502 });
  }
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json({ error: data?.detail ?? "Fleet service error" }, { status: upstream.status });
  }
  return NextResponse.json(data);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ hub_id: string }> }) {
  const { hub_id } = await params;
  return proxy(req, hub_id, "GET");
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ hub_id: string }> }) {
  const { hub_id } = await params;
  return proxy(req, hub_id, "PUT");
}
