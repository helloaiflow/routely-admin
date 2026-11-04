import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";

/* M17l: a tenant in review cannot create stops (D70, enforced by Postgres triggers). Admin asks the same
 * stop_block_reason() first so the answer is a 403 with the message, not the 500 a refused insert used to give. */
export const REVIEW_MESSAGE = "We're reviewing your account — usually within a few hours.";

export async function reviewBlock(tenantId: number) {
  const { data } = await getSupabaseAdmin().rpc("stop_block_reason", { p_tenant_id: tenantId });
  if (!data) return null;
  return NextResponse.json({ ok: false, error: REVIEW_MESSAGE, code: String(data) }, { status: 403 });
}

/** A refused insert (trigger raises P0001 ACCOUNT_IN_REVIEW) maps to the same 403. */
export function reviewRefusal(error: { message?: string; code?: string } | null) {
  if (!error || !String(error.message ?? "").includes("ACCOUNT_IN_REVIEW")) return null;
  return NextResponse.json({ ok: false, error: REVIEW_MESSAGE, code: "ACCOUNT_IN_REVIEW" }, { status: 403 });
}
