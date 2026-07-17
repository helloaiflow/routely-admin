export type PlanKey = "trial" | "free" | "starter" | "professional" | "enterprise";

export type Plan = {
  key: PlanKey;
  name: string;
  tagline: string;
  price_per_stop: number;
  price_per_mile: number;
  features: string[];
  recommended?: boolean;
};

export const PLANS: Record<PlanKey, Plan> = {
  trial: {
    key: "trial",
    name: "Free Trial",
    tagline: "14 days on us \u2014 up to 50 packages.",
    price_per_stop: 0,
    price_per_mile: 0,
    features: ["14-day free trial", "Up to 50 packages total", "Basic routing", "Email support"],
  },
  free: {
    key: "free",
    name: "Free Trial",
    tagline: "14 days on us \u2014 up to 50 packages.",
    price_per_stop: 0,
    price_per_mile: 0,
    features: ["14-day free trial", "Up to 50 packages total", "Basic routing", "Email support"],
  },
  starter: {
    key: "starter",
    name: "Starter",
    tagline: "Pay as you grow \u2014 perfect for small teams.",
    price_per_stop: 16.0,
    price_per_mile: 1.65,
    features: ["$16 per stop", "$1.65 per mile", "Route optimization", "Real-time tracking", "Email support"],
  },
  professional: {
    key: "professional",
    name: "Professional",
    tagline: "AI agent + web orders for growing operations.",
    price_per_stop: 14.0,
    price_per_mile: 1.5,
    features: [
      "$14 per stop",
      "$1.50 per mile",
      "AI voice agent (Sofia)",
      "Web order form",
      "Priority support",
      "Custom route zones",
    ],
    recommended: true,
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    tagline: "Full API access + dedicated success manager.",
    price_per_stop: 12.0,
    price_per_mile: 1.35,
    features: [
      "$12 per stop",
      "$1.35 per mile",
      "Everything in Professional",
      "API access",
      "Custom integrations",
      "Dedicated account manager",
      "SLA guarantees",
    ],
  },
};

export const PLAN_KEYS: PlanKey[] = ["trial", "starter", "professional", "enterprise"];

export function getPlan(key: string): Plan {
  return PLANS[key as PlanKey] ?? PLANS.trial;
}
