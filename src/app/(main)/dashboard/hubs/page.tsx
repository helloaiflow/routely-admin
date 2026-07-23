import { HubsTab } from "../fleet/_components/hubs-tab";

/** Fleet · Hubs — Routely's dispatch origins (depots). Admin-only (ops surface). */
export default function HubsPage() {
  return (
    <div className="@container/main w-full space-y-5 px-4 py-4 sm:px-6">
      <HubsTab />
    </div>
  );
}
