import { NextResponse } from "next/server";

import { reviveStopDoc, shapeStopForList } from "@/lib/spoke-fields";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

export async function GET(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const tenantId = Number(ctx.tenantId);
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
  const filter = searchParams.get("filter") ?? "all";

  const now = new Date();
  // Today's date in Florida (ET) as YYYY-MM-DD — handles DST automatically
  const etDateStr = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  // HOTFIX 2026-07-13: the previous `select doc … limit(2000)` pulled EVERY
  // tenant doc (~2.6 MB of JSONB) on EVERY call, ×3 filters per board refresh.
  // Under concurrent refreshes PostgREST queued these payloads until the
  // shared-tier Postgres hit statement timeouts → cascading 504s → the whole
  // app "frozen, nothing loads" (verified live in Supabase API logs).
  //
  // Now each filter narrows SERVER-SIDE with a positive condition that is a
  // strict SUPERSET of what the JS below keeps (verified against real data:
  // today=28 · unassigned=136 · recovered=0 · all=361 — SQL counts match the
  // JS semantics exactly), plus created_at DESC ordering and a hard cap. The
  // fine-grained null/missing-field semantics still run in JS unchanged —
  // just over ≤500 rows instead of 2000.
  let q = supabase.from("stops").select("doc").eq("tenant_id", tenantId);
  if (filter === "today") {
    // service.date / delivery.date are plain "YYYY-MM-DD" strings in the doc.
    q = q.or(`doc->service->>date.eq.${etDateStr},doc->delivery->>date.eq.${etDateStr}`);
  } else if (filter === "unassigned") {
    // Every row the JS keeps has one of these statuses — driver/route null
    // checks (null OR missing) stay in JS where the semantics are exact.
    q = q.in("doc->>status", ["pending", "approved", "paid", "unassigned", "created"]);
  } else if (filter === "recovered") {
    q = q.eq("doc->>status", "draft");
  }
  // created_at is an ISO string in the doc → lexicographic DESC is correct.
  const { data: rows, error } = await q.order("doc->>created_at", { ascending: false }).limit(500);

  if (error) {
    console.error("[stops] supabase error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let docs = (rows ?? []).map((r) => reviveStopDoc((r as { doc: any }).doc)).filter(Boolean);

  // Base exclusions: soft-deleted stops and internal pickup legs are never
  // shown on the customer-facing Submitted tab. (!== matches missing too.)
  docs = docs.filter((d) => d.status !== "deleted" && d.stop_type !== "pickup");

  if (filter === "today") {
    // "Today" = delivers today, keyed STRICTLY off the canonical delivery day
    // (service.date), legacy delivery.date as fallback. created_at must NOT
    // define "today" — a stop created today but scheduled later belongs to its
    // delivery day, not today's board.
    docs = docs.filter((d) => d.service?.date === etDateStr || d.delivery?.date === etDateStr);
  } else if (filter === "unassigned") {
    // Submitted tab: only stops no dispatcher has worked yet — PENDING-bucket
    // status AND no driver AND no route (null matches missing field too).
    const PENDING = ["pending", "approved", "paid", "unassigned", "created"];
    docs = docs.filter(
      (d) =>
        PENDING.includes(d.status) &&
        (d.assignment?.driver_id ?? null) === null &&
        (d.assignment?.route_id ?? null) === null,
    );
  } else if (filter === "recovered") {
    // Recovered drafts: a submit failed (Spoke didn't accept) so the stop fell
    // back to status "draft" + submit_error. These live in `stops` and must
    // surface in the Drafts list so the user can edit + resubmit.
    docs = docs.filter((d) => d.status === "draft" && d.submit_error != null);
  } else if (filter === "week") {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    docs = docs.filter((d) => d.created_at && new Date(d.created_at) >= weekAgo);
  }
  // filter=all (default) → no date restriction, only base exclusions

  // created_at DESC, then cap at limit (matches Mongo's sort().limit() order).
  docs.sort((a, b) => {
    const ta = a.created_at instanceof Date ? a.created_at.getTime() : new Date(a.created_at ?? 0).getTime();
    const tb = b.created_at instanceof Date ? b.created_at.getTime() : new Date(b.created_at ?? 0).getTime();
    return tb - ta;
  });
  docs = docs.slice(0, limit);

  // No driverMap needed: shapeStopForList falls back to the embedded
  // assignment.driver_name. (A Supabase driver-name resolver is added later
  // only if assigned stops come back without an embedded name.)
  const stops = docs.map((d) => shapeStopForList(d));

  return NextResponse.json({ stops, total: stops.length, filter });
}
