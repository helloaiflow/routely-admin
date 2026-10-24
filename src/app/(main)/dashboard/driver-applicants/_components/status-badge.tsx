import { derivedStatusBucketOf, STATUS_BUCKET_COLORS, STATUS_BUCKET_LABEL } from "@/lib/driver-applicants";

/* R28 point 7: the 5-bucket Onboarding/Under Review/Approved/Waitlisted/Rejected contract, colored
 * to match routely-driver's own RoutelyStatusColors (V146 v2) exactly — the admin used to show the
 * raw status in a generic shadcn Badge variant (gray "In progress", etc.), which had no relation to
 * what the applicant's own app shows for the same state.
 *
 * R34 A6: `waitlistedByStaff` is the server's `waitlisted_by_staff` signal. Pass it whenever it is
 * available — without it a lite-funnel applicant (auto-waitlisted on a bare web submission, no
 * documents yet) would wrongly read "Waitlisted" instead of "Onboarding". */
export function StatusBadge({ status, waitlistedByStaff }: { status: string; waitlistedByStaff?: boolean | null }) {
  const bucket = derivedStatusBucketOf(status, waitlistedByStaff);
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
