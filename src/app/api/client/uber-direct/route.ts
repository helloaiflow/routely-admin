import { NextResponse } from "next/server";
import { requirePagePermission } from "@/lib/tenant";

const UBER_TOKEN_URL = "https://login.uber.com/oauth/v2/token";
const UBER_QUOTE_URL = `https://api.uber.com/v1/customers/${process.env.UBER_DIRECT_CUSTOMER_ID}/delivery_quotes`;

// Cache token in memory — reuse until expiry
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getUberToken(): Promise<string> {
  // Bust cache if expired
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  cachedToken = null;

  const clientId = process.env.UBER_DIRECT_CLIENT_ID;
  const clientSecret = process.env.UBER_DIRECT_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Uber Direct credentials not configured");

  const res = await fetch(UBER_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "eats.deliveries",   // ← Uber Direct correct scope
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[Uber Direct] Auth failed:", err);
    throw new Error(`Uber auth failed: ${err}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

export async function POST(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { pickup_address, delivery_address } = body;

  if (!pickup_address || !delivery_address) {
    return NextResponse.json({ error: "pickup_address and delivery_address required" }, { status: 400 });
  }

  try {
    const token = await getUberToken();

    const quoteRes = await fetch(UBER_QUOTE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        pickup_address,
        dropoff_address: delivery_address,
      }),
    });

    if (!quoteRes.ok) {
      const errText = await quoteRes.text();
      console.error(`[Uber Direct] Quote failed ${quoteRes.status}:`, errText);

      let parsed: { code?: string; message?: string; metadata?: { details?: string } } = {};
      try { parsed = JSON.parse(errText); } catch { /* ignore */ }

      // Outside delivery radius — graceful unavailable, not a 500
      if (parsed.code === "address_undeliverable" || quoteRes.status === 422) {
        return NextResponse.json({
          available: false,
          reason: parsed.metadata?.details ?? parsed.message ?? "Outside Uber Direct delivery radius",
        });
      }

      throw new Error(`Uber quote failed (${quoteRes.status}): ${errText}`);
    }

    const quote = await quoteRes.json();
    console.log("[Uber Direct] Quote response:", JSON.stringify(quote));

    // Uber Direct returns fee in cents — field may be 'fee' or 'total_fee'
    const feeCents = quote.fee ?? quote.total_fee ?? quote.amount ?? 0;
    const raw_price = Math.round((feeCents / 100) * 100) / 100;
    const client_price = Math.round(raw_price * 1.5 * 100) / 100;

    if (raw_price === 0) {
      console.warn("[Uber Direct] Got quote but fee is 0, full quote:", JSON.stringify(quote));
    }

    return NextResponse.json({
      available: true,
      quote_id: quote.id,
      raw_price,
      client_price,
      currency: quote.currency ?? "USD",
      pickup_eta: quote.pickup_duration,  // seconds
      dropoff_eta: quote.dropoff_eta,      // ISO timestamp
      provider: "Uber Direct",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Uber Direct error";
    console.error("[Uber Direct] Error:", msg);
    return NextResponse.json({ error: msg, fallback: true }, { status: 500 });
  }
}
