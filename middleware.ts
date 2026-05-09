import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/unauthorized(.*)",
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();
  const path = req.nextUrl.pathname;

  // Public routes — allow
  if (isPublicRoute(req)) return;

  // Not signed in → Clerk login
  if (!userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // ── Role check — must be "admin" ─────────────────────────────────────────
  const role = (sessionClaims?.publicMetadata as Record<string, unknown>)?.role as string | undefined;

  if (role !== "admin") {
    console.warn(`[admin-middleware] Access denied — userId=${userId} role=${role ?? "none"}`);
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
