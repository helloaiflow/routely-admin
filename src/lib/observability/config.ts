/**
 * M28-B · GlitchTip configuration. Off unless EVERY condition holds:
 *   - the DSN parses, is https and points at errors.helloai.my (never sentry.io),
 *   - the flag is "true" on a Vercel production build, or "qa" (explicit QA run).
 * Browser reads NEXT_PUBLIC_* (inlined at build); Node/Edge read the server vars.
 * Kill switch: set the flag to "false" (or remove the DSN) and redeploy.
 */

import type { AppName, Environment, Runtime } from "./privacy-filter";

export const APP_NAME: AppName = "routely-admin";
const INGEST_HOST = "errors.helloai.my";

export interface ObservabilityConfig {
  app: AppName;
  environment: Environment;
  release: string | null;
  endpoint: string;
}

export function parseDsn(raw: string | undefined): { endpoint: string } | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== INGEST_HOST || url.port !== "") return null;
  if (!/^[0-9a-f]{32}$/.test(url.username) || url.password) return null;
  const project = /^\/(\d{1,6})$/.exec(url.pathname)?.[1];
  if (!project || url.search || url.hash) return null;
  const qs = `sentry_version=7&sentry_key=${url.username}&sentry_client=routely.observability%2F1.0.0`;
  return { endpoint: `https://${INGEST_HOST}/api/${project}/envelope/?${qs}` };
}

export function resolveConfig(input: {
  dsn: string | undefined;
  flag: string | undefined;
  vercelEnv: string | undefined;
  sha: string | undefined;
}): ObservabilityConfig | null {
  const flag = input.flag?.trim().toLowerCase();
  let environment: Environment;
  if (flag === "qa") environment = "qa";
  else if (flag === "true" && input.vercelEnv?.trim() === "production") environment = "production";
  else return null;
  const dsn = parseDsn(input.dsn);
  if (!dsn) return null;
  const sha = input.sha?.trim().toLowerCase().slice(0, 12);
  const release = sha && /^[0-9a-f]{7,12}$/.test(sha) ? `${APP_NAME}@${sha}` : null;
  return { app: APP_NAME, environment, release, endpoint: dsn.endpoint };
}

export function readConfig(runtime: Runtime): ObservabilityConfig | null {
  if (runtime === "browser") {
    // Literal references so Next inlines them into the client bundle.
    return resolveConfig({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      flag: process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED,
      vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
      sha: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    });
  }
  return resolveConfig({
    dsn: process.env.SENTRY_DSN,
    flag: process.env.OBSERVABILITY_ENABLED,
    vercelEnv: process.env.VERCEL_ENV,
    sha: process.env.VERCEL_GIT_COMMIT_SHA,
  });
}
