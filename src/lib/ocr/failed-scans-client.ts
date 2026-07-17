/* ── Failed-scans client helpers ─────────────────────────────────────────────
 * Persist / fetch / resolve the same-day failed-scan tray (see
 * /api/client/failed-scans). The label image is downscaled before upload so the
 * Mongo doc stays small (it lives in the document, not R2).
 * ─────────────────────────────────────────────────────────────────────────── */

export interface FailedScan {
  id: string;
  image: string | null; // data URL
  name: string | null;
  phone: string | null;
  address: string | null;
  dob: string | null;
  orderIds: string[];
  reasons: string[];
  createdAt: string | null;
}

export interface PersistFailedScanInput {
  image: string; // data URL (will be downscaled)
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  dob?: string | null;
  orderIds?: string[];
  reasons?: string[];
  source?: "batch" | "single";
}

/**
 * Downscale a data URL to a max dimension + re-encode as JPEG so the persisted
 * image stays small (a label is legible well under 1280px). Falls back to the
 * original string if anything goes wrong (canvas unavailable, decode error).
 */
export function downscaleDataUrl(dataUrl: string, maxDim = 1280, quality = 0.6): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(dataUrl);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
}

/**
 * Persist a failed scan. Best-effort and never throws — a persistence failure
 * must not break the live scanning flow (the in-window correction still works).
 */
export async function persistFailedScan(input: PersistFailedScanInput): Promise<string | null> {
  try {
    const image = await downscaleDataUrl(input.image);
    const res = await fetch("/api/client/failed-scans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image,
        name: input.name ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        dob: input.dob ?? null,
        orderIds: input.orderIds ?? [],
        reasons: input.reasons ?? [],
        source: input.source ?? "batch",
      }),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { id?: string };
    return d.id ?? null;
  } catch {
    return null;
  }
}

/** Lightweight pending count for the page badge (no images in the payload). */
export async function fetchFailedScansCount(): Promise<number> {
  try {
    const res = await fetch("/api/client/failed-scans?count=1");
    if (!res.ok) return 0;
    const d = (await res.json()) as { count?: number };
    return d.count ?? 0;
  } catch {
    return 0;
  }
}

export async function fetchFailedScans(): Promise<FailedScan[]> {
  try {
    const res = await fetch("/api/client/failed-scans");
    if (!res.ok) return [];
    const d = (await res.json()) as { items?: FailedScan[] };
    return d.items ?? [];
  } catch {
    return [];
  }
}

export async function resolveFailedScan(id: string, status: "resolved" | "discarded"): Promise<boolean> {
  try {
    const res = await fetch("/api/client/failed-scans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Bulk discard (delete selected / all) — single round-trip. */
export async function discardFailedScans(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  try {
    const res = await fetch("/api/client/failed-scans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status: "discarded" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Convert a stored data URL back into a File so it can be fed to the scanner. */
export function dataUrlToFile(dataUrl: string, filename = "failed-scan.jpg"): File {
  const [header, b64] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(header)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}
