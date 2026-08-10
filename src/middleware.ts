import { NextResponse } from "next/server";

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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
]);

// A deep link's destination is only ever trusted if it's a same-origin
// relative path — "/foo" is fine, "//evil.com" and "https://evil.com" are
// browser-recognized ways to smuggle an absolute redirect through a
// same-looking string and must be rejected (open-redirect prevention).
function safeRedirectPath(raw: string | null): string | null {
  if (!raw?.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();
  const path = req.nextUrl.pathname;

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

  const meta = sessionClaims?.metadata as Record<string, unknown> | undefined;
  const role = meta?.role as string | undefined;

  // Admin portal is admin-only.
  if (!role || !ADMIN_ROLES.includes(role)) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
