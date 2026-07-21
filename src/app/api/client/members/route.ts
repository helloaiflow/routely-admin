import { NextResponse, type NextRequest } from "next/server";

import { clerkClient } from "@clerk/nextjs/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext } from "@/lib/tenant";

/* ── /api/client/members ──────────────────────────────────────────────────────
 * Member-system Phase 3 (CEO-approved Clerk-invitation method, 2026-06-11).
 *
 * Owner-only. Members NEVER self-register (origin rule): the only way a member
 * exists is a logged-in owner inviting them here. The Clerk invitation carries
 * publicMetadata {role:"tenant_user", tenant_id:<owner's>, tenant_role:"member"}
 * so the invitee is born anchored to the inviting owner's tenant — they can
 * never choose or change it. page_permissions live ONLY in Mongo
 * (tenant_members), the single source of truth the server-side guards read.
 *
 * The pending tenant_members row stores clerk_user_id = "invite:<invitationId>"
 * (placeholder) because the real id doesn't exist until acceptance and the
 * {tenant_id, clerk_user_id} unique index forbids null duplicates. The Clerk
 * user.created webhook swaps in the real id and flips active:true on accept.
 * ─────────────────────────────────────────────────────────────────────────── */

// Invite redirect base. Hardened (2026-06-12): the prod env var held a
// non-URL value baked into the running deployment, so Clerk rejected the
// invitation with "redirect_url must be a valid url". Normalize whatever the
// env contains — trim, strip wrapping quotes, force https:// when the scheme
// is missing, drop trailing slashes — and fall back to the canonical domain
// if the result still isn't a parseable absolute URL.
function normalizeAppUrl(raw: string | undefined): string {
  let v = (raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (v && !/^https?:\/\//i.test(v)) v = `https://${v}`;
  v = v.replace(/\/+$/, "");
  try {
    new URL(v);
  } catch {
    v = "";
  }
  return v || "https://app.routelypro.com";
}

const APP_URL = normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL);

type PagePerms = { orders: boolean; billing: boolean; reports: boolean; settings: boolean };

function parsePerms(input: unknown): PagePerms {
  const p = (input ?? {}) as Record<string, unknown>;
  return {
    orders:   p.orders === true,
    billing:  p.billing === true,
    reports:  p.reports === true,
    settings: p.settings === true,
  };
}

// ── GET — list this tenant's members (owners + members + pending invites) ────
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== "owner") {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from("tenant_members")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[members GET] supabase error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    members: (rows ?? []).map((r: any) => ({
      id: String(r.id),
      email: r.email ?? "",
      role: r.role,
      active: r.active === true,
      pending: r.role === "member" && r.active !== true && r.invitation_status === "pending",
      invitation_status: r.invitation_status ?? null,
      page_permissions: parsePerms(r.page_permissions),
      invited_by: r.invited_by ?? null,
      created_at: r.created_at ?? null,
      accepted_at: r.accepted_at ?? null,
      deactivated_at: r.deactivated_at ?? r.doc?.deactivated_at ?? null,
    })),
  });
}

// ── POST — invite a member (Clerk invitation email) ─────────────────────────
export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== "owner") {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  let body: { email?: string; page_permissions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const perms = parsePerms(body.page_permissions);

  const supabase = getSupabaseAdmin();

  // One identity per tenant: block if this email already has a live row here.
  const { data: existing } = await supabase
    .from("tenant_members")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("email", email)
    .or("active.eq.true,invitation_status.eq.pending")
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "This email is already a member or has a pending invite" },
      { status: 409 },
    );
  }

  // Create the Clerk invitation. The metadata anchors the invitee to THIS
  // tenant as a member — stamped by Clerk at user creation, not user-editable.
  const clerk = await clerkClient();
  let invitation;
  try {
    invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: `${APP_URL}/register`,
      notify: true,
      publicMetadata: {
        role: "tenant_user",
        tenant_id: ctx.tenantId,
        tenant_role: "member",
      },
    });
  } catch (err) {
    console.error("[members] createInvitation failed:", err);
    const msg =
      err && typeof err === "object" && "errors" in err
        ? JSON.stringify((err as { errors: unknown }).errors)
        : String(err);
    return NextResponse.json({ error: `Invitation failed: ${msg}` }, { status: 502 });
  }

  const { error: insertErr } = await supabase.from("tenant_members").insert({
    tenant_id: ctx.tenantId,
    // Placeholder until acceptance (unique-index safe); webhook swaps in the
    // real clerk_user_id when the invitee's account is created.
    clerk_user_id: `invite:${invitation.id}`,
    email,
    role: "member",
    active: false,
    invited_by: ctx.userId,
    invitation_id: invitation.id,
    invitation_status: "pending",
    page_permissions: perms,
    // `doc` is NOT NULL on tenant_members (hybrid schema) with no default. An
    // invite has no Mongo-shaped document, so seed {}. Omitting it made this
    // insert fail the not-null constraint — but the error was swallowed, so
    // every pending invite silently never persisted (invisible in the Team
    // list until the invitee accepted). Seed doc + surface any insert error.
    doc: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (insertErr) {
    // The Clerk invite email already went out, but we couldn't record the
    // pending row — return an error instead of a misleading 201 so the owner
    // knows the invite isn't tracked (and can retry).
    console.error("[members POST] pending-row insert failed:", insertErr);
    return NextResponse.json(
      { error: `Invite email sent, but recording the pending member failed: ${insertErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, invitation_id: invitation.id }, { status: 201 });
}
