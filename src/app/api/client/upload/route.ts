import { type NextRequest, NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

const FASTAPI_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.routelypro.com";
const ROUTELY_API_SECRET = process.env.ROUTELY_API_SECRET ?? "";

/* Incident 2026-10-29: routely-stops is private now. FastAPI's presigned-url
 * requires X-API-Key and no longer returns a public_url — only a short-lived
 * PUT URL + object_name. Session required here too (not just middleware). */
export async function POST(req: NextRequest) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ROUTELY_API_SECRET) {
    console.error("[upload/presigned-url] ROUTELY_API_SECRET is not set");
    return NextResponse.json({ error: "Failed to get presigned URL" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const res = await fetch(`${FASTAPI_URL}/v1/upload/presigned-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ROUTELY_API_SECRET },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[upload/presigned-url]", err);
    return NextResponse.json({ error: "Failed to get presigned URL" }, { status: 500 });
  }
}
