import { redirect } from "next/navigation";

/** Consolidated into the tabbed Settings experience. */
export default function PlansRedirect() {
  redirect("/dashboard/settings?tab=plans");
}
