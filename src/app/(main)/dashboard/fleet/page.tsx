import { redirect } from "next/navigation";

/** Fleet was split into dedicated Hubs and Drivers pages. Keep this route as a
 *  backward-compatible redirect for old bookmarks / deep links. */
export default function FleetPage() {
  redirect("/dashboard/hubs");
}
