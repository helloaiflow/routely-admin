// biome-ignore lint/suspicious/noExplicitAny: Shippo SDK v4 ESM interop
let _client: any = null;

export function getShippo() {
  if (_client) return _client;
  const key = process.env.SHIPPO_API_KEY;
  if (!key) throw new Error("SHIPPO_API_KEY not set");

  // Lazy dynamic require avoids ESM interop issues with Shippo SDK v4
  // biome-ignore lint/suspicious/noExplicitAny: Shippo SDK v4 ESM interop
  // biome-ignore lint/style/noCommonJs: required for Shippo SDK v4 ESM interop in Next.js
  const mod = require("shippo") as any; // eslint-disable-line @typescript-eslint/no-require-imports
  const Cls = mod?.default ?? mod?.Shippo ?? mod;
  _client = new Cls({ apiKeyHeader: key });
  return _client;
}

export const DEFAULT_PARCEL = {
  length: "9",
  width: "6",
  height: "3",
  distanceUnit: "in",
  weight: "8",
  massUnit: "oz",
} as const;
