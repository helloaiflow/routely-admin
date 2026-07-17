import { NextResponse } from "next/server";

import { logExternalCall } from "@/lib/api-log";
import { fireN8nBackup, type OrderBody } from "@/lib/create-order";
import { getDb, requirePagePermission } from "@/lib/tenant";

// Member-system Phase 5: the actor reference stamped on created stops.
// The TENANT owns the order (tenant_id); the actor is WHO created it — the
// seed for the future audit timeline's "who". Stored additively on the
// canonical stops docs AFTER FastAPI creates them (FastAPI contract untouched).
type StopActor = {
  type: "tenant_owner" | "tenant_member";
  clerk_user_id: string;
  name: string;
  tenant_role: string;
};

// IMPORTANT: This Next route is intentionally a thin pass-through.
// FastAPI (routely-api on the VPS) is the SOLE creator of:
//   - delivery stop_id (RTL-xxxx)
//   - pickup stop_id (RTL-xxxx)   ← for Case A (Normal Pickup)
//   - order_ref (JOB-YYYYMMDD-XXXX)
//   - tracking_pool reservation
//   - Spoke creation + Spoke response persistence
// Next forwards the manual-intake payload + idempotency key (created_from_draft_id)
// and passes the FastAPI response through to the frontend.

const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const FASTAPI_SECRET = process.env.ROUTELY_API_SECRET ?? "";
// Server-only secret for internal callers that need to bypass Clerk
// (n8n workflows, cron jobs, etc.). Browsers can NEVER spoof this
// because the secret is held only on the server. Set in Vercel env.
const INTERNAL_SECRET = process.env.ROUTELY_INTERNAL_SECRET ?? "";

export async function POST(request: Request) {
  const body = (await request.json()) as OrderBody;

  // Internal bypass: only granted to server-side callers that present a
  // shared secret in `x-routely-internal-secret`. The old `x-internal: 1`
  // header trust let any browser send `tenant_id` and create orders for
  // any tenant — removed entirely. If INTERNAL_SECRET is empty/unset on
  // this deployment, the bypass is effectively disabled (always fails).
  const providedSecret = request.headers.get("x-routely-internal-secret") ?? "";
  const isInternal = INTERNAL_SECRET.length > 0 && providedSecret === INTERNAL_SECRET;

  let tenantId: number;
  let actor: StopActor | null = null;
  if (isInternal) {
    const requested = Number(body.tenant_id);
    if (!Number.isFinite(requested) || requested <= 0) {
      return NextResponse.json({ error: "tenant_id required for internal calls" }, { status: 400 });
    }
    tenantId = requested;
    // Internal callers (n8n, cron) are system actors — no member to record.
  } else {
    const ctx = await requirePagePermission("orders");
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    tenantId = ctx.tenantId;
    actor = {
      type: ctx.role === "member" ? "tenant_member" : "tenant_owner",
      clerk_user_id: ctx.userId,
      name:
        [ctx.user?.firstName, ctx.user?.lastName].filter(Boolean).join(" ") ||
        ctx.user?.emailAddresses?.[0]?.emailAddress ||
        "",
      tenant_role: ctx.role,
    };
  }

  // Required field validation before hitting FastAPI
  const recipientName = String(body.recipient_name ?? "").trim();
  const deliveryAddr = String(body.delivery_address ?? "").trim();
  const deliveryCity = String(body.delivery_city ?? "").trim();
  const deliveryState = String(body.delivery_state ?? "FL").trim();
  const deliveryZip = String(body.delivery_zip ?? "").trim();
  const pickupAddr = String(body.pickup_address ?? "").trim();
  const packageType = String(body.package_type ?? "rx");
  const recipientPhone = String(body.recipient_phone ?? "").replace(/\D/g, "");
  const recipientEmail = String(body.recipient_email ?? "").trim() || null;

  // DropOff signals — frontend sends stop_type:"dropoff" + nested
  // pickup.location_id:"dropoff" + pickup_location_id:"dropoff". Forward
  // every form so FastAPI's DropOff detection fires regardless of which
  // shape its current contract reads.
  const stopType = String(body.stop_type ?? "delivery")
    .trim()
    .toLowerCase();
  const pickupLocationId = String(body.pickup_location_id ?? body.pickup?.location_id ?? "").trim();
  const pickupName = String(body.pickup_name ?? body.pickup?.name ?? "").trim();
  const isDropoff = stopType === "dropoff" || pickupLocationId === "dropoff";

  if (!recipientName) return NextResponse.json({ ok: false, error: "Recipient name is required" }, { status: 400 });
  if (!deliveryAddr) return NextResponse.json({ ok: false, error: "Delivery address is required" }, { status: 400 });
  if (!deliveryCity) return NextResponse.json({ ok: false, error: "Delivery city is required" }, { status: 400 });
  if (!deliveryZip) return NextResponse.json({ ok: false, error: "Delivery zip code is required" }, { status: 400 });

  try {
    // FastAPI expects nested objects — confirmed working with 200 response
    const fastapiRes = await fetch(`${FASTAPI_BASE}/v1/stops/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FASTAPI_SECRET,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        recipient: {
          name: recipientName.toUpperCase(),
          phone: recipientPhone || null,
          email: recipientEmail,
          street: deliveryAddr.toUpperCase(),
          city: deliveryCity.toUpperCase(),
          state: deliveryState.toUpperCase(),
          zip: deliveryZip,
        },
        package: {
          type: packageType,
          notes: String(body.notes ?? "").trim() || null,
        },
        delivery: {
          address: deliveryAddr.toUpperCase(),
          city: deliveryCity.toUpperCase(),
          state: deliveryState.toUpperCase(),
          zip: deliveryZip,
        },
        pickup_address: pickupAddr.toUpperCase(),
        // DropOff signals — forwarded so FastAPI's paired-stops orchestrator
        // skips pickup-sibling creation. Three forms, all preferred by the
        // backend contract (preferred + alternative + flat fallback):
        //   1. stop_type:"dropoff"
        //   2. pickup:{location_id:"dropoff"}
        //   3. pickup_location_id:"dropoff"
        // For normal pickup we still forward stop_type so the user's
        // delivery/pickup/return choice persists.
        stop_type: stopType,
        pickup: isDropoff
          ? { location_id: "dropoff", name: "DropOff", address: "" }
          : pickupLocationId || pickupName
            ? {
                location_id: pickupLocationId || undefined,
                name: pickupName || undefined,
                address: pickupAddr || undefined,
                city: String(body.pickup_city ?? "") || undefined,
                state: String(body.pickup_state ?? "") || undefined,
                zip: String(body.pickup_zip ?? "") || undefined,
                code: String(body.pickup_code ?? "") || undefined,
              }
            : undefined,
        pickup_location_id: isDropoff ? "dropoff" : pickupLocationId || undefined,
        pickup_name: isDropoff ? "DropOff" : pickupName || undefined,
        payment_status: String(body.payment_status ?? "paid"),
        total_amount: Number(body.total_amount ?? 0),
        source: "client_portal",
        gate_code: String(body.gate_code ?? "").trim() || null,
        requires_signature: Boolean(body.requires_signature),
        collect_cod: Boolean(body.collect_cod),
        collect_amount: String(body.collect_amount ?? "0"),
        delivery_type: String(body.delivery_type ?? "next_day"),
        delivery_date: String(body.delivery_date ?? "").trim() || null,
        rx_number: String(body.rx_number ?? "").trim() || null,
        // Forward preprinted RTL to FastAPI when provided. When absent,
        // FastAPI generates its own delivery stop_id.
        tracking_id: (body as Record<string, unknown>).tracking_id
          ? String((body as Record<string, unknown>).tracking_id)
          : undefined,
        // Idempotency key — FastAPI uses (tenant_id, created_from_draft_id,
        // stop_type) to dedupe pickup + delivery siblings on retry.
        created_from_draft_id: (body as Record<string, unknown>).created_from_draft_id
          ? String((body as Record<string, unknown>).created_from_draft_id)
          : undefined,
      }),
    });

    if (!fastapiRes.ok) {
      const errText = await fastapiRes.text().catch(() => "");
      console.error("[orders/create] FastAPI error:", fastapiRes.status, errText);
      throw new Error(`FastAPI ${fastapiRes.status}: ${errText.slice(0, 300)}`);
    }

    const data = (await fastapiRes.json()) as Record<string, unknown>;
    const deliveryStopId = String(data.stop_id ?? "");
    // FastAPI returns the pickup leg's id NESTED at pickup.stop_id (there is
    // no top-level pickup_stop_id) — reading the wrong key here was why the
    // pickup leg never got its created_by stamp (KNOWN_ISSUES 2026-06-12).
    const pickupStopId =
      (data.pickup_stop_id as string | undefined) ??
      ((data.pickup as Record<string, unknown> | null)?.stop_id as string | undefined) ??
      null;
    console.log(
      "[orders/create] ✓ stop created:",
      deliveryStopId,
      "zone:",
      data.route_zone,
      "order_ref:",
      data.order_ref ?? null,
      "pickup_stop_id:",
      pickupStopId,
    );

    // Member-system Phase 5: stamp the actor on the canonical stops docs.
    // Additive annotation AFTER FastAPI created them — tenant-scoped, and
    // NEVER fatal: the order must not fail because the audit stamp did.
    if (actor) {
      const stopIds = [deliveryStopId, String(pickupStopId ?? "")].filter(Boolean);
      try {
        const db = await getDb();
        await db
          .collection("stops")
          .updateMany(
            { stop_id: { $in: stopIds }, tenant_id: tenantId },
            { $set: { created_by: { ...actor, source: "client_portal", stamped_at: new Date() } } },
          );
      } catch (stampErr) {
        console.error("[orders/create] created_by stamp failed (non-fatal):", stampErr);
      }
    }

    // ── GHOST GUARD — verify Spoke actually accepted before reporting success ──
    // FastAPI inserts the stops doc with status:"unassigned" (= "in Spoke" in the
    // UI) BEFORE posting to Spoke; if that POST fails/times out the doc is left
    // unassigned with NO assignment.spoke_stop_id → a ghost (Submitted in the UI,
    // absent from Spoke = a package no driver picks up). This is exactly what the
    // "verify Spoke accepted before trusting Mongo" rule exists to prevent.
    // Authoritative check: read the freshly-created doc's canonical spoke id
    // (FastAPI dispatch is synchronous, so it's committed before this response).
    // `data.spoke.posted` is a corroborating hint only.
    if (deliveryStopId) {
      // Read Spoke acceptance from FastAPI's AUTHORITATIVE response body — synchronous,
      // no race. FastAPI sets top-level status:"draft" iff the delivery leg genuinely
      // failed (not posted AND not skipped); the real Spoke id is at
      // data.delivery.spoke.stop_id. The old code read data.spoke.stop_id (a key that
      // does NOT exist → always undefined) and fell back to a findOne on the async
      // PG→Mongo mirror, which lags under STOPS_AUTHORITY=supabase and produced FALSE
      // "not accepted by Spoke" verdicts on stops Spoke actually accepted.
      const deliverySpoke =
        (((data.delivery as Record<string, unknown> | null) ?? null)?.spoke as
          | Record<string, unknown>
          | null) ?? null;
      const spokeStopId = (deliverySpoke?.stop_id as string | undefined) ?? null;
      const spokePosted = deliverySpoke?.posted === true;
      const spokeAccepted = String(data.status ?? "") !== "draft";
      // AUDIT: the Spoke create outcome relayed by FastAPI — provider=spoke,
      // ok=false only on a genuine ghost. Raw 4xx bodies live in FastAPI's logs.
      logExternalCall({
        provider: "spoke",
        operation: "spoke.create_stop.via_fastapi",
        method: "POST",
        status_code: spokeAccepted ? 200 : null,
        ok: spokeAccepted,
        error_message: spokeAccepted
          ? null
          : `spoke not confirmed by FastAPI${data.warning ? `: ${String(data.warning)}` : deliverySpoke ? `; delivery.spoke=${JSON.stringify(deliverySpoke).slice(0, 200)}` : ""}`,
        tenant_id: tenantId,
        actor: actor?.name ?? null,
        stop_id: deliveryStopId,
        draft_id: String((body as Record<string, unknown>).created_from_draft_id ?? "") || null,
      });
      if (!spokeAccepted) {
        // Genuine ghost (FastAPI already persisted status:"draft" + submit_error in
        // Postgres, the authority). Mirror to the Mongo doc so the current Mongo-reading
        // UI shows it in Drafts to retry — the reverse PG→Mongo mirror is not wired, so
        // this write keeps the UI honest for real ghosts. (Remove once client reads PG.)
        console.error("[orders/create] GHOST PREVENTED — Spoke unconfirmed for", deliveryStopId);
        try {
          const db = await getDb();
          await db.collection("stops").updateOne(
            { stop_id: deliveryStopId, tenant_id: tenantId },
            {
              $set: {
                status: "draft",
                submit_error: {
                  at: new Date(),
                  reason: "Dispatch (Spoke) did not confirm this stop",
                  spoke_status: null,
                  attempt_count: 1,
                },
                dispatch_status: "spoke_error",
                spoke_unconfirmed: true,
                updated_at: new Date(),
              },
            },
          );
        } catch (markErr) {
          console.error("[orders/create] ghost-guard mark failed:", markErr);
        }
        return NextResponse.json(
          {
            ok: false,
            error: "Spoke did not confirm this stop — saved as a draft to retry, not submitted.",
            dispatch_status: "spoke_unconfirmed",
            stop_id: deliveryStopId,
            tracking_number: deliveryStopId,
          },
          { status: 409 },
        );
      }
      // Accepted by Spoke (or intentionally skipped, e.g. on-demand).
      return NextResponse.json({
        ok: true,
        tracking_number: deliveryStopId,
        stop_id: deliveryStopId,
        spoke_stop_id: spokeStopId,
        route_zone: data.route_zone ?? null,
        dispatch_status: spokePosted ? "dispatched" : "ready",
        total_amount: Number(body.total_amount ?? 0),
        message: "Order created",
        order_ref: (data.order_ref as string | null) ?? null,
        pickup_stop_id: pickupStopId,
        tracking_reserved: Boolean(data.tracking_reserved),
      });
    }

    return NextResponse.json({
      ok: true,
      tracking_number: deliveryStopId,
      stop_id: deliveryStopId,
      route_zone: data.route_zone ?? null,
      dispatch_status: (data.spoke as Record<string, unknown>)?.posted ? "dispatched" : "ready",
      total_amount: Number(body.total_amount ?? 0),
      message: "Order created",
      // Pass-through fields from FastAPI's paired-stops response. FastAPI
      // populates these for Case A (Normal Pickup). For Case B (DropOff)
      // pickup_stop_id is null and only the delivery stop is created.
      order_ref: (data.order_ref as string | null) ?? null,
      pickup_stop_id: pickupStopId,
      tracking_reserved: Boolean(data.tracking_reserved),
    });
  } catch (err) {
    console.error("[orders/create] fatal:", err);
    // AUDIT: FastAPI unreachable / threw (includes the FastAPI non-2xx above).
    logExternalCall({
      provider: "spoke",
      operation: "spoke.create_stop.via_fastapi",
      method: "POST",
      ok: false,
      error_message: err instanceof Error ? err.message : String(err),
      tenant_id: tenantId,
      actor: actor?.name ?? null,
      draft_id: String((body as Record<string, unknown>).created_from_draft_id ?? "") || null,
    });
    try {
      await fireN8nBackup(tenantId, body);
      return NextResponse.json(
        { ok: false, error: "Primary failed — queued to backup.", dispatch_status: "backup_queued" },
        { status: 202 },
      );
    } catch {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "Order creation failed" },
        { status: 500 },
      );
    }
  }
}
