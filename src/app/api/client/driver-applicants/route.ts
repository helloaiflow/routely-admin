import { type NextRequest, NextResponse } from "next/server";

import {
  BACKGROUND_CHECK_CONSENT_PURPOSES,
  REQUIRED_DOCUMENT_KINDS,
  requirementsMet,
  TOTAL_REQUIREMENTS,
} from "@/lib/driver-applicants";
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
 *
 * R28 (2026-10-22, admin QA): "complete"/"stuck" were both wrong — "complete" counted ANY
 * non-onboarding status (64 waitlisted/in_review applicants with ZERO documents counted as
 * "complete"); "stuck" counted waitlisted/decided applicants as stuck too. Both now use the SAME
 * real-requirements definition as A03's own checklist (see lib/driver-applicants.ts
 * requirementsMet()) and the real status, never one standing in for the other. Also adds a
 * `funnel_step` per row (see funnelStepOf below) for A01's real step funnel (point 6).
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
const STUCK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PAGE_SIZE = 100;

type ProfileRow = {
  legal_name: string | null;
  dob: string | null;
  email: string | null;
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
  applicant_documents: { kind: string; status: string }[] | null;
  applicant_consents: { purpose: string }[] | null;
  applicant_verifications: { kind: string; state: string }[] | null;
};

/* R28 point 6: a real step funnel — "cuenta → perfil → licencia+selfie → seguro → registro →
 * autorización → Under Review → Approved" — not the current-state status distribution A01 used to
 * show. Ordinal, furthest-reached: an applicant who's `in_review` has necessarily already passed
 * every earlier step (submit() itself requires it), so this never needs to re-derive the funnel
 * from scratch for post-submit applicants — only onboarding-stage rows need the per-field check. */
const FUNNEL_STEPS = [
  "account",
  "profile",
  "license_and_selfie",
  "insurance",
  "registration",
  "authorization",
  "under_review",
  "approved",
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

function funnelStepOf(
  status: string,
  profile: ProfileRow | undefined,
  docKindsOk: Set<string>,
  hasAuth: boolean,
): FunnelStep {
  if (status === "approved_applicant") return "approved";
  if (["in_review", "waitlisted", "rejected", "withdrawn"].includes(status)) return "under_review";
  if (hasAuth) return "authorization";
  if (docKindsOk.has("registration")) return "registration";
  if (docKindsOk.has("insurance")) return "insurance";
  if (docKindsOk.has("license_front") && docKindsOk.has("license_back") && docKindsOk.has("selfie"))
    return "license_and_selfie";
  const profileComplete = Boolean(
    profile?.legal_name && profile?.dob && profile?.email && profile?.phone && profile?.address && profile?.vehicle,
  );
  if (profileComplete) return "profile";
  return "account";
}

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
  const profileSelect = "legal_name, dob, email, phone, address, operating_zones, vehicle";
  const restEmbeds =
    "applicant_signals(flag_for_review), applicant_documents(kind, status), " +
    "applicant_consents(purpose), applicant_verifications(kind, state)";
  const select = needsInnerProfile
    ? `id, application_ref, status, current_step, next_action, acquisition_source, created_at, updated_at, applicant_profiles!inner(${profileSelect}), ${restEmbeds}`
    : `id, application_ref, status, current_step, next_action, acquisition_source, created_at, updated_at, applicant_profiles(${profileSelect}), ${restEmbeds}`;

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
    // R28 point 5: stuck = Onboarding ONLY (draft/in_progress) idle > 7 days. Waitlisted/decided
    // applicants are never "stuck" — they're waiting on a staff decision or already decided, not
    // abandoned mid-onboarding.
    query = query
      .lt("updated_at", new Date(Date.now() - STUCK_AFTER_MS).toISOString())
      .in("status", ["draft", "in_progress"]);
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
    const consents = r.applicant_consents ?? [];
    const verifications = r.applicant_verifications ?? [];
    const updatedAgeMs = now - new Date(r.updated_at).getTime();
    const bgState = verifications.find((v) => v.kind === "background")?.state ?? null;
    const bgStatus =
      bgState === "clear"
        ? "clear"
        : bgState === "needs_review"
          ? "consider"
          : bgState === "pending"
            ? "requested"
            : null;
    const met = requirementsMet({ documents: docs, consents, backgroundCheckStatus: bgStatus });
    const docKindsOk = new Set(
      REQUIRED_DOCUMENT_KINDS.filter((rd) =>
        docs.some((d) => d.kind === rd.kind && (d.status === "uploaded" || d.status === "verified")),
      ).map((rd) => rd.kind),
    );
    const hasAuth = consents.some((c) => (BACKGROUND_CHECK_CONSENT_PURPOSES as readonly string[]).includes(c.purpose));
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
      // R28 point 4: "complete" = every real requirement met (docs + authorization + clear
      // background check), never a stand-in for status. A waitlisted/in_review applicant with 0
      // documents is NOT complete.
      complete: met === TOTAL_REQUIREMENTS,
      requirements_met: met,
      requirements_total: TOTAL_REQUIREMENTS,
      flags: (r.applicant_signals ?? []).filter((s) => s.flag_for_review).length,
      docs_needs_review: docs.some((d) => d.status === "needs_review"),
      // R28 point 5: stuck = Onboarding only (see the SQL filter above for the same restriction).
      stuck: ["draft", "in_progress"].includes(r.status) && updatedAgeMs > STUCK_AFTER_MS,
      funnel_step: funnelStepOf(r.status, p, docKindsOk, hasAuth),
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });
  return NextResponse.json({
    applicants,
    total: count ?? applicants.length,
    page,
    pageSize,
    funnel_steps: FUNNEL_STEPS,
  });
}
