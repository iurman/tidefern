// The byte-budget gate (task J3d, docs/design/PERFORMANCE.md "The byte-budget gate").
//
// Usage, from the repository root, against a seeded production server:
//   pnpm --filter web perf:bytes <base> [--json <file>]
// <base> is the server origin, for example http://127.0.0.1:3000 in CI's verify job.
//
// Each route in budgets.json is loaded once in a fresh Chromium context (no cache, no cookies
// but the persona's session) with Lighthouse's mobile screen (412 x 823 at 1.75x, touch), and
// every request the load makes until the network has been quiet for a second is added up from
// the DevTools network events: `encodedDataLength` at `loadingFinished`, which is the bytes on
// the wire with headers, the number Lighthouse calls `transferSize`. Script transfer is the sum
// over requests of resource type Script, total transfer the sum over all of them. The run fails
// with the route, the number and the ceiling for every route over a ceiling.
//
// Bytes only, never timings: the same build and seed give the same bytes, so the gate does not
// flap. No Lighthouse here: it would add a second Chrome launch per route and its simulated
// timings, which the gate does not use, to read the same network records.
//
// Signed-in routes sign each persona in once through the API, only against a loopback server
// (the seed cast exists nowhere else). The session cookie is never printed.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { signIn } from "./cast.mjs";
import { formatBytesTable, label, overCeilings, readBudgets, tally } from "./bytes-model.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// Better Auth allows three sign-ins per ten seconds per client and counts from the last one
// (apps/web/tests/e2e/limiter.ts). The gate runs right after the browser suite, whose last
// sign-in may be a moment ago, so it waits out that window once before its own three.
const LIMITER_QUIET_MS = 11_000;
// Lighthouse's defaults for the end of a load: a pause after the load event, then a second of
// network quiet.
const PAUSE_AFTER_LOAD_MS = 1_000;
const NETWORK_QUIET_MS = 1_000;
const LOAD_LIMIT_MS = 30_000;

const args = process.argv.slice(2);
const base = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!base || !/^https?:\/\//.test(base)) {
  console.error("usage: pnpm --filter web perf:bytes <base> [--json <file>]");
  process.exit(2);
}
const origin = new URL(base).origin;
const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname);
const budgets = readBudgets(JSON.parse(await readFile(path.join(here, "budgets.json"), "utf8")));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Loads one route and returns every finished request as { type, bytes }, plus the path the
 * page ended on. The DevTools session sees the document, every subresource and the
 * prefetches the page starts on its own.
 */
async function measure(browser, route, cookie) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  try {
    if (cookie) {
      await context.addCookies(
        cookie.split("; ").map((pair) => {
          const at = pair.indexOf("=");
          return { name: pair.slice(0, at), value: pair.slice(at + 1), url: origin };
        }),
      );
    }
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    const types = new Map();
    const finished = [];
    const inFlight = new Set();
    let lastActivity = Date.now();
    cdp.on("Network.requestWillBeSent", (event) => {
      inFlight.add(event.requestId);
      if (event.type) types.set(event.requestId, event.type);
      lastActivity = Date.now();
    });
    cdp.on("Network.responseReceived", (event) => {
      types.set(event.requestId, event.type);
    });
    cdp.on("Network.loadingFinished", (event) => {
      inFlight.delete(event.requestId);
      finished.push({
        type: types.get(event.requestId) ?? "Other",
        bytes: event.encodedDataLength,
      });
      lastActivity = Date.now();
    });
    cdp.on("Network.loadingFailed", (event) => {
      inFlight.delete(event.requestId);
      lastActivity = Date.now();
    });
    const started = Date.now();
    await page.goto(`${origin}${route}`, { waitUntil: "load", timeout: LOAD_LIMIT_MS });
    await sleep(PAUSE_AFTER_LOAD_MS);
    while (inFlight.size > 0 || Date.now() - lastActivity < NETWORK_QUIET_MS) {
      if (Date.now() - started > LOAD_LIMIT_MS) {
        throw new Error(`${route}: the network never went quiet`);
      }
      await sleep(100);
    }
    return { landed: new URL(page.url()).pathname, requests: finished };
  } finally {
    await context.close();
  }
}

const cookies = new Map();
const signedIn = budgets.filter((budget) => budget.persona);
if (signedIn.length && !loopback) {
  console.error(`${origin} is not a loopback server with the seed cast; signed-in routes need one`);
  process.exit(2);
}
if (signedIn.length) await sleep(LIMITER_QUIET_MS);
for (const { persona } of signedIn) {
  if (!cookies.has(persona)) cookies.set(persona, await signIn(origin, persona));
}

const browser = await chromium.launch({
  channel: "chromium",
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const rows = [];
const failures = [];
try {
  for (const budget of budgets) {
    const { landed, requests } = await measure(
      browser,
      budget.route,
      budget.persona ? cookies.get(budget.persona) : undefined,
    );
    if (landed !== budget.route) {
      failures.push(`${label(budget)}: the load ended on ${landed}, not ${budget.route}`);
      continue;
    }
    const measured = tally(requests);
    rows.push({ budget, measured });
    failures.push(...overCeilings(budget, measured));
  }
} finally {
  await browser.close();
}

console.log(formatBytesTable(rows));
const json = option("--json");
if (json) {
  await writeFile(
    path.resolve(json),
    JSON.stringify(
      rows.map(({ budget, measured }) => ({ route: label(budget), ...measured })),
      null,
      2,
    ),
  );
}
if (failures.length) {
  console.error("\nByte budgets missed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=Byte budget::${failure}`);
  }
  process.exit(1);
}
console.log(`\nEvery route is within its ceilings (${rows.length} routes).`);
