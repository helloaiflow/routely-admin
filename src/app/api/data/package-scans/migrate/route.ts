/**
 * POST /api/data/package-scans/migrate
 *
 * One-time backfill: copies the shared Mongo `package_scans` collection (written
 * by routely-web's IVY endpoint) into Supabase `public.ivy_scans`. Both apps
 * point at the same Mongo cluster, so routely-client can read it directly.
 * Idempotent (insert-only by rtscan_id → safe to re-run). Mongo is READ-only
 * here and left fully intact.
 *
 * Internal / no auth (same tier as /api/data/package-scans).
 */

import { NextResponse } from "next/server";

import clientPromise from "@/lib/mongodb";
import { getSupabaseAdmin } from "@/lib/supabase";

const iso = (v: unknown) => {
  if (!v) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export async function POST(req: Request) {
  try {
    // Optional `?since=<ISO>` cutoff: only migrate scans created on/after this
    // instant. Used after a "start from 0" reset so old test data in the Mongo
    // backup is NOT re-imported into the fresh Supabase table.
    const sinceParam = new URL(req.url).searchParams.get("since");
    const sinceMs = sinceParam ? new Date(sinceParam).getTime() : NaN;
    const afterCutoff = (b: Record<string, unknown>) => {
      if (Number.isNaN(sinceMs)) return true;
      const t = new Date((b.started_at ?? b.created_at) as string).getTime();
      return !Number.isNaN(t) && t >= sinceMs;
    };

    const db = (await clientPromise).db("routely_prod");
    const docs = await db.collection("package_scans").find({}).toArray();

    const rows = docs
      .filter((d) => d.rtscan_id != null && afterCutoff(d as Record<string, unknown>))
      .map((d) => {
        const b = d as Record<string, unknown>;
        return {
          rtscan_id: Number(b.rtscan_id),
          tenant_id: Number(b.tenant_id ?? b.client_id ?? 1),
          status: (b.status as string) ?? "PROCESSING",
          stage: (b.stage as string) ?? null,
          error_stage: (b.error_stage as string) ?? null,
          error_message: (b.error_message as string) ?? (b.error as string) ?? null,
          full_name: (b.full_name as string) ?? null,
          phone: (b.phone as string) ?? null,
          full_address: (b.full_address as string) ?? null,
          address: (b.address as string) ?? null,
          city: (b.city as string) ?? null,
          state: (b.state as string) ?? null,
          zipcode: (b.zipcode as string) ?? null,
          image_url: (b.image_url as string) ?? null,
          stop_id: (b.stop_id as string) ?? null,
          spoke_delivery_id: (b.spoke_delivery_id as string) ?? null,
          spoke_pickup_id: (b.spoke_pickup_id as string) ?? null,
          route: (b.route as string) ?? null,
          rx_pharma_id: (b.rx_pharma_id as string) ?? null,
          source: (b.source as string) ?? "ivy",
          started_at: iso(b.started_at) ?? iso(b.created_at),
          completed_at: iso(b.completed_at),
          processing_time_ms: b.processing_time_ms != null ? Number(b.processing_time_ms) : null,
          doc: (() => {
            const { _id, ...rest } = b;
            void _id;
            return rest;
          })(),
        };
      });

    const supabase = getSupabaseAdmin();
    let migrated = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase.from("ivy_scans").upsert(chunk, {
        onConflict: "rtscan_id",
        ignoreDuplicates: true,
      });
      if (error) {
        console.error("[package-scans migrate]", error);
        return NextResponse.json({ ok: false, migrated, error: error.message }, { status: 500 });
      }
      migrated += chunk.length;
    }

    return NextResponse.json({ ok: true, mongo_docs: docs.length, migrated });
  } catch (err) {
    console.error("[package-scans migrate]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
