/**
 * M28-B · Server (Node) and Edge error capture for GlitchTip.
 * `onRequestError` receives the request, but only the static route TEMPLATE
 * (context.routePath) and route type are forwarded; the request itself
 * (URL, headers, cookies, body) is never read.
 */

import type { Instrumentation } from "next";

export function register() {
  // Nothing to set up: the reporter is created lazily and is inert without config.
}

type WaitUntil = (p: Promise<unknown>) => void;

/** The platform's waitUntil (Vercel request context), so Edge does not cut the send short. */
function platformWaitUntil(): WaitUntil | null {
  for (const key of ["@vercel/request-context", "@next/request-context"]) {
    try {
      const holder = (globalThis as Record<symbol, { get?: () => { waitUntil?: WaitUntil } | undefined }>)[
        Symbol.for(key)
      ];
      const wait = holder?.get?.()?.waitUntil;
      if (typeof wait === "function") return wait;
    } catch {
      // ignore and try the next one
    }
  }
  return null;
}

export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  const send = import("@/lib/observability/reporter").then(({ captureError }) =>
    captureError(error, {
      operation: "server.request_error",
      runtime: process.env.NEXT_RUNTIME === "edge" ? "edge" : "nodejs",
      routePath: context.routePath,
      routeType: context.routeType,
    }),
  );
  try {
    platformWaitUntil()?.(send.catch(() => null));
  } catch {
    // fall through: we still await below
  }
  await send.catch(() => null);
};
