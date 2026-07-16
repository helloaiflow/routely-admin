import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* ───────────────────────────────────────────────────────────────────────────
 * Supabase — server-side admin client (Postgres migration).
 *
 * Uses the SECRET (service) key → bypasses RLS. SERVER-ONLY: never import this
 * into a client component or anything shipped to the browser.
 *
 * During the Mongo→Supabase migration, tables follow the hybrid pattern:
 * promoted scalar columns for querying + a `doc jsonb` column holding the full
 * original Mongo document. Reading `.select("doc")` returns that exact document,
 * so existing field-mapping code keeps working unchanged.
 * ─────────────────────────────────────────────────────────────────────────── */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not defined");
if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is not defined");

let _admin: SupabaseClient | undefined;

/** Reused across warm serverless invocations (singleton). */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(url as string, secretKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}
