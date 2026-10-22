import { type NextRequest, NextResponse } from "next/server";

import { BACKGROUND_CHECK_STATUSES, isValidKey, ROUTELY_OPS_TENANT_ID } from "@/lib/driver-applicants";
import { getTenantContext } from "@/lib/tenant";

/* POST /api/client/driver-applicants/[key]/background-check — staff records a
 * manual background-check result. Proxies to FastAPI POST
 * /v1/onboarding/applications/{key}/background-check. This does NOT change the
 * application's status — it's separate tracking info the Approve decision reads.
 * NEVER a file upload: only a short structured status + an optional free-text
 * external_reference string. Same auth/actor/error-passthrough shape as ../approve.
 * Admin-only. Backend endpoint contract (2026-10-22): body
 * {status: 'requested'|'clear'|'consider', date?, external_reference?}. */

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Onboarding service unavailable" }, { status: 503 });

  const { key } = await params;
  if (!isValidKey(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { status?: unknown; date?: unknown; external_reference?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "invalid_body", message: "Request body must be JSON" }, { status: 400 });
  }
  const status = typeof body.status === "string" ? body.status : "";
  if (!(BACKGROUND_CHECK_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { code: "invalid_status", message: `status must be one of: ${BACKGROUND_CHECK_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }
  let date: string | null = null;
  if (typeof body.date === "string" && body.date.trim()) {
    if (!DATE_RE.test(body.date.trim())) {
      return NextResponse.json({ code: "invalid_date", message: "date must be YYYY-MM-DD" }, { status: 400 });
    }
    date = body.date.trim();
  }
  const externalReference =
    typeof body.external_reference === "string" ? body.external_reference.trim().slice(0, 200) : "";
  const actor = ctx.user?.primaryEmailAddress?.emailAddress ?? ctx.userId;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/onboarding/applications/${encodeURIComponent(key)}/background-check?tenant_id=${ROUTELY_OPS_TENANT_ID}&actor=${encodeURIComponent(actor)}`,
      {
        method: "POST",
        headers: { "X-API-Key": FASTAPI_SECRET, "Content-Type": "application/json" },
        body: JSON.stringify({ status, date, external_reference: externalReference || null }),
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json({ error: "Onboarding service unreachable" }, { status: 502 });
  }
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
