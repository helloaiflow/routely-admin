import { type NextRequest, NextResponse } from "next/server";

import { waitlistedByStaff } from "@/lib/driver-applicants";
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

/** routely-api's record_background_check() upserts into applicant_verifications
 *  (kind='background', state one of pending|clear|needs_review, details JSONB
 *  {date, by, external_reference}) — there is no separate background-check
 *  table. Maps that row onto the UI's 4-state vocabulary. */
function backgroundCheckFromVerification(
  v: { kind: string; state: string; details: Record<string, unknown> | null; updated_at: string } | undefined,
): {
  status: "requested" | "clear" | "consider";
  date: string | null;
  external_reference: string | null;
  actor: string | null;
  created_at: string;
} | null {
  if (!v) return null;
  const status =
    v.state === "clear"
      ? "clear"
      : v.state === "needs_review"
        ? "consider"
        : v.state === "pending"
          ? "requested"
          : null;
  if (!status) return null;
  const details = v.details ?? {};
  return {
    status,
    date: typeof details.date === "string" ? details.date : null,
    external_reference: typeof details.external_reference === "string" ? details.external_reference : null,
    actor: typeof details.by === "string" ? details.by : null,
    created_at: v.updated_at,
  };
}

/** Phone is stored unmasked in applicant_profiles/driver_accounts (SMS OTP needs the real
 *  number) — the DB never masks it, so THIS proxy must: the full number must never leave
 *  the server. R28 point 3: mask format is area code + last 4 visible, exchange masked
 *  (`(305) ••• 4821`) — enough for staff to recognize/confirm a number without exposing it whole. */
function maskPhone(phone: string | null): string | null {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "•".repeat(phone.length);
  const last10 = digits.slice(-10);
  const area = last10.slice(0, 3);
  const last4 = last10.slice(-4);
  return `(${area}) ••• ${last4}`;
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
  const [profile, documents, consents, signals, verifications, events, driverAccount] = await Promise.all([
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
    db
      .from("applicant_verifications")
      .select("kind, state, source, details, updated_at")
      .eq("applicant_id", id)
      .order("kind"),
    db
      .from("applicant_events")
      .select("id, event_type, actor, actor_type, reason, from_state, to_state, occurred_at")
      .eq("applicant_id", id)
      .order("id"),
    // R28 point 3: phone fallback — applicant_profiles.phone is only ever set once the applicant
    // reaches that profile step; driver_accounts.phone_e164 (set as soon as a driver_accounts row
    // exists, e.g. via the app's own sign-up) is a real, earlier-available source for the SAME
    // person's phone number. Read-only — never written here.
    db.from("driver_accounts").select("phone_e164").eq("applicant_id", id).maybeSingle(),
  ]);
  const failed = [profile, documents, consents, signals, verifications, events].find((r) => r.error);
  if (failed?.error) {
    console.error("[driver-applicants detail]", failed.error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (driverAccount.error) console.error("[driver-applicants detail] driver_accounts", driverAccount.error);
  const rawPhone = profile.data?.phone || driverAccount.data?.phone_e164 || null;
  const maskedProfile = profile.data ? { ...profile.data, phone: maskPhone(rawPhone) } : null;
  const backgroundVerification = (verifications.data ?? []).find((v) => v.kind === "background");
  /* R34 A6: the staff-vs-automatic waitlist split, derived READ-ONLY from the audit timeline this
   * route already loads (no extra query, nothing written). Same discriminator as the list route and
   * as Postgres's app_driver_status_v2() — see lib/driver-applicants.ts. null for any other status,
   * matching v2's own column. */
  const waitlistedByStaffFlag = applicant.status === "waitlisted" ? waitlistedByStaff(events.data ?? []) : null;
  return NextResponse.json({
    applicant: { ...applicant, waitlisted_by_staff: waitlistedByStaffFlag },
    profile: maskedProfile,
    documents: documents.data ?? [],
    consents: consents.data ?? [],
    signals: signals.data ?? [],
    verifications: (verifications.data ?? []).map(({ kind, state, source }) => ({ kind, state, source })),
    events: events.data ?? [],
    background_check: backgroundCheckFromVerification(backgroundVerification),
  });
}
