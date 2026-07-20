import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();
    const { data: tenant } = await supabase
      .from("tenants")
      .select("tenant_id")
      .eq("clerk_user_id", userId)
      .maybeSingle();
    if (!tenant) return NextResponse.json({ stops: [] });

    const { data: rows } = await supabase
      .from("stops")
      .select("doc, stop_id, status, created_at")
      .eq("tenant_id", tenant.tenant_id)
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stops: (rows ?? []).map((r: any) => {
        const s = (r.doc ?? {}) as Record<string, unknown>;
        return {
          id: String(r.stop_id ?? s.stop_id ?? s._id ?? ""),
          rtstop_id: s.rtstop_id,
          recipient: s.recipient_name || s.name || "Unknown",
          address: s.address || "",
          status: r.status || s.status || "pending",
          created_at: r.created_at ?? s.created_at,
        };
      }),
    });
  } catch {
    return NextResponse.json({ stops: [] });
  }
}
