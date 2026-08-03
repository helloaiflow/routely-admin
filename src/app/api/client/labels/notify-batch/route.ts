import { type NextRequest, NextResponse } from "next/server";

import { BRAND_PRIMARY } from "@/lib/brand";
import { formatDisplayCase } from "@/lib/format-display";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/* POST /api/client/labels/notify-batch — ONE tenant email per label checkout.
 * Body: { order_ids: string[] } — every label purchased in the checkout.
 * Anti-spam contract: N labels in one checkout → exactly one email (never one
 * per label). Respects tenants.notification_prefs.label_email. Emits a
 * notification.sent outbox event. Non-fatal by design: a mail failure never
 * fails the purchase flow (the caller fires-and-forgets). */

export async function POST(req: NextRequest) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const orderIds: string[] = Array.isArray(body?.order_ids)
    ? body.order_ids.filter((x: unknown) => typeof x === "string")
    : [];
  if (!orderIds.length) return NextResponse.json({ error: "order_ids required" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const tenantId = Number(ctx.tenantId);

  const { data: tenant } = await supabase
    .from("tenants")
    .select("email, company_name, doc")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const prefs = ((tenant?.doc as Record<string, unknown>)?.notification_prefs ?? {}) as Record<string, unknown>;
  if (prefs.label_email === false) {
    return NextResponse.json({ ok: true, skipped: "label_email disabled" });
  }
  const to = tenant?.email;
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !to) return NextResponse.json({ ok: false, error: "resend/email unavailable" });

  const { data: rows } = await supabase
    .from("label_orders")
    .select("doc")
    .eq("tenant_id", tenantId)
    .in("order_id", orderIds);
  const orders = (rows ?? []).map((r) => r.doc as Record<string, any>).filter((o) => o?.status === "purchased");
  if (!orders.length) return NextResponse.json({ ok: true, skipped: "no purchased orders" });

  const total = orders.reduce((s, o) => s + Number(o.rate?.client_price ?? 0), 0);
  const logo = (tenant?.doc as Record<string, any>)?.logo_url as string | undefined;
  const cards = orders
    .map((o) => {
      const track =
        o.shippo?.tracking_url_provider ||
        o.shippo?.tracking_url ||
        (o.shippo?.tracking_number ? `https://www.routelypro.com/track/${o.shippo.tracking_number}` : null);
      return `<div style="border:1px solid #e2e6ef;border-radius:10px;padding:14px 16px;margin:10px 0;font-family:sans-serif">
      <div style="font-family:monospace;font-size:13px;color:${BRAND_PRIMARY};font-weight:600">${o.order_id}</div>
      <div style="font-size:13px;margin-top:4px"><b>${formatDisplayCase(o.to_address?.name ?? "")}</b> · ${formatDisplayCase([o.to_address?.street1, o.to_address?.city].filter(Boolean).join(", "))}</div>
      <div style="font-size:12px;color:#667085;margin-top:2px">${o.rate?.provider ?? ""} ${o.rate?.service ?? ""} · ${o.package_type ?? "package"} · $${Number(o.rate?.client_price ?? 0).toFixed(2)}</div>
      <div style="margin-top:8px">
        ${track ? `<a href="${track}" style="font-size:12px;color:${BRAND_PRIMARY}">Track delivery ↗</a>` : ""}
        ${o.shippo?.label_url ? ` &nbsp; <a href="${o.shippo.label_url}" style="font-size:12px;color:${BRAND_PRIMARY}">Print label ↗</a>` : ""}
      </div>
    </div>`;
    })
    .join("");

  const html = `
    ${logo ? `<img src="${logo}" alt="" style="max-height:36px;margin-bottom:12px" />` : `<h2 style="font-family:sans-serif;color:${BRAND_PRIMARY};margin:0 0 12px">Routely</h2>`}
    <p style="font-family:sans-serif;font-size:14px">Your label purchase is confirmed — <b>${orders.length} label${orders.length > 1 ? "s" : ""}</b> · total <b>$${total.toFixed(2)}</b>.</p>
    ${cards}
    <p style="font-family:sans-serif;font-size:11px;color:#98a2b3;margin-top:16px">Manage label notifications in Settings → Notifications.</p>`;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: "Routely <dispatch@routelypro.com>",
        to: [to],
        subject: `Label purchase confirmed — ${orders.length} label${orders.length > 1 ? "s" : ""} · $${total.toFixed(2)}`,
        html,
      }),
    });
    if (!resp.ok) throw new Error(`resend ${resp.status}`);
  } catch (e) {
    console.error("[notify-batch] send failed (non-fatal)", e);
    return NextResponse.json({ ok: false, error: "send failed" });
  }

  await supabase.from("events").insert({
    tenant_id: tenantId,
    aggregate_type: "tenant",
    aggregate_id: String(tenantId),
    type: "notification.sent",
    payload: { channel: "email", template: "label_purchase_batch", labels: orders.length, total },
    actor: "notify-batch",
  });
  return NextResponse.json({ ok: true, emailed: to, labels: orders.length });
}
