/* Canonical published-tier rates (D30, CEO-locked 2026-08-19). Read ONLY by
 * POST /api/client/billing/plan when a tenant selects one of the three
 * published tiers — never by anything in the charging path (D31: billing_rates
 * is the only thing that bills; no tier lookup in any charging path). This is
 * the single source those three numbers come from instead of the 6+ places
 * that used to each hardcode their own copy (marketing site, onboarding,
 * settings displays, routely-api's informational PLAN_PRICES fallback). */

export type PublishedTier = "starter" | "professional" | "enterprise";

export const PUBLISHED_TIER_RATES: Record<
  PublishedTier,
  {
    package: number;
    per_mile: number;
    on_demand_per_mile: number;
    on_demand_split: { driver: number; routely: number };
  }
> = {
  starter: { package: 1600, per_mile: 150, on_demand_per_mile: 550, on_demand_split: { driver: 70, routely: 30 } },
  professional: { package: 1400, per_mile: 150, on_demand_per_mile: 550, on_demand_split: { driver: 70, routely: 30 } },
  enterprise: { package: 1200, per_mile: 150, on_demand_per_mile: 550, on_demand_split: { driver: 70, routely: 30 } },
};

// Standard billing_rules a published tier gets — the same defaults new
// signups are seeded with. Custom is the only plan allowed a bespoke rule
// set; picking a real tier resets back to this rather than leaving a
// negotiated rule silently attached to a "locked" plan.
export const DEFAULT_BILLING_TYPE = "package" as const;
// biome-ignore-start lint/suspicious/noThenProperty: `then` is the actual
// field name the billing_rules JSON schema resolve_type() reads — not a
// thenable, can't rename it (matches the Clerk webhook's tenant seed).
export const DEFAULT_BILLING_RULES = [
  { if: { package_type: "specimen" }, then: "miles" },
  { if: { service_type: "on_demand" }, then: "on_demand" },
] as const;
// biome-ignore-end lint/suspicious/noThenProperty: see above
