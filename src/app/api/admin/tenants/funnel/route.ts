import { NextResponse } from "next/server";

import { type FunnelRow, isQaTenant } from "@/lib/onboarding-funnel";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext } from "@/lib/tenant";

/**
 * M25: every tenant with its signup funnel (source, campaign, signup/done dates, last step, total time). Company
 * signups have onboarding_step; legacy tenants come back with empty funnel fields. Filtering and the CSV happen in
 * the page, on these rows. M26: QA/e2e tenants come back marked `qa`; the page leaves them out unless asked.
 */
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const [{ data: tenants }, { data: attribution }, { data: events }] = await Promise.all([
    supabase.from("tenants").select("tenant_id, company_name, email, status, onboarding_step, created_at, doc"),
    supabase
      .from("signup_attribution")
      .select("tenant_id, utm_source, utm_medium, utm_campaign, referrer, device, ip_country, ip_region"),
    supabase
      .from("onboarding_events")
      .select("tenant_id, event, at")
      .in("event", ["signup", "verify", "done", "first_stop"]),
  ]);

  const attr = new Map((attribution ?? []).map((a) => [a.tenant_id, a]));
  const once = new Map<string, string>();
  for (const e of events ?? []) once.set(`${e.tenant_id}:${e.event}`, e.at);

  const rows: FunnelRow[] = (tenants ?? []).map((t) => {
    const a = attr.get(t.tenant_id);
    const signup = t.onboarding_step ? (once.get(`${t.tenant_id}:signup`) ?? t.created_at) : null;
    const done = once.get(`${t.tenant_id}:done`) ?? null;
    let referrerHost: string | null = null;
    try {
      referrerHost = a?.referrer ? new URL(a.referrer).hostname.replace(/^www\./, "") : null;
    } catch {
      referrerHost = null;
    }
    return {
      tenant_id: t.tenant_id,
      name: t.company_name || t.doc?.company_name || `Tenant ${t.tenant_id}`,
      status: t.status,
      // Without a utm_source: the referring site, or "direct" for a company signup with no referrer.
      source: a?.utm_source ?? referrerHost ?? (t.onboarding_step ? "direct" : null),
      medium: a?.utm_medium ?? null,
      campaign: a?.utm_campaign ?? null,
      device: a?.device ?? null,
      region: a ? [a.ip_region, a.ip_country].filter(Boolean).join(", ") || null : null,
      signup_at: signup,
      verified_at: once.get(`${t.tenant_id}:verify`) ?? null,
      done_at: done,
      first_stop_at: once.get(`${t.tenant_id}:first_stop`) ?? null,
      last_step: t.onboarding_step,
      total_minutes: signup && done ? (Date.parse(done) - Date.parse(signup)) / 60_000 : null,
      qa: isQaTenant(t.doc, t.email),
    };
  });
  rows.sort((a, b) => (b.signup_at ?? "").localeCompare(a.signup_at ?? "") || b.tenant_id - a.tenant_id);
  return NextResponse.json({ rows });
}
