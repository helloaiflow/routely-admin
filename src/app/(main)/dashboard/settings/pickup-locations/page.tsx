import { redirect } from "next/navigation";

/** Consolidated into the tabbed Settings experience (Pickup Locations tab). */
export default function PickupLocationsRedirect() {
  redirect("/dashboard/settings?tab=pickup");
}
