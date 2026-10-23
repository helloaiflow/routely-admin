/* Shared types for the Driver Applicants module (A01 Overview, A02 Applications,
 * A03 Detail, A04 Activity). Mirrors the JSON shapes the proxy routes under
 * /api/client/driver-applicants return — see their route.ts files for the
 * authoritative server-side shape; keep these in sync by hand. */

export type ApplicantStatus =
  | "draft"
  | "in_progress"
  | "submitted"
  | "in_review"
  | "approved_applicant"
  | "waitlisted"
  | "rejected"
  | "withdrawn";

export type SourceCategory = "app" | "web";

export type ApplicantRow = {
  id: string;
  application_ref: string;
  status: ApplicantStatus;
  current_step: string;
  next_action: string;
  acquisition_source: string;
  source_category: SourceCategory;
  name: string | null;
  zone: string | null;
  operating_zones: string[];
  vehicle_type: string | null;
  complete: boolean;
  requirements_met: number;
  requirements_total: number;
  flags: number;
  docs_needs_review: boolean;
  stuck: boolean;
  funnel_step: string;
  created_at: string;
  updated_at: string;
};

export type ApplicantsListResponse = {
  applicants: ApplicantRow[];
  total: number;
  page: number;
  pageSize: number;
  funnel_steps: readonly string[];
  bucket_counts: Record<"onboarding" | "under_review" | "approved" | "waitlisted" | "rejected", number>;
};

export type BackgroundCheck = {
  status: "requested" | "clear" | "consider";
  date: string | null;
  external_reference: string | null;
  actor: string | null;
  created_at: string;
} | null;

export type ApplicantDetail = {
  applicant: Omit<
    ApplicantRow,
    | "name"
    | "zone"
    | "operating_zones"
    | "vehicle_type"
    | "complete"
    | "flags"
    | "docs_needs_review"
    | "stuck"
    | "source_category"
  >;
  profile: {
    legal_name: string | null;
    dob: string | null;
    phone: string | null; // already masked server-side — never the full number
    email: string | null;
    address: { line1?: string; city?: string; state?: string; zip?: string } | null;
    languages: string[] | null;
    vehicle: { type?: string; make?: string; model?: string; year?: string | number } | null;
    operating_zones: string[] | null;
    eligibility: Record<string, unknown> | null;
  } | null;
  documents: {
    id: string;
    kind: string;
    status: string;
    masked_number: string | null;
    content_type: string | null;
    size_bytes: number | null;
    created_at: string;
  }[];
  consents: { purpose: string; version: string; accepted_at: string }[];
  signals: {
    dimension: string;
    state: string;
    confidence: number | null;
    flag_for_review: boolean;
    provenance: Record<string, unknown>;
  }[];
  verifications: { kind: string; state: string; source: string }[];
  events: AuditEvent[];
  background_check: BackgroundCheck;
};

export type AuditEvent = {
  id: number;
  event_type: string;
  actor: string;
  actor_type: string;
  reason: string | null;
  from_state: string | null;
  to_state: string | null;
  occurred_at: string;
};

export type GlobalEvent = AuditEvent & { applicant_id: string; application_ref: string | null };

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_progress: "In progress",
  submitted: "Submitted",
  in_review: "Under Review",
  approved_applicant: "Approved",
  waitlisted: "Waitlisted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function statusVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "approved_applicant") return "default";
  if (s === "in_review") return "secondary";
  if (s === "rejected" || s === "withdrawn") return "destructive";
  if (s === "waitlisted") return "outline";
  return "outline";
}

export const fmt = (iso: string) => new Date(iso).toLocaleString();
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();
