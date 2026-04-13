import { NextResponse } from "next/server";

const SPOKE_BASE = "https://api.getcircuit.com/public/v0.2b";

export async function GET(req: Request) {
  try {
    const apiKey = process.env.SPOKE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "SPOKE_API_KEY not set" }, { status: 500 });
    const credentials = Buffer.from(`${apiKey}:`).toString("base64");
    const { searchParams } = new URL(req.url);
    const routeId = searchParams.get("id");
    if (!routeId) return NextResponse.json({ error: "id required" }, { status: 400 });
    const res = await fetch(`${SPOKE_BASE}/${routeId}/stops`, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    if (!res.ok) return NextResponse.json({ error: `Spoke error: ${res.status}` }, { status: 500 });
    const data = await res.json();
    return NextResponse.json({ stops: data.stops || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
