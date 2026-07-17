import { redirect } from "next/navigation";

/** Consolidated into the tabbed Settings experience. */
export default function PhonesRedirect() {
  redirect("/dashboard/settings");
}
