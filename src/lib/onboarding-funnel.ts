/** M25: the company-signup funnel shown in Tenants. Same step ids as app.routelypro.com/src/lib/onboarding/steps.ts. */
export const SETUP_STEPS = ["profile", "company", "baa", "hub", "deliver", "plan", "payment", "team"] as const;

export const STEP_LABEL: Record<string, string> = {
  profile: "Profile",
  company: "Company",
  baa: "HIPAA agreement",
  hub: "First hub",
  deliver: "Who delivers",
  plan: "Plan",
  payment: "Payment",
  team: "Team",
  done: "Done",
};

export const EVENT_LABEL: Record<string, string> = {
  signup: "Signed up",
  verify: "Verified email",
  step_start: "Started",
  step_done: "Finished",
  done: "Finished setup",
  first_stop: "First stop",
};

export type FunnelRow = {
  tenant_id: number;
  name: string;
  status: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  device: string | null;
  region: string | null;
  signup_at: string | null;
  verified_at: string | null;
  done_at: string | null;
  first_stop_at: string | null;
  last_step: string | null;
  /** Signup → done in minutes; null while setup is unfinished. */
  total_minutes: number | null;
};

export type OnboardingEvent = { event: string; step: string | null; at: string; source: string };

/** "2 h 05 min", "3 d 4 h", "12 min". */
export function formatMinutes(minutes: number | null) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))} min`;
  if (minutes < 24 * 60)
    return `${Math.floor(minutes / 60)} h ${String(Math.round(minutes % 60)).padStart(2, "0")} min`;
  return `${Math.floor(minutes / 1440)} d ${Math.floor((minutes % 1440) / 60)} h`;
}
