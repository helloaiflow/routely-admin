import { type NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { getSupabaseAdmin } from "@/lib/supabase";

// ── POST /api/webhooks/clerk ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const CLERK_WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET ?? "";
  const CLERK_SECRET_KEY     = process.env.CLERK_SECRET_KEY ?? "";

  const svix_id        = req.headers.get("svix-id");
  const svix_timestamp = req.headers.get("svix-timestamp");
  const svix_signature = req.headers.get("svix-signature");

  const body = await req.text();

  if (CLERK_WEBHOOK_SECRET && svix_id && svix_timestamp && svix_signature) {
    try {
      const wh = new Webhook(CLERK_WEBHOOK_SECRET);
      wh.verify(body, {
        "svix-id":        svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      });
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  try {
    const payload = JSON.parse(body);
    const { type, data } = payload;

    if (type !== "user.created") {
      return NextResponse.json({ received: true, skipped: true });
    }

    const supabase = getSupabaseAdmin();
    const email  = data.email_addresses?.[0]?.email_address?.toLowerCase() ?? "";
    const nowIso = new Date().toISOString();

    // ── Invitation-born MEMBER (member-system Phase 3, 2026-06-11) ──────────
    // Origin rule (CEO-locked): members never self-register — they only exist
    // via an owner's Clerk invitation, whose publicMetadata is stamped onto the
    // user at creation ({role:"tenant_user", tenant_id, tenant_role:"member"}).
    // A member must NEVER be provisioned a tenant of their own, so this branch
    // runs BEFORE any tenant lookup/creation.
    const bornMeta = (data.public_metadata ?? {}) as Record<string, unknown>;
    const memberTenantId = Number(bornMeta.tenant_id);
    if (bornMeta.tenant_role === "member" && Number.isFinite(memberTenantId) && memberTenantId > 0) {
      const memberName = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();

      // users row — insert only if this clerk_user_id doesn't exist yet.
      const { data: uExisting } = await supabase
        .from("users")
        .select("id")
        .eq("clerk_user_id", data.id)
        .maybeSingle();
      if (!uExisting) {
        await supabase.from("users").insert({
          clerk_user_id: data.id,
          email,
          name:          memberName,
          system_role:   "tenant_user",
          created_from:  "member_invite",
          created_at:    nowIso,
          doc: {
            clerk_user_id: data.id,
            email,
            name:          memberName,
            system_role:   "tenant_user",
            created_at:    nowIso,
            created_from:  "member_invite",
          },
        });
      }

      // Flip the pending row → active, swapping the "invite:<id>" placeholder
      // for the real clerk_user_id.
      const { data: flipped } = await supabase
        .from("tenant_members")
        .update({
          clerk_user_id:     data.id,
          active:            true,
          invitation_status: "accepted",
          accepted_at:       nowIso,
          updated_at:        nowIso,
        })
        .eq("tenant_id", memberTenantId)
        .eq("email", email)
        .eq("invitation_status", "pending")
        .select("id");

      if (!flipped || flipped.length === 0) {
        // Defensive: the metadata can only originate from our createInvitation,
        // so honor it even if the pending row is missing — orders-only perms,
        // flagged for review. Insert only if no row for this pair exists.
        const { data: fbExisting } = await supabase
          .from("tenant_members")
          .select("id")
          .eq("tenant_id", memberTenantId)
          .eq("clerk_user_id", data.id)
          .maybeSingle();
        if (!fbExisting) {
          await supabase.from("tenant_members").insert({
            tenant_id:         memberTenantId,
            clerk_user_id:     data.id,
            email,
            role:              "member",
            active:            true,
            invited_by:        null,
            invitation_status: "accepted",
            page_permissions:  { orders: true, billing: false, reports: false, settings: false },
            created_at:        nowIso,
            updated_at:        nowIso,
          });
        }
        notifyTelegram(`⚠️ <b>MEMBER ACCEPTED WITHOUT PENDING ROW</b>\n📧 ${email}\n🏢 Tenant ${memberTenantId}\nCreated fallback row (orders-only perms) — review in settings.`);
      } else {
        notifyTelegram(`👥 <b>MEMBER JOINED</b>\n👤 ${memberName || "N/A"}\n📧 ${email}\n🏢 Tenant ${memberTenantId}`);
      }

      return NextResponse.json({ success: true, member: true, tenant_id: memberTenantId });
    }

    // Idempotency check — match on email OR clerk_user_id.
    let existingQuery = supabase.from("tenants").select("*");
    existingQuery = email
      ? existingQuery.or(`email.eq.${email},clerk_user_id.eq.${data.id}`)
      : existingQuery.eq("clerk_user_id", data.id);
    const { data: existingRows } = await existingQuery.limit(1);
    const existing = existingRows?.[0];

    if (existing) {
      if (!existing.clerk_user_id) {
        const doc = { ...((existing.doc ?? {}) as Record<string, unknown>), clerk_user_id: data.id };
        await supabase
          .from("tenants")
          .update({ clerk_user_id: data.id, doc, updated_at: nowIso })
          .eq("tenant_id", existing.tenant_id);
      }
      await setClerkMetadata(CLERK_SECRET_KEY, data.id, {
        role: "tenant_user",
        tenant_id: existing.tenant_id,
        tenant_role: "owner",
      });
      return NextResponse.json({ success: true, existing: true, tenant_id: existing.tenant_id });
    }

    // Next tenant_id — fail closed: a guessed id can collide with an existing
    // tenant and cross-contaminate all tenant-scoped data. Never default.
    // Minted atomically from the Postgres sequence via the next_tenant_id() RPC.
    const { data: tid, error: tidErr } = await supabase.rpc("next_tenant_id");
    if (tidErr || tid == null || !Number.isFinite(Number(tid))) {
      console.error("[clerk-webhook] tenant_id sequence read failed — aborting provisioning", { email, clerk_user_id: data.id, tidErr });
      notifyTelegram(`🚨 <b>TENANT PROVISIONING FAILED</b>\n📧 ${email}\nSequence read returned no id — signup aborted, Clerk will retry.`);
      return NextResponse.json({ error: "tenant_id sequence unavailable" }, { status: 503 });
    }
    const tenant_id = Number(tid);

    const trialEndsAt   = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const contactName   = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();

    // Full original tenant document → stored verbatim in `doc`; promoted scalar
    // columns are duplicated onto the row for querying.
    const tenantDoc = {
      tenant_id,
      company_name:        "",
      contact_name:        contactName,
      email,
      phone:               data.phone_numbers?.[0]?.phone_number ?? "",
      clerk_user_id:       data.id,
      owner_clerk_user_id: data.id,
      price_per_stop:      16.00,
      price_per_mile:      1.65,
      xpress_base_fee:     14.99,
      xpress_per_mile:     1.38,
      postpay_enabled:     false,
      credit_limit:        0,
      outstanding_amount:  0,
      packages_this_month: 0,
      plan_type:           "free_trial",
      trial_ends_at:       trialEndsAt,
      stripe_customer_id:  null,
      status:              "pending_setup",
      active:              true,
      address:             {},
      pickup_locations:    [],
      created_at:          nowIso,
      updated_at:          nowIso,
    };

    await supabase.from("tenants").insert({
      tenant_id,
      company_name:        "",
      plan_type:           "free_trial",
      stripe_customer_id:  null,
      outstanding_amount:  0,
      owner_clerk_user_id: data.id,
      credit_limit:        0,
      status:              "pending_setup",
      active:              true,
      postpay_enabled:     false,
      clerk_user_id:       data.id,
      email,
      created_at:          nowIso,
      updated_at:          nowIso,
      doc:                 tenantDoc,
    });

    await supabase.from("tenant_members").insert({
      tenant_id,
      clerk_user_id: data.id,
      email,
      role:          "owner",
      active:        true,
      invited_by:    null,
      page_permissions: { orders: true, billing: true, reports: true, settings: true },
      created_at:    nowIso,
      updated_at:    nowIso,
    });

    // users row (member-system Phase 2+): every Clerk user gets a users doc.
    const { data: uOwner } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_user_id", data.id)
      .maybeSingle();
    if (!uOwner) {
      await supabase.from("users").insert({
        clerk_user_id: data.id,
        email,
        name:          contactName,
        system_role:   "tenant_user",
        created_from:  "clerk_webhook",
        created_at:    nowIso,
        doc: {
          clerk_user_id: data.id,
          email,
          name:          contactName,
          system_role:   "tenant_user",
          created_at:    nowIso,
          created_from:  "clerk_webhook",
        },
      });
    }

    await setClerkMetadata(CLERK_SECRET_KEY, data.id, {
      role:        "tenant_user",
      tenant_id,
      tenant_role: "owner",
    });

    // Telegram notify
    const msg = `🎉 <b>NEW TENANT</b>\n👤 ${contactName || "N/A"}\n📧 ${email}\n🆔 Tenant ID: ${tenant_id}\n📋 Free Trial`;
    notifyTelegram(msg);

    return NextResponse.json({ success: true, tenant_id }, { status: 201 });

  } catch (err) {
    console.error("[clerk-webhook]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Fire-and-forget Telegram notification. Missing credentials must never break
// tenant provisioning — log and skip, no hardcoded fallback.
function notifyTelegram(text: string) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("[clerk-webhook] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set — skipping Telegram notification");
    return;
  }
  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  }).catch((err) => {
    console.error("[clerk-webhook] Telegram notification failed:", err);
  });
}

async function setClerkMetadata(secretKey: string, userId: string, metadata: Record<string, unknown>) {
  if (!secretKey) return;
  try {
    await fetch(`https://api.clerk.com/v1/users/${userId}/metadata`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ public_metadata: metadata }),
    });
  } catch (err) {
    console.error("[clerk-webhook] metadata error:", err);
  }
}
