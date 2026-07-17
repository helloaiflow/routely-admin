import { NextResponse } from "next/server";
import { requirePagePermission } from "@/lib/tenant";
import { getShippo, DEFAULT_PARCEL } from "@/lib/shippo";
import { getSupabaseAdmin } from "@/lib/supabase";

const MARKUP = 1.5; // 50% profit margin — client pays raw × 1.5

export async function POST(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { from_address, to_address, parcel } = body;

  if (!from_address?.street1 || !to_address?.street1) {
    return NextResponse.json({ error: "from_address and to_address required" }, { status: 400 });
  }

  try {
    // Shippo REQUIRES address_from.email at label-purchase time, and the
    // purchase uses a rate created HERE (addresses are frozen into the
    // shipment). A missing email surfaces at the LAST step as confusing
    // "must not be empty" / USPS-signup-looking errors. Inject the buyer's
    // email server-side so the client form stays simple.
    const userEmail = ctx.user?.emailAddresses?.[0]?.emailAddress ?? "support@routelypro.com";

    // USPS also REQUIRES a seller PHONE ("Seller email and phone number
    // required for USPS"). Pickup-location selections don't carry one, so
    // fall back to the tenant's phone on file (tenants.doc.phone).
    let senderPhone = String(from_address.phone ?? "").trim();
    if (!senderPhone) {
      try {
        const { data: tRow } = await getSupabaseAdmin()
          .from("tenants")
          .select("doc")
          .eq("tenant_id", ctx.tenantId)
          .maybeSingle();
        const doc = (tRow as { doc?: Record<string, unknown> } | null)?.doc;
        senderPhone = String(doc?.phone ?? doc?.contact_phone ?? "").trim();
      } catch {
        /* best-effort — frontend supplies the phone in the normal path */
      }
    }

    const shippo = getShippo();
    // biome-ignore lint/suspicious/noExplicitAny: Shippo SDK v4
    const shipment = await (shippo.shipments.create as any)({
      addressFrom: {
        ...from_address,
        email: from_address.email || userEmail,
        ...(senderPhone ? { phone: senderPhone } : {}),
        country: "US",
      },
      addressTo: { ...to_address, email: to_address.email || userEmail, country: "US" },
      parcels: [parcel ?? DEFAULT_PARCEL],
      async: false,
    });

    // biome-ignore lint/suspicious/noExplicitAny: Shippo SDK v4
    const rates = ((shipment.rates ?? []) as any[])
      .filter((r: any) => ["USPS", "FedEx", "UPS"].includes(r.provider ?? ""))
      .map((r: any) => {
        const raw_price = Number(r.amount);
        const client_price = Math.round(raw_price * MARKUP * 100) / 100;
        return {
          rate_id: r.objectId,
          provider: r.provider,
          service: r.servicelevel?.name ?? r.servicelevel?.token ?? "",
          days: r.estimatedDays ?? null,
          raw_price,       // what Shippo charges us
          client_price,    // what we charge the client (raw × 1.5)
          currency: r.currency,
        };
      })
      .sort((a: any, b: any) => a.client_price - b.client_price);

    return NextResponse.json({ rates, shipment_id: shipment.objectId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Shippo error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
