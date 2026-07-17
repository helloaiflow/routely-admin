import { redirect } from "next/navigation";

/** Consolidated into the tabbed Settings experience (Account tab). */
export default function ProfileRedirect() {
  redirect("/dashboard/settings?tab=account");
}
