import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";

/* M17l: a tenant in review cannot create stops (D70, enforced by Postgres triggers). Admin asks the same
 * stop_block_reason() first so the answer is a 403 with the message, not the 500 a refused insert used to give. */
export const REVIEW_MESSAGE = "We're reviewing your account — usually within a few hours.";
// M21: same text as public.stop_block_message().
const STOP_BLOCK_MESSAGE: Record<string, string> = {
  ACCOUNT_IN_REVIEW: REVIEW_MESSAGE,
  AGREEMENTS_REQUIRED: "Accept the updated agreements to create stops.",
};

export async function reviewBlock(tenantId: number) {
  const { data } = await getSupabaseAdmin().rpc("stop_block_reason", { p_tenant_id: tenantId });
  if (!data) return null;
  const code = String(data);
  return NextResponse.json({ ok: false, error: STOP_BLOCK_MESSAGE[code] ?? REVIEW_MESSAGE, code }, { status: 403 });
}

/** A refused insert (trigger raises P0001 with the reason as message) maps to the same 403. */
export function reviewRefusal(error: { message?: string; code?: string } | null) {
  const code = Object.keys(STOP_BLOCK_MESSAGE).find((key) => String(error?.message ?? "").includes(key));
  if (!code) return null;
  return NextResponse.json({ ok: false, error: STOP_BLOCK_MESSAGE[code], code }, { status: 403 });
}
