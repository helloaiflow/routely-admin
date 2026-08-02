import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

/* GET /api/client/billing/summary — KPI/chart/table data for the redesigned
 * Billing page (2026-08-02). Combines TWO real, distinct money flows without
 * conflating them:
 *   • delivery charges     — billing_ledger (what the tenant owes Routely
 *     for deliveries: package/miles/on-demand charges per attempt)
 *   • shipping label spend — label_orders (what the tenant spends buying
 *     shipping labels via Shippo — a different flow entirely; a tenant can
 *     owe hundreds in delivery charges with $0 label spend, or vice versa)
 * Every field below is labeled by which flow it belongs to; nothing here
 * mixes the two into a single ambiguous number. */

const round0 = (n: number) => Math.round(n);

export async function GET() {
  const ctx = await requirePagePermission("billing");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = Number(ctx.tenantId);
  const supabase = getSupabaseAdmin();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);

  // ── Query A: ALL uninvoiced ledger lines (no date bound — mirrors
  // /api/client/billing/usage exactly). Backs "amount due", the
  // charges-by-type breakdown, the failed-attempts caption, and the
  // "old uninvoiced" overdue signal. ──
  const { data: uninvoicedRows } = await supabase
    .from("billing_ledger")
    .select("resolved_type, outcome, amount_cents, attempted_at, flag")
    .eq("tenant_id", tenantId)
    .is("invoiced_at", null);
  const uninvoiced = uninvoicedRows ?? [];

  let amountDueCents = 0;
  let oldUninvoicedCents = 0;
  let oldUninvoicedCount = 0;
  let failedLines = 0;
  let totalLines = 0;
  const byType: Record<string, { lines: number; amount_cents: number }> = {};
  for (const l of uninvoiced) {
    if (l.flag) continue;
    const cents = l.amount_cents ?? 0;
    amountDueCents += cents;
    totalLines++;
    if (l.outcome === "failed") failedLines++;
    byType[l.resolved_type] ??= { lines: 0, amount_cents: 0 };
    byType[l.resolved_type].lines++;
    byType[l.resolved_type].amount_cents += cents;
    if (new Date(l.attempted_at) < thirtyDaysAgo) {
      oldUninvoicedCount++;
      oldUninvoicedCents += cents;
    }
  }

  // ── Query B: last ~60 days of ledger lines, ANY invoice status. Backs
  // this-month/last-month delivery-charge deltas, the 30-day delivery-charge
  // chart, and the recent-charges table. ──
  const since = lastMonthStart.toISOString();
  const { data: recentRows } = await supabase
    .from("billing_ledger")
    .select("id, stop_id, resolved_type, outcome, amount_cents, invoiced_at, attempted_at, flag")
    .eq("tenant_id", tenantId)
    .gte("attempted_at", since)
    .order("attempted_at", { ascending: false })
    .limit(500);
  const recent = recentRows ?? [];

  let deliveryThisMonthCents = 0;
  let deliveryLastMonthCents = 0;
  const deliverySeries = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    deliverySeries.set(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)), 0);
  }
  for (const l of recent) {
    if (l.flag) continue;
    const at = new Date(l.attempted_at);
    const cents = l.amount_cents ?? 0;
    if (at >= monthStart) deliveryThisMonthCents += cents;
    else if (at >= lastMonthStart && at < monthStart) deliveryLastMonthCents += cents;
    const k = dayKey(at);
    if (deliverySeries.has(k)) deliverySeries.set(k, (deliverySeries.get(k) ?? 0) + cents);
  }

  // Recent-charges table: top 15, enriched with recipient name via a single
  // batch lookup against `stops` (billing_ledger only stores stop_id).
  const recentTop = recent.slice(0, 15);
  const stopIds = [...new Set(recentTop.map((l) => l.stop_id))];
  const namesByStopId: Record<string, string> = {};
  if (stopIds.length > 0) {
    const { data: stopRows } = await supabase.from("stops").select("stop_id, doc").in("stop_id", stopIds);
    for (const s of stopRows ?? []) {
      const doc = (s.doc ?? {}) as { recipient?: { name?: string } };
      namesByStopId[s.stop_id] = doc.recipient?.name ?? "";
    }
  }
  const recentCharges = recentTop.map((l) => ({
    id: l.id,
    stop_id: l.stop_id,
    recipient_name: namesByStopId[l.stop_id] ?? "",
    date: l.attempted_at,
    resolved_type: l.resolved_type,
    outcome: l.outcome,
    amount_cents: l.amount_cents,
    invoiced_at: l.invoiced_at,
    flagged: Boolean(l.flag),
  }));

  // ── Shipping label spend (label_orders — a wholly separate flow from the
  // ledger above). This month + last month for the delta. ──
  const { data: orderRows } = await supabase
    .from("label_orders")
    .select("doc, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", since)
    .limit(1000);
  const orders = orderRows ?? [];
  let labelsThisMonthCents = 0;
  let labelsLastMonthCents = 0;
  for (const o of orders) {
    const doc = (o.doc ?? {}) as { status?: string; rate?: { client_price?: number } };
    if (doc.status !== "purchased") continue;
    const cents = round0((Number(doc.rate?.client_price) || 0) * 100);
    const at = new Date(o.created_at);
    if (at >= monthStart) labelsThisMonthCents += cents;
    else if (at >= lastMonthStart && at < monthStart) labelsLastMonthCents += cents;
  }

  return NextResponse.json({
    amount_due_cents: round0(amountDueCents),
    delivery_this_month_cents: round0(deliveryThisMonthCents),
    delivery_last_month_cents: round0(deliveryLastMonthCents),
    labels_this_month_cents: labelsThisMonthCents,
    labels_last_month_cents: labelsLastMonthCents,
    outstanding_old_uninvoiced_cents: round0(oldUninvoicedCents),
    outstanding_old_uninvoiced_count: oldUninvoicedCount,
    charges_by_type: byType,
    failed_attempts: { failed: failedLines, total: totalLines },
    delivery_series_30d: [...deliverySeries.entries()].map(([date, amount_cents]) => ({ date, amount_cents })),
    recent_charges: recentCharges,
  });
}
