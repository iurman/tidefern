// Run with: pnpm --filter web perf:test
import assert from "node:assert/strict";
import { test } from "node:test";
import { collectLeaves, packageOf, routeEntrypoints } from "./bundle-model.mjs";
import {
  containsSecret,
  finalPath,
  formatTable,
  redact,
  runMetrics,
  scriptTransfer,
  verdicts,
} from "./summary.mjs";

const lhr = (overrides = {}) => ({
  lighthouseVersion: "13.5.0",
  finalDisplayedUrl: "http://127.0.0.1:3252/today",
  categories: { performance: { score: 0.784 } },
  configSettings: {
    formFactor: "mobile",
    extraHeaders: { Cookie: "better-auth.session_token=abc123secretvalue" },
  },
  audits: {
    "largest-contentful-paint": { numericValue: 2400 },
    "cumulative-layout-shift": { numericValue: 0.05 },
    "total-blocking-time": { numericValue: 120 },
    "first-contentful-paint": { numericValue: 900 },
    "total-byte-weight": { numericValue: 600_000 },
    "network-requests": {
      details: {
        items: [
          { resourceType: "Document", transferSize: 15_000 },
          { resourceType: "Script", transferSize: 100_000 },
          { resourceType: "Script", transferSize: 50_000 },
          { resourceType: "Font", transferSize: 130_000 },
        ],
      },
    },
  },
  ...overrides,
});

test("script transfer sums only Script records", () => {
  assert.deepEqual(scriptTransfer(lhr()), { bytes: 150_000, count: 2 });
  assert.deepEqual(scriptTransfer({ audits: {} }), { bytes: 0, count: 0 });
});

test("run metrics read the audits and round the score", () => {
  const m = runMetrics(lhr());
  assert.equal(m.score, 78);
  assert.equal(m.lcpMs, 2400);
  assert.equal(m.totalTransferBytes, 600_000);
  assert.equal(m.scriptTransferBytes, 150_000);
  assert.ok(Number.isNaN(runMetrics({ audits: {} }).lcpMs));
});

test("verdicts compare against the architecture budgets", () => {
  assert.deepEqual(verdicts(runMetrics(lhr())), {
    totalTransfer: "met",
    scriptTransfer: "met",
    lcp: "met",
    cls: "met",
  });
  const heavy = {
    ...runMetrics(lhr()),
    lcpMs: 2501,
    scriptTransferBytes: 200 * 1024 + 1,
    cls: 0.11,
    totalTransferBytes: Number.NaN,
  };
  assert.deepEqual(verdicts(heavy), {
    totalTransfer: "unknown",
    scriptTransfer: "missed",
    lcp: "missed",
    cls: "missed",
  });
});

test("redact removes the session cookie Lighthouse copied into configSettings", () => {
  const original = lhr();
  const clean = redact(original);
  assert.equal(clean.configSettings.extraHeaders, "[redacted]");
  assert.equal(containsSecret(JSON.stringify(clean), ["abc123secretvalue"]), false);
  assert.ok(original.configSettings.extraHeaders.Cookie, "the input is not mutated");
  assert.equal(containsSecret(JSON.stringify(original), ["abc123secretvalue"]), true);
  assert.equal(
    redact(lhr({ configSettings: { extraHeaders: null } })).configSettings.extraHeaders,
    null,
  );
});

test("short strings never count as a secret match", () => {
  assert.equal(containsSecret("a 1234567 b", ["1234567"]), false);
});

test("final path catches a signed-in route that bounced to sign-in", () => {
  assert.equal(finalPath(lhr()), "/today");
  assert.equal(
    finalPath(lhr({ finalDisplayedUrl: "http://127.0.0.1:3252/sign-in?next=x" })),
    "/sign-in",
  );
  assert.equal(finalPath({}), null);
});

test("the table marks missed budgets", () => {
  const table = formatTable([
    { route: "/", persona: null, metrics: runMetrics(lhr()) },
    { route: "/today", persona: "noor", metrics: { ...runMetrics(lhr()), lcpMs: 5000 } },
  ]);
  const [, , first, second] = table.split("\n");
  assert.match(first, /^\| \/ \| signed out \| 78 \| 2\.40 s \|/);
  assert.match(second, /\| 5\.00 s \(over\) \|/);
  assert.match(second, /146\.5 KB in 2 files \|$/);
});

test("package names come from pnpm store paths, workspace packages and app source", () => {
  assert.equal(
    packageOf("./../node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/api.js"),
    "zod",
  );
  assert.equal(
    packageOf(
      "./../node_modules/.pnpm/a@1/node_modules/a/x.js + 3 modules (concatenated)/../node_modules/.pnpm/@swc+helpers@0.5.23/node_modules/@swc/helpers/esm/x.js",
    ),
    "@swc/helpers",
  );
  assert.equal(packageOf("../packages/core/src/growth-data.json"), "@tidefern/core");
  assert.equal(packageOf("./src/components/ui/switch.tsx"), "apps/web src");
  assert.equal(packageOf("webpack/runtime"), "other");
});

test("route entry points include the framework, the root layout and the group", () => {
  assert.deepEqual(routeEntrypoints("/today"), [
    "main",
    "main-app",
    "app/layout",
    "app/(app)/layout",
    "app/(app)/today/page",
  ]);
  assert.throws(() => routeEntrypoints("/nowhere"));
});

test("leaves flatten nested analyzer groups", () => {
  const leaves = collectLeaves([
    {
      label: "a",
      groups: [
        { path: "a/x.js", statSize: 2 },
        { label: "b", groups: [{ path: "a/b/y.js", statSize: 3 }] },
      ],
    },
    { path: "z.js", statSize: 1, groups: [] },
  ]);
  assert.deepEqual(leaves, [
    { path: "a/x.js", statSize: 2 },
    { path: "a/b/y.js", statSize: 3 },
    { path: "z.js", statSize: 1 },
  ]);
});
