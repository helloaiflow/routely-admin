import { NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* GET /api/client/billing/documents/[id]/pdf — streams the PDF rendered from
 * the document's frozen snapshot (routely-api never recalculates it). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${FASTAPI_BASE}/v1/billing/documents/${encodeURIComponent(id)}/pdf?tenant_id=${encodeURIComponent(String(ctx.tenantId))}`,
      { headers: { "X-API-Key": FASTAPI_SECRET } },
    );
  } catch {
    return NextResponse.json({ error: "Billing service unreachable" }, { status: 502 });
  }
  if (!upstream.ok) {
    const payload = await upstream.json().catch(() => ({ error: "PDF generation failed" }));
    return NextResponse.json(payload, { status: upstream.status });
  }
  const buf = await upstream.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": upstream.headers.get("content-disposition") ?? "inline",
    },
  });
}
