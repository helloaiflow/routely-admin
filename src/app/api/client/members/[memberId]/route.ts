import { NextResponse, type NextRequest } from "next/server";

import { clerkClient } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";

import { getDb, getTenantContext } from "@/lib/tenant";

/* ── PATCH /api/client/members/[memberId] ─────────────────────────────────────
 * Owner-only member management. NEVER hard-deletes (audit trail):
 *   action: "permissions"  → update page_permissions
 *   action: "deactivate"   → active:false (+timestamp). Member keeps Clerk
 *                            account but every permission gate resolves null.
 *   action: "reactivate"   → active:true (accepted members only)
 *   action: "revoke"       → revoke a PENDING Clerk invitation + mark row
 * Owner rows are untouchable from this endpoint.
 * ─────────────────────────────────────────────────────────────────────────── */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== "owner") {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  const { memberId } = await params;
  if (!ObjectId.isValid(memberId)) {
    return NextResponse.json({ error: "Invalid member id" }, { status: 400 });
  }

  let body: { action?: string; page_permissions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = await getDb();
  // Tenant-scoped lookup — an owner can only ever touch rows of THEIR tenant.
  const row = await db.collection("tenant_members").findOne({
    _id: new ObjectId(memberId),
    tenant_id: ctx.tenantId,
  });
  if (!row) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (row.role === "owner") {
    return NextResponse.json({ error: "Owner rows cannot be modified here" }, { status: 403 });
  }

  switch (body.action) {
    case "permissions": {
      const p = (body.page_permissions ?? {}) as Record<string, unknown>;
      await db.collection("tenant_members").updateOne(
        { _id: row._id },
        {
          $set: {
            page_permissions: {
              orders:   p.orders === true,
              billing:  p.billing === true,
              reports:  p.reports === true,
              settings: p.settings === true,
            },
            updated_at: new Date(),
          },
        },
      );
      return NextResponse.json({ success: true });
    }

    case "deactivate": {
      await db.collection("tenant_members").updateOne(
        { _id: row._id },
        { $set: { active: false, deactivated_at: new Date(), updated_at: new Date() } },
      );
      return NextResponse.json({ success: true });
    }

    case "reactivate": {
      if (row.invitation_status === "revoked" || typeof row.clerk_user_id !== "string" || row.clerk_user_id.startsWith("invite:")) {
        return NextResponse.json(
          { error: "Only accepted members can be reactivated" },
          { status: 400 },
        );
      }
      await db.collection("tenant_members").updateOne(
        { _id: row._id },
        { $set: { active: true, updated_at: new Date() }, $unset: { deactivated_at: "" } },
      );
      return NextResponse.json({ success: true });
    }

    case "revoke": {
      if (row.invitation_status !== "pending" || !row.invitation_id) {
        return NextResponse.json({ error: "No pending invitation to revoke" }, { status: 400 });
      }
      try {
        const clerk = await clerkClient();
        await clerk.invitations.revokeInvitation(row.invitation_id);
      } catch (err) {
        console.error("[members] revokeInvitation failed:", err);
        return NextResponse.json({ error: "Clerk revoke failed" }, { status: 502 });
      }
      await db.collection("tenant_members").updateOne(
        { _id: row._id },
        {
          $set: {
            invitation_status: "revoked",
            active: false,
            revoked_at: new Date(),
            updated_at: new Date(),
          },
        },
      );
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
