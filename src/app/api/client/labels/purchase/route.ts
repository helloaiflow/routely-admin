import { NextResponse } from "next/server";

import { BRAND_PRIMARY } from "@/lib/brand";
import clientPromise from "@/lib/mongodb";
import { getShippo } from "@/lib/shippo";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/** Buys the Shippo label for an order created by /labels/checkout.
 *
 *  MONEY-SAFETY ORDER (never violated):
 *    card    → verify the PaymentIntent is SUCCEEDED for the exact amount
 *              BEFORE buying; if Shippo then fails, AUTO-REFUND the intent.
 *    postpay → re-verify the tenant privilege, buy, then accrue the client
 *              price to tenants.outstanding_amount (same rule as stops).   */
export async function POST(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { order_id, payment_intent_id } = body ?? {};
  if (!order_id) return NextResponse.json({ error: "order_id required" }, { status: 400 });

  const tenantId = String(ctx.tenantId ?? "1");
  const client = await clientPromise;
  const col = client.db("routely_prod").collection("label_orders");

  const order = await col.findOne({ order_id, tenant_id: tenantId });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status === "purchased") {
    // Idempotent: a retry after success returns the existing label.
    return NextResponse.json({
      order_id,
      tracking_number: order.shippo?.tracking_number,
      tracking_url: order.shippo?.tracking_url,
      label_url: order.shippo?.label_url,
      status: "purchased",
    });
  }
  if (order.status !== "pending_payment") {
    return NextResponse.json({ error: `Order is ${order.status}` }, { status: 409 });
  }

  const paymentType: string = order.payment?.type;
  const amountCents: number = Number(order.payment?.amount_cents ?? 0);

  try {
    // ── 1 · Verify payment ────────────────────────────────────────────────
    let cardBrand: string | null = null;
    let cardLast4: string | null = null;
    if (paymentType === "card") {
      if (!payment_intent_id) {
        return NextResponse.json({ error: "payment_intent_id required for card orders" }, { status: 400 });
      }
      const pi = await getStripe().paymentIntents.retrieve(payment_intent_id, { expand: ["payment_method"] });
      const piOk =
        pi.status === "succeeded" &&
        pi.amount === amountCents &&
        (pi.metadata?.stop_id === order_id || pi.metadata?.tenant_id === tenantId);
      if (!piOk) {
        return NextResponse.json({ error: "Payment not verified — label not purchased" }, { status: 402 });
      }
      // Card display metadata (last4/brand are non-sensitive) for the labels UI.
      const pm = pi.payment_method;
      if (typeof pm === "object" && pm?.card) {
        cardBrand = pm.card.brand ?? null;
        cardLast4 = pm.card.last4 ?? null;
      }
    } else if (paymentType === "postpay") {
      const { data: tenant } = await getSupabaseAdmin()
        .from("tenants")
        .select("postpay_enabled, outstanding_amount")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!tenant?.postpay_enabled) {
        return NextResponse.json({ error: "Postpay is not enabled for this account" }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "Unknown payment type" }, { status: 400 });
    }

    // ── 2 · Buy the label ─────────────────────────────────────────────────
    const shippo = getShippo();
    // biome-ignore lint/suspicious/noExplicitAny: Shippo SDK v4
    const txn = await (shippo.transactions.create as any)({
      rate: order.rate?.rate_id,
      labelFileType: "PNG",
      async: false,
    });

    if (txn.status !== "SUCCESS") {
      // biome-ignore lint/suspicious/noExplicitAny: Shippo SDK v4
      const msg = ((txn.messages ?? []) as any[]).map((m: any) => m.text).join(", ") || "Label creation failed";

      // ── Auto-refund: we charged but the carrier label failed ──
      let refund_id: string | null = null;
      if (paymentType === "card" && payment_intent_id) {
        try {
          const refund = await getStripe().refunds.create({ payment_intent: payment_intent_id });
          refund_id = refund.id;
        } catch (e) {
          console.error("[labels/purchase] REFUND FAILED — manual action needed", order_id, e);
        }
      }
      await col.updateOne(
        { order_id },
        {
          $set: {
            status: paymentType === "card" ? (refund_id ? "refunded" : "refund_failed") : "failed",
            error: msg,
            "payment.refund_id": refund_id,
          },
        },
      );
      return NextResponse.json(
        { error: `${msg}${refund_id ? " — your payment was refunded automatically" : ""}` },
        { status: 400 },
      );
    }

    // ── 3 · Persist success ───────────────────────────────────────────────
    await col.updateOne(
      { order_id },
      {
        $set: {
          status: "purchased",
          purchased_at: new Date().toISOString(),
          "payment.payment_intent_id": payment_intent_id ?? null,
          "payment.card_brand": cardBrand,
          "payment.card_last4": cardLast4,
          "shippo.transaction_id": txn.objectId ?? null,
          "shippo.tracking_number": txn.trackingNumber,
          "shippo.tracking_url": txn.trackingUrlProvider,
          "shippo.label_url": txn.labelUrl,
        },
      },
    );

    // ── 4 · Postpay accrues to the tenant's outstanding balance ──────────
    if (paymentType === "postpay") {
      try {
        const supabase = getSupabaseAdmin();
        const { data: tRow } = await supabase
          .from("tenants")
          .select("outstanding_amount")
          .eq("tenant_id", tenantId)
          .maybeSingle();
        const current = Number(tRow?.outstanding_amount ?? 0);
        const clientPrice = Number(order.rate?.client_price ?? amountCents / 100);
        await supabase
          .from("tenants")
          .update({ outstanding_amount: current + clientPrice })
          .eq("tenant_id", tenantId);
      } catch (e) {
        console.error("[labels/purchase] postpay accrual failed", order_id, e);
      }
    }

    // ── 5 · Notify the recipient (best-effort — never blocks the purchase) ──
    const resendKey = process.env.RESEND_API_KEY;
    const recipientEmail = String(order.to_address?.email ?? "").trim();
    if (resendKey && recipientEmail) {
      const provider = String(order.rate?.provider ?? "");
      const service = String(order.rate?.service ?? "");
      const days = order.rate?.days != null ? Number(order.rate.days) : null;
      const senderName = String(order.from_address?.name ?? "Routely");
      const senderCity = [order.from_address?.city, order.from_address?.state].filter(Boolean).join(", ");
      const toName = String(order.to_address?.name ?? "").trim();
      const toAddr = [
        order.to_address?.street1,
        order.to_address?.street2,
        [order.to_address?.city, order.to_address?.state, order.to_address?.zip].filter(Boolean).join(", "),
      ]
        .filter(Boolean)
        .join(", ");
      const p = order.parcel as { length?: string; width?: string; height?: string; weight?: string } | null;
      const parcelLine = p?.length ? `${p.length}×${p.width}×${p.height} in · ${p.weight} oz` : "—";
      const shipDate = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      const etaLine = days != null ? `${days} business day${days === 1 ? "" : "s"}` : "See carrier tracking";
      const mono = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace";
      // Detail row helper — label left, value right (email-safe tables).
      const row = (label: string, value: string, valueStyle = "") =>
        `<tr><td style="padding:8px 0;font-size:13px;color:#6b7280;vertical-align:top;width:40%;border-bottom:1px solid #eef0f3">${label}</td><td style="padding:8px 0;font-size:13px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #eef0f3;${valueStyle}">${value}</td></tr>`;
      // Spacer row — the ONLY reliable vertical rhythm across Gmail/Outlook/Apple
      // Mail (margin & padding on <p> get collapsed by Outlook; empty <td> height
      // is universally respected). This is what fixes the "todo pegado" look.
      const spacer = (h: number) => `<tr><td style="line-height:${h}px;height:${h}px;font-size:0">&nbsp;</td></tr>`;
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#f4f5f7;-webkit-font-smoothing:antialiased;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">
  <!-- Brand header -->
  <tr><td align="center"><span style="font-size:22px;font-weight:800;color:${BRAND_PRIMARY}">Routely</span>&nbsp;<span style="font-size:13px;color:#6b7280">Shipping</span></td></tr>
  ${spacer(22)}
  <!-- Card -->
  <tr><td style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <!-- Hero -->
      <tr><td style="background:${BRAND_PRIMARY};padding:34px 36px">
        <div style="font-size:11px;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.4px;font-weight:600">Your package is on its way</div>
        <div style="font-size:24px;font-weight:800;color:#ffffff;font-family:${mono};letter-spacing:0.5px;padding-top:10px">${txn.trackingNumber}</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.9);padding-top:12px">${provider} ${service} &middot; Est. transit: <strong style="color:#ffffff">${etaLine}</strong></div>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px 36px 36px">
        <div style="font-size:15px;color:#374151;line-height:1.6">Hi${toName ? ` <strong>${toName}</strong>` : ""},</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">${spacer(12)}</table>
        <div style="font-size:15px;color:#374151;line-height:1.6"><strong>${senderName}</strong>${senderCity ? ` (${senderCity})` : ""} has shipped a package to you. Follow it every step of the way with the button below.</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">${spacer(26)}</table>
        <!-- CTA -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center"><a href="${txn.trackingUrlProvider}" style="display:inline-block;background:${BRAND_PRIMARY};color:#ffffff;font-size:15px;font-weight:700;padding:14px 40px;border-radius:10px;text-decoration:none">Track Your Package &rarr;</a></td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">${spacer(28)}</table>
        <!-- Shipment details card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border:1px solid #eef0f3;border-radius:12px"><tr><td style="padding:20px 22px">
          <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;padding-bottom:10px">Shipment Details</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${row("Carrier &amp; Service", `${provider} ${service}`)}
            ${row("Estimated Transit", etaLine)}
            ${row("Ship Date", shipDate)}
            ${row("Deliver To", toAddr || "—")}
            ${row("Package", parcelLine)}
            ${row("Tracking Number", String(txn.trackingNumber), `font-family:${mono};font-weight:700`)}
          </table>
        </td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">${spacer(26)}</table>
        <!-- What happens next -->
        <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;padding-bottom:12px">What Happens Next</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-size:13px;color:#4b5563;padding:5px 0"><span style="color:#059669;font-weight:700">&#10003;</span>&nbsp;&nbsp;Shipping label created</td></tr>
          <tr><td style="font-size:13px;color:#4b5563;padding:5px 0"><span style="color:${BRAND_PRIMARY};font-weight:700">&rarr;</span>&nbsp;&nbsp;${provider} receives and scans your package</td></tr>
          <tr><td style="font-size:13px;color:#4b5563;padding:5px 0"><span style="color:#9ca3af;font-weight:700">&middot;</span>&nbsp;&nbsp;In transit — live updates on the tracking page</td></tr>
          <tr><td style="font-size:13px;color:#4b5563;padding:5px 0"><span style="color:#9ca3af;font-weight:700">&middot;</span>&nbsp;&nbsp;Delivered to your address</td></tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">${spacer(24)}</table>
        <div style="border-top:1px solid #f3f4f6;padding-top:18px;font-size:12px;color:#9ca3af;line-height:1.7">Questions about this shipment? Reply to this email or write to <a href="mailto:support@routelypro.com" style="color:${BRAND_PRIMARY};text-decoration:none">support@routelypro.com</a>.<br/>Sent by Routely Shipping on behalf of ${senderName}.</div>
      </td></tr>
    </table>
  </td></tr>
  ${spacer(20)}
  <tr><td align="center" style="font-size:11px;color:#9ca3af">Routely LLC &middot; routelypro.com</td></tr>
</table>
</td></tr></table></body></html>`;
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: "Routely <dispatch@routelypro.com>",
            to: [recipientEmail],
            subject: `📦 Your ${provider} package from ${senderName} is on its way`,
            html,
          }),
        });
        await col.updateOne({ order_id }, { $set: { recipient_notified_at: new Date().toISOString() } });
      } catch (e) {
        console.error("[labels/purchase] recipient notification failed", order_id, e);
      }
    }

    return NextResponse.json({
      order_id,
      tracking_number: txn.trackingNumber,
      tracking_url: txn.trackingUrlProvider,
      label_url: txn.labelUrl,
      status: "purchased",
      recipient_notified: Boolean(resendKey && recipientEmail),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Purchase error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
