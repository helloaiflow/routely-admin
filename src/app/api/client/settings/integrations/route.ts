import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext } from "@/lib/tenant";

/* ── /api/client/settings/integrations ────────────────────────────────────────
 * Command Center config (CC0): which optimizer engine + SMS provider Routely
 * uses for a tenant, plus the Circuit hybrid fallback switch. This is an OPS
 * decision (Routely staff), NOT tenant-facing — so it's ADMIN-ONLY and lives in
 * the admin portal. One row per tenant in `integration_settings` (seeded by Code
 * in CC0). Reads/writes with the service key + explicit tenant_id scoping (same
 * pattern as the other Next routes; RLS is enforced on the FastAPI role).
 * ─────────────────────────────────────────────────────────────────────────── */

const OPTIMIZER_ENGINES = ["google", "ortools", "mapbox"] as const;
const SMS_PROVIDERS = ["telnyx", "twilio", "clicksend"] as const;
type OptimizerEngine = (typeof OPTIMIZER_ENGINES)[number];
type SmsProvider = (typeof SMS_PROVIDERS)[number];

type IntegrationSettings = {
  tenant_id: number;
  optimizer_engine: OptimizerEngine;
  sms_provider: SmsProvider;
  sms_fallback_order: SmsProvider[];
  circuit_enabled: boolean;
  updated_at: string | null;
};

const DEFAULTS: Omit<IntegrationSettings, "tenant_id" | "updated_at"> = {
  optimizer_engine: "google",
  sms_provider: "telnyx",
  sms_fallback_order: ["telnyx", "twilio", "clicksend"],
  circuit_enabled: true,
};

/** Resolve the tenant this request edits. Admin must have narrowed to ONE tenant
 *  (the header selector), not "all" — you configure one tenant at a time. */
function resolveScopedTenant(ctx: { isAdmin: boolean; tenantScope: number | "all"; tenantId: number }) {
  if (ctx.isAdmin) {
    if (ctx.tenantScope === "all") return null; // caller must pick a tenant
    return ctx.tenantScope;
  }
  return ctx.tenantId;
}

// ── GET — current integration settings for the scoped tenant ─────────────────
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const tenantId = resolveScopedTenant(ctx);
  if (tenantId === null) {
    return NextResponse.json({ error: "Select a tenant first", needsTenant: true }, { status: 409 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("integration_settings")
    .select("tenant_id, optimizer_engine, sms_provider, sms_fallback_order, circuit_enabled, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    console.error("[integrations GET]", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Row is seeded per tenant in CC0, but fall back to defaults if missing.
  const settings: IntegrationSettings = data
    ? {
        tenant_id: Number(data.tenant_id),
        optimizer_engine: (data.optimizer_engine as OptimizerEngine) ?? DEFAULTS.optimizer_engine,
        sms_provider: (data.sms_provider as SmsProvider) ?? DEFAULTS.sms_provider,
        sms_fallback_order: (data.sms_fallback_order as SmsProvider[]) ?? DEFAULTS.sms_fallback_order,
        circuit_enabled: data.circuit_enabled ?? DEFAULTS.circuit_enabled,
        updated_at: data.updated_at ?? null,
      }
    : { tenant_id: tenantId, ...DEFAULTS, updated_at: null };

  return NextResponse.json({
    settings,
    options: { optimizer_engines: OPTIMIZER_ENGINES, sms_providers: SMS_PROVIDERS },
  });
}

// ── PATCH — update engine / provider / fallback / circuit switch ─────────────
export async function PATCH(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const tenantId = resolveScopedTenant(ctx);
  if (tenantId === null) {
    return NextResponse.json({ error: "Select a tenant first", needsTenant: true }, { status: 409 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Build a validated patch — only known, non-sensitive fields (credentials are
  // NEVER set from this UI; those stay backend/secret-managed).
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("optimizer_engine" in body) {
    if (!OPTIMIZER_ENGINES.includes(body.optimizer_engine as OptimizerEngine)) {
      return NextResponse.json({ error: "Invalid optimizer_engine" }, { status: 400 });
    }
    patch.optimizer_engine = body.optimizer_engine;
  }
  if ("sms_provider" in body) {
    if (!SMS_PROVIDERS.includes(body.sms_provider as SmsProvider)) {
      return NextResponse.json({ error: "Invalid sms_provider" }, { status: 400 });
    }
    patch.sms_provider = body.sms_provider;
  }
  if ("sms_fallback_order" in body) {
    const order = body.sms_fallback_order;
    if (
      !Array.isArray(order) ||
      order.length === 0 ||
      order.some((p) => !SMS_PROVIDERS.includes(p as SmsProvider)) ||
      new Set(order).size !== order.length
    ) {
      return NextResponse.json({ error: "Invalid sms_fallback_order" }, { status: 400 });
    }
    patch.sms_fallback_order = order;
  }
  if ("circuit_enabled" in body) {
    if (typeof body.circuit_enabled !== "boolean") {
      return NextResponse.json({ error: "Invalid circuit_enabled" }, { status: 400 });
    }
    patch.circuit_enabled = body.circuit_enabled;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("integration_settings")
    .update(patch)
    .eq("tenant_id", tenantId)
    .select("tenant_id, optimizer_engine, sms_provider, sms_fallback_order, circuit_enabled, updated_at")
    .maybeSingle();
  if (error) {
    console.error("[integrations PATCH]", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
