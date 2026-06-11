import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// ── Public routes — no auth required ─────────────────────────────────────────
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/register(.*)",
  "/verify(.*)",
  "/unauthorized(.*)",
  "/api/webhooks(.*)",
]);

// ── Dispatcher-only routes ────────────────────────────────────────────────────
const isDispatcherRoute = createRouteMatcher([
  "/dashboard/package-scans(.*)",
  "/dashboard/routes(.*)",
  "/dashboard/drivers(.*)",
  "/dashboard/spoke-stops(.*)",
  "/dashboard/spoke-plans(.*)",
  "/dashboard/spoke-depots(.*)",
  "/dashboard/spoke-drivers(.*)",
  "/settings(.*)",
]);

// Roles allowed in admin portal
const ADMIN_ROLES = ["routely_admin", "dispatcher"] as const;
type AdminRole = typeof ADMIN_ROLES[number];

// ── CEO safety-net allowlist (member-system Phase 2 rollout, 2026-06-11) ──
// Hard guarantee: these clerk_user_ids can NEVER be locked out by bad/missing
// Clerk publicMetadata. Checked BEFORE any role logic. Env-overridable
// (comma-separated clerk_user_ids).
// ⚠ PENDING REMOVAL once Phase 2 is verified stable in production.
const CEO_ALLOWLIST = (process.env.CEO_CLERK_USER_ALLOWLIST ?? "user_3CUV90FSFpBYL4MBOYoPL9rnWLH")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export default clerkMiddleware(async (auth, req) => {
  // Always allow public routes
  if (isPublicRoute(req)) return;

  const { userId, sessionClaims } = await auth();

  // Not signed in → redirect to sign-in
  if (!userId) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  // CEO safety net: allowlisted ids bypass ALL role gating (anti-lockout).
  if (CEO_ALLOWLIST.includes(userId)) return;

  const role = (sessionClaims?.metadata as Record<string, unknown>)?.role as string | undefined;

  // Role not allowed in admin portal → unauthorized
  if (!role || !ADMIN_ROLES.includes(role as AdminRole)) {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  // Dispatcher trying to access non-dispatcher route → unauthorized
  if (role === "dispatcher" && !isDispatcherRoute(req)) {
    // Allow /dashboard/default as entry point, redirect to their allowed area
    if (req.nextUrl.pathname === "/" || req.nextUrl.pathname === "/dashboard/default") {
      return NextResponse.redirect(new URL("/dashboard/package-scans", req.url));
    }
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
