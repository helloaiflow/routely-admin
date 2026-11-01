import { NextResponse } from "next/server";

import { sendPasswordReset } from "@/lib/email/auth";

/* Always the same answer: this endpoint never says whether the email has an account. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase();
  if (email) await sendPasswordReset(email);
  return NextResponse.json({ ok: true });
}
