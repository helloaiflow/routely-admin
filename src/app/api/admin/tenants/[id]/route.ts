import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

/* Read-only: tenant users are managed from app.routelypro.com. */
export async function GET(_req: Request, { params }: Params) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = Number((await params).id);
  if (!Number.isInteger(tenantId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  const [{ data: tenant }, { data: members }, { data: profiles }] = await Promise.all([
    supabase.from("tenants").select("tenant_id, company_name").eq("tenant_id", tenantId).maybeSingle(),
    supabase
      .from("tenant_members")
      .select("clerk_user_id, email, role, active, invitation_status, doc")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
    supabase.from("user_profiles").select("user_id, full_name").eq("tenant_id", tenantId),
  ]);
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const names = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));
  const users = await Promise.all(
    (members ?? []).map(async (m) => {
      // A pending row carries invite:<id> instead of a user id.
      const isUser = names.has(m.clerk_user_id);
      const { data } = isUser ? await supabase.auth.admin.getUserById(m.clerk_user_id) : { data: null };
      return {
        name: names.get(m.clerk_user_id) ?? null,
        email: m.email,
        role: m.role === "member" ? (m.doc?.invited_role ?? "member") : m.role,
        status: m.active ? "active" : m.invitation_status === "pending" ? "invited" : "deactivated",
        last_login: data?.user?.last_sign_in_at ?? null,
      };
    }),
  );
  return NextResponse.json({ tenant: { id: tenant.tenant_id, name: tenant.company_name }, users });
}
