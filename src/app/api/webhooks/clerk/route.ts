import { type NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import clientPromise from "@/lib/mongodb";

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

    const client = await clientPromise;
    const db     = client.db("routely_prod");
    const email  = data.email_addresses?.[0]?.email_address?.toLowerCase() ?? "";

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

      await db.collection("users").updateOne(
        { clerk_user_id: data.id },
        {
          $setOnInsert: {
            clerk_user_id: data.id,
            email,
            name:          memberName,
            system_role:   "tenant_user",
            created_at:    new Date(),
            created_from:  "member_invite",
          },
        },
        { upsert: true },
      );

      // Flip the pending row → active, swapping the "invite:<id>" placeholder
      // for the real clerk_user_id.
      const flip = await db.collection("tenant_members").updateOne(
        { tenant_id: memberTenantId, email, invitation_status: "pending" },
        {
          $set: {
            clerk_user_id:     data.id,
            active:            true,
            invitation_status: "accepted",
            accepted_at:       new Date(),
            updated_at:        new Date(),
          },
        },
      );

      if (flip.matchedCount === 0) {
        // Defensive: the metadata can only originate from our createInvitation,
        // so honor it even if the pending row is missing — orders-only perms,
        // flagged for review.
        await db.collection("tenant_members").updateOne(
          { tenant_id: memberTenantId, clerk_user_id: data.id },
          {
            $setOnInsert: {
              tenant_id:         memberTenantId,
              clerk_user_id:     data.id,
              email,
              role:              "member",
              active:            true,
              invited_by:        null,
              invitation_status: "accepted",
              page_permissions:  { orders: true, billing: false, reports: false, settings: false },
              created_at:        new Date(),
              created_from:      "webhook_member_fallback",
            },
          },
          { upsert: true },
        );
        notifyTelegram(`⚠️ <b>MEMBER ACCEPTED WITHOUT PENDING ROW</b>\n📧 ${email}\n🏢 Tenant ${memberTenantId}\nCreated fallback row (orders-only perms) — review in settings.`);
      } else {
        notifyTelegram(`👥 <b>MEMBER JOINED</b>\n👤 ${memberName || "N/A"}\n📧 ${email}\n🏢 Tenant ${memberTenantId}`);
      }

      return NextResponse.json({ success: true, member: true, tenant_id: memberTenantId });
    }

    // Idempotency check
    const existing = await db.collection("tenants").findOne({
      $or: [{ email }, { clerk_user_id: data.id }]
    });

    if (existing) {
      if (!existing.clerk_user_id) {
        await db.collection("tenants").updateOne(
          { _id: existing._id },
          { $set: { clerk_user_id: data.id, updated_at: new Date() } }
        );
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
    const counter = await db.collection("counters").findOneAndUpdate(
      { _id: "tenant_id" as unknown as import("bson").ObjectId },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" }
    );
    if (typeof counter?.seq !== "number") {
      console.error("[clerk-webhook] tenant_id counter read failed — aborting provisioning", { email, clerk_user_id: data.id });
      notifyTelegram(`🚨 <b>TENANT PROVISIONING FAILED</b>\n📧 ${email}\nCounter read returned no seq — signup aborted, Clerk will retry.`);
      return NextResponse.json({ error: "tenant_id counter unavailable" }, { status: 503 });
    }
    const tenant_id = counter.seq;

    const trialEndsAt   = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const contactName   = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();

    await db.collection("tenants").insertOne({
      tenant_id,
      company_name:        "",
      contact_name:        contactName,
      email,
      phone:               data.phone_numbers?.[0]?.phone_number ?? "",
      clerk_user_id:       data.id,
      // Canonical owner pointer (member-system design). Dual-write with
      // clerk_user_id is intentional during the transition — other code
      // still reads the old field.
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
      created_at:          new Date(),
      updated_at:          new Date(),
    });

    await db.collection("tenant_members").insertOne({
      tenant_id,
      clerk_user_id: data.id,
      email,
      role:          "owner",
      active:        true,
      invited_by:    null,
      page_permissions: { orders: true, billing: true, reports: true, settings: true },
      created_at:    new Date(),
    });

    // users row (member-system Phase 2+): every Clerk user gets a users doc.
    await db.collection("users").updateOne(
      { clerk_user_id: data.id },
      {
        $setOnInsert: {
          clerk_user_id: data.id,
          email,
          name:          contactName,
          system_role:   "tenant_user",
          created_at:    new Date(),
          created_from:  "clerk_webhook",
        },
      },
      { upsert: true },
    );

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
