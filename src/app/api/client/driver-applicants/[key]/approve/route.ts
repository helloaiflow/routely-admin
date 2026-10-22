import { type NextRequest, NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant";

/* POST /api/client/driver-applicants/[key]/approve — staff approval.
 * Proxies to FastAPI POST /v1/onboarding/applications/{key}/approve, which moves
 * in_review → approved_applicant (the pool), writes the completion report and the
 * audit event. The actor recorded is the signed-in admin. Creates NO driver row —
 * graduation to public.drivers is a later mission. Admin-only. */

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";
const ROUTELY_OPS_TENANT_ID = 1;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_RE = /^RA-[2-9A-HJKMNP-TV-Z]{6}$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Onboarding service unavailable" }, { status: 503 });

  const { key } = await params;
  if (!UUID_RE.test(key) && !REF_RE.test(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { reason?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine — reason is optional */
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const actor = ctx.user?.primaryEmailAddress?.emailAddress ?? ctx.userId;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/onboarding/applications/${encodeURIComponent(key)}/approve?tenant_id=${ROUTELY_OPS_TENANT_ID}&actor=${encodeURIComponent(actor)}`,
      {
        method: "POST",
        headers: { "X-API-Key": FASTAPI_SECRET, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || null }),
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json({ error: "Onboarding service unreachable" }, { status: 502 });
  }
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
