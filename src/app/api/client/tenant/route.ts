import { NextResponse } from "next/server";
import { requireActiveTenantContext } from "@/lib/tenant";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const ctx = await requireActiveTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from("tenants")
    .select("doc")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  // `doc` jsonb is the original Mongo document → the field mapping below is unchanged.
  // biome-ignore lint/suspicious/noExplicitAny: doc is the raw Mongo shape
  const tenant = (row as { doc: Record<string, unknown> }).doc as any;

  return NextResponse.json({
    tenant_id: tenant.tenant_id,
    company_name: tenant.company_name,
    plan_type: tenant.plan_type || "trial",
    // Routely Next Day pricing (set per tenant)
    price_per_stop: tenant.price_per_stop ?? 16.00,
    price_per_mile: tenant.price_per_mile ?? 1.65,
    // Routely Xpress pricing (fixed platform-wide, overridable)
    xpress_base_fee: tenant.xpress_base_fee ?? 14.99,
    xpress_per_mile: tenant.xpress_per_mile ?? 1.38,
    // Billing
    postpay_enabled: tenant.postpay_enabled ?? false,
    credit_limit: tenant.credit_limit ?? 0,
    credit_period: tenant.credit_period ?? "monthly",       // monthly | weekly | biweekly
    credit_reset_day: tenant.credit_reset_day ?? 1,         // day of month (1-28) or day of week (0=Sun)
    outstanding_amount: tenant.outstanding_amount ?? 0,
    packages_this_month: tenant.packages_this_month || 0,
    miles_this_month: tenant.miles_this_month || 0,
    trial_ends_at: tenant.trial_ends_at,
    billing_method: tenant.billing_method || "prepaid",
    has_payment_method: Boolean(tenant.stripe_default_payment_method),
    sender_name: tenant.company_name || tenant.name || "Routely Client",
    sender_address: tenant.address?.street
      ? `${tenant.address.street}, ${tenant.address.city || ""}, ${tenant.address.state || "FL"} ${tenant.address.zip || ""}`.trim()
      : tenant.full_address || "",
    sender_phone: tenant.phone || tenant.contact_phone || "",
    pickup_locations:
      Array.isArray(tenant.pickup_locations) && tenant.pickup_locations.length > 0
        ? tenant.pickup_locations
        : [
            // Synthesized fallback used ONLY when tenant.pickup_locations is empty.
            // Includes street/city/state/zip so callers can persist the full
            // address breakdown (matches the shape of real pickup_locations entries).
            {
              id: "default",
              location_id: "default",
              name: tenant.company_name || tenant.name || "Default Location",
              street: tenant.address?.street || "",
              city:   tenant.address?.city   || "",
              state:  tenant.address?.state  || "FL",
              zip:    tenant.address?.zip    || "",
              address: tenant.address?.street
                ? `${tenant.address.street}, ${tenant.address.city || ""}, ${tenant.address.state || "FL"} ${tenant.address.zip || ""}`.trim()
                : tenant.full_address || "",
              is_default: true,
            },
          ],
  });
}

// PATCH — disabled in the client portal.
//
// Earlier this route accepted price_per_stop, price_per_mile,
// xpress_base_fee, xpress_per_mile, postpay_enabled, credit_limit,
// credit_period, credit_reset_day, and plan_type updates from any
// authenticated tenant user — meaning a tenant could rewrite their
// own pricing and credit terms. There is no role system in the client
// portal yet, so the safe move for sprint-1 is to disable PATCH here
// entirely. Tenant pricing/billing/plan changes belong to the admin
// portal (routely-admin) which has its own auth tier and audit log.
//
// Future-friendly: when a role/member system lands and "owner" /
// "admin" roles are wired up, this handler can re-enable a narrow
// subset (e.g. company_name only) for the right roles.
export async function PATCH() {
  return NextResponse.json(
    {
      error: "Forbidden",
      message:
        "Tenant pricing, plan, and billing settings are managed in the admin portal. " +
        "Contact your Routely account manager to make changes.",
    },
    { status: 403 },
  );
}
