import { type NextRequest, NextResponse } from "next/server";

import { isValidKey, REQUEST_CHANGES_REASON_CODES, ROUTELY_OPS_TENANT_ID } from "@/lib/driver-applicants";
import { getTenantContext } from "@/lib/tenant";

/* POST /api/client/driver-applicants/[key]/request-changes — staff decision.
 * Proxies to FastAPI POST /v1/onboarding/applications/{key}/request-changes, which
 * returns the application to Onboarding (in_progress) so the applicant can redo the
 * flagged item. Same auth/actor/error-passthrough shape as ../approve. Admin-only.
 * Backend endpoint contract (2026-10-22): body {reason_code, note?}, reason_code in
 * REQUEST_CHANGES_REASON_CODES. */

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Onboarding service unavailable" }, { status: 503 });

  const { key } = await params;
  if (!isValidKey(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { reason_code?: unknown; note?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "invalid_body", message: "Request body must be JSON" }, { status: 400 });
  }
  const reasonCode = typeof body.reason_code === "string" ? body.reason_code : "";
  if (!(REQUEST_CHANGES_REASON_CODES as readonly string[]).includes(reasonCode)) {
    return NextResponse.json(
      {
        code: "invalid_reason_code",
        message: `reason_code must be one of: ${REQUEST_CHANGES_REASON_CODES.join(", ")}`,
      },
      { status: 400 },
    );
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  const actor = ctx.user?.primaryEmailAddress?.emailAddress ?? ctx.userId;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/onboarding/applications/${encodeURIComponent(key)}/request-changes?tenant_id=${ROUTELY_OPS_TENANT_ID}&actor=${encodeURIComponent(actor)}`,
      {
        method: "POST",
        headers: { "X-API-Key": FASTAPI_SECRET, "Content-Type": "application/json" },
        body: JSON.stringify({ reason_code: reasonCode, note: note || null }),
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json({ error: "Onboarding service unreachable" }, { status: 502 });
  }
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
