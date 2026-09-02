// Internal Packages module — the WHITELISTED shape the module's API returns.
// Deliberately contains no medical fields (CEO, 2026-09-01).
export interface InternalPackage {
  id: string;
  stop_id: string | null;
  status: string;
  delivery_succeeded: boolean | null;
  recipient_name: string;
  recipient_phone: string | null;
  recipient_email: string | null;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  pickup_name: string | null;
  pickup_address: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  pickup_zip: string | null;
  package_type: string;
  notes: string | null;
  delivery_date: string | null;
  eta_at: string | null;
  driver_name: string | null;
  tracking_link: string | null;
  created_at: string;
  created_by_user: string | null;
}

export interface InternalPackagesResponse {
  visibility: "all" | "own";
  caller_user_id: string;
  packages: InternalPackage[];
  generated_at: string;
}

export type Direction = "outgoing" | "incoming";

export function directionOf(p: InternalPackage, callerUserId: string, callerEmail?: string | null): Direction {
  if (p.created_by_user === callerUserId) return "outgoing";
  if (callerEmail && (p.recipient_email ?? "").toLowerCase() === callerEmail.toLowerCase()) return "incoming";
  // For all-visibility viewers (owners/admins) anything not created by them
  // still reads as outgoing FROM its office — group by creator instead.
  return "outgoing";
}
