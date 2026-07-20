import { auth, currentUser } from "@clerk/nextjs/server";
import type { User } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import clientPromise from "./mongodb";
import { getSupabaseAdmin } from "./supabase";

/* ───────────────────────────────────────────────────────────────────────────
 * Tenant member roles + permissions
 *
 * Sprint-1 scope (no UI, no member-management endpoints): this file just
 * declares the shape so future role-checking code has a single source of
 * truth. Until a member system ships, every authenticated user is treated
 * as "owner" of their own tenant (the only resolvable role today).
 *
 *   owner       — full access incl. billing/pricing/plan settings (= tenant.owner)
 *   admin       — every operational + member action (no billing changes)
 *   manager     — operational dashboards + dispatch tools, no member changes
 *   dispatcher  — stop/route management, no settings
 *   front_desk  — create + edit draft stops only
 *   billing     — billing, invoices, payment methods only
 *   viewer      — read-only
 *
 * Permission strings (informational for now — actual gates land alongside
 * the future member-management endpoints):
 *   billing:read | billing:write
 *   pricing:write
 *   plan:write
 *   stops:read  | stops:write | stops:delete
 *   drafts:read | drafts:write
 *   members:read | members:write
 * ─────────────────────────────────────────────────────────────────────────── */
export type TenantRole =
  | "owner"
  | "member"
  | "admin"
  | "manager"
  | "dispatcher"
  | "front_desk"
  | "billing"
  | "viewer";

export type TenantPermission =
  | "billing:read"  | "billing:write"
  | "pricing:write"
  | "plan:write"
  | "stops:read"    | "stops:write"   | "stops:delete"
  | "drafts:read"   | "drafts:write"
  | "members:read"  | "members:write";

export type TenantContext = {
  userId:   string;
  tenantId: number;
  /** Default "owner" until the member system ships. Surface-read only —
   *  no route gates this yet. */
  role:     TenantRole;
  user:     User | null;
  /** True when the caller is a Routely admin/dispatcher/CEO — the ADMIN console.
   *  Admins have no tenant of their own; they browse across every tenant. */
  isAdmin:  boolean;
  /** For admins: the tenant they've narrowed to (via the header selector), or
   *  "all" for cross-tenant. For regular users: always their own tenantId. */
  tenantScope: number | "all";
};

/* ───────────────────────────────────────────────────────────────────────────
 * getTenantContext
 *
 * Returns the tenant context for the current Clerk session, or null when
 * the caller is not signed in OR when no tenant_id can be resolved from
 * the user's publicMetadata.
 *
 * Behavior change (sprint-1 security):
 *   - NEVER silently defaults to tenant_id=1. Earlier code did
 *     `(...) || 1`, which meant any newly-signed-up user with no
 *     publicMetadata.tenant_id quietly read/wrote Routely LLC's data.
 *   - Routes treat `null` as 401/403 (they already do).
 *
 * `role` defaults to "owner" — the only role surfaced today since each
 * tenant currently has exactly one user. Once a members table exists,
 * the role will be looked up from there instead.
 * ─────────────────────────────────────────────────────────────────────────── */
export async function getTenantContext(): Promise<TenantContext | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  const meta = (user?.publicMetadata ?? {}) as Record<string, unknown>;

  // ── Admin / CEO detection (cross-tenant console) ───────────────────────────
  // The admin portal reuses the client codebase but its users are Routely staff
  // (system role routely_admin / dispatcher) or the CEO allowlist — they have NO
  // tenant of their own, so instead of 403ing we give them a cross-tenant
  // context. They may narrow to one tenant via the `admin_tenant` cookie that
  // the header tenant-selector sets.
  const CEO_ALLOWLIST = (process.env.CEO_CLERK_USER_ALLOWLIST ?? "user_3CUV90FSFpBYL4MBOYoPL9rnWLH")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const systemRole = typeof meta.role === "string" ? meta.role : "";
  const isAdmin = CEO_ALLOWLIST.includes(userId) || systemRole === "routely_admin" || systemRole === "dispatcher";

  if (isAdmin) {
    let tenantScope: number | "all" = "all";
    try {
      const sel = (await cookies()).get("admin_tenant")?.value;
      if (sel && /^\d+$/.test(sel)) tenantScope = Number(sel);
    } catch {
      /* cookies() may be unavailable in some render contexts — default to "all" */
    }
    return {
      userId,
      tenantId: tenantScope === "all" ? 0 : tenantScope,
      tenantScope,
      isAdmin: true,
      role: "admin",
      user,
    };
  }

  const rawTenantId = meta.tenant_id;
  const tenantId =
    typeof rawTenantId === "number" ? rawTenantId :
    typeof rawTenantId === "string" && rawTenantId.trim() !== "" ? Number(rawTenantId) :
    NaN;

  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    // No silent fallback to tenant_id=1. Caller should respond 403/401.
    return null;
  }

  // Member system (Phase 2+, 2026-06-11): the tenant-level role lives in
  // publicMetadata.tenant_role ("owner" | "member"); publicMetadata.role is the
  // SYSTEM role ("tenant_user"). Legacy users without tenant_role default to
  // "owner" — every pre-member-system tenant has exactly one user, its owner.
  const rawRole = typeof meta.tenant_role === "string" ? meta.tenant_role.toLowerCase() : "";
  const role: TenantRole = isTenantRole(rawRole) ? rawRole : "owner";

  return { userId, tenantId, tenantScope: tenantId, isAdmin: false, role, user };
}

function isTenantRole(s: string): s is TenantRole {
  return s === "owner" || s === "member" || s === "admin" || s === "manager" ||
         s === "dispatcher" || s === "front_desk" || s === "billing" || s === "viewer";
}

/* ───────────────────────────────────────────────────────────────────────────
 * Page-level permissions (member system Phase 4 — CEO-locked granularity)
 *
 * Owners always have every page. Members get the page_permissions map the
 * owner configured on their tenant_members row; a missing or DEACTIVATED
 * member row resolves to null → callers must treat null as 403 on every
 * permission-gated surface (server-side enforcement; UI hiding is not
 * security).
 * ─────────────────────────────────────────────────────────────────────────── */
export type PagePermissions = {
  orders:   boolean;
  billing:  boolean;
  reports:  boolean;
  settings: boolean;
};

export const OWNER_PERMISSIONS: PagePermissions = {
  orders: true, billing: true, reports: true, settings: true,
};

export async function getPagePermissions(ctx: TenantContext): Promise<PagePermissions | null> {
  // Admins (Routely staff / CEO) have every page across every tenant.
  if (ctx.isAdmin) return OWNER_PERMISSIONS;
  if (ctx.role !== "member") return OWNER_PERMISSIONS;

  const supabase = getSupabaseAdmin();
  const { data: row } = await supabase
    .from("tenant_members")
    .select("active, page_permissions")
    .eq("tenant_id", ctx.tenantId)
    .eq("clerk_user_id", ctx.userId)
    .maybeSingle();
  // No row or deactivated → no access at all.
  if (!row || row.active !== true) return null;
  const p = (row.page_permissions ?? {}) as Record<string, unknown>;
  return {
    orders:   p.orders === true,
    billing:  p.billing === true,
    reports:  p.reports === true,
    settings: p.settings === true,
  };
}

/** One-call guard for API routes: returns the context when the caller has the
 *  page permission, or null (caller responds 401/403). Owners pass for free. */
export async function requirePagePermission(
  page: keyof PagePermissions,
): Promise<TenantContext | null> {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  const perms = await getPagePermissions(ctx);
  if (!perms || perms[page] !== true) return null;
  return ctx;
}

/** Guard for surfaces every ACTIVE member may use (dashboard home, tenant
 *  read for the order flow): owners pass for free; members must have a live,
 *  non-deactivated tenant_members row. Null → caller responds 401/403. */
export async function requireActiveTenantContext(): Promise<TenantContext | null> {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  const perms = await getPagePermissions(ctx);
  if (!perms) return null;
  return ctx;
}

export async function getDb() {
  const client = await clientPromise;
  return client.db("routely_prod");
}
