import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/register(.*)",
  "/verify(.*)",
  "/unauthorized(.*)",
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Public routes — always allow
  if (isPublicRoute(req)) return;

  const { userId, sessionClaims } = await auth();

  // Not signed in → redirect to sign-in
  if (!userId) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Signed in but not admin → unauthorized
  const role = (sessionClaims?.publicMetadata as Record<string, unknown>)?.role as string | undefined;
  if (role !== "admin") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  // Admin → allow
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
