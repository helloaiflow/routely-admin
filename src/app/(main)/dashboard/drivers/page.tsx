import { DriversTab } from "../fleet/_components/drivers-tab";

/** Fleet · Drivers — the people who run Routely deliveries. Admin-only (ops surface). */
export default function DriversPage() {
  return (
    <div className="@container/main w-full space-y-5 px-4 py-4 sm:px-6">
      <DriversTab />
    </div>
  );
}
