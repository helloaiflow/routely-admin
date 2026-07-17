import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getDb, requirePagePermission } from "@/lib/tenant";

// FastAPI (VPS) owns internal notes on STOPS (F6b): it writes PG — what the
// detail panel reads — and mirrors to Mongo. A Mongo-direct note here was
// invisible to the panel and doomed to be wiped by the full-doc reverse
// mirror on the next edit. Drafts stay Mongo-direct (they live only in Mongo).
const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ stop_id: string }> },
) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { stop_id } = await params;
  const tenantId = Number(ctx.tenantId);

  const body = (await request.json()) as { text?: string };
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Note text required" }, { status: 400 });
  if (text.length > 500) return NextResponse.json({ error: "Note too long (max 500 chars)" }, { status: 400 });

  // Resolve author name from Clerk session
  const user = await currentUser();
  const author = user
    ? (`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.emailAddresses[0]?.emailAddress || "Client")
    : "Client";

  // ── Stops: delegate to FastAPI (same actor shape as the main stop route) ──
  if (FASTAPI_SECRET) {
    const actor = {
      type: ctx.role === "member" ? "tenant_member" : "tenant_owner",
      clerk_user_id: ctx.userId,
      name: author === "Client" ? "" : author,
      tenant_role: ctx.role,
    };
    let upstream: Response | null = null;
    try {
      upstream = await fetch(
        `${FASTAPI_BASE}/v1/stops/${encodeURIComponent(stop_id)}/notes?tenant_id=${tenantId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": FASTAPI_SECRET },
          body: JSON.stringify({ text, actor }),
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch {
      return NextResponse.json(
        { error: "Notes service unreachable — note not saved. Please try again." },
        { status: 502 },
      );
    }
    if (upstream.ok) {
      // Passthrough {ok, note}
      const out = (await upstream.json()) as Record<string, unknown>;
      return NextResponse.json(out);
    }
    if (upstream.status !== 404) {
      return NextResponse.json({ error: "Couldn't save the note" }, { status: 502 });
    }
    // 404 → not a stop; fall through to the draft branch below.
  }

  const note = {
    id: `note_${Date.now()}`,
    text,
    author,
    role: "client" as const,
    created_at: new Date().toISOString(),
  };

  // ── Drafts (and stops fallback when FastAPI is not configured) ──
  // biome-ignore lint/suspicious/noExplicitAny: MongoDB $push type inference
  const pushOp = { $push: { internal_notes: note }, $set: { updated_at: new Date() } } as any;

  const db = await getDb();
  let result = { matchedCount: 0 };
  if (!FASTAPI_SECRET) {
    result = await db.collection("stops").updateOne({ stop_id, tenant_id: tenantId }, pushOp);
  }
  if (result.matchedCount === 0) {
    result = await db
      .collection("draft_stops")
      .updateOne({ $or: [{ draft_id: stop_id }, { stop_id }], tenant_id: tenantId }, pushOp);
  }

  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Stop not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, note });
}
