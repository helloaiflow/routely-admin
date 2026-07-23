import { redirect } from "next/navigation";

/** Backward-compatible entry point for bookmarked Fleet links. */
export default async function FleetPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(tab === "drivers" ? "/dashboard/drivers" : "/dashboard/hubs");
}
