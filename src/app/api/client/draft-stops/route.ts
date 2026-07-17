import { BRAND_PRIMARY } from "@/lib/brand";
import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requirePagePermission } from "@/lib/tenant";

// jsonb stores Mongo Dates as ISO strings. Older docs migrated via ETL may also
// carry real Date objects in memory. isoOf normalizes both to an ISO string and
// never silently substitutes `now` for an existing value.
const isoOf = (v: unknown): string =>
  typeof v === "string"
    ? v
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      v && typeof (v as any).toISOString === "function"
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (v as any).toISOString()
      : new Date().toISOString();

// ── GET /api/client/draft-stops ───────────────────────────────────────────────
export async function GET(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const tenantId = Number(ctx.tenantId);
  // Admin cross-tenant: "all" scope drops the per-tenant filter.
  const scopeAll = ctx.isAdmin && ctx.tenantScope === "all";
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Number(searchParams.get("limit") ?? "100");

  let query = supabase.from("draft_stops").select("doc");
  if (!scopeAll) query = query.eq("tenant_id", tenantId);
  if (status && status !== "all") query = query.eq("status", status);
  query = query.order("created_at", { ascending: false }).limit(limit);

  const { data: rows, error } = await query;
  if (error) {
    console.error("[draft-stops GET] supabase error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const drafts = (rows ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (r as { doc: any }).doc ?? {};
    return {
      id: d.draft_id,
      draft_id: d.draft_id,
      tracking_id: d.tracking_id ?? null,
      status: d.status,
      pickup_address: d.pickup_info?.pickup_address ?? "",
      pickup_location_id: d.pickup_info?.pickup_location_id ?? "",
      pickup_name: d.pickup_info?.pickup_name ?? "",
      pickup_lat: d.pickup_info?.lat ?? null,
      pickup_lng: d.pickup_info?.lng ?? null,
      delivery_address: d.delivery_info?.delivery_address ?? "",
      delivery_city: d.delivery_info?.delivery_city ?? "",
      delivery_state: d.delivery_info?.delivery_state ?? "FL",
      delivery_zip: d.delivery_info?.delivery_zip ?? "",
      delivery_lat: d.delivery_info?.lat ?? null,
      delivery_lng: d.delivery_info?.lng ?? null,
      recipient_name: d.recipient_name ?? "",
      recipient_phone: d.recipient_phone ?? "",
      package_type: d.service_info?.package_type ?? "rx",
      requires_signature: d.delivery_requirements?.requires_signature ?? false,
      cold_chain: d.delivery_requirements?.cold_chain ?? false,
      internal_package: d.delivery_requirements?.internal_package ?? false,
      collect_cod: d.delivery_requirements?.collect_cod ?? false,
      collect_amount: d.delivery_requirements?.collect_amount ?? null,
      is_same_day: d.delivery_info?.is_same_day ?? false,
      delivery_date: d.delivery_info?.delivery_date ?? null,
      notes: d.service_info?.notes ?? null,
      estimated_miles: d.pricing_info?.distance_miles ?? null,
      estimated_cost: d.pricing_info?.total_price ?? null,
      photos: d.photos ?? [],
      payment_type: d.payment_info?.payment_type ?? null,
      payment_status: d.payment_info?.payment_status ?? null,
      created_at: isoOf(d.created_at),
      updated_at: isoOf(d.updated_at),
    };
  });

  return NextResponse.json({ drafts, total: drafts.length });
}

// ── POST /api/client/draft-stops ──────────────────────────────────────────────
export async function POST(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Admin in "All tenants" scope has no target tenant — a draft can't be created
  // without a real tenant. Ask them to pick one in the header selector.
  if (ctx.isAdmin && (!Number.isFinite(Number(ctx.tenantId)) || Number(ctx.tenantId) <= 0)) {
    return NextResponse.json(
      { ok: false, error: "Select a specific tenant (top-right selector) before creating a draft." },
      { status: 400 },
    );
  }
  const body = await request.json();

  // Fail-closed: a draft MUST have a complete delivery address. Even when Google
  // validated once, a missing part (especially ZIP) fails downstream and the stop
  // can't be routed. Reject server-side so a malformed address can never persist,
  // even if the client check is bypassed.
  const dAddr = String(body.delivery_address ?? "").trim();
  const dCity = String(body.delivery_city ?? "").trim();
  const dState = String(body.delivery_state ?? "").trim();
  const dZip = String(body.delivery_zip ?? "").trim();
  const missing = [!dAddr && "street address", !dCity && "city", !dState && "state", !dZip && "zip code"].filter(
    Boolean,
  );
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Incomplete delivery address — missing ${missing.join(", ")}.` },
      { status: 422 },
    );
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const isCourtesy = Boolean(body.is_courtesy);
  const totalPrice = Number(body.total_price ?? 0);
  const doc = {
    draft_id: String(body.draft_id ?? ""),
    tracking_id: String(body.tracking_id ?? ""),
    tenant_id: Number(ctx.tenantId),
    status: "draft" as const,
    // Links this draft back to the OCR/IVY scan that created it (ocr_scans).
    scan_id: String(body.scan_id ?? "") || null,
    recipient_name: (body.recipient_name ?? "").trim().toUpperCase(),
    recipient_phone: (body.recipient_phone ?? "").replace(/\D/g, ""),
    // Hybrid-OCR AI path (Phase 1): DOB + canonical order-id array (rx_number
    // in service_info mirrors them as a display string — storage Option B).
    recipient_dob: /^\d{2}\/\d{2}\/\d{4}$/.test(String(body.recipient_dob ?? "")) ? String(body.recipient_dob) : null,
    order_ids: Array.isArray(body.order_ids)
      ? body.order_ids.map((v: unknown) => String(v).trim()).filter((v: string) => /^\d{7}-\d{2}$/.test(v))
      : [],
    contact_info: { email: (body.recipient_email ?? "").trim().toLowerCase() || null },
    pickup_info: {
      pickup_location_id: String(body.pickup_location_id ?? ""),
      pickup_name: (body.pickup_name ?? "").trim().toUpperCase(),
      pickup_address: (body.pickup_address ?? "").trim().toUpperCase(),
      // Address breakdown (added to align with delivery_info schema)
      city: (body.pickup_city ?? "").trim().toUpperCase(),
      state: (body.pickup_state ?? "FL").trim().toUpperCase(),
      zip: String(body.pickup_zip ?? "").trim(),
      // Short operational code (e.g. DFB, GRN) — optional
      code: body.pickup_code ? String(body.pickup_code).trim().toUpperCase() : "",
    },
    delivery_info: {
      delivery_address: (body.delivery_address ?? "").trim().toUpperCase(),
      delivery_city: (body.delivery_city ?? "").trim().toUpperCase(),
      delivery_state: (body.delivery_state ?? "FL").trim().toUpperCase(),
      delivery_zip: String(body.delivery_zip ?? "").trim(),
      apt_unit: (body.apt_unit ?? "").trim() || null,
      gate_code: (body.gate_code ?? "").trim() || null,
      delivery_date: body.delivery_date ?? null,
      is_same_day: Boolean(body.is_same_day),
      dropoff_instructions: Array.isArray(body.dropoff_instructions) ? body.dropoff_instructions : [],
      address_verified: body.address_verified === false ? false : true,
    },
    service_info: {
      service_type: body.service_type ?? (body.is_same_day ? "same_day" : "local"),
      package_type: body.package_type ?? "rx",
      notes: (body.notes ?? "").trim() || null,
      rx_number: (body.rx_number ?? "").trim() || null,
    },
    delivery_requirements: {
      requires_signature: Boolean(body.requires_signature),
      cold_chain: Boolean(body.cold_chain),
      collect_cod: Boolean(body.collect_cod),
      collect_amount: body.collect_cod ? parseFloat(String(body.collect_amount ?? "0").replace(/,/g, "")) : null,
      internal_package: Boolean(body.internal_package),
    },
    pricing_info: {
      price_per_stop: Number(body.price_per_stop ?? 0),
      price_per_mile: Number(body.price_per_mile ?? 0),
      xpress_base_fee: Number(body.xpress_base_fee ?? 0),
      xpress_per_mile: Number(body.xpress_per_mile ?? 0),
      distance_miles: body.distance_miles != null ? Number(body.distance_miles) : null,
      total_price: totalPrice,
      is_courtesy: isCourtesy,
      courtesy_credit: Number(body.courtesy_credit ?? 0),
      net_price: totalPrice,
    },
    payment_info: {
      payment_type: null as string | null,
      payment_status: "pending",
      stripe_payment_intent_id: null as string | null,
    },
    photos: Array.isArray(body.photos) ? body.photos : [],
    photo_count: Array.isArray(body.photos) ? body.photos.length : 0,
    clerk_user_id: ctx.userId ?? "",
    source: "client_portal",
    // Member-system Phase 5: structured actor (seed for the audit timeline's
    // "who"). The TENANT owns the draft; created_by records which owner/member
    // created it.
    created_by: {
      type: ctx.role === "member" ? "tenant_member" : "tenant_owner",
      clerk_user_id: ctx.userId,
      name:
        [ctx.user?.firstName, ctx.user?.lastName].filter(Boolean).join(" ") ||
        ctx.user?.emailAddresses?.[0]?.emailAddress ||
        "",
      tenant_role: ctx.role,
    },
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    approved_at: null as string | null,
    dispatched_at: null as string | null,
  };

  // Hybrid table: promoted columns the app queries/sorts on + the full doc.
  const { error } = await supabase.from("draft_stops").insert({
    draft_id: doc.draft_id,
    tenant_id: doc.tenant_id,
    status: doc.status,
    tracking_id: doc.tracking_id || null,
    doc,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  });

  if (error) {
    console.error("[draft-stops POST]", error);
    return NextResponse.json({ ok: false, error: String(error.message ?? error) }, { status: 500 });
  }

  // Link the originating scan → this draft (ocr_scans). Fire-and-forget.
  if (doc.scan_id) {
    void supabase
      .from("ocr_scans")
      .update({ draft_id: doc.draft_id, linked_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("scan_id", doc.scan_id)
      .eq("tenant_id", doc.tenant_id)
      .then(({ error: linkErr }) => {
        if (linkErr) console.error("[ocr_scans link draft]", linkErr.message);
      });
  }

  return NextResponse.json({ ok: true, inserted_id: doc.draft_id, draft_id: doc.draft_id });
}

// ── PATCH /api/client/draft-stops ─────────────────────────────────────────────
export async function PATCH(request: Request) {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { draft_id, ...updates } = body;
  if (!draft_id) return NextResponse.json({ error: "draft_id required" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  // Admin cross-tenant: operate as the DRAFT's real tenant (not the current
  // header scope) so any tenant's draft can be edited/approved and the
  // downstream isolation + charging stay correct.
  let tenantId = Number(ctx.tenantId);
  if (ctx.isAdmin) {
    const { data: owner } = await supabase
      .from("draft_stops")
      .select("tenant_id")
      .eq("draft_id", draft_id)
      .maybeSingle();
    if (owner?.tenant_id != null) tenantId = Number(owner.tenant_id);
  }
  const now = new Date();
  const nowIso = now.toISOString();

  // Read-modify-write: Mongo used dot-notation $set into nested fields; with
  // jsonb the clean equivalent is to load the doc, mutate the JS object, and
  // write it back whole. Dataset is tiny so this is simpler and exact.
  const { data: existing, error: fetchErr } = await supabase
    .from("draft_stops")
    .select("doc")
    .eq("draft_id", draft_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[draft-stops PATCH] fetch error:", fetchErr);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
  // Tenant-scoped match: no row means either no such draft for this tenant or
  // another tenant owns that id — both surface as 404 (never a silent success).
  if (!existing?.doc) {
    return NextResponse.json({ ok: false, error: "Draft not found", draft_id }, { status: 404 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = existing.doc as any;
  doc.payment_info ??= {};
  doc.contact_info ??= {};
  doc.pickup_info ??= {};
  doc.delivery_info ??= {};
  doc.service_info ??= {};
  doc.delivery_requirements ??= {};

  // ── status / tracking / payment transitions ──
  if (updates.status) doc.status = updates.status;
  if (updates.tracking_id) doc.tracking_id = updates.tracking_id;
  if (updates.payment_type) doc.payment_info.payment_type = updates.payment_type;
  if (updates.payment_status) doc.payment_info.payment_status = updates.payment_status;
  if (updates.stripe_payment_intent_id) doc.payment_info.stripe_payment_intent_id = updates.stripe_payment_intent_id;
  if (updates.status === "approved" || updates.status === "paid") doc.approved_at = nowIso;

  // ── Draft detail edits — flat top-level fields (DraftStopPanel-style payloads) ──
  if ("recipient_name" in updates)
    doc.recipient_name = String(updates.recipient_name ?? "")
      .trim()
      .toUpperCase();
  if ("recipient_phone" in updates) doc.recipient_phone = String(updates.recipient_phone ?? "").replace(/\D/g, "");
  if ("recipient_email" in updates) doc.contact_info.email = updates.recipient_email ?? null;
  if ("pickup_address" in updates)
    doc.pickup_info.pickup_address = String(updates.pickup_address ?? "")
      .trim()
      .toUpperCase();
  if ("pickup_location_id" in updates) doc.pickup_info.pickup_location_id = String(updates.pickup_location_id ?? "");
  if ("pickup_name" in updates)
    doc.pickup_info.pickup_name = String(updates.pickup_name ?? "")
      .trim()
      .toUpperCase();
  if ("pickup_city" in updates)
    doc.pickup_info.city = String(updates.pickup_city ?? "")
      .trim()
      .toUpperCase();
  if ("pickup_state" in updates)
    doc.pickup_info.state = String(updates.pickup_state ?? "FL")
      .trim()
      .toUpperCase();
  if ("pickup_zip" in updates) doc.pickup_info.zip = String(updates.pickup_zip ?? "").trim();
  if ("pickup_code" in updates)
    doc.pickup_info.code = updates.pickup_code ? String(updates.pickup_code).trim().toUpperCase() : "";
  if ("delivery_address" in updates)
    doc.delivery_info.delivery_address = String(updates.delivery_address ?? "")
      .trim()
      .toUpperCase();
  if ("delivery_city" in updates)
    doc.delivery_info.delivery_city = String(updates.delivery_city ?? "")
      .trim()
      .toUpperCase();
  if ("delivery_state" in updates)
    doc.delivery_info.delivery_state = String(updates.delivery_state ?? "FL")
      .trim()
      .toUpperCase();
  if ("delivery_zip" in updates) doc.delivery_info.delivery_zip = String(updates.delivery_zip ?? "");
  if ("delivery_date" in updates) doc.delivery_info.delivery_date = updates.delivery_date ?? null;
  if ("is_same_day" in updates) doc.delivery_info.is_same_day = Boolean(updates.is_same_day);
  if ("package_type" in updates) doc.service_info.package_type = updates.package_type;
  if ("notes" in updates) doc.service_info.notes = updates.notes ?? null;
  if ("stop_type" in updates) doc.stop_type = updates.stop_type;

  // ── Draft detail edits — nested section payloads (StopDetailPanel scheduleAutoSave) ──
  const rec = updates.recipient as Record<string, unknown> | undefined;
  if (rec && typeof rec === "object") {
    if ("name" in rec)
      doc.recipient_name = String(rec.name ?? "")
        .trim()
        .toUpperCase();
    if ("phone" in rec) doc.recipient_phone = String(rec.phone ?? "").replace(/\D/g, "");
    if ("email" in rec) doc.contact_info.email = rec.email ?? null;
    if ("dob" in rec) doc.recipient_dob = rec.dob ?? null;
  }
  const addr = updates.address as Record<string, unknown> | undefined;
  if (addr && typeof addr === "object") {
    if ("street" in addr)
      doc.delivery_info.delivery_address = String(addr.street ?? "")
        .trim()
        .toUpperCase();
    if ("city" in addr)
      doc.delivery_info.delivery_city = String(addr.city ?? "")
        .trim()
        .toUpperCase();
    if ("state" in addr)
      doc.delivery_info.delivery_state = String(addr.state ?? "FL")
        .trim()
        .toUpperCase();
    if ("zip" in addr) doc.delivery_info.delivery_zip = String(addr.zip ?? "");
    if ("gate_code" in addr) doc.delivery_info.gate_code = addr.gate_code ?? null;
    if ("drop_preference" in addr) doc.delivery_info.drop_preference = addr.drop_preference ?? null;
  }
  const pkg = updates.package as Record<string, unknown> | undefined;
  if (pkg && typeof pkg === "object") {
    if ("type" in pkg) doc.service_info.package_type = pkg.type;
    if ("notes" in pkg) doc.service_info.notes = pkg.notes ?? null;
    if ("rx_number" in pkg) doc.service_info.rx_number = pkg.rx_number ?? null;
    if ("dp_note" in pkg) doc.service_info.dp_note = pkg.dp_note ?? null;
    if ("cold_chain" in pkg) doc.delivery_requirements.cold_chain = Boolean(pkg.cold_chain);
    if ("requires_signature" in pkg) doc.delivery_requirements.requires_signature = Boolean(pkg.requires_signature);
    if ("internal_package" in pkg) doc.delivery_requirements.internal_package = Boolean(pkg.internal_package);
    if ("weight_oz" in pkg) doc.service_info.weight_oz = Number(pkg.weight_oz) || 8;
    if ("length_in" in pkg) doc.service_info.length_in = Number(pkg.length_in) || 10;
    if ("width_in" in pkg) doc.service_info.width_in = Number(pkg.width_in) || 7;
    if ("height_in" in pkg) doc.service_info.height_in = Number(pkg.height_in) || 2;
  }
  const svc = updates.service as Record<string, unknown> | undefined;
  if (svc && typeof svc === "object") {
    if ("type" in svc) {
      doc.service_info.service_type = svc.type;
      doc.delivery_info.is_same_day = svc.type === "same_day";
    }
    if ("date" in svc) doc.delivery_info.delivery_date = svc.date ?? null;
    if ("collect_payment" in svc) doc.delivery_requirements.collect_cod = Boolean(svc.collect_payment);
    if ("cod_amount" in svc) {
      const n = parseFloat(String(svc.cod_amount ?? 0).replace(/,/g, ""));
      doc.delivery_requirements.collect_amount = isFinite(n) && n > 0 ? n : null;
    }
    if ("return_to_sender" in svc) doc.delivery_requirements.return_to_sender = Boolean(svc.return_to_sender);
  }

  doc.updated_at = nowIso;

  // Persist the mutated doc + promoted columns the app filters on.
  const { error: updErr } = await supabase
    .from("draft_stops")
    .update({ doc, status: doc.status, tracking_id: doc.tracking_id ?? null, updated_at: nowIso })
    .eq("draft_id", draft_id)
    .eq("tenant_id", tenantId);
  if (updErr) {
    console.error("[draft-stops PATCH] update error:", updErr);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }

  // ── Side effect: postpay approval accrues to tenant outstanding balance ──
  if (updates.status === "approved" && updates.payment_type === "postpay") {
    const tp = Number(updates.total_price ?? 0);
    if (tp > 0) {
      try {
        const { data: tRow } = await supabase
          .from("tenants")
          .select("outstanding_amount")
          .eq("tenant_id", tenantId)
          .maybeSingle();
        const current = Number(tRow?.outstanding_amount ?? 0);
        await supabase.from("tenants").update({ outstanding_amount: current + tp }).eq("tenant_id", tenantId);
      } catch (e) {
        console.error("[tenant outstanding]", e);
      }
    }
  }

  // ── Side effect: on submit (tracking_id set) copy photos + notes, email client ──
  if (updates.tracking_id) {
    const stopId = String(updates.tracking_id);

    // Link the originating scan → this stop (ocr_scans). Fire-and-forget.
    const scanId = typeof doc.scan_id === "string" ? doc.scan_id : "";
    if (scanId) {
      void supabase
        .from("ocr_scans")
        .update({ stop_id: stopId, updated_at: nowIso })
        .eq("scan_id", scanId)
        .eq("tenant_id", tenantId)
        .then(({ error: linkErr }) => {
          if (linkErr) console.error("[ocr_scans link stop]", linkErr.message);
        });
    }

    const photos: string[] = Array.isArray(doc.photos) ? doc.photos : [];
    const draftNotes: unknown[] = Array.isArray(doc.internal_notes) ? doc.internal_notes : [];

    if (photos.length > 0) {
      try {
        await supabase.from("stop_photos").insert(
          photos.map((url: string) => ({
            stop_id: stopId,
            draft_id,
            tenant_id: tenantId,
            public_url: url,
            uploaded_at: nowIso,
          })),
        );
      } catch (e) {
        console.error("[stop_photos]", e);
      }
    }

    if (draftNotes.length > 0) {
      // Best-effort: the real stop may still be created in Mongo by FastAPI, so
      // it may not exist in Supabase yet — then this is a no-op (same as Mongo's
      // updateOne matching nothing). Resolves fully once FastAPI moves over.
      try {
        const { data: stopRow } = await supabase
          .from("stops")
          .select("doc")
          .eq("stop_id", stopId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sdoc = (stopRow as { doc: any } | null)?.doc;
        if (sdoc) {
          const existingNotes = Array.isArray(sdoc.internal_notes) ? sdoc.internal_notes : [];
          sdoc.internal_notes = [...existingNotes, ...draftNotes];
          await supabase.from("stops").update({ doc: sdoc }).eq("stop_id", stopId).eq("tenant_id", tenantId);
        }
      } catch (e) {
        console.error("[draft notes copy]", e);
      }
    }

    const resendKey = process.env.RESEND_API_KEY;
    const clientEmail = ctx.user?.emailAddresses?.[0]?.emailAddress;
    if (resendKey && clientEmail) {
      const recipientName = String(doc.recipient_name ?? "").trim();
      const address = String(doc.delivery_info?.delivery_address ?? "").trim();
      const city = String(doc.delivery_info?.delivery_city ?? "").trim();
      const deliveryDate = String(doc.delivery_info?.delivery_date ?? "");
      const isXpress = Boolean(doc.delivery_info?.is_same_day);
      const total = Number(doc.pricing_info?.total_price ?? 0);
      const formattedDate = deliveryDate
        ? new Date(`${deliveryDate}T12:00:00`).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })
        : "Tomorrow";
      const serviceLabel = isXpress ? "⚡ Xpress Priority" : "📅 Next Day";
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td align="center" style="padding-bottom:20px"><span style="font-size:22px;font-weight:800;color:${BRAND_PRIMARY}">Routely</span><span style="font-size:13px;color:#6b7280;margin-left:6px">Medical Courier</span></td></tr><tr><td style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)"><table width="100%"><tr><td style="background:${BRAND_PRIMARY};padding:28px 32px"><p style="margin:0;font-size:12px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.5px">Delivery Confirmed</p><p style="margin:6px 0 0;font-size:28px;font-weight:800;color:#fff;font-family:monospace;letter-spacing:1px">${stopId}</p></td></tr></table><table width="100%" style="padding:28px 32px"><tr><td style="padding-bottom:20px;font-size:15px;color:#374151">Your stop has been <strong>confirmed and dispatched</strong>.</td></tr><tr><td style="background:#f9fafb;border-radius:10px;padding:20px"><table width="100%"><tr><td style="font-size:13px;color:#6b7280;padding:5px 0;width:45%">📦 Recipient</td><td style="font-size:13px;color:#111827;font-weight:600;text-align:right">${recipientName || "—"}</td></tr><tr><td style="font-size:13px;color:#6b7280;padding:5px 0">📍 Address</td><td style="font-size:13px;color:#111827;font-weight:600;text-align:right">${address}${city ? `, ${city}` : ""}</td></tr><tr><td style="font-size:13px;color:#6b7280;padding:5px 0">📅 Delivery</td><td style="font-size:13px;color:#111827;font-weight:600;text-align:right">${formattedDate}</td></tr><tr><td style="font-size:13px;color:#6b7280;padding:5px 0">🚀 Service</td><td style="font-size:13px;color:#111827;font-weight:600;text-align:right">${serviceLabel}</td></tr>${total > 0 ? `<tr><td style="font-size:13px;color:#6b7280;padding:5px 0">💰 Total</td><td style="font-size:13px;color:#111827;font-weight:600;text-align:right">$${total.toFixed(2)}</td></tr>` : ""}</table></td></tr><tr><td style="padding-top:20px;font-size:13px;color:#6b7280">Questions? <a href="mailto:support@routelypro.com" style="color:${BRAND_PRIMARY}">support@routelypro.com</a></td></tr></table></td></tr></table></td></tr></table></body></html>`;
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: "Routely <dispatch@routelypro.com>",
            to: [clientEmail],
            subject: `✅ Stop Confirmed — ${stopId}`,
            html,
          }),
        });
      } catch (e) {
        console.error("[Resend]", e);
      }
    }
  }

  // ── Side effect: usage_events status mirror on approve/pay ──
  const finalStatus = updates.status;
  if (finalStatus === "approved" || finalStatus === "paid") {
    try {
      const ueStatus = finalStatus === "paid" ? "paid" : "approved";
      const { data: ueRows } = await supabase
        .from("usage_events")
        .select("doc")
        .eq("event_type", "delivery")
        .filter("doc->>draft_id", "eq", draft_id)
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ueDoc = (ueRows?.[0] as { doc: any } | undefined)?.doc;
      if (ueDoc) {
        ueDoc.status = ueStatus;
        ueDoc.payment_type = updates.payment_type ?? null;
        ueDoc.updated_at = nowIso;
        if (updates.tracking_id) ueDoc.stop_id = String(updates.tracking_id);
        await supabase
          .from("usage_events")
          .update({
            status: ueStatus,
            doc: ueDoc,
            updated_at: nowIso,
            ...(updates.tracking_id ? { stop_id: String(updates.tracking_id) } : {}),
          })
          .eq("event_type", "delivery")
          .filter("doc->>draft_id", "eq", draft_id);
      }
    } catch (e) {
      console.error("[usage_events] delivery status update failed:", e);
    }
  }

  return NextResponse.json({ ok: true, draft_id });
}
