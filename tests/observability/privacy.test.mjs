// M28-B · Privacy tests for the GlitchTip reporter. FAKE data only.
// Run: node --import ./tests/observability/ts-resolve.mjs --test tests/observability/

import { parseDsn, resolveConfig } from "../../src/lib/observability/config.ts";
import {
  buildEnvelope,
  guardEnvelope,
  parseStack,
  sanitizeErrorEvent,
  validateSafeEvent,
} from "../../src/lib/observability/privacy-filter.ts";
import { captureError } from "../../src/lib/observability/reporter.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const FAKE_DSN = "https://0123456789abcdef0123456789abcdef@errors.helloai.my/9999";
const CANARIES = [
  "qa.canary@example.invalid",
  "qa.canary%40example.invalid",
  "+1-202-555-0147",
  "(305) 555-0199",
  "3055550199",
  "Zyxwv Canaryname",
  "742 Evergreen Terrace",
  "25.761681",
  "-80.191788",
  "MRN-0000123",
  "Rx#998877",
  "Amoxicillin 500mg",
  "stop_canary_123",
  "tenant_canary_77",
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjYW5hcnkifQ.c2lnbmF0dXJlY2FuYXJ5",
  "sb-canary-auth-token",
  "Bearer canarytoken",
  "X-Amz-Signature=canarysig",
  "canary_cookie_value",
  "token=canaryquery",
  "frag-canary",
  "/Users/canaryuser/",
];
const CANARY_TEXT = CANARIES.join(" | ");

function contaminatedError() {
  const err = new Error(`Failed for ${CANARY_TEXT}`);
  err.name = "TypeError";
  err.cause = new Error(`cause ${CANARY_TEXT}`);
  err.request = {
    url: "https://app.routelypro.com/stops/stop_canary_123?token=canaryquery#frag-canary",
    headers: { cookie: "canary_cookie_value", authorization: "Bearer canarytoken" },
    body: CANARY_TEXT,
  };
  err.user = { email: "qa.canary@example.invalid", phone: "+1-202-555-0147" };
  err.extra = { deep: { deeper: { list: [CANARY_TEXT, { more: CANARY_TEXT }] } } };
  err.stack = [
    `TypeError: Failed for ${CANARY_TEXT}`,
    "    at handleStop (https://app.routelypro.com/_next/static/chunks/app_page.js?token=canaryquery#frag-canary:12:34)",
    "    at Object.render [as call] (https://app.routelypro.com/_next/static/chunks/main-app.js:1:2)",
    "    at qa.canary@example.invalid (https://app.routelypro.com/_next/static/chunks/x.js:3:4)",
    "    at evil (https://cdn.canary.example/stop_canary_123/x.js:5:6)",
    "    at ext (chrome-extension://abcdef/content.js:7:8)",
    "    at /Users/canaryuser/project/src/x.ts:9:10",
    "    at serverFn (/var/task/.next/server/chunks/ssr/[root-of-the-server]__abc._.js:11:12)",
    "    at node:internal/process/task_queues:95:5",
    `    at weird (https://app.routelypro.com/_next/static/chunks/${encodeURIComponent("Zyxwv Canaryname")}.js:1:1)`,
  ].join("\n");
  return err;
}

const CTX = {
  app: "routely-admin",
  runtime: "browser",
  operation: "browser.unhandled_error",
  environment: "production",
  release: "routely-admin@abcdef123456",
  userAgent: "Mozilla/5.0 Chrome/140.0",
};

function assertNoCanary(text) {
  for (const c of CANARIES) assert.ok(!text.includes(c), `canary leaked: ${c}`);
  for (const c of ["canary", "Canary", "Failed for", "cookie", "Bearer", "token="])
    assert.ok(!text.includes(c), `leak: ${c}`);
}

test("contaminated error → only allowlisted, canary-free event", () => {
  globalThis.location = { origin: "https://app.routelypro.com" };
  const ev = sanitizeErrorEvent(contaminatedError(), CTX);
  assert.ok(ev);
  assert.ok(validateSafeEvent(ev));
  const body = buildEnvelope(ev);
  assertNoCanary(body);
  assert.ok(guardEnvelope(body));
  assert.equal(ev.exception.values[0].type, "TypeError");
  assert.match(ev.exception.values[0].value, /details withheld/);
  const files = ev.exception.values[0].stacktrace.frames.map((f) => f.filename);
  assert.deepEqual(files, [
    "node:internal/process/task_queues",
    ".next/server/chunks/ssr/[root-of-the-server]__abc._.js",
    "app:///_next/static/chunks/x.js", // frame kept, its fake "function" name dropped
    "app:///_next/static/chunks/main-app.js",
    "app:///_next/static/chunks/app_page.js",
  ]);
  assert.equal(ev.exception.values[0].stacktrace.frames[2].function, undefined);
  assert.equal(ev.tags.browser, "chrome");
  assert.deepEqual(Object.keys(ev).sort(), [
    "environment",
    "event_id",
    "exception",
    "fingerprint",
    "level",
    "logger",
    "platform",
    "release",
    "sdk",
    "tags",
    "timestamp",
  ]);
  delete globalThis.location;
});

test("unknown type, non-objects, no own frames → generic or dropped", () => {
  const e = new Error("x");
  e.name = "Zyxwv Canaryname";
  e.stack = "Error\n    at a (/var/task/.next/server/app/page.js:1:1)";
  const ev = sanitizeErrorEvent(e, { ...CTX, runtime: "nodejs", operation: "server.request_error" });
  assert.equal(ev.exception.values[0].type, "UnknownError");
  assert.equal(sanitizeErrorEvent("qa.canary@example.invalid", CTX), null);
  assert.equal(sanitizeErrorEvent(null, CTX), null);
  const foreign = new Error("x");
  foreign.stack = "Error\n    at x (chrome-extension://abc/c.js:1:1)";
  assert.equal(sanitizeErrorEvent(foreign, CTX), null);
});

test("hostile getters and cycles never throw, never leak", () => {
  const hostile = {};
  Object.defineProperty(hostile, "name", {
    get() {
      throw new Error("boom");
    },
  });
  Object.defineProperty(hostile, "stack", {
    get() {
      throw new Error("boom");
    },
  });
  assert.equal(sanitizeErrorEvent(hostile, CTX), null);
  const cyc = new Error("c");
  cyc.self = cyc;
  cyc.stack = "Error\n    at f (/var/task/.next/server/x.js:1:1)";
  assert.ok(sanitizeErrorEvent(cyc, { ...CTX, runtime: "edge", operation: "server.request_error" }));
});

test("route templates kept, real paths/queries rejected", () => {
  const e = new Error("x");
  e.stack = "Error\n    at f (/var/task/.next/server/x.js:1:1)";
  const base = { ...CTX, runtime: "nodejs", operation: "server.request_error" };
  assert.equal(
    sanitizeErrorEvent(e, { ...base, routePath: "/api/stops/[id]", routeType: "route" }).tags.route,
    "/api/stops/[id]",
  );
  assert.equal(sanitizeErrorEvent(e, { ...base, routePath: "/api/stops/x?token=canaryquery" }).tags.route, undefined);
  assert.equal(sanitizeErrorEvent(e, { ...base, routePath: "/u/qa.canary@example.invalid" }).tags.route, undefined);
  assert.equal(sanitizeErrorEvent(e, { ...base, routeType: "canary" }).tags.route_type, undefined);
  assert.equal(sanitizeErrorEvent(e, { ...base, routePath: "/stops/1234567" }).tags.route, undefined);
  assert.equal(
    sanitizeErrorEvent(e, { ...base, routePath: "/(main)/dashboard/[...slug]" }).tags.route,
    "/(main)/dashboard/[...slug]",
  );
});

test("guard rejects any tampered or extra field in the bytes", () => {
  const e = new Error("x");
  e.stack = "Error\n    at f (/var/task/.next/server/x.js:1:1)";
  const ev = sanitizeErrorEvent(e, { ...CTX, runtime: "nodejs", operation: "server.request_error" });
  assert.ok(guardEnvelope(buildEnvelope(ev)));
  for (const mutate of [
    (x) => {
      x.user = { email: "qa.canary@example.invalid" };
    },
    (x) => {
      x.request = { url: "/x" };
    },
    (x) => {
      x.extra = {};
    },
    (x) => {
      x.breadcrumbs = [];
    },
    (x) => {
      x.contexts = {};
    },
    (x) => {
      x.tags.tenant = "tenant_canary_77";
    },
    (x) => {
      x.exception.values[0].value = "Failed for qa.canary@example.invalid";
    },
    (x) => {
      x.exception.values[0].stacktrace.frames[0].vars = { a: 1 };
    },
    (x) => {
      x.exception.values[0].stacktrace.frames[0].filename = "/Users/canaryuser/x.js";
    },
    (x) => {
      x.release = "3055550199";
    },
  ]) {
    const copy = structuredClone(ev);
    mutate(copy);
    assert.equal(guardEnvelope(buildEnvelope(copy)), false);
  }
  assert.equal(guardEnvelope(`${buildEnvelope(ev)}{"type":"attachment"}\n`), false);
});

test("config: off by default, only errors.helloai.my, never sentry.io", () => {
  assert.equal(resolveConfig({ dsn: FAKE_DSN, flag: undefined, vercelEnv: "production", sha: "abc1234" }), null);
  assert.equal(resolveConfig({ dsn: FAKE_DSN, flag: "true", vercelEnv: "preview", sha: "abc1234" }), null);
  assert.equal(resolveConfig({ dsn: FAKE_DSN, flag: "false", vercelEnv: "production", sha: "abc1234" }), null);
  assert.equal(resolveConfig({ dsn: undefined, flag: "true", vercelEnv: "production" }), null);
  assert.equal(parseDsn("https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io/9999"), null);
  assert.equal(parseDsn("http://0123456789abcdef0123456789abcdef@errors.helloai.my/9999"), null);
  assert.equal(parseDsn("https://0123456789abcdef0123456789abcdef@errors.helloai.my.evil.example/9999"), null);
  const cfg = resolveConfig({ dsn: FAKE_DSN, flag: "true", vercelEnv: "production", sha: "ABCDEF1234567890" });
  assert.equal(cfg.environment, "production");
  assert.equal(cfg.release, "routely-admin@abcdef123456");
  assert.equal(
    cfg.endpoint,
    "https://errors.helloai.my/api/9999/envelope/?sentry_version=7&sentry_key=0123456789abcdef0123456789abcdef&sentry_client=routely.observability%2F1.0.0",
  );
  assert.equal(resolveConfig({ dsn: FAKE_DSN, flag: "qa", vercelEnv: undefined }).environment, "qa");
});

test("transport: exact outgoing bytes are clean; failures send nothing and never throw", async () => {
  const cfg = resolveConfig({ dsn: FAKE_DSN, flag: "qa", vercelEnv: undefined, sha: "abc1234" });
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true };
  };
  const err = contaminatedError();
  err.stack = err.stack.replaceAll("https://app.routelypro.com", "/var/task/.next/server");
  const id = await captureError(err, {
    operation: "server.request_error",
    runtime: "nodejs",
    config: cfg,
    fetchImpl: fakeFetch,
    routePath: "/api/stops/[id]",
  });
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.ok(url.startsWith("https://errors.helloai.my/api/9999/envelope/"));
  assertNoCanary(init.body);
  assert.ok(guardEnvelope(init.body));
  assert.deepEqual(Object.keys(init.headers).sort(), ["Content-Type", "User-Agent"]);
  assert.equal(init.credentials, "omit");
  assert.equal(init.referrerPolicy, "no-referrer");

  // Duplicate fingerprint within a minute → not sent again.
  assert.equal(
    await captureError(err, {
      operation: "server.request_error",
      runtime: "nodejs",
      config: cfg,
      fetchImpl: fakeFetch,
      routePath: "/api/stops/[id]",
    }),
    null,
  );
  assert.equal(calls.length, 1);
  // Disabled config → zero network.
  assert.equal(
    await captureError(err, {
      operation: "server.request_error",
      runtime: "nodejs",
      config: null,
      fetchImpl: fakeFetch,
    }),
    null,
  );
  // Network down → null, no throw.
  const e2 = new Error("y");
  e2.stack = "Error\n    at other (/var/task/.next/server/y.js:2:2)";
  assert.equal(
    await captureError(e2, {
      operation: "server.request_error",
      runtime: "edge",
      config: cfg,
      fetchImpl: async () => {
        throw new Error("offline");
      },
    }),
    null,
  );
  // Sanitizer blowing up → zero sends.
  const hostile = {};
  Object.defineProperty(hostile, "name", {
    get() {
      throw new Error("boom");
    },
  });
  const before = calls.length;
  assert.equal(
    await captureError(hostile, {
      operation: "server.request_error",
      runtime: "nodejs",
      config: cfg,
      fetchImpl: fakeFetch,
    }),
    null,
  );
  assert.equal(calls.length, before);
});

test("parseStack handles Gecko/Safari format", () => {
  const frames = parseStack(
    "handle@https://app.routelypro.com/_next/static/chunks/a.js:10:5\n@https://app.routelypro.com/_next/static/chunks/b.js?x=1:1:1",
    "https://app.routelypro.com",
  );
  assert.deepEqual(
    frames.map((f) => [f.function, f.filename]),
    [
      [undefined, "app:///_next/static/chunks/b.js"],
      ["handle", "app:///_next/static/chunks/a.js"],
    ],
  );
});

test("Vercel Edge bare chunk names are kept as edge:///<chunk>, nothing else", () => {
  const e = new Error("x");
  e.stack =
    "Error: x\n    at (index.js:244:39922)\n    at handler (index.js:233:5968)\n    at evil (/tmp/qa.canary@example.invalid.js:1:1)";
  const ev = sanitizeErrorEvent(e, { ...CTX, runtime: "edge", operation: "server.request_error" });
  assert.ok(ev);
  assert.deepEqual(
    ev.exception.values[0].stacktrace.frames.map((f) => [f.function, f.filename]),
    [
      ["handler", "edge:///index.js"],
      [undefined, "edge:///index.js"],
    ],
  );
  assert.ok(guardEnvelope(buildEnvelope(ev)));
});
