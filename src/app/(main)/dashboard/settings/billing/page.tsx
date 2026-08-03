import { redirect } from "next/navigation";

/** Billing moved again — out of Settings entirely (2026-08 billing v3). */
export default function BillingRedirect() {
  redirect("/dashboard/billing");
}
