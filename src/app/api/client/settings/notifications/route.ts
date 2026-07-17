import { NextResponse } from "next/server";

import { getDb, requirePagePermission } from "@/lib/tenant";

/* ───────────────────────────────────────────────────────────────────────────
 * Notification preferences — persisted on tenant.notification_prefs.
 * Gated by the "settings" page permission. Only the known boolean keys below
 * are accepted (unknown keys ignored), so the client can't write arbitrary
 * fields onto the tenant document.
 * ───────────────────────────────────────────────────────────────────────────*/

const KEYS = [
  "delivery_confirmed",
  "pickup_notification",
  "delivery_failed",
  "weekly_summary",
  "monthly_report",
  "email_channel",
  "sms_channel",
] as const;

type PrefKey = (typeof KEYS)[number];
type Prefs = Record<PrefKey, boolean>;

const DEFAULTS: Prefs = {
  delivery_confirmed: true,
  pickup_notification: true,
  delivery_failed: true,
  weekly_summary: false,
  monthly_report: false,
  email_channel: true,
  sms_channel: false,
};

function normalize(raw: unknown): Prefs {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULTS };
  for (const k of KEYS) if (typeof src[k] === "boolean") out[k] = src[k] as boolean;
  return out;
}

export async function GET() {
  const ctx = await requirePagePermission("settings");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const t = await db
    .collection("tenants")
    .findOne({ tenant_id: ctx.tenantId }, { projection: { notification_prefs: 1 } });
  return NextResponse.json({ prefs: normalize(t?.notification_prefs) });
}

export async function PATCH(req: Request) {
  const ctx = await requirePagePermission("settings");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Merge onto existing prefs so a partial patch keeps the untouched keys.
  const db = await getDb();
  const t = await db
    .collection("tenants")
    .findOne({ tenant_id: ctx.tenantId }, { projection: { notification_prefs: 1 } });
  const current = normalize(t?.notification_prefs);
  const merged = { ...current };
  for (const k of KEYS) if (typeof body[k] === "boolean") merged[k] = body[k] as boolean;

  await db
    .collection("tenants")
    .updateOne({ tenant_id: ctx.tenantId }, { $set: { notification_prefs: merged, updated_at: new Date() } });
  return NextResponse.json({ prefs: merged });
}
