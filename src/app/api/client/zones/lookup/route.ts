import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

// ── GET /api/client/zones/lookup ──────────────────────────────────────────────
// Display-only: resolves the delivery zone_name for a 5-digit ZIP from the
// Supabase `zones` table so the draft editor can refresh the "Route Zone" field
// live after an address change (the DB trigger already persists the real value).
// Non-fatal by design — any failure returns { zone_name: null }, never a 500.
export async function GET(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const zip5 = String(searchParams.get("zip") ?? "")
      .replace(/\D/g, "")
      .slice(0, 5);
    if (zip5.length !== 5) return NextResponse.json({ zone_name: null });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("zones")
      .select("zone_name")
      .eq("zip", zip5)
      .maybeSingle();
    if (error) {
      console.error("[zones/lookup] supabase error:", error);
      return NextResponse.json({ zone_name: null });
    }

    return NextResponse.json({ zone_name: data?.zone_name ?? null });
  } catch (e) {
    console.error("[zones/lookup]", e);
    return NextResponse.json({ zone_name: null });
  }
}
