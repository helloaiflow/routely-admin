import { type NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext } from "@/lib/tenant";

/* ── /api/client/driver-applicants/events ─────────────────────────────────────
 * A04 Activity — cross-applicant feed: every decision (who decided what, when,
 * with what reason) and every document-view/access event, across ALL of
 * tenant 1's applicants, newest first.
 *
 * Gap note (2026-10-22): there is no FastAPI endpoint for this — every
 * /v1/onboarding/* route that touches applicant_events is scoped to one
 * application_ref at a time. This route does NOT invent backend business
 * logic though: it's a plain READ straight from Supabase (service key), the
 * exact same pattern the sibling list/detail routes already use for every
 * other field on this page. If/when a cross-tenant or cross-applicant
 * FastAPI endpoint exists, this can switch to proxying it instead.
 * Admin-only. Cursor-paginated by numeric event id (applicant_events.id),
 * since the table is append-only and ids are monotonically increasing.
 * ─────────────────────────────────────────────────────────────────────────── */

const ROUTELY_OPS_TENANT_ID = 1;
const MAX_PAGE_SIZE = 200;

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(sp.get("pageSize") ?? "50", 10) || 50));
  const before = sp.get("before"); // event id cursor: only ids strictly less than this

  const db = getSupabaseAdmin();
  // applicant_events has no tenant_id column of its own — scope via the parent
  // applicants row (RLS-equivalent manual join, same as detail's single-applicant
  // query does implicitly by first resolving applicant.id for tenant 1).
  const { data: tenantApplicants, error: idsErr } = await db
    .from("applicants")
    .select("id, application_ref")
    .eq("tenant_id", ROUTELY_OPS_TENANT_ID);
  if (idsErr) {
    console.error("[driver-applicants events]", idsErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  const refById = new Map((tenantApplicants ?? []).map((a) => [a.id as string, a.application_ref as string]));
  const ids = [...refById.keys()];
  if (ids.length === 0) return NextResponse.json({ events: [] });

  let query = db
    .from("applicant_events")
    .select("id, applicant_id, event_type, actor, actor_type, reason, from_state, to_state, occurred_at, payload")
    .in("applicant_id", ids)
    .order("id", { ascending: false })
    .limit(pageSize);
  if (before && /^\d+$/.test(before)) query = query.lt("id", Number(before));

  const { data, error } = await query;
  if (error) {
    console.error("[driver-applicants events]", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  const events = (data ?? []).map((e) => ({
    ...e,
    application_ref: refById.get(e.applicant_id as string) ?? null,
  }));
  return NextResponse.json({ events, next_before: events.length === pageSize ? events[events.length - 1].id : null });
}
