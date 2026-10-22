import { type NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext } from "@/lib/tenant";

/* GET /api/client/driver-applicants/[key] — staff detail of one applicant, by
 * application_ref (RA-XXXXXX, any case) or internal id. Reads Supabase directly:
 * profile, documents (metadata + masked license only — never storage keys), consents,
 * screening signals WITH provenance, verifications and the audit timeline.
 * Admin-only. `applicant_ref` (the applicant's RLS identity) is never returned. */

const ROUTELY_OPS_TENANT_ID = 1;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_RE = /^RA-[2-9A-HJKMNP-TV-Z]{6}$/i;

/** Phone is stored unmasked in applicant_profiles (SMS OTP needs the real
 *  number) — the DB never masks it, so THIS proxy must: the full number must
 *  never leave the server. Keeps only the last 2 digits. */
function maskPhone(phone: string | null): string | null {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "•".repeat(phone.length);
  return `(•••) •••-••${digits.slice(-2)}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { key } = await params;
  const byId = UUID_RE.test(key);
  if (!byId && !REF_RE.test(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = getSupabaseAdmin();
  const { data: applicant, error } = await db
    .from("applicants")
    .select("id, application_ref, status, current_step, next_action, acquisition_source, created_at, updated_at")
    .eq("tenant_id", ROUTELY_OPS_TENANT_ID)
    .eq(byId ? "id" : "application_ref", byId ? key : key.toUpperCase())
    .maybeSingle();
  if (error) {
    console.error("[driver-applicants detail]", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!applicant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const id = applicant.id as string;
  const [profile, documents, consents, signals, verifications, events, backgroundCheck] = await Promise.all([
    db
      .from("applicant_profiles")
      .select("legal_name, dob, phone, email, address, languages, vehicle, operating_zones, eligibility")
      .eq("applicant_id", id)
      .maybeSingle(),
    db
      .from("applicant_documents")
      .select("id, kind, status, masked_number, content_type, size_bytes, created_at")
      .eq("applicant_id", id)
      .order("created_at"),
    db.from("applicant_consents").select("purpose, version, accepted_at").eq("applicant_id", id).order("accepted_at"),
    db
      .from("applicant_signals")
      .select("dimension, state, confidence, flag_for_review, provenance, created_at")
      .eq("applicant_id", id)
      .order("created_at"),
    db.from("applicant_verifications").select("kind, state, source, updated_at").eq("applicant_id", id).order("kind"),
    db
      .from("applicant_events")
      .select("id, event_type, actor, actor_type, reason, from_state, to_state, occurred_at")
      .eq("applicant_id", id)
      .order("id"),
    // Background-check tracking (mission 2026-10-22): a brand-new table the
    // backend agent's parallel work is adding alongside the /background-check
    // endpoint — it does not exist in this Supabase project as of this
    // investigation. Read best-effort: an "undefined table" error (42P01) just
    // means no backend-tracking data exists yet, same as "no rows" — the UI
    // shows "Not started" either way. Any OTHER error still fails the request.
    db
      .from("applicant_background_checks")
      .select("status, date, external_reference, actor, created_at")
      .eq("applicant_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const failed = [profile, documents, consents, signals, verifications, events].find((r) => r.error);
  if (failed?.error) {
    console.error("[driver-applicants detail]", failed.error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (backgroundCheck.error && backgroundCheck.error.code !== "42P01") {
    console.error("[driver-applicants detail] background_check", backgroundCheck.error);
  }
  const maskedProfile = profile.data ? { ...profile.data, phone: maskPhone(profile.data.phone) } : null;
  return NextResponse.json({
    applicant,
    profile: maskedProfile,
    documents: documents.data ?? [],
    consents: consents.data ?? [],
    signals: signals.data ?? [],
    verifications: verifications.data ?? [],
    events: events.data ?? [],
    background_check: backgroundCheck.error ? null : backgroundCheck.data,
  });
}
