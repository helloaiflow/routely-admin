import { type NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/* /api/client/billing/rates — per-tenant negotiated billing (North Star:
 * structured + API-writable so the LLM operator can manage billing).
 * GET  → { billing_rates, default_billing_type, billing_rules }
 * PATCH → partial update; validates: cents are non-negative integers,
 *         on_demand_split sums exactly 100, rules use only structured keys. */

const RULE_KEYS = new Set(["stop_type", "service_type", "package_type"]);
const TYPES = new Set(["package", "miles", "on_demand"]);
// Same enum settings-tab.tsx's RULE_VALUE_OPTIONS.package_type offers — a
// credit_rules key that isn't a real package_type would silently never
// match any stop, same failure class the rules editor's own value
// constraint already exists to prevent.
const PACKAGE_TYPES = new Set(["rx", "specimen", "medical", "cold", "urgent", "document"]);

export async function GET() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("tenants")
    .select("billing_rates, default_billing_type, billing_rules, credit_rules, postpay_enabled, credit_limit")
    .eq("tenant_id", Number(ctx.tenantId))
    .maybeSingle();
  return NextResponse.json(data ?? {});
}

export async function PATCH(req: NextRequest) {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.billing_rates !== undefined) {
    const r = body.billing_rates;
    for (const k of ["package", "per_mile", "on_demand_per_mile"]) {
      if (!Number.isInteger(r?.[k]) || r[k] < 0)
        return NextResponse.json({ error: `billing_rates.${k} must be integer cents ≥ 0` }, { status: 400 });
    }
    const split = r?.on_demand_split ?? {};
    if (!Number.isInteger(split.routely) || !Number.isInteger(split.driver) || split.routely + split.driver !== 100)
      return NextResponse.json({ error: "on_demand_split must be integers summing 100" }, { status: 400 });
    patch.billing_rates = {
      package: r.package,
      per_mile: r.per_mile,
      on_demand_per_mile: r.on_demand_per_mile,
      on_demand_split: { routely: split.routely, driver: split.driver },
    };
  }
  if (body.default_billing_type !== undefined) {
    if (!TYPES.has(body.default_billing_type))
      return NextResponse.json({ error: "default_billing_type invalid" }, { status: 400 });
    patch.default_billing_type = body.default_billing_type;
  }
  if (body.billing_rules !== undefined) {
    if (!Array.isArray(body.billing_rules))
      return NextResponse.json({ error: "billing_rules must be an array" }, { status: 400 });
    for (const rule of body.billing_rules) {
      const cond = rule?.if ?? {};
      const keys = Object.keys(cond);
      if (
        !keys.length ||
        keys.some((k) => !RULE_KEYS.has(k)) ||
        !TYPES.has(rule?.then) ||
        keys.some((k) => typeof cond[k] !== "string")
      )
        return NextResponse.json(
          { error: "rules must be {if:{stop_type|service_type|package_type: string}, then: type}" },
          { status: 400 },
        );
    }
    patch.billing_rules = body.billing_rules;
  }
  if (body.credit_rules !== undefined) {
    const cr = body.credit_rules;
    if (typeof cr !== "object" || cr === null || Array.isArray(cr))
      return NextResponse.json({ error: "credit_rules must be an object of package_type -> cents" }, { status: 400 });
    for (const [k, v] of Object.entries(cr)) {
      if (!PACKAGE_TYPES.has(k))
        return NextResponse.json({ error: `credit_rules key "${k}" is not a known package_type` }, { status: 400 });
      if (!Number.isInteger(v) || (v as number) < 0)
        return NextResponse.json({ error: `credit_rules.${k} must be integer cents ≥ 0` }, { status: 400 });
    }
    patch.credit_rules = cr;
  }
  // postpay_enabled/credit_limit moved OFF this route (2026-08-11) — they
  // used to write straight to Supabase here with no audit trail and no
  // approval gate. That path is retired; POST /api/client/billing/billing-
  // method is the only way to change either now (routed through routely-
  // api's dual-approval-aware endpoint, which also enforces the debt rules).
  if (body.postpay_enabled !== undefined || body.credit_limit !== undefined) {
    return NextResponse.json(
      { error: "postpay_enabled/credit_limit moved to POST /api/client/billing/billing-method" },
      { status: 400 },
    );
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  // D39 (CEO-locked 2026-08-19): "Custom" is the only plan whose rates/rules
  // aren't locked. This route is the sole path that changes them directly —
  // so a direct write here IS the act of going Custom, structurally, not by
  // UI convention. A tenant can never display "Starter" while carrying a
  // hand-edited rate: the write that would cause that also flips the label.
  patch.plan_type = "custom";

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tenants")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("tenant_id", Number(ctx.tenantId));
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  return NextResponse.json({ ok: true, ...patch });
}
