import { NextResponse } from "next/server";
import { requirePagePermission } from "@/lib/tenant";
import { getShippo } from "@/lib/shippo";

export async function POST(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { rate_id } = body;

  if (!rate_id) {
    return NextResponse.json({ error: "rate_id required" }, { status: 400 });
  }

  try {
    const shippo = getShippo();
    // biome-ignore lint/suspicious/noExplicitAny: Shippo SDK v4
    const txn = await (shippo.transactions.create as any)({
      rate: rate_id,
      labelFileType: "PNG",
      async: false,
    });

    if (txn.status !== "SUCCESS") {
      // biome-ignore lint/suspicious/noExplicitAny: Shippo SDK v4
      const msg = ((txn.messages ?? []) as any[]).map((m: any) => m.text).join(", ") || "Label creation failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({
      tracking_number: txn.trackingNumber,
      tracking_url: txn.trackingUrlProvider,
      label_url: txn.labelUrl,
      status: txn.status,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Shippo error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
