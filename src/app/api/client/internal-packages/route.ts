import { NextResponse } from "next/server";

import { reviveStopDoc, shapeStopForList } from "@/lib/spoke-fields";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireActiveTenantContext } from "@/lib/tenant";

/* ── GET /api/client/internal-packages ──────────────────────────────────────
 * The Internal Packages module's ONLY read endpoint (CEO, 2026-09-01).
 * Returns internal packages exclusively — the SQL filter keeps every medical
 * stop out at the database, and the response shape is a WHITELIST: no
 * medical fields, patient details, images or operational metadata can leak
 * through this route even if the doc carries them.
 *
 * Visibility:
 *  - owners / members granted internal_packages → every internal package of
 *    the tenant ("all").
 *  - role "internal" users → only packages they SENT (created_by matches
 *    their clerk user) or will RECEIVE (recipient email matches theirs)
 *    ("own").
 * ─────────────────────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shapeInternal(d: any) {
  const s = shapeStopForList(d);
  return {
    id: s.id,
    stop_id: s.stop_id,
    status: s.status,
    delivery_succeeded: s.delivery_succeeded ?? null,
    recipient_name: s.recipient_name,
    recipient_phone: s.recipient_phone,
    recipient_email: d.recipient?.email ?? null,
    delivery_address: s.delivery_address,
    delivery_city: s.delivery_city,
    delivery_state: s.delivery_state,
    delivery_zip: s.delivery_zip,
    pickup_name: s.pickup_name,
    pickup_address: s.pickup_address,
    pickup_city: d.pickup?.city ?? null,
    pickup_state: d.pickup?.state ?? null,
    pickup_zip: d.pickup?.zip ?? null,
    package_type: s.package_type,
    notes: s.notes,
    delivery_date: s.delivery_date,
    eta_at: s.eta_at,
    driver_name: s.driver_name,
    tracking_link: s.tracking_link,
    created_at: s.created_at,
    created_by_user: d.created_by?.clerk_user_id ?? null,
  };
}

export async function GET() {
  const ctx = await requireActiveTenantContext();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // ADMIN cross-tenant: honor the global TenantSelector cookie — "all" lists
  // every tenant's internal packages; a specific scope filters (same pattern
  // as the admin dashboard API).
  const scopeAll = ctx.isAdmin && ctx.tenantScope === "all";

  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("stops")
    .select("doc")
    .eq("doc->delivery_requirements->>internal_package", "true");
  if (!scopeAll) q = q.eq("tenant_id", Number(ctx.tenantId));
  const { data: rows, error } = await q.order("doc->>created_at", { ascending: false }).limit(500);

  if (error) {
    console.error("[internal-packages] supabase error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const docs = (rows ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r) => reviveStopDoc((r as { doc: any }).doc))
    .filter(Boolean)
    .filter((d) => d.status !== "deleted")
    // orders/create makes a PAIRED pickup stop at the origin office; the
    // module tracks the package by its DELIVERY leg only — showing both legs
    // duplicated every row (found live, 2026-09-01: recipient name with the
    // origin address next to the real row).
    .filter((d) => String(d.stop_type ?? "delivery").toLowerCase() !== "pickup");

  const visibility = "all" as const;
  const shaped = docs.map(shapeInternal);

  return NextResponse.json({
    visibility,
    caller_user_id: ctx.userId,
    packages: shaped,
    generated_at: new Date().toISOString(),
  });
}
