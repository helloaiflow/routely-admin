import { type NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@supabase/ssr";

/** Refreshes the session cookies and returns the verified web claims. Only web users count here:
 *  a driver token (app_role "driver") is never a portal session. */
export async function readSupabaseSession(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) req.cookies.set(name, value);
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of list) res.cookies.set(name, value, options);
        },
      },
    },
  );
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims?.app_role === "web" ? data.claims : null;
  return {
    res,
    userId: claims?.sub ?? null,
    meta: claims
      ? {
          role: claims.is_platform_admin === true ? "routely_admin" : "tenant_user",
          tenant_id: claims.tenant_id,
          tenant_role: claims.tenant_role,
        }
      : undefined,
  };
}

/** Carries refreshed session cookies onto a gate's redirect or JSON response. */
export function withSessionCookies(from: NextResponse, to: Response | undefined | void) {
  if (!to) return from;
  const out = to instanceof NextResponse ? to : new NextResponse(to.body, to);
  for (const cookie of from.cookies.getAll()) out.cookies.set(cookie);
  return out;
}
