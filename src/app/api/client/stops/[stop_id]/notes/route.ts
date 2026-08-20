import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getDb, requirePagePermission } from "@/lib/tenant";

// FastAPI (VPS) owns internal notes on STOPS (F6b): it writes PG — what the
// detail panel reads — and mirrors to Mongo. A Mongo-direct note here was
// invisible to the panel and doomed to be wiped by the full-doc reverse
// mirror on the next edit. Drafts moved to Supabase public.draft_stops on
// 2026-06-22 (commit 975852a) — this fallback was left querying Mongo
// draft_stops after that migration and has been 404ing on any draft made
// since (found live 2026-08-19/20, Mongo Inventory report). Repointed here.
const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";

export async function POST(request: Request, { params }: { params: Promise<{ stop_id: string }> }) {
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
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.emailAddresses[0]?.emailAddress || "Client"
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
      upstream = await fetch(`${FASTAPI_BASE}/v1/stops/${encodeURIComponent(stop_id)}/notes?tenant_id=${tenantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": FASTAPI_SECRET },
        body: JSON.stringify({ text, actor }),
        signal: AbortSignal.timeout(15000),
      });
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

  // ── Stops fallback when FastAPI is not configured (Mongo — dev-only path,
  // stops itself stays on Mongo per standing instruction) ──
  if (!FASTAPI_SECRET) {
    // biome-ignore lint/suspicious/noExplicitAny: MongoDB $push type inference
    const pushOp = { $push: { internal_notes: note }, $set: { updated_at: new Date() } } as any;
    const db = await getDb();
    const result = await db.collection("stops").updateOne({ stop_id, tenant_id: tenantId }, pushOp);
    if (result.matchedCount > 0) return NextResponse.json({ ok: true, note });
  }

  // ── Drafts — Supabase public.draft_stops (jsonb doc, no $push — read,
  // mutate the JS object, write the whole doc back, same pattern
  // draft-stops/route.ts's PATCH handler already uses). ──
  const supabase = getSupabaseAdmin();
  const { data: draftRow } = await supabase
    .from("draft_stops")
    .select("doc")
    .or(`draft_id.eq.${stop_id},tracking_id.eq.${stop_id}`)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!draftRow) {
    return NextResponse.json({ error: "Stop not found" }, { status: 404 });
  }

  const doc = (draftRow.doc ?? {}) as Record<string, unknown>;
  const existingNotes = Array.isArray(doc.internal_notes) ? doc.internal_notes : [];
  doc.internal_notes = [...existingNotes, note];
  doc.updated_at = new Date().toISOString();

  const { error: updErr } = await supabase
    .from("draft_stops")
    .update({ doc, updated_at: new Date().toISOString() })
    .eq("draft_id", (doc as { draft_id?: string }).draft_id ?? stop_id)
    .eq("tenant_id", tenantId);
  if (updErr) {
    console.error("[notes] draft_stops update error:", updErr);
    return NextResponse.json({ error: "Stop not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, note });
}
