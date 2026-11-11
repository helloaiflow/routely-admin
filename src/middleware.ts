import { type NextRequest, NextResponse } from "next/server";

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

import { readSupabaseSession, withSessionCookies } from "@/lib/auth/middleware-session";
import { USE_SUPABASE_AUTH } from "@/lib/auth/provider";

// ─────────────────────────────────────────────────────────────────────────────
// ROUTELY ADMIN middleware. Reuses client's Clerk login UI (/login) but gates
// the whole portal to admin roles. This REPLACES client's tenant middleware.
//   • PUBLIC: /login, /auth, /unauthorized, webhooks, google helper proxies.
//   • Signed-in on /login → /dashboard/default.
//   • CEO allowlist bypasses all gating (anti-lockout).
//   • Only routely_admin / dispatcher may enter; everyone else → /unauthorized.
// ─────────────────────────────────────────────────────────────────────────────
const CEO_ALLOWLIST = (process.env.CEO_CLERK_USER_ALLOWLIST ?? "user_3CUV90FSFpBYL4MBOYoPL9rnWLH")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ADMIN_ROLES = ["routely_admin", "dispatcher"];

const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/auth(.*)",
  "/api/auth/forgot(.*)",
  "/staff-invite(.*)",
  "/api/staff-invite(.*)",
  "/unauthorized(.*)",
  "/api/webhooks(.*)",
  // Stripe's webhook lives at /api/stripe/webhook (not /api/webhooks/*) — the
  // OTHER webhook file at /api/webhooks/stripe was consolidated away (2026-08
  // billing v3), but this app's Clerk gate never whitelisted THIS path, so
  // Stripe calls here would have 401'd at auth before signature verification
  // even ran. Fixed alongside the consolidation.
  "/api/stripe/webhook(.*)",
  "/api/data/package-scans(.*)",
  "/api/client/distance(.*)",
  "/api/client/places(.*)",
  "/api/client/place-details(.*)",
  // M28-B: GlitchTip self-test; the route itself answers 404 without OBSERVABILITY_SELFTEST_TOKEN.
  "/api/observability/selftest(.*)",
]);

// A deep link's destination is only ever trusted if it's a same-origin
// relative path — "/foo" is fine, "//evil.com" and "https://evil.com" are
// browser-recognized ways to smuggle an absolute redirect through a
// same-looking string and must be rejected (open-redirect prevention).
function safeRedirectPath(raw: string | null): string | null {
  if (!raw?.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

// Provider-neutral gate: same policy for a Clerk or a Supabase session (D62).
async function gate(req: NextRequest, userId: string | null, meta: Record<string, unknown> | undefined) {
  const path = req.nextUrl.pathname;

  if (USE_SUPABASE_AUTH && path.startsWith("/register")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (userId && path === "/login") {
    const dest = safeRedirectPath(req.nextUrl.searchParams.get("redirect_url"));
    return NextResponse.redirect(new URL(dest ?? "/dashboard/default", req.url));
  }

  if (isPublicRoute(req)) return;

  if (!userId) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Preserve the originally requested URL (path + query) so login can
    // return the user to it instead of always landing on /dashboard/default —
    // otherwise every deep link (bookmarked stops, emailed invoice links)
    // loses its destination on an expired session.
    const loginUrl = new URL("/login", req.url);
    const dest = path + req.nextUrl.search;
    if (dest !== "/") loginUrl.searchParams.set("redirect_url", dest);
    return NextResponse.redirect(loginUrl);
  }

  // CEO safety net: allowlisted ids bypass ALL role gating.
  if (CEO_ALLOWLIST.includes(userId)) return;

  const role = meta?.role as string | undefined;

  // Admin portal is admin-only.
  if (!role || !ADMIN_ROLES.includes(role)) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }
}

const clerkGate = clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();
  return gate(req, userId, sessionClaims?.metadata as Record<string, unknown> | undefined);
});

async function supabaseGate(req: NextRequest) {
  const { res, userId, meta } = await readSupabaseSession(req);
  return withSessionCookies(res, await gate(req, userId, meta));
}

export default USE_SUPABASE_AUTH ? supabaseGate : clerkGate;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
