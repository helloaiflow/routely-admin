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
    const planId = searchParams.get("id");

    if (planId) {
      const [planRes, routesRes] = await Promise.all([
        fetch(`${SPOKE_BASE}/plans/${planId}`, { headers: { Authorization: auth() } }),
        fetch(`${SPOKE_BASE}/plans/${planId}/routes`, { headers: { Authorization: auth() } }),
      ]);
      if (!planRes.ok) return NextResponse.json({ error: `Spoke ${planRes.status}` }, { status: planRes.status });
      const plan = await planRes.json();
      const routesData = routesRes.ok ? await routesRes.json() : { routes: [] };
      return NextResponse.json({ plan, routes: routesData.routes || [] });
    }

    const res = await fetch(`${SPOKE_BASE}/plans?pageSize=50`, { headers: { Authorization: auth() } });
    if (!res.ok) return NextResponse.json({ error: `Spoke ${res.status}` }, { status: res.status });
    const data = await res.json();
    return NextResponse.json({ plans: data.plans || [], nextPageToken: data.nextPageToken });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
