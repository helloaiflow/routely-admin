import { NextResponse } from "next/server";

const SPOKE_BASE = "https://api.getcircuit.com/public/v0.2b";

function auth() {
  const key = process.env.SPOKE_API_KEY;
  if (!key) throw new Error("SPOKE_API_KEY not set");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const routeId = searchParams.get("id");
    if (!routeId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const res = await fetch(`${SPOKE_BASE}/routes/${routeId}/stops?pageSize=100`, {
      headers: { Authorization: auth() },
    });
    if (!res.ok) return NextResponse.json({ error: `Spoke ${res.status}` }, { status: res.status });
    const data = await res.json();
    return NextResponse.json({ stops: data.stops || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
