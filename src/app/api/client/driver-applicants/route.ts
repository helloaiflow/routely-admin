import { type NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext } from "@/lib/tenant";

/* ── /api/client/driver-applicants ────────────────────────────────────────────
 * M1 · Driver onboarding. Lists applicants (public.applicants) for Routely OPS
 * (tenant 1). READS straight from Supabase (service key, admin-only); every state
 * change goes through FastAPI /v1/onboarding/* (see [key]/approve). Search is by
 * application_ref prefix (RA-XXXXXX, case-insensitive) — a locator, not a credential.
 * ─────────────────────────────────────────────────────────────────────────── */

const ROUTELY_OPS_TENANT_ID = 1;
const STATUSES = ["draft", "in_progress", "submitted", "in_review", "approved_applicant", "rejected", "withdrawn"];

type Row = {
  id: string;
  application_ref: string;
  status: string;
  current_step: string;
  next_action: string;
  acquisition_source: string;
  created_at: string;
  updated_at: string;
  applicant_profiles: { legal_name: string | null; address: { city?: string; state?: string } | null }[] | null;
  applicant_signals: { flag_for_review: boolean }[] | null;
};

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  // Only [A-Z0-9-] survives, so the value is safe inside an ilike pattern.
  const ref = (sp.get("q") ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "");

  let query = getSupabaseAdmin()
    .from("applicants")
    .select(
      "id, application_ref, status, current_step, next_action, acquisition_source, created_at, updated_at, applicant_profiles(legal_name, address), applicant_signals(flag_for_review)",
    )
    .eq("tenant_id", ROUTELY_OPS_TENANT_ID)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && STATUSES.includes(status)) query = query.eq("status", status);
  if (ref.startsWith("RA-") || (ref.length >= 2 && "RA-".startsWith(ref.slice(0, 3)))) {
    query = query.ilike("application_ref", `${ref}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[driver-applicants GET]", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  const applicants = ((data ?? []) as unknown as Row[]).map((r) => {
    const p = r.applicant_profiles?.[0];
    return {
      id: r.id,
      application_ref: r.application_ref,
      status: r.status,
      current_step: r.current_step,
      next_action: r.next_action,
      acquisition_source: r.acquisition_source,
      name: p?.legal_name ?? null,
      zone: [p?.address?.city, p?.address?.state].filter(Boolean).join(", ") || null,
      flags: (r.applicant_signals ?? []).filter((s) => s.flag_for_review).length,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });
  return NextResponse.json({ applicants });
}
