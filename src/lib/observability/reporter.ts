/**
 * M28-B · Error reporter (browser, Node, Edge). One fetch per event, no retries,
 * no breadcrumbs, no tracing, no replay, no sessions, no attachments, no logs.
 * Never throws and never logs the original error: a failure anywhere drops the event.
 */

import { type ObservabilityConfig, readConfig } from "./config";
import { buildEnvelope, guardEnvelope, type Operation, type Runtime, sanitizeErrorEvent } from "./privacy-filter";

const MAX_PER_MINUTE = 10;
const TIMEOUT_MS = 3000;
const SERVER_UA = "routely-observability/1.0 (+https://routelypro.com)";

let windowStart = 0;
let windowCount = 0;
const recent = new Map<string, number>();

export interface CaptureOptions {
  operation: Operation;
  runtime: Runtime;
  routePath?: unknown;
  routeType?: unknown;
  /** Test seams; production code never passes these. */
  config?: ObservabilityConfig | null;
  fetchImpl?: typeof fetch;
}

function allow(fingerprint: string, now: number): boolean {
  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
    recent.clear();
  }
  if (windowCount >= MAX_PER_MINUTE || recent.has(fingerprint)) return false;
  windowCount += 1;
  recent.set(fingerprint, now);
  return true;
}

/** Static outcome codes only (safe to return from the self-test; never error content). */
export type SendStage =
  | "disabled"
  | "dropped"
  | "rate_limited"
  | "guard_rejected"
  | "network_error"
  | `http_${number}`
  | "sent";

export async function sendError(error: unknown, opts: CaptureOptions): Promise<{ stage: SendStage; eventId?: string }> {
  try {
    const cfg = opts.config !== undefined ? opts.config : readConfig(opts.runtime);
    if (!cfg) return { stage: "disabled" };
    const now = Date.now();
    const event = sanitizeErrorEvent(error, {
      app: cfg.app,
      runtime: opts.runtime,
      operation: opts.operation,
      environment: cfg.environment,
      release: cfg.release,
      routePath: opts.routePath,
      routeType: opts.routeType,
      userAgent: opts.runtime === "browser" && typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      now,
    });
    if (!event) return { stage: "dropped" };
    if (!allow(event.fingerprint.join("|"), now)) return { stage: "rate_limited" };
    const body = buildEnvelope(event, now);
    if (!guardEnvelope(body)) return { stage: "guard_rejected" };

    const doFetch = opts.fetchImpl ?? globalThis.fetch;
    const headers: Record<string, string> = { "Content-Type": "text/plain;charset=UTF-8" };
    if (opts.runtime !== "browser") headers["User-Agent"] = SERVER_UA;
    let res: { ok: boolean; status?: number };
    try {
      res = await doFetch(cfg.endpoint, {
        method: "POST",
        body,
        headers,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        keepalive: opts.runtime === "browser",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { stage: "network_error" };
    }
    return res.ok ? { stage: "sent", eventId: event.event_id } : { stage: `http_${res.status ?? 0}` };
  } catch {
    return { stage: "dropped" };
  }
}

/** Resolves to the accepted event id, or null when nothing was sent. Never throws. */
export async function captureError(error: unknown, opts: CaptureOptions): Promise<string | null> {
  const { eventId } = await sendError(error, opts);
  return eventId ?? null;
}
