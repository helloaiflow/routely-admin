import { NextResponse } from "next/server";

import { fetchPhiObject, ivyPhotoKey } from "@/lib/phi-r2";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchTelegramImage } from "@/lib/telegram-file";
import { requirePagePermission } from "@/lib/tenant";

/* Session-gated, tenant-scoped proxy for one IVY label photo. The browser only
 * ever sees this URL. Source order: the private PHI bucket (@/lib/phi-r2,
 * copied by IVY after the driver is notified), then Telegram as a fallback for
 * scans from before that copy existed (@/lib/telegram-file — the bot token
 * stays server-side). Any failure is a generic 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ rtscanId: string }> }) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rtscanId } = await params;
  const id = Number(rtscanId);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let q = getSupabaseAdmin().from("ivy_scans").select("image_url, tenant_id").eq("rtscan_id", id);
  // Admin cross-tenant: "all" scope drops the per-tenant filter (same as the list).
  if (!(ctx.isAdmin && ctx.tenantScope === "all")) q = q.eq("tenant_id", Number(ctx.tenantId));
  const { data } = await q.maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stored = data.image_url ? String(data.image_url) : "";
  const img =
    (await fetchPhiObject(ivyPhotoKey(Number(data.tenant_id), id))) ??
    (stored ? await fetchTelegramImage(stored) : null);
  if (!img) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(img.body, {
    headers: { "Content-Type": img.contentType, "Cache-Control": "private, max-age=3600" },
  });
}
