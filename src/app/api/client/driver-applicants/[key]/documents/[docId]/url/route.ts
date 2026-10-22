import { type NextRequest, NextResponse } from "next/server";

import { isValidKey, ROUTELY_OPS_TENANT_ID } from "@/lib/driver-applicants";
import { getTenantContext } from "@/lib/tenant";

/* GET /api/client/driver-applicants/[key]/documents/[docId]/url — staff
 * document viewing. Proxies to FastAPI GET
 * /v1/onboarding/applications/{key}/documents/{doc_id}/url, which returns a
 * short-lived presigned GET to the PRIVATE R2 bucket and writes a
 * 'document.accessed' audit event server-side (every access is audited — see
 * app/services/onboarding.py:document_view_url in routely-api). This is the
 * ONLY way this app ever hands out a document URL: never a direct/public link,
 * never built from a storage_path client-side.
 *
 * R2 vs Supabase Storage (2026-10-22 investigation): every applicant_documents
 * row currently stored by routely-api lives in R2 (see
 * services/r2_driver_docs.py) regardless of acquisition_source — there is no
 * Supabase Storage document path in the backend today, so this one endpoint
 * covers both web- and app-sourced documents as things stand. If the mobile
 * team's parallel work adds a Supabase-Storage-backed document kind, THIS proxy
 * will need a second branch (or the backend a second signed-URL endpoint) —
 * flagged here rather than built against, since no such endpoint exists to
 * build against yet. Admin-only. */

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string; docId: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  if (!FASTAPI_SECRET) return NextResponse.json({ error: "Onboarding service unavailable" }, { status: 503 });

  const { key, docId } = await params;
  if (!isValidKey(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actor = ctx.user?.primaryEmailAddress?.emailAddress ?? ctx.userId;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/onboarding/applications/${encodeURIComponent(key)}/documents/${encodeURIComponent(docId)}/url?tenant_id=${ROUTELY_OPS_TENANT_ID}&actor=${encodeURIComponent(actor)}`,
      {
        method: "GET",
        headers: { "X-API-Key": FASTAPI_SECRET },
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json({ error: "Onboarding service unreachable" }, { status: 502 });
  }
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
