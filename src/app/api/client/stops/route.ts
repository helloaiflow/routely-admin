import { NextResponse } from "next/server";

import { reviveStopDoc, shapeStopForList } from "@/lib/spoke-fields";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/* GET /api/client/stops — dispatch console list query (2026-08-01).
 *
 * Structured query params (agent-consumable — the AI dispatcher queries the
 * same way a human does):
 *
 *   status         comma-separated, any of:
 *                    unassigned  — pending/approved/paid/unassigned/created,
 *                                  no driver, no route (never touched by dispatch)
 *                    in_route    — assigned | in_transit (currently out with a driver)
 *                    delivered
 *                    failed      — terminal, post-2026-07-31 collapse
 *                  Omit for no status restriction (still excludes deleted/pickup-leg).
 *                  'draft' is NOT a value here — drafts live in draft_stops,
 *                  fetched separately via /api/client/draft-stops.
 *   disposition    comma-separated disposition enum values (e.g.
 *                  no_one_home,bad_address) — narrows within status=failed or
 *                  status=delivered. See routely-api DISPOSITIONS_BY_STATUS.
 *   cancel_pending 1|true — only stops with cancel_requested.status='pending'.
 *   date_from      YYYY-MM-DD, inclusive. Matches the stop's scheduled
 *                  delivery day (service.date, legacy delivery.date fallback)
 *                  — NOT created_at. Omit both date params for no date filter.
 *   date_to        YYYY-MM-DD, inclusive.
 *   filter         legacy shortcut, still supported: today|unassigned|
 *                  recovered|week|all. Superseded by status/date_from/date_to
 *                  but kept for backward compat with existing callers.
 *   limit          default 200, max 1000.
 *   offset         default 0 — pagination for wide date ranges.
 *
 * Response: { stops, total, returned, offset, limit, has_more }
 *   total    = count of ALL rows matching the filter (for "N of M" UI text)
 *   returned = stops.length (after limit/offset slice)
 */

const STATUS_BUCKETS: Record<string, string[]> = {
  unassigned: ["pending", "approved", "paid", "unassigned", "created"],
  in_route: ["assigned", "in_transit"],
  delivered: ["delivered"],
  failed: ["failed"],
};

export async function GET(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const tenantId = Number(ctx.tenantId);
  // Admin cross-tenant: "all" scope drops the per-tenant filter.
  const scopeAll = ctx.isAdmin && ctx.tenantScope === "all";
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "200"), 1), 1000);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0"), 0);
  const filter = searchParams.get("filter") ?? "all";

  const statusParam = searchParams.get("status");
  const statusList = statusParam
    ? statusParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
  const dispositionParam = searchParams.get("disposition");
  const dispositionList = dispositionParam
    ? dispositionParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
  const cancelPending = ["1", "true"].includes(searchParams.get("cancel_pending") ?? "");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  const now = new Date();
  // Today's date in Florida (ET) as YYYY-MM-DD — handles DST automatically
  const etDateStr = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  // HOTFIX 2026-07-13: the previous `select doc … limit(2000)` pulled EVERY
  // tenant doc (~2.6 MB of JSONB) on EVERY call, ×3 filters per board refresh.
  // Under concurrent refreshes PostgREST queued these payloads until the
  // shared-tier Postgres hit statement timeouts → cascading 504s → the whole
  // app "frozen, nothing loads" (verified live in Supabase API logs).
  //
  // Server-side narrowing stays a strict SUPERSET of what the JS below keeps
  // (fine-grained null/missing-field semantics run in JS, where they're
  // exact) — status/disposition/cancel_pending/date_from/date_to are all now
  // real SQL predicates (2026-08-01), not just the legacy `filter` buckets.
  let q = supabase.from("stops").select("doc", { count: "exact" });
  if (!scopeAll) q = q.eq("tenant_id", tenantId);

  if (statusList?.length) {
    const values = statusList.flatMap((s) => STATUS_BUCKETS[s] ?? [s]);
    q = q.in("doc->>status", values);
  }
  if (dispositionList?.length) {
    q = q.in("doc->>disposition", dispositionList);
  }
  if (cancelPending) {
    q = q.eq("doc->cancel_requested->>status", "pending");
  }
  if (dateFrom || dateTo) {
    // service.date / delivery.date are plain "YYYY-MM-DD" strings — safe to
    // range-compare lexicographically. OR across both fields, each leg
    // range-bounded on whichever side was given.
    const bound = (field: string) => {
      const parts: string[] = [];
      if (dateFrom) parts.push(`doc->${field}->>date.gte.${dateFrom}`);
      if (dateTo) parts.push(`doc->${field}->>date.lte.${dateTo}`);
      return parts;
    };
    // PostgREST .or() needs a single comma-joined expression; AND the two
    // bounds per field, then OR across service/delivery via nested and().
    const serviceParts = bound("service");
    const deliveryParts = bound("delivery");
    const clauses = [
      serviceParts.length ? `and(${serviceParts.join(",")})` : null,
      deliveryParts.length ? `and(${deliveryParts.join(",")})` : null,
    ].filter(Boolean) as string[];
    if (clauses.length) q = q.or(clauses.join(","));
  } else if (filter === "today") {
    // Legacy shortcut — same semantics as before.
    q = q.or(`doc->service->>date.eq.${etDateStr},doc->delivery->>date.eq.${etDateStr}`);
  } else if (filter === "unassigned" && !statusList) {
    q = q.in("doc->>status", STATUS_BUCKETS.unassigned);
  } else if (filter === "recovered") {
    q = q.eq("doc->>status", "draft");
  }

  // created_at is an ISO string in the doc → lexicographic DESC is correct.
  const {
    data: rows,
    error,
    count,
  } = await q.order("doc->>created_at", { ascending: false }).range(offset, offset + limit - 1);

  if (error) {
    console.error("[stops] supabase error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let docs = (rows ?? []).map((r) => reviveStopDoc((r as { doc: any }).doc)).filter(Boolean);

  // Base exclusions: soft-deleted stops and internal pickup legs are never
  // shown on the customer-facing Submitted tab. (!== matches missing too.)
  docs = docs.filter((d) => d.status !== "deleted" && d.stop_type !== "pickup");

  // Fine-grained JS pass for the legacy `filter` shortcut only (kept exact —
  // see HOTFIX note above). Skipped when the new status/date params drove
  // the query, since those are already exact SQL predicates.
  if (!statusList && !dateFrom && !dateTo) {
    if (filter === "today") {
      docs = docs.filter((d) => d.service?.date === etDateStr || d.delivery?.date === etDateStr);
    } else if (filter === "unassigned") {
      const PENDING = STATUS_BUCKETS.unassigned;
      docs = docs.filter(
        (d) =>
          PENDING.includes(d.status) &&
          (d.assignment?.driver_id ?? null) === null &&
          (d.assignment?.route_id ?? null) === null,
      );
    } else if (filter === "recovered") {
      docs = docs.filter((d) => d.status === "draft" && d.submit_error != null);
    } else if (filter === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      docs = docs.filter((d) => d.created_at && new Date(d.created_at) >= weekAgo);
    }
  }
  // "unassigned" bucket additionally needs the driver/route null check even
  // when status= drove the query (JS-only semantics — null OR missing).
  if (statusList?.includes("unassigned")) {
    docs = docs.filter((d) => {
      if (!STATUS_BUCKETS.unassigned.includes(d.status)) return true; // other selected buckets untouched
      return (d.assignment?.driver_id ?? null) === null && (d.assignment?.route_id ?? null) === null;
    });
  }

  const stops = docs.map((d) => shapeStopForList(d));
  const total = count ?? stops.length;

  return NextResponse.json({
    stops,
    total,
    returned: stops.length,
    offset,
    limit,
    has_more: offset + stops.length < total,
    filter,
  });
}
