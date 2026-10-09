// Lighthouse lab runs against a running production server (task J2, docs/design/PERFORMANCE.md).
//
// Usage, from the repository root:
//   pnpm --filter web perf:lighthouse <base> [--runs 3] [--routes /,/privacy] [--out <dir>]
// <base> is the server origin, for example http://127.0.0.1:3252 from seeded.sh serve.
//
// Each route runs <runs> times (default 3) with Lighthouse's mobile form factor and default
// simulated throttling, in Playwright's Chromium (PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH wins when
// set). The median run, picked by Lighthouse's own computeMedianRun, goes in the table.
// Signed-in routes sign in once per persona through the API and pass the session cookie with
// --extra-headers; the cookie is never written to disk: Lighthouse's copy of the header is
// redacted before a report is saved, and a report that still contains it is refused.
// Reports land in apps/web/perf-reports/<timestamp>/ (gitignored) unless --out says otherwise.
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeMedianRun } from "lighthouse/core/lib/median-run.js";
import {
  budgets,
  containsSecret,
  finalPath,
  formatConditions,
  formatTable,
  redact,
  runConditions,
  runMetrics,
  verdicts,
} from "./summary.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../..");
const require = createRequire(path.join(webRoot, "package.json"));

// The synthetic seed cast (packages/db README, "The cast"); these accounts exist only in a
// database seeded by `pnpm db:seed`, never in production.
const personas = {
  noor: { email: "noor@example.test", password: "tidefern-seed-noor" },
  mira: { email: "mira@example.test", password: "tidefern-seed-mira" },
  pia: { email: "pia@example.test", password: "tidefern-seed-pia" },
};

// The key routes: signed out first, then each signed-in route with the persona whose seeded
// data fills it.
const keyRoutes = [
  { route: "/" },
  { route: "/privacy" },
  { route: "/sign-in" },
  { route: "/design" },
  { route: "/today", persona: "noor" },
  { route: "/today", persona: "mira" },
  { route: "/calendar", persona: "noor" },
  { route: "/family", persona: "pia" },
  { route: "/sharing", persona: "noor" },
  { route: "/settings", persona: "noor" },
];

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--") && !isOptionValue(a));
function isOptionValue(value) {
  const i = args.indexOf(value);
  return i > 0 && args[i - 1].startsWith("--");
}
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!base || !/^https?:\/\//.test(base)) {
  console.error(
    "usage: pnpm --filter web perf:lighthouse <base> [--runs 3] [--routes /,/privacy] [--out <dir>]",
  );
  process.exit(2);
}
const origin = new URL(base).origin;
const runs = Number(option("--runs") ?? 3);
const onlyRoutes = option("--routes")?.split(",");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.resolve(option("--out") ?? path.join(webRoot, "perf-reports", stamp));
const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname);

const chromePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  require("@playwright/test").chromium.executablePath();
const chromeVersion = execFileSync(chromePath, ["--version"], { encoding: "utf8" }).trim();
const lighthouseCli = require.resolve("lighthouse/cli/index.js");
const machine = {
  cpu: os.cpus()[0]?.model ?? "unknown",
  cores: os.cpus().length,
  memoryGb: Math.round(os.totalmem() / 1024 ** 3),
  os: `${os.type()} ${os.release()} ${os.arch()}`,
  node: process.version,
};

/** Signs a persona in through the API and returns the Cookie header value. */
async function signIn(name) {
  const persona = personas[name];
  const response = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: persona.email, password: persona.password }),
  });
  if (!response.ok) {
    throw new Error(`sign-in as ${name} answered ${response.status}`);
  }
  const cookies = response.headers.getSetCookie().map((line) => line.split(";")[0]);
  if (!cookies.length) throw new Error(`sign-in as ${name} set no cookie`);
  return cookies.join("; ");
}

/** Runs the Lighthouse CLI once and resolves with the parsed result. */
function lighthouse(url, file, cookie) {
  const flags = [
    lighthouseCli,
    url,
    "--output=json",
    `--output-path=${file}`,
    "--only-categories=performance",
    "--form-factor=mobile",
    "--throttling-method=simulate",
    "--chrome-flags=--headless=new",
    "--quiet",
  ];
  if (cookie) flags.push(`--extra-headers=${JSON.stringify({ Cookie: cookie })}`);
  return new Promise((resolve, reject) => {
    // Lighthouse 13's CLI takes the browser binary from CHROME_PATH (its --chrome-flags help
    // says so); there is no --chrome-path flag in this release.
    const child = spawn(process.execPath, flags, {
      env: { ...process.env, CHROME_PATH: chromePath },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`lighthouse exited ${code} for ${url}: ${stderr.slice(-400)}`));
    });
  });
}

/** Lowest and highest value of each timing across the runs, to show how noisy a route was. */
function spread(all) {
  const range = (key) => [Math.min(...all.map((m) => m[key])), Math.max(...all.map((m) => m[key]))];
  return { score: range("score"), lcpMs: range("lcpMs"), tbtMs: range("tbtMs") };
}

/** Reads a raw report, redacts it, refuses it if a secret survived, and rewrites it. */
async function sanitize(file, secrets) {
  const lhr = redact(JSON.parse(await readFile(file, "utf8")));
  const text = JSON.stringify(lhr, null, 2);
  if (containsSecret(text, secrets)) {
    await rm(file, { force: true });
    throw new Error(
      `a session value survived redaction in ${path.basename(file)}; the report was deleted`,
    );
  }
  await writeFile(file, text);
  return lhr;
}

await mkdir(out, { recursive: true });
const selected = keyRoutes.filter(({ route }) => !onlyRoutes || onlyRoutes.includes(route));
const cookies = new Map();
const secrets = [];
for (const { persona } of selected) {
  if (!persona || cookies.has(persona)) continue;
  if (!loopback) {
    console.error(
      `skipping signed-in routes: ${origin} is not a loopback server with the seed cast`,
    );
    break;
  }
  const cookie = await signIn(persona);
  cookies.set(persona, cookie);
  for (const pair of cookie.split("; ")) secrets.push(pair.slice(pair.indexOf("=") + 1));
}

const results = [];
const failures = [];
for (const { route, persona } of selected) {
  if (persona && !cookies.has(persona)) continue;
  const slug = `${route === "/" ? "home" : route.slice(1).replace(/\//g, "-")}${persona ? `-${persona}` : ""}`;
  const lhrs = [];
  for (let run = 1; run <= runs; run += 1) {
    const file = path.join(out, `${slug}-run${run}.json`);
    process.stdout.write(`${route}${persona ? ` as ${persona}` : ""}, run ${run} of ${runs} ... `);
    try {
      await lighthouse(`${origin}${route}`, file, cookies.get(persona));
      const lhr = await sanitize(file, secrets);
      const landed = finalPath(lhr);
      if (landed !== route) throw new Error(`ended on ${landed}, not ${route}`);
      if (lhr.runtimeError) throw new Error(`runtime error ${lhr.runtimeError.code}`);
      lhrs.push(lhr);
      const m = runMetrics(lhr);
      console.log(`score ${m.score}, LCP ${Math.round(m.lcpMs)} ms`);
    } catch (error) {
      console.log("failed");
      failures.push(`${route}${persona ? ` (${persona})` : ""} run ${run}: ${error.message}`);
    }
  }
  if (!lhrs.length) continue;
  const medianRun = computeMedianRun(lhrs);
  results.push({
    route,
    persona: persona ?? null,
    runs: lhrs.length,
    medianRun: lhrs.indexOf(medianRun) + 1,
    metrics: runMetrics(medianRun),
    spread: spread(lhrs.map(runMetrics)),
    perRun: lhrs.map((lhr) => ({ metrics: runMetrics(lhr), conditions: runConditions(lhr) })),
  });
}

const conditions = results[0]?.perRun[0]?.conditions;
const differing = results
  .flatMap((r) => r.perRun.map((p) => p.conditions))
  .filter(
    (c) =>
      JSON.stringify({ ...c, benchmarkIndex: 0 }) !==
      JSON.stringify({ ...conditions, benchmarkIndex: 0 }),
  );
const summary = {
  measuredAt: new Date().toISOString(),
  base: origin,
  chromePath,
  chromeVersion,
  machine,
  budgets,
  conditions,
  runsPerRoute: runs,
  results: results.map((r) => ({ ...r, verdicts: verdicts(r.metrics) })),
  failures,
};
await writeFile(path.join(out, "summary.json"), JSON.stringify(summary, null, 2));

const table = formatTable(results);
const report = [
  `# Lighthouse lab run, ${summary.measuredAt}`,
  "",
  `${chromeVersion} at ${chromePath}.`,
  conditions ? formatConditions(conditions, machine) : "No run completed.",
  differing.length
    ? `Warning: ${differing.length} runs recorded different conditions; see summary.json.`
    : "Every run recorded the same conditions.",
  `Median of ${runs} runs per route (Lighthouse computeMedianRun). "(over)" marks a missed budget: total transfer 1.5 MB, script transfer 200 KB, LCP 2.5 s, CLS 0.1.`,
  "These are lab numbers from one machine against a local server. They prove nothing about field performance.",
  "",
  table,
  ...(failures.length ? ["", "Failures:", ...failures.map((f) => `- ${f}`)] : []),
  "",
].join("\n");
await writeFile(path.join(out, "summary.md"), report);
console.log(`\n${report}`);
console.log(`Reports in ${out}`);
if (failures.length) process.exit(1);
