/**
 * M28-B · GlitchTip privacy filter (pure, no imports, runs in browser, Node and Edge).
 *
 * Allow-by-construction: the outgoing event is REBUILT from a closed list of
 * fields. Nothing the error carries (message, cause, properties, request, user,
 * URL, query, body, headers, cookies) is copied — only:
 *   - a static error type from TYPE_ALLOWLIST (else "UnknownError"),
 *   - a static description from the catalog (never the original message),
 *   - stack frames reduced to function name + bundle-relative file + line/col,
 *     each validated by a strict regex (anything else drops the frame),
 *   - closed-enum tags (app, runtime, operation, route_type, browser family)
 *     and the Next.js route TEMPLATE (e.g. /api/stops/[id]), never the real path.
 *
 * `sanitizeErrorEvent` never throws: any failure returns null (event dropped).
 * `guardEnvelope` re-validates the final serialized bytes against the same
 * schema right before the network call; a mismatch drops the event.
 */

export type Runtime = "browser" | "nodejs" | "edge";
export type Operation = "browser.unhandled_error" | "browser.unhandled_rejection" | "server.request_error";
export type Environment = "production" | "qa";
export type AppName = "routely-client" | "routely-admin";

export interface SanitizeContext {
  app: AppName;
  runtime: Runtime;
  operation: Operation;
  environment: Environment;
  release: string | null;
  routePath?: unknown;
  routeType?: unknown;
  userAgent?: unknown;
  now?: number;
}

export interface SafeFrame {
  function?: string;
  filename: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

export interface SafeEvent {
  event_id: string;
  timestamp: number;
  level: "error";
  platform: "javascript" | "node";
  logger: "routely.observability";
  environment: Environment;
  release?: string;
  tags: Record<string, string>;
  fingerprint: string[];
  exception: { values: [{ type: string; value: string; stacktrace?: { frames: SafeFrame[] } }] };
  sdk: { name: "routely.observability"; version: "1.0.0" };
}

export const QA_SYNTHETIC_TYPE = "RoutelyQASyntheticError";

const TYPE_ALLOWLIST = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AggregateError",
  "AbortError",
  "TimeoutError",
  "NetworkError",
  "ChunkLoadError",
  "NotFoundError",
  "NotAllowedError",
  "QuotaExceededError",
  "SecurityError",
  "InvalidStateError",
  "DataCloneError",
  QA_SYNTHETIC_TYPE,
]);

/** Static descriptions. The original message is NEVER sent. */
const CATALOG: Record<Operation, string> = {
  "browser.unhandled_error": "Unhandled error in the browser (details withheld by the privacy filter)",
  "browser.unhandled_rejection": "Unhandled promise rejection in the browser (details withheld by the privacy filter)",
  "server.request_error": "Unhandled error while serving a request (details withheld by the privacy filter)",
};
const QA_DESCRIPTION = "Synthetic QA error (no user data)";

const OPERATIONS = new Set<Operation>(Object.keys(CATALOG) as Operation[]);
const RUNTIMES = new Set<Runtime>(["browser", "nodejs", "edge"]);
const ROUTE_TYPES = new Set(["render", "route", "action", "proxy", "middleware"]);
const APPS = new Set<AppName>(["routely-client", "routely-admin"]);
const ENVIRONMENTS = new Set<Environment>(["production", "qa"]);
const BROWSERS = new Set(["chrome", "safari", "firefox", "edge", "other"]);

const MAX_STACK_CHARS = 16_000;
const MAX_FRAMES = 30;
const FN_RE = /^[A-Za-z_$][\w$]*(?:[.#][A-Za-z_$<>][\w$<>]*){0,6}(?: \[as [A-Za-z_$][\w$]*\])?$/;
const FILE_RE =
  /^(?:app:\/\/\/_next\/[\w\-./[\]~@]+|\.next\/[\w\-./[\]~@]+|node:[a-z_/]+|edge:\/\/\/[\w.-]{1,80}\.js)$/;
const ROUTE_RE = /^\/[\w\-/[\].()@]{0,200}$/;
const ROUTE_SEGMENT_RE =
  /^(?:[A-Za-z_-][\w-]{0,60}|\[{1,2}(?:\.\.\.)?[\w-]{1,60}\]{1,2}|\([\w-]{1,60}\)|@[\w-]{1,60})$/;

/** Next.js route TEMPLATE only (/api/stops/[id]); anything that looks like a real value is rejected. */
export function safeRoute(raw: unknown): string | null {
  if (typeof raw !== "string" || !ROUTE_RE.test(raw)) return null;
  if (raw === "/") return raw;
  const segments = raw.slice(1).split("/");
  for (const seg of segments) {
    if (!ROUTE_SEGMENT_RE.test(seg)) return null;
    if (/\d{4,}/.test(seg) || /[0-9a-f]{12,}/i.test(seg)) return null; // ids, hashes
  }
  return raw;
}
const RELEASE_RE = /^routely-(?:client|admin)@[0-9a-f]{7,12}$/;
const EVENT_ID_RE = /^[0-9a-f]{32}$/;
const SAFE_CHAR_TAG_RE = /^[\w\-./[\]()@]{1,200}$/;

function hex32(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function readErrorType(error: object): string {
  let name: unknown;
  try {
    name = (error as { name?: unknown }).name;
  } catch {
    return "UnknownError";
  }
  return typeof name === "string" && TYPE_ALLOWLIST.has(name) ? name : "UnknownError";
}

function readStack(error: object): string | null {
  let stack: unknown;
  try {
    stack = (error as { stack?: unknown }).stack;
  } catch {
    return null;
  }
  return typeof stack === "string" ? stack.slice(0, MAX_STACK_CHARS) : null;
}

/** Reduce a raw location to a bundle-relative file, or null (frame dropped). */
export function safeFilename(raw: string, origin: string | null): string | null {
  let loc = raw.trim();
  if (/^https?:\/\//.test(loc)) {
    let url: URL;
    try {
      url = new URL(loc);
    } catch {
      return null;
    }
    // Only our own origin's Next.js bundles; query and fragment are discarded.
    if (origin && url.origin !== origin) return null;
    if (!url.pathname.startsWith("/_next/")) return null;
    loc = `app:///${url.pathname.slice(1)}`;
    return FILE_RE.test(loc) ? loc : null;
  }
  if (loc.startsWith("node:")) return FILE_RE.test(loc) ? loc : null;
  // Vercel Edge bundles report a bare chunk name ("index.js"): no path, no data.
  const bare = /^\(?([\w.-]{1,80}\.js)$/.exec(loc);
  if (bare) return `edge:///${bare[1]}`;
  if (loc.startsWith("file://")) loc = loc.slice("file://".length);
  const idx = loc.indexOf("/.next/");
  if (idx >= 0) loc = loc.slice(idx + 1);
  else if (loc.startsWith(".next/")) {
    // already relative
  } else return null;
  loc = loc.split(/[?#]/)[0];
  return FILE_RE.test(loc) ? loc : null;
}

function safeFunction(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const fn = raw
    .trim()
    .replace(/^async\s+/, "")
    .replace(/^new\s+/, "");
  return FN_RE.test(fn) && fn.length <= 120 ? fn : undefined;
}

function safeInt(raw: string): number | undefined {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 10_000_000 ? n : undefined;
}

const V8_RE = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
const GECKO_RE = /^\s*([^@]*)@(.+?):(\d+):(\d+)\s*$/;

/** Parse V8 / Gecko / JSC stacks into validated frames (oldest first, Sentry order). */
export function parseStack(stack: string, origin: string | null): SafeFrame[] {
  const frames: SafeFrame[] = [];
  for (const line of stack.split("\n").slice(0, 200)) {
    const m = V8_RE.exec(line) ?? GECKO_RE.exec(line);
    if (!m) continue;
    const filename = safeFilename(m[2], origin);
    if (!filename) continue;
    const frame: SafeFrame = { filename, in_app: !filename.startsWith("node:") };
    const fn = safeFunction(m[1]);
    if (fn) frame.function = fn;
    const lineno = safeInt(m[3]);
    const colno = safeInt(m[4]);
    if (lineno) frame.lineno = lineno;
    if (colno) frame.colno = colno;
    frames.push(frame);
    if (frames.length >= MAX_FRAMES) break;
  }
  return frames.reverse();
}

function browserFamily(ua: unknown): string {
  if (typeof ua !== "string") return "other";
  if (/Edg\//.test(ua)) return "edge";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua)) return "safari";
  return "other";
}

export function sanitizeErrorEvent(error: unknown, ctx: SanitizeContext): SafeEvent | null {
  try {
    if (!APPS.has(ctx.app) || !RUNTIMES.has(ctx.runtime) || !OPERATIONS.has(ctx.operation)) return null;
    if (!ENVIRONMENTS.has(ctx.environment)) return null;
    if (typeof error !== "object" || error === null) return null;

    const type = readErrorType(error);
    const isQa = type === QA_SYNTHETIC_TYPE;
    const stack = readStack(error);
    const origin =
      ctx.runtime === "browser" && typeof location !== "undefined" && typeof location.origin === "string"
        ? location.origin
        : null;
    const frames = stack ? parseStack(stack, origin) : [];
    // Without a single validated frame of ours the event is noise (extensions,
    // cross-origin "Script error.") — drop it. QA synthetic events are exempt.
    if (!isQa && !frames.some((f) => f.in_app)) return null;

    const tags: Record<string, string> = {
      app: ctx.app,
      runtime: ctx.runtime,
      operation: isQa ? "qa.synthetic" : ctx.operation,
    };
    if (typeof ctx.routeType === "string" && ROUTE_TYPES.has(ctx.routeType)) tags.route_type = ctx.routeType;
    const route = safeRoute(ctx.routePath);
    if (route) tags.route = route;
    if (ctx.runtime === "browser") tags.browser = browserFamily(ctx.userAgent);

    const top = [...frames].reverse().find((f) => f.in_app);
    const event: SafeEvent = {
      event_id: hex32(),
      timestamp: Math.floor((ctx.now ?? Date.now()) / 1000),
      level: "error",
      platform: ctx.runtime === "browser" ? "javascript" : "node",
      logger: "routely.observability",
      environment: isQa ? "qa" : ctx.environment,
      tags,
      fingerprint: [tags.operation, type, top ? `${top.function ?? "anonymous"}@${top.filename}` : "no-frame"],
      exception: {
        values: [
          {
            type,
            value: isQa ? QA_DESCRIPTION : CATALOG[ctx.operation],
            ...(frames.length ? { stacktrace: { frames } } : {}),
          },
        ],
      },
      sdk: { name: "routely.observability", version: "1.0.0" },
    };
    if (ctx.release && RELEASE_RE.test(ctx.release)) event.release = ctx.release;
    return validateSafeEvent(event) ? event : null;
  } catch {
    return null;
  }
}

// ── Exact-schema validation (used on the object AND on the serialized bytes) ──

function exactKeys(obj: unknown, required: string[], optional: string[] = []): obj is Record<string, unknown> {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  const allowed = new Set([...required, ...optional]);
  return required.every((k) => k in obj) && keys.every((k) => allowed.has(k));
}

function validFrame(f: unknown): boolean {
  if (!exactKeys(f, ["filename", "in_app"], ["function", "lineno", "colno"])) return false;
  if (typeof f.filename !== "string" || !FILE_RE.test(f.filename)) return false;
  if (typeof f.in_app !== "boolean") return false;
  if (f.function !== undefined && (typeof f.function !== "string" || !FN_RE.test(f.function))) return false;
  for (const k of ["lineno", "colno"] as const) {
    const v = f[k];
    if (v !== undefined && (typeof v !== "number" || !Number.isInteger(v) || v <= 0 || v >= 10_000_000)) return false;
  }
  return true;
}

export function validateSafeEvent(e: unknown): e is SafeEvent {
  if (
    !exactKeys(
      e,
      [
        "event_id",
        "timestamp",
        "level",
        "platform",
        "logger",
        "environment",
        "tags",
        "fingerprint",
        "exception",
        "sdk",
      ],
      ["release"],
    )
  )
    return false;
  if (typeof e.event_id !== "string" || !EVENT_ID_RE.test(e.event_id)) return false;
  if (typeof e.timestamp !== "number" || !Number.isInteger(e.timestamp) || e.timestamp < 1.7e9 || e.timestamp > 4e9)
    return false;
  if (e.level !== "error" || (e.platform !== "javascript" && e.platform !== "node")) return false;
  if (e.logger !== "routely.observability") return false;
  if (typeof e.environment !== "string" || !ENVIRONMENTS.has(e.environment as Environment)) return false;
  if (e.release !== undefined && (typeof e.release !== "string" || !RELEASE_RE.test(e.release))) return false;
  if (!exactKeys(e.sdk, ["name", "version"]) || e.sdk.name !== "routely.observability" || e.sdk.version !== "1.0.0")
    return false;

  const t = e.tags;
  if (!exactKeys(t, ["app", "runtime", "operation"], ["route_type", "route", "browser"])) return false;
  if (!APPS.has(t.app as AppName) || !RUNTIMES.has(t.runtime as Runtime)) return false;
  if (t.operation !== "qa.synthetic" && !OPERATIONS.has(t.operation as Operation)) return false;
  if (t.route_type !== undefined && !ROUTE_TYPES.has(t.route_type as string)) return false;
  if (t.route !== undefined && safeRoute(t.route) !== t.route) return false;
  if (t.browser !== undefined && !BROWSERS.has(t.browser as string)) return false;

  if (!Array.isArray(e.fingerprint) || e.fingerprint.length !== 3) return false;
  const [fOp, fType, fTop] = e.fingerprint as unknown[];
  if (fOp !== t.operation || typeof fType !== "string" || (!TYPE_ALLOWLIST.has(fType) && fType !== "UnknownError"))
    return false;
  if (typeof fTop !== "string") return false;
  if (fTop !== "no-frame") {
    const at = fTop.indexOf("@"); // function names never contain "@"; filenames may
    const fn = fTop.slice(0, at);
    const file = fTop.slice(at + 1);
    if (!FN_RE.test(fn) || !FILE_RE.test(file)) return false;
  }

  if (!exactKeys(e.exception, ["values"]) || !Array.isArray(e.exception.values) || e.exception.values.length !== 1)
    return false;
  const v = e.exception.values[0] as unknown;
  if (!exactKeys(v, ["type", "value"], ["stacktrace"])) return false;
  if (typeof v.type !== "string" || (v.type !== "UnknownError" && !TYPE_ALLOWLIST.has(v.type))) return false;
  if (v.value !== QA_DESCRIPTION && !Object.values(CATALOG).includes(v.value as string)) return false;
  if (v.stacktrace !== undefined) {
    if (!exactKeys(v.stacktrace, ["frames"]) || !Array.isArray(v.stacktrace.frames)) return false;
    if (v.stacktrace.frames.length > MAX_FRAMES || !v.stacktrace.frames.every(validFrame)) return false;
  }
  for (const val of Object.values(t)) if (typeof val !== "string" || !SAFE_CHAR_TAG_RE.test(val)) return false;
  return true;
}

// ── Envelope (Sentry protocol, accepted by GlitchTip) ──

export function buildEnvelope(event: SafeEvent, now: number = Date.now()): string {
  const header = { event_id: event.event_id, sent_at: new Date(now).toISOString() };
  return `${JSON.stringify(header)}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
}

const SENT_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Last check on the exact bytes that will leave the process. */
export function guardEnvelope(body: string): boolean {
  try {
    if (typeof body !== "string" || body.length > 64_000) return false;
    const lines = body.split("\n");
    if (lines.length !== 4 || lines[3] !== "") return false;
    const header = JSON.parse(lines[0]) as unknown;
    const item = JSON.parse(lines[1]) as unknown;
    const event = JSON.parse(lines[2]) as unknown;
    if (!exactKeys(header, ["event_id", "sent_at"])) return false;
    if (typeof header.sent_at !== "string" || !SENT_AT_RE.test(header.sent_at)) return false;
    if (!exactKeys(item, ["type"]) || item.type !== "event") return false;
    if (!validateSafeEvent(event) || header.event_id !== event.event_id) return false;
    // Belt and braces on every free-ish string (filenames are already pinned by FILE_RE).
    const ex = event.exception.values[0];
    const fns = (ex.stacktrace?.frames ?? []).map((f) => f.function ?? "");
    const scan = [...Object.values(event.tags), ex.type, ex.value, ...fns].join("\n");
    if (/[\w.%+-]+@[\w-]+\.[A-Za-z]{2,}/.test(scan)) return false; // email
    if (/eyJ[\w-]{8,}\.[\w-]{8,}/.test(scan)) return false; // JWT
    if (/\+?\d[\d\s().-]{8,}\d/.test(scan)) return false; // phone-like digit runs
    if (/[?#&]|%[0-9A-Fa-f]{2}/.test(lines[2])) return false; // query, fragment, encoded payloads
    return true;
  } catch {
    return false;
  }
}
