import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

// jsonb stores Mongo Dates as ISO strings; normalize to a string either way.
const isoOf = (v: unknown): string =>
  typeof v === "string"
    ? v
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      v && typeof (v as any).toISOString === "function"
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (v as any).toISOString()
      : new Date().toISOString();

// Returns a draft as FullStop-shaped JSON so the existing StopDetailPanel
// hydration flow (setFull -> useEffect([full]) -> populate all form state)
// works identically for drafts as it does for submitted stops.
export async function GET(_request: Request, { params }: { params: Promise<{ draft_id: string }> }) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { draft_id } = await params;
  const supabase = getSupabaseAdmin();

  // Admin can open any tenant's draft; regular users stay tenant-scoped.
  let dq = supabase.from("draft_stops").select("doc").eq("draft_id", draft_id);
  if (!ctx.isAdmin) dq = dq.eq("tenant_id", Number(ctx.tenantId));
  const { data: row, error } = await dq.maybeSingle();

  if (error) {
    console.error("[draft-stops/[draft_id] GET] supabase error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!row?.doc) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = row.doc as any;

  const stop = {
    stop_id: String(d.tracking_id ?? d.draft_id ?? ""),
    stop_type: d.stop_type ?? "delivery",
    status: d.status ?? "draft",
    order_ref: null,
    total_price: Number(d.pricing_info?.total_price ?? 0),
    created_at: isoOf(d.created_at),
    recipient: {
      name: d.recipient_name ?? "",
      phone: d.recipient_phone ?? "",
      email: d.contact_info?.email ?? "",
      dob: d.recipient_dob ?? null,
    },
    address: {
      street: d.delivery_info?.delivery_address ?? "",
      city: d.delivery_info?.delivery_city ?? "",
      state: d.delivery_info?.delivery_state ?? "FL",
      zip: d.delivery_info?.delivery_zip ?? "",
      gate_code: d.delivery_info?.gate_code ?? "",
      drop_preference: d.delivery_info?.drop_preference ?? "",
    },
    package: {
      type: d.service_info?.package_type ?? "rx",
      rx_number: d.service_info?.rx_number ?? "",
      dp_note: d.service_info?.dp_note ?? "",
      notes: d.service_info?.notes ?? "",
      cold_chain: Boolean(d.delivery_requirements?.cold_chain),
      requires_signature: Boolean(d.delivery_requirements?.requires_signature),
      weight_oz: Number(d.service_info?.weight_oz ?? 8),
      length_in: Number(d.service_info?.length_in ?? 10),
      width_in: Number(d.service_info?.width_in ?? 7),
      height_in: Number(d.service_info?.height_in ?? 2),
    },
    service: {
      // Normalize: any legacy "nextday" / missing type returns "local" so the UI
      // Service Type <Select> (whose option values are local / same_day / express
      // / return) always has a matching option.
      type: ((): string => {
        const raw = d.service_info?.service_type ?? (d.delivery_info?.is_same_day ? "same_day" : "local");
        return raw === "nextday" ? "local" : raw;
      })(),
      date: d.delivery_info?.delivery_date ?? null,
      collect_payment: Boolean(d.delivery_requirements?.collect_cod),
      cod_amount: Number(d.delivery_requirements?.collect_amount ?? 0),
      return_to_sender: Boolean(d.delivery_requirements?.return_to_sender),
    },
    assignment: { driver_name: null, route_title: null, eta_at: null },
    rates: { ups: null, usps: null, fedex: null, selected: null },
    photos: Array.isArray(d.photos) ? d.photos : [],
    internal_notes: Array.isArray(d.internal_notes) ? d.internal_notes : [],
    // Hybrid-OCR (Phase 1): canonical order-id array (rx_number mirrors it).
    order_ids: Array.isArray(d.order_ids) ? d.order_ids : [],
  };

  return NextResponse.json({ stop });
}
