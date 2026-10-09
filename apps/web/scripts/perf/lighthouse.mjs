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
// --extra-headers. Lighthouse saves its report with a copy of that header, including on a run
// that ends in a runtime error and a nonzero exit, so every report it leaves is rewritten with
// the header redacted as soon as Lighthouse exits, before the run counts as passed or failed; a
// report that cannot be read or still contains a cookie value is deleted. Error text is scrubbed
// of cookie values before it is printed or saved.
// Reports land in apps/web/perf-reports/<timestamp>/ (gitignored) unless --out says otherwise.
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeMedianRun, filterToValidRuns } from "lighthouse/core/lib/median-run.js";
import { signIn } from "./cast.mjs";
import {
  budgets,
  finalPath,
  formatConditions,
  formatTable,
  runConditions,
  runMetrics,
  sanitizeReport,
  scrub,
  verdicts,
} from "./summary.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../..");
const require = createRequire(path.join(webRoot, "package.json"));

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

/**
 * Runs the Lighthouse CLI once and resolves with its exit code and error output, whatever the
 * code, so the caller can redact a report Lighthouse saved before it exited nonzero.
 */
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
    child.on("exit", (code, signal) => resolve({ code: code ?? signal, stderr }));
  });
}

/** Lowest and highest value of each timing across the runs, to show how noisy a route was. */
function spread(all) {
  const range = (key) => [Math.min(...all.map((m) => m[key])), Math.max(...all.map((m) => m[key]))];
  return { score: range("score"), lcpMs: range("lcpMs"), tbtMs: range("tbtMs") };
}

/**
 * Rewrites the report Lighthouse saved with the session header redacted and returns it, or
 * returns null when Lighthouse saved none. A report that is not valid JSON or still contains a
 * session value after redaction is deleted.
 */
async function sanitize(file, secrets) {
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const clean = sanitizeReport(raw, secrets);
  if (!clean) {
    await rm(file, { force: true });
    throw new Error(
      `${path.basename(file)} was unreadable or kept a session value after redaction; the report was deleted`,
    );
  }
  await writeFile(file, clean.text);
  return clean.lhr;
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
  const cookie = await signIn(origin, persona);
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
      const { code, stderr } = await lighthouse(`${origin}${route}`, file, cookies.get(persona));
      // Redact first: Lighthouse saves the report before it exits nonzero on a runtime error.
      const lhr = await sanitize(file, secrets);
      if (lhr?.runtimeError) {
        throw new Error(`runtime error ${lhr.runtimeError.code} (lighthouse exited ${code})`);
      }
      if (code !== 0) {
        throw new Error(`lighthouse exited ${code}: ${scrub(stderr.slice(-400), secrets)}`);
      }
      if (!lhr) throw new Error("lighthouse exited 0 but saved no report");
      const landed = finalPath(lhr);
      if (landed !== route) throw new Error(`ended on ${landed}, not ${route}`);
      lhrs.push(lhr);
      const m = runMetrics(lhr);
      console.log(`score ${m.score}, LCP ${Math.round(m.lcpMs)} ms`);
    } catch (error) {
      console.log("failed");
      failures.push(
        `${route}${persona ? ` (${persona})` : ""} run ${run}: ${scrub(error.message, secrets)}`,
      );
    }
  }
  // computeMedianRun throws when any run lacks an FCP or TTI value; drop those runs first so one
  // bad run never costs the summary of every route.
  const valid = filterToValidRuns(lhrs);
  if (valid.length < lhrs.length) {
    failures.push(
      `${route}${persona ? ` (${persona})` : ""}: ${lhrs.length - valid.length} completed runs had no FCP or TTI value and were left out of the median`,
    );
  }
  if (!valid.length) continue;
  const medianRun = computeMedianRun(valid);
  results.push({
    route,
    persona: persona ?? null,
    runs: valid.length,
    medianRun: valid.indexOf(medianRun) + 1,
    metrics: runMetrics(medianRun),
    spread: spread(valid.map(runMetrics)),
    perRun: valid.map((lhr) => ({ metrics: runMetrics(lhr), conditions: runConditions(lhr) })),
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
