/**
 * M28-B · Synthetic QA error for the GlitchTip self-test routes.
 * Answers 404 unless OBSERVABILITY_SELFTEST_TOKEN is set (>= 32 chars) and the
 * x-routely-selftest header matches it (constant-time compare). When it
 * matches, it throws a RoutelyQASyntheticError so the real onRequestError
 * path reports it (environment "qa", static description, no user data).
 */

import { QA_SYNTHETIC_TYPE, type Runtime } from "./privacy-filter";
import { sendError } from "./reporter";

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function synthetic(): Error {
  const err = new Error("synthetic");
  err.name = QA_SYNTHETIC_TYPE;
  return err;
}

/**
 * x-routely-selftest-mode: "direct" → report through the reporter and answer the
 * static outcome code (sent / http_NNN / network_error / disabled …).
 * Otherwise → throw, so the real onRequestError path reports it.
 */
export async function runSelftest(req: Request, runtime: Runtime): Promise<Response> {
  const token = process.env.OBSERVABILITY_SELFTEST_TOKEN?.trim() ?? "";
  const given = req.headers.get("x-routely-selftest") ?? "";
  if (token.length < 32 || !sameSecret(given, token)) return new Response(null, { status: 404 });
  if (req.headers.get("x-routely-selftest-mode") === "direct") {
    const { stage, eventId } = await sendError(synthetic(), { operation: "server.request_error", runtime });
    return Response.json({ runtime, stage, eventId: eventId ?? null }, { headers: { "Cache-Control": "no-store" } });
  }
  throw synthetic();
}
