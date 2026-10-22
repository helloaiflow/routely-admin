import { STATUS_BUCKET_COLORS, STATUS_BUCKET_LABEL, statusBucketOf } from "@/lib/driver-applicants";

/* R28 point 7: the 5-bucket Onboarding/Under Review/Approved/Waitlisted/Rejected contract, colored
 * to match routely-driver's own RoutelyStatusColors (V146 v2) exactly — the admin used to show the
 * raw status in a generic shadcn Badge variant (gray "In progress", etc.), which had no relation to
 * what the applicant's own app shows for the same state. */
export function StatusBadge({ status }: { status: string }) {
  const bucket = statusBucketOf(status);
  const c = STATUS_BUCKET_COLORS[bucket];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium text-xs"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
      {STATUS_BUCKET_LABEL[bucket]}
    </span>
  );
}
