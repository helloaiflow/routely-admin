import { NextResponse } from "next/server";

import { getPagePermissions, getTenantContext } from "@/lib/tenant";

/* ── GET /api/client/me/permissions ──────────────────────────────────────────
 * The signed-in user's own tenant role + page permissions (member-system
 * Phase 4). Drives conditional UI (sidebar, settings tabs). Owners always get
 * full permissions; a deactivated member gets active:false + all-false.
 * Read-only and self-scoped — safe for any authenticated tenant user.
 * ─────────────────────────────────────────────────────────────────────────── */
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await getPagePermissions(ctx);
  return NextResponse.json({
    role: ctx.role,
    active: perms !== null,
    permissions: perms ?? { orders: false, billing: false, reports: false, settings: false },
  });
}
