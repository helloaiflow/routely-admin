import { NextResponse } from "next/server";

const SPOKE_BASE = "https://api.getcircuit.com/public/v0.2b";

export async function GET(req: Request) {
  try {
    const apiKey = process.env.SPOKE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "SPOKE_API_KEY not set" }, { status: 500 });
    const credentials = Buffer.from(`${apiKey}:`).toString("base64");
    const headers = { Authorization: `Basic ${credentials}` };
    const { searchParams } = new URL(req.url);
    const planId = searchParams.get("id");
    if (planId) {
      const [planRes, routesRes] = await Promise.all([
        fetch(`${SPOKE_BASE}/${planId}`, { headers }),
        fetch(`${SPOKE_BASE}/${planId}/routes`, { headers }),
      ]);
      const plan = planRes.ok ? await planRes.json() : {};
      const routesData = routesRes.ok ? await routesRes.json() : { routes: [] };
      return NextResponse.json({ plan, routes: routesData.routes || [] });
    }
    const res = await fetch(`${SPOKE_BASE}/plans`, { headers });
    if (!res.ok) return NextResponse.json({ error: `Spoke error: ${res.status}` }, { status: 500 });
    const data = await res.json();
    return NextResponse.json({ plans: data.plans || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
