import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

/** The session user for the browser, read from user_profiles (D62). */
export async function GET() {
  const p = await getSessionProfile();
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let companyName = "";
  if (p.tenant_id != null) {
    const { data } = await getSupabaseAdmin()
      .from("tenants")
      .select("company_name")
      .eq("tenant_id", p.tenant_id)
      .maybeSingle();
    companyName = data?.company_name ?? "";
  }
  const [first, ...rest] = (p.full_name ?? "").trim().split(/\s+/);
  return NextResponse.json({
    id: p.user_id,
    email: p.email,
    first_name: first || null,
    last_name: rest.join(" ") || null,
    full_name: p.full_name,
    company_name: companyName,
    metadata: {
      role: p.is_platform_admin ? "routely_admin" : "tenant_user",
      tenant_id: p.tenant_id,
      tenant_role: p.tenant_role,
      phone: p.phone,
      default_office_id: p.default_office_id,
    },
  });
}

export async function PATCH(req: Request) {
  const p = await getSessionProfile();
  if (!p) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { full_name?: unknown };
  const fullName = typeof body.full_name === "string" ? body.full_name.trim().slice(0, 120) : "";
  if (!fullName) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  await getSupabaseAdmin()
    .from("user_profiles")
    .update({ full_name: fullName, updated_at: new Date().toISOString() })
    .eq("user_id", p.user_id);
  return NextResponse.json({ ok: true });
}
