import { type NextRequest, NextResponse } from "next/server";

import { isValidKey, ROUTELY_OPS_TENANT_ID } from "@/lib/driver-applicants";
import { getTenantContext } from "@/lib/tenant";

/* POST /api/client/driver-applicants/[key]/documents/selfie-match — staff records a manual
 * "same person?" decision from the Document Visualizer's compare view (license front vs. selfie).
 * Proxies to FastAPI POST /v1/onboarding/applications/{key}/documents/selfie-match (R29C). This
 * does NOT change the application's status -- same shape/pattern as ../background-check. Admin-only.
 * Backend endpoint contract (2026-10-23): body {match: boolean, note?: string}. */

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Onboarding service unavailable" }, { status: 503 });

  const { key } = await params;
  if (!isValidKey(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { match?: unknown; note?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "invalid_body", message: "Request body must be JSON" }, { status: 400 });
  }
  if (typeof body.match !== "boolean") {
    return NextResponse.json({ code: "invalid_match", message: "match must be a boolean" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  const actor = ctx.user?.primaryEmailAddress?.emailAddress ?? ctx.userId;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/onboarding/applications/${encodeURIComponent(key)}/documents/selfie-match?tenant_id=${ROUTELY_OPS_TENANT_ID}&actor=${encodeURIComponent(actor)}`,
      {
        method: "POST",
        headers: { "X-API-Key": FASTAPI_SECRET, "Content-Type": "application/json" },
        body: JSON.stringify({ match: body.match, note: note || null }),
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json({ error: "Onboarding service unreachable" }, { status: 502 });
  }
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
