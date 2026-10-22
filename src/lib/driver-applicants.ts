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
