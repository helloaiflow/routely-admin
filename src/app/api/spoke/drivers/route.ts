import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.SPOKE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "SPOKE_API_KEY not set" }, { status: 500 });
    const credentials = Buffer.from(`${apiKey}:`).toString("base64");
    const res = await fetch("https://api.getcircuit.com/public/v0.2b/drivers", {
      headers: { Authorization: `Basic ${credentials}` },
    });
    if (!res.ok) return NextResponse.json({ error: `Spoke error: ${res.status}` }, { status: 500 });
    const data = await res.json();
    return NextResponse.json({ drivers: data.drivers || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
