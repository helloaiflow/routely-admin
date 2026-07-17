import { redirect } from "next/navigation";

/** Consolidated into the tabbed Settings experience. */
export default function BillingRedirect() {
  redirect("/dashboard/settings?tab=billing");
}
