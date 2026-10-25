import type { TenantContext } from "@/lib/tenant";

/* R26a Part B (A09) — thin server-side proxy helper to routely-api's Payouts P1
 * prod-sandbox module (feat/r37-payouts-prod). Mirrors the exact auth/actor/
 * error-passthrough pattern every other driver-applicants staff route in this
 * app already uses (see src/app/api/client/driver-applicants/[key]/approve/route.ts),
 * but with its OWN internal key — payouts validates against
 * PAYOUTS_API_KEY_SANDBOX specifically, never the onboarding ROUTELY_API_SECRET.
 *
 * PAYOUTS_API_KEY_SANDBOX was generated server-side on the VPS by the backend
 * round of this mission and never printed anywhere — it must be added to this
 * Vercel project's env vars (Production + Preview) before this page actually
 * works end-to-end. Until then every call below 503s cleanly. */

export const FASTAPI_BASE = process.env.ROUTELY_API_URL ?? "https://api.routelypro.com";
const PAYOUTS_SECRET = process.env.PAYOUTS_API_KEY_SANDBOX ?? "";
export const ROUTELY_OPS_TENANT_ID = 1;

export function payoutsActor(ctx: TenantContext): string {
  const identity = ctx.user?.primaryEmailAddress?.emailAddress ?? ctx.userId;
  return `staff:${identity}`;
}

export async function payoutsFetch(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; actor: string; searchParams?: Record<string, string> } = {
    actor: "",
  },
): Promise<{ status: number; data: Record<string, unknown> }> {
  if (!PAYOUTS_SECRET) {
    return {
      status: 503,
      data: { detail: { code: "payouts_unconfigured", message: "PAYOUTS_API_KEY_SANDBOX is not set" } },
    };
  }
  const qs = new URLSearchParams({ tenant_id: String(ROUTELY_OPS_TENANT_ID), ...(init.searchParams ?? {}) });
  const url = `${FASTAPI_BASE}${path}${path.includes("?") ? "&" : "?"}${qs.toString()}`;
  const headers: Record<string, string> = { "X-API-Key": PAYOUTS_SECRET, "Content-Type": "application/json" };
  if (init.actor) headers["X-Actor"] = init.actor;
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    return { status: 502, data: { detail: { code: "payouts_unreachable", message: "Payouts service unreachable" } } };
  }
  const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: upstream.status, data };
}

/** Current ISO week, UTC, as routely-api's /v1/payouts/run expects (YYYY-Www). */
export function currentIsoWeek(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
