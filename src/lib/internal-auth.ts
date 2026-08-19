import { NextResponse } from "next/server";

/* Shared internal-caller auth for routes with no Clerk session to check —
 * true machine-to-machine endpoints (n8n workflows, cron, IVY). Same
 * pattern already established in orders/create/route.ts: a shared secret
 * in `x-routely-internal-secret`, held only server-side so a browser can
 * never spoof it. If ROUTELY_INTERNAL_SECRET is empty/unset on a
 * deployment, the check is effectively disabled (always denies) — fail
 * closed, never fail open.
 *
 * 2026-08-19: added after finding /api/data/package-scans and its /migrate
 * route had shipped with NO auth check at all since June ("internal only"
 * in a comment is an intention, not a control) — deployed on a public
 * Vercel domain, reachable by anyone. Traced the blast radius first
 * (routely-api's actual stop-creation/status endpoints are separately
 * authenticated via require_api_key, and nothing in any of the three repos
 * reads the table these routes write to in order to trigger a mutation) —
 * confirmed this could NOT reach record_attempt() or cause a real charge,
 * but it DID allow an unauthenticated GET to read another tenant's
 * recipient PII (name/phone/address/package photos) and an unauthenticated
 * POST/PATCH to write arbitrary content into it. */
export function requireInternalSecret(request: Request): NextResponse | null {
  const INTERNAL_SECRET = process.env.ROUTELY_INTERNAL_SECRET ?? "";
  const provided = request.headers.get("x-routely-internal-secret") ?? "";
  const authorized = INTERNAL_SECRET.length > 0 && provided === INTERNAL_SECRET;
  if (authorized) return null;

  // Vercel's own request logs carry no IP/User-Agent field for these routes
  // (confirmed while sequencing this fix's rollout) — this console.warn IS
  // the only mechanism that makes a rejected call diagnosable. A missed
  // caller must be a 30-second grep of function logs for
  // "[internal-auth] denied", not a silent gap in scan data nobody notices
  // for days (see the Stripe-webhook-dead-for-10-days precedent this same
  // fix is guarding against for a different route).
  const reason = INTERNAL_SECRET.length === 0 ? "secret_unset" : provided ? "secret_mismatch" : "header_missing";
  console.warn(
    `[internal-auth] denied request reason=${reason} ${request.method} ${new URL(request.url).pathname} ` +
      `ip=${request.headers.get("x-forwarded-for") ?? "unknown"} ` +
      `ua="${request.headers.get("user-agent") ?? "unknown"}"`,
  );
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}
