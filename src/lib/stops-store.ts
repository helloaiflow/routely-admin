import { getSupabaseAdmin } from "@/lib/supabase";

/* M18: public.stops is the only store for stops. These helpers replace the old Mongo `stops` reads and the
 * `$set`/`$push` writes the portal made outside FastAPI. Writes rewrite the whole doc (same pattern as
 * draft_stops) and keep the status column in step with doc.status. */

export type StopDoc = Record<string, unknown>;

export async function loadStopDoc(stopId: string, tenantId: number): Promise<StopDoc | null> {
  const { data } = await getSupabaseAdmin()
    .from("stops")
    .select("doc")
    .eq("stop_id", stopId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (data?.doc as StopDoc | undefined) ?? null;
}

function setPath(doc: StopDoc, path: string, value: unknown) {
  const keys = path.split(".");
  let node = doc;
  for (const key of keys.slice(0, -1)) {
    const next = node[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) node[key] = {};
    node = node[key] as StopDoc;
  }
  node[keys[keys.length - 1]] = value instanceof Date ? value.toISOString() : value;
}

/** Applies dotted-path sets (and optional array appends) to the stop's doc. Returns false when the stop is not
 * this tenant's. */
export async function patchStopDoc(
  stopId: string,
  tenantId: number,
  set: Record<string, unknown>,
  push: Record<string, unknown> = {},
): Promise<boolean> {
  const doc = await loadStopDoc(stopId, tenantId);
  if (!doc) return false;
  for (const [path, value] of Object.entries(set)) setPath(doc, path, value);
  for (const [key, value] of Object.entries(push)) {
    const current = Array.isArray(doc[key]) ? (doc[key] as unknown[]) : [];
    doc[key] = [...current, value];
  }
  const now = new Date().toISOString();
  doc.updated_at = now;
  const row: Record<string, unknown> = { doc, updated_at: now };
  if (typeof set.status === "string") row.status = set.status;
  const { error } = await getSupabaseAdmin().from("stops").update(row).eq("stop_id", stopId).eq("tenant_id", tenantId);
  if (error) throw new Error(`stops update failed: ${error.message}`);
  return true;
}

/** Driver names from public.drivers (external_circuit_id = the Circuit/Spoke driver id on the stop). Stops whose
 * driver is not there keep the name cached on assignment.driver_name (the shapers fall back to it). */
export async function resolveDriverNames(docs: StopDoc[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [
    ...new Set(
      docs
        .map((d) => {
          const a = d.assignment as StopDoc | undefined;
          const leg = d.delivery_leg as StopDoc | undefined;
          return (a?.driver_id ?? leg?.driver_id) as string | undefined;
        })
        .filter(Boolean) as string[],
    ),
  ];
  if (ids.length === 0) return map;
  const { data } = await getSupabaseAdmin()
    .from("drivers")
    .select("name, external_circuit_id")
    .in("external_circuit_id", ids);
  for (const row of data ?? []) {
    if (row.external_circuit_id && row.name) map.set(String(row.external_circuit_id), String(row.name));
  }
  return map;
}
