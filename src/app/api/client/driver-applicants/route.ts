import { type NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext } from "@/lib/tenant";

/* ── /api/client/driver-applicants ────────────────────────────────────────────
 * M1 · Driver onboarding. Lists applicants (public.applicants) for Routely OPS
 * (tenant 1). READS straight from Supabase (service key, admin-only); every state
 * change goes through FastAPI /v1/onboarding/* (see [key]/approve and friends).
 *
 * A02 evolution (2026-10-22): real server-side pagination + filters, extended
 * fields for the Overview (A01) KPIs and the Applications grid (completeness,
 * zone/operating_zones, vehicle, a "stuck" flag, documents needing review).
 * Search matches application_ref (locator) prefix, legal name and phone.
 * ─────────────────────────────────────────────────────────────────────────── */

const ROUTELY_OPS_TENANT_ID = 1;
const STATUSES = [
  "draft",
  "in_progress",
  "submitted",
  "in_review",
  "approved_applicant",
  "waitlisted",
  "rejected",
  "withdrawn",
];
const TERMINAL_STATUSES = new Set(["approved_applicant", "rejected", "withdrawn"]);
const STUCK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PAGE_SIZE = 100;

type ProfileRow = {
  legal_name: string | null;
  phone: string | null;
  address: { city?: string; state?: string } | null;
  operating_zones: string[] | null;
  vehicle: { type?: string } | null;
};

type Row = {
  id: string;
  application_ref: string;
  status: string;
  current_step: string;
  next_action: string;
  acquisition_source: string;
  created_at: string;
  updated_at: string;
  applicant_profiles: ProfileRow[] | null;
  applicant_signals: { flag_for_review: boolean }[] | null;
  applicant_documents: { status: string }[] | null;
};

/** Heuristic only (2026-10-22): acquisition_source is a free-text slug
 *  (`^[a-z0-9_:.-]{2,64}$`), not an enum with a stable "app"/"web" value. Until
 *  there's a confirmed canonical list, we bucket by substring match so the
 *  source filter/KPI at least degrades gracefully instead of hard-coding
 *  values that may not match what the funnel actually writes. */
function sourceCategory(acquisitionSource: string): "app" | "web" {
  return acquisitionSource.toLowerCase().includes("app") ? "app" : "web";
}

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const source = sp.get("source"); // "app" | "web"
  const completeness = sp.get("completeness"); // "complete" | "incomplete"
  const stuck = sp.get("stuck") === "true";
  const zone = (sp.get("zone") ?? "").trim();
  const vehicle = (sp.get("vehicle") ?? "").trim();
  const from = sp.get("from"); // ISO date, inclusive
  const to = sp.get("to"); // ISO date, inclusive
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(sp.get("pageSize") ?? "25", 10) || 25));

  // Free-text search: application_ref prefix (RA-XXXXXX) OR legal name OR phone.
  // Only [A-Z0-9-] survives into the ref pattern, so it's safe inside an ilike.
  const qRaw = (sp.get("q") ?? "").trim();
  const ref = qRaw.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const digits = qRaw.replace(/[^0-9]/g, "");

  // zone/vehicle/name-or-phone search all live on the embedded applicant_profiles
  // row, so PostgREST needs that embed marked !inner to filter on it.
  const needsInnerProfile = Boolean(zone || vehicle || qRaw);
  const profileSelect = "legal_name, phone, address, operating_zones, vehicle";
  const select = needsInnerProfile
    ? `id, application_ref, status, current_step, next_action, acquisition_source, created_at, updated_at, applicant_profiles!inner(${profileSelect}), applicant_signals(flag_for_review), applicant_documents(status)`
    : `id, application_ref, status, current_step, next_action, acquisition_source, created_at, updated_at, applicant_profiles(${profileSelect}), applicant_signals(flag_for_review), applicant_documents(status)`;

  let query = getSupabaseAdmin()
    .from("applicants")
    .select(select, { count: "exact" })
    .eq("tenant_id", ROUTELY_OPS_TENANT_ID)
    .order("created_at", { ascending: false });

  if (status && STATUSES.includes(status)) query = query.eq("status", status);
  if (completeness === "complete") query = query.not("status", "in", "(draft,in_progress)");
  if (completeness === "incomplete") query = query.in("status", ["draft", "in_progress"]);
  if (source === "app") query = query.ilike("acquisition_source", "%app%");
  if (source === "web") query = query.not("acquisition_source", "ilike", "%app%");
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  if (stuck) {
    query = query
      .lt("updated_at", new Date(Date.now() - STUCK_AFTER_MS).toISOString())
      .in("status", ["draft", "in_progress", "submitted", "in_review", "waitlisted"]);
  }
  if (zone) query = query.contains("applicant_profiles.operating_zones", [zone]);
  if (vehicle) query = query.ilike("applicant_profiles.vehicle->>type", `%${vehicle}%`);
  if (qRaw) {
    const ors = [
      `application_ref.ilike.${ref || qRaw.toUpperCase()}%`,
      `applicant_profiles.legal_name.ilike.%${qRaw}%`,
    ];
    if (digits.length >= 3) ors.push(`applicant_profiles.phone.ilike.%${digits}%`);
    query = query.or(ors.join(","));
  }

  const start = (page - 1) * pageSize;
  query = query.range(start, start + pageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error("[driver-applicants GET]", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  const now = Date.now();
  const applicants = ((data ?? []) as unknown as Row[]).map((r) => {
    const p = r.applicant_profiles?.[0];
    const docs = r.applicant_documents ?? [];
    const updatedAgeMs = now - new Date(r.updated_at).getTime();
    return {
      id: r.id,
      application_ref: r.application_ref,
      status: r.status,
      current_step: r.current_step,
      next_action: r.next_action,
      acquisition_source: r.acquisition_source,
      source_category: sourceCategory(r.acquisition_source),
      name: p?.legal_name ?? null,
      zone: p?.operating_zones?.[0] || [p?.address?.city, p?.address?.state].filter(Boolean).join(", ") || null,
      operating_zones: p?.operating_zones ?? [],
      vehicle_type: p?.vehicle?.type ?? null,
      complete: !["draft", "in_progress"].includes(r.status),
      flags: (r.applicant_signals ?? []).filter((s) => s.flag_for_review).length,
      docs_needs_review: docs.some((d) => d.status === "needs_review"),
      stuck: !TERMINAL_STATUSES.has(r.status) && updatedAgeMs > STUCK_AFTER_MS,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });
  return NextResponse.json({ applicants, total: count ?? applicants.length, page, pageSize });
}
