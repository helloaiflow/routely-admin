import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/register(.*)",
  "/verify(.*)",
  "/unauthorized(.*)",
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Public routes — allow always
  if (isPublicRoute(req)) return;

  const { userId, sessionClaims } = await auth();

  // Not signed in → Clerk handles redirect to sign-in automatically
  if (!userId) {
    await auth.protect();
    return;
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
