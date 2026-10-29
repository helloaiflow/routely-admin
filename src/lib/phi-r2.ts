import { AwsClient } from "aws4fetch";

/* ───────────────────────────────────────────────────────────────────────────
 * Private PHI bucket (Cloudflare R2 `routely-phi`, incident 2026-10-29).
 * No public access: objects are only ever read server-side here and streamed
 * through session-gated, tenant-scoped routes. Credentials are server-only
 * env vars (PHI_R2_*), scoped by Cloudflare to this one bucket.
 *
 * IVY label photos: `ivy/{tenant_id}/{rtscan_id}.jpg`, written by the n8n
 * IVY v10 branch that runs after the driver is notified.
 * ───────────────────────────────────────────────────────────────────────────*/

const ACCOUNT_ID = process.env.PHI_R2_ACCOUNT_ID ?? "4ec960641f27592177aac8fcf3b823be";
const BUCKET = process.env.PHI_R2_BUCKET ?? "routely-phi";

let client: AwsClient | null = null;
function r2(): AwsClient | null {
  const accessKeyId = process.env.PHI_R2_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.PHI_R2_SECRET_ACCESS_KEY ?? "";
  if (!accessKeyId || !secretAccessKey) return null;
  client ??= new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  return client;
}

export function ivyPhotoKey(tenantId: number, rtscanId: number): string {
  return `ivy/${tenantId}/${rtscanId}.jpg`;
}

/** Fetch one object from routely-phi. Null when missing, unconfigured, or on any error. */
export async function fetchPhiObject(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
  const c = r2();
  if (!c) return null;
  try {
    const url = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
    const res = await c.fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!res.ok || !res.body) return null;
    return { body: res.body, contentType: res.headers.get("content-type") || "image/jpeg" };
  } catch {
    return null;
  }
}
