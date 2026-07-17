import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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
  "/api/data/package-scans(.*)",
  "/api/client/distance(.*)",
  "/api/client/places(.*)",
  "/api/client/place-details(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();
  const path = req.nextUrl.pathname;

  if (userId && path === "/login") {
    return NextResponse.redirect(new URL("/dashboard/default", req.url));
  }

  if (isPublicRoute(req)) return;

  if (!userId) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
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
