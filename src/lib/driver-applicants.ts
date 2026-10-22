/* Shared constants for the Driver Applicants module (M1 onboarding, staff-only).
 * Single source of truth for the id/ref formats and the reason_code enums the
 * backend (routely-api /v1/onboarding/applications/{key}/*) requires verbatim —
 * duplicated here (not imported from routely-api, a separate repo) so the proxy
 * routes AND the UI dropdowns stay byte-for-byte in sync with each other. If the
 * backend's enum ever changes, update it here once. */

export const ROUTELY_OPS_TENANT_ID = 1;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REF_RE = /^RA-[2-9A-HJKMNP-TV-Z]{6}$/i;

export function isValidKey(key: string): boolean {
  return UUID_RE.test(key) || REF_RE.test(key);
}

export const WAITLIST_REASON_CODES = ["zone_not_open", "capacity_full", "vehicle_not_eligible", "other"] as const;
export type WaitlistReasonCode = (typeof WAITLIST_REASON_CODES)[number];

export const REJECT_REASON_CODES = [
  "docs_invalid",
  "identity_mismatch",
  "ineligible_age_license",
  "duplicate",
  "other",
] as const;
export type RejectReasonCode = (typeof REJECT_REASON_CODES)[number];

export const REQUEST_CHANGES_REASON_CODES = [
  "license_unreadable",
  "selfie_unclear",
  "insurance_name_mismatch",
  "insurance_expired",
  "registration_mismatch",
  "other",
] as const;
export type RequestChangesReasonCode = (typeof REQUEST_CHANGES_REASON_CODES)[number];

export const REASON_CODE_LABEL: Record<string, string> = {
  zone_not_open: "Zone not open",
  capacity_full: "Capacity full",
  vehicle_not_eligible: "Vehicle not eligible",
  docs_invalid: "Documents invalid",
  identity_mismatch: "Identity mismatch",
  ineligible_age_license: "Ineligible (age/license)",
  duplicate: "Duplicate application",
  license_unreadable: "License unreadable",
  selfie_unclear: "Selfie unclear",
  insurance_name_mismatch: "Insurance name mismatch",
  insurance_expired: "Insurance expired",
  registration_mismatch: "Registration mismatch",
  other: "Other",
};

export const BACKGROUND_CHECK_STATUSES = ["requested", "clear", "consider"] as const;
export type BackgroundCheckStatus = (typeof BACKGROUND_CHECK_STATUSES)[number];

export const BACKGROUND_CHECK_STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  requested: "Requested",
  clear: "Clear",
  consider: "Consider",
};

/* R28 (2026-10-22, admin QA): approve()'s own background-check-authorization gate recognizes
 * EITHER purpose string for the same real-world consent — 'background_check' (legacy/pre-v2) or
 * 'background_check_authorization' (routely-driver app's migration 0062) — see routely-api's
 * services/onboarding.py BACKGROUND_CHECK_CONSENT_PURPOSES. Mirrored here so the admin's own
 * Approve-readiness gate never disagrees with the backend's real gate. */
export const BACKGROUND_CHECK_CONSENT_PURPOSES = ["background_check", "background_check_authorization"] as const;

/* Every REAL consent purpose string this app's 3 producers (legacy web funnel, M2/M3 funnels,
 * routely-driver app) have ever written to applicant_consents, with a readable label — found by
 * reading routely-api's own CONSENT_VERSIONS/REQUIRED_CONSENTS_* dicts, routely-driver's own
 * migration 0062, and real production rows (RA-365MNN, 2026-10-22 QA). A3's consents section
 * renders every row actually present for an applicant (never a fixed subset that silently hides
 * unknown-but-real purposes) — this map only supplies the label; an unmapped purpose still shows
 * (humanized from its own string), it just won't have a nice label. */
export const CONSENT_PURPOSE_LABEL: Record<string, string> = {
  terms_of_service: "Terms of service",
  privacy_policy: "Privacy policy",
  background_check: "Background check authorization (legacy)",
  background_check_authorization: "Background check authorization (FCRA)",
  sms_communications: "SMS communications",
  welcome_data_use: "Data use",
  waitlist_no_guarantee: "Waitlist — no guarantee",
  tcpa_sms_voice: "SMS/voice (TCPA)",
  marketing_sms: "Marketing SMS (optional)",
  fcra_disclosure: "FCRA disclosure",
  terms_privacy_18plus: "Terms, privacy & 18+",
  age_18_confirmed: "18+ confirmed",
  applicant_terms_accepted: "Terms accepted",
  applicant_privacy_notice_received: "Privacy notice received",
  document_collection_license: "Document collection — license",
  document_collection_insurance: "Document collection — insurance",
  document_collection_registration: "Document collection — registration",
};

export function consentPurposeLabel(purpose: string): string {
  return (
    CONSENT_PURPOSE_LABEL[purpose] ??
    purpose
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

/* R28 point 2: the full document checklist per the real contract — license front/back, selfie,
 * insurance, registration. Was missing insurance/registration entirely. */
export const REQUIRED_DOCUMENT_KINDS: { kind: string; label: string }[] = [
  { kind: "license_front", label: "License (front)" },
  { kind: "license_back", label: "License (back)" },
  { kind: "selfie", label: "Selfie" },
  { kind: "insurance", label: "Insurance" },
  { kind: "registration", label: "Registration" },
];

/* R28 point 7: Onboarding / Under Review / Approved / Waitlisted / Rejected — the 5-bucket display
 * contract, with the SAME colors as routely-driver's own RoutelyStatusColors (lib/theme/colors.dart,
 * "V146 v2", build 31) so a status never means something visually different in the admin than it
 * does in the app the applicant themselves sees. */
export type StatusBucket = "onboarding" | "under_review" | "approved" | "waitlisted" | "rejected";

export const STATUS_BUCKET: Record<string, StatusBucket> = {
  draft: "onboarding",
  in_progress: "onboarding",
  submitted: "onboarding",
  in_review: "under_review",
  approved_applicant: "approved",
  waitlisted: "waitlisted",
  rejected: "rejected",
  withdrawn: "rejected",
};

export const STATUS_BUCKET_LABEL: Record<StatusBucket, string> = {
  onboarding: "Onboarding",
  under_review: "Under Review",
  approved: "Approved",
  waitlisted: "Waitlisted",
  rejected: "Rejected",
};

/* Values match routely-driver's lib/theme/colors.dart RoutelyStatusColors exactly. Brand blue uses
 * this app's own --primary token (globals.css's own brand-blue var, roundtrip-verified against the
 * app's palette), never a hardcoded hex, per the design-token gate
 * (routely-os/DESIGN_TOKENS_CRITERION.md). The other 3 tones (amber/mint/red) aren't yet their own
 * semantic tokens here — closest literal match to the app's palette, flagged for a future token
 * addition rather than blocked on one now. */
export const STATUS_BUCKET_COLORS: Record<StatusBucket, { bg: string; fg: string; dot: string }> = {
  onboarding: { bg: "var(--primary)", fg: "#FFFFFF", dot: "#FFFFFF" }, // "Action needed" — solid fill, the one filled tone
  under_review: { bg: "#FFF5E0", fg: "#A15F00", dot: "#F59E0B" },
  waitlisted: { bg: "#EAF2FF", fg: "var(--primary)", dot: "var(--primary)" },
  approved: { bg: "#E1FFF3", fg: "#0B8562", dot: "#2BD9A0" },
  rejected: { bg: "rgba(229,72,77,0.10)", fg: "#E5484D", dot: "#E5484D" },
};

export function statusBucketOf(status: string): StatusBucket {
  return STATUS_BUCKET[status] ?? "onboarding";
}

/* R28 points 2/4/8: ONE shared definition of "requirements met" — the Approve-readiness checklist
 * (A03), the "Complete" KPI (A01), and the Requirements x/7 column (A02) must never compute this 3
 * different ways. 7 = the 5 document kinds + the background-check-authorization consent + a
 * 'clear' background-check result. */
export const TOTAL_REQUIREMENTS = REQUIRED_DOCUMENT_KINDS.length + 2;

export function requirementsMet(args: {
  documents: { kind: string; status: string }[];
  consents: { purpose: string }[];
  backgroundCheckStatus: string | null | undefined; // 'clear' | 'consider' | 'requested' | null
}): number {
  const docOk = (kind: string) =>
    args.documents.some((d) => d.kind === kind && (d.status === "uploaded" || d.status === "verified"));
  const docsComplete = REQUIRED_DOCUMENT_KINDS.filter((rd) => docOk(rd.kind)).length;
  const authOk = args.consents.some((c) =>
    (BACKGROUND_CHECK_CONSENT_PURPOSES as readonly string[]).includes(c.purpose),
  );
  const bgOk = args.backgroundCheckStatus === "clear";
  return docsComplete + (authOk ? 1 : 0) + (bgOk ? 1 : 0);
}
