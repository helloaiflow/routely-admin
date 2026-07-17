import { NextResponse } from "next/server";

import clientPromise from "@/lib/mongodb";
import { requirePagePermission } from "@/lib/tenant";

/* ───────────────────────────────────────────────────────────────────────────
 * Billing charges + metrics — everything derived STRICTLY from real data:
 *   • tenant counters  (packages_this_month, miles_this_month, price_per_*,
 *                       outstanding_amount, billing_method, plan_type)
 *   • label_orders     (Shippo label spend + the concrete charge history)
 *
 * No invoices collection exists yet, so we DO NOT fabricate invoices. The
 * "charges" list below is the real ledger; a formal monthly-invoice system is
 * tracked as tech debt (see routely-os backlog).
 *
 * BUSINESS RULE (inherited from labels): rate.raw_price / margin are NEVER
 * returned — only rate.client_price reaches the client.
 * ───────────────────────────────────────────────────────────────────────────*/

type ChargeRow = {
  id: string;
  date: string;
  kind: "shipping_label";
  title: string;
  subtitle: string;
  amount: number;
  status: string;
  carrier: string | null;
  service: string | null;
  tracking: string | null;
  tracking_url: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function GET() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = (await clientPromise).db("routely_prod");

    const tenant = await db.collection("tenants").findOne(
      { tenant_id: ctx.tenantId },
      {
        projection: {
          plan_type: 1,
          billing_method: 1,
          billing_status: 1,
          price_per_stop: 1,
          price_per_mile: 1,
          packages_this_month: 1,
          miles_this_month: 1,
          outstanding_amount: 1,
          outstanding_routes_count: 1,
          billing_cycle_start: 1,
          billing_cycle_end: 1,
          trial_ends_at: 1,
          company_name: 1,
          name: 1,
          address: 1,
          full_address: 1,
          phone: 1,
          contact_phone: 1,
          email: 1,
          billing_email: 1,
        },
      },
    );
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    // Last 180 days of label orders for this tenant (chart series + ledger).
    const since = new Date(Date.now() - 180 * 86400_000).toISOString();
    const orders = await db
      .collection("label_orders")
      .find({ tenant_id: String(ctx.tenantId), created_at: { $gte: since } })
      .sort({ created_at: -1 })
      .limit(500)
      .project({ _id: 0 })
      .toArray();

    // ── Month window (calendar month, aligns with *_this_month counters) ──
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();

    const pricePerStop = Number(tenant.price_per_stop) || 0;
    const pricePerMile = Number(tenant.price_per_mile) || 0;
    const packages = Number(tenant.packages_this_month) || 0;
    const miles = Number(tenant.miles_this_month) || 0;

    // Real cost components.
    const deliveryExpense = round2(packages * pricePerStop);
    const milesExpense = round2(miles * pricePerMile);

    // Shipping-label spend this month (purchased only).
    const isPurchased = (o: Record<string, unknown>) => o.status === "purchased";
    const priceOf = (o: Record<string, unknown>) => Number((o.rate as { client_price?: number })?.client_price) || 0;

    let labelExpense = 0;
    for (const o of orders) {
      if (isPurchased(o) && new Date(o.created_at as string) >= monthStart) labelExpense += priceOf(o);
    }
    labelExpense = round2(labelExpense);

    const total = round2(deliveryExpense + milesExpense + labelExpense);
    const outstanding = round2(Number(tenant.outstanding_amount) || 0);

    // ── 30-day daily series for the chart (label spend + count) ──
    const series: { date: string; spend: number; count: number }[] = [];
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const buckets = new Map<string, { spend: number; count: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      buckets.set(dayKey(d), { spend: 0, count: 0 });
    }
    for (const o of orders) {
      if (!isPurchased(o)) continue;
      const k = dayKey(new Date(o.created_at as string));
      const b = buckets.get(k);
      if (b) {
        b.spend = round2(b.spend + priceOf(o));
        b.count += 1;
      }
    }
    for (const [date, v] of buckets) series.push({ date, spend: v.spend, count: v.count });

    // ── Recent charge ledger (real label_orders) ──
    const charges: ChargeRow[] = orders.slice(0, 25).map((o) => {
      const rate = (o.rate ?? {}) as { provider?: string; service?: string; client_price?: number };
      const to = (o.to_address ?? {}) as { name?: string; city?: string; state?: string };
      const shippo = (o.shippo ?? {}) as { tracking_number?: string; tracking_url?: string };
      return {
        id: String(o.order_id ?? ""),
        date: String(o.created_at ?? ""),
        kind: "shipping_label",
        title: rate.provider ? `${rate.provider.toUpperCase()} ${rate.service ?? ""}`.trim() : "Shipping label",
        subtitle: to.name ? `${to.name}${to.city ? ` · ${to.city}, ${to.state ?? ""}` : ""}`.trim() : "—",
        amount: Number(rate.client_price) || 0,
        status: String(o.status ?? ""),
        carrier: rate.provider ? rate.provider.toLowerCase() : null,
        service: rate.service ?? null,
        tracking: shippo.tracking_number ?? null,
        tracking_url: shippo.tracking_url ?? null,
      };
    });

    // ── Simple month projection from month-to-date run rate ──
    const runRate = dayOfMonth > 0 ? total / dayOfMonth : 0;
    const projectedTotal = round2(runRate * daysInMonth);

    // ── Bill-to block (client details) for invoices ──
    const addr = (tenant.address ?? {}) as { street?: string; city?: string; state?: string; zip?: string };
    const bill_to = {
      name: String(tenant.company_name ?? tenant.name ?? ""),
      street: String(addr.street ?? ""),
      city: String(addr.city ?? ""),
      state: String(addr.state ?? ""),
      zip: String(addr.zip ?? ""),
      full_address: String(tenant.full_address ?? ""),
      phone: String(tenant.phone ?? tenant.contact_phone ?? ""),
      email: String(tenant.billing_email ?? tenant.email ?? ""),
    };

    return NextResponse.json({
      bill_to,
      month: {
        label: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        package_expense: labelExpense,
        delivery_expense: deliveryExpense,
        miles_expense: milesExpense,
        total,
        outstanding,
        packages,
        miles,
      },
      pricing: {
        price_per_stop: pricePerStop,
        price_per_mile: pricePerMile,
        plan_type: tenant.plan_type ?? "trial",
        billing_method: tenant.billing_method ?? "prepaid",
        billing_status: tenant.billing_status ?? null,
      },
      projection: { run_rate: round2(runRate), projected_total: projectedTotal, days_in_month: daysInMonth, day_of_month: dayOfMonth },
      series,
      charges,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Query error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
