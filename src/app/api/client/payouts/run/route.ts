import { type NextRequest, NextResponse } from "next/server";

import { currentIsoWeek, payoutsActor, payoutsFetch } from "@/lib/payouts-api";
import { getTenantContext } from "@/lib/tenant";

/* POST /api/client/payouts/run — "Dry run" / "Run Monday payouts" buttons.
 * Proxies to FastAPI POST /v1/payouts/run with the real ISO week (UTC) and
 * the dry_run flag the request body asked for. Admin-only. */
export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  let body: { dry_run?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* default dry_run=true below */
  }
  const dryRun = body.dry_run !== false;
  const week = currentIsoWeek();

  const { status, data } = await payoutsFetch("/v1/payouts/run", {
    method: "POST",
    actor: payoutsActor(ctx),
    searchParams: { week, dry_run: String(dryRun) },
  });
  return NextResponse.json(data, { status });
}
