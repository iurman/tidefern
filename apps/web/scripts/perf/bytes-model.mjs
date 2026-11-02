// Pure helpers for scripts/perf/bytes.mjs, the byte-budget gate: read the ceilings, add up what a
// load transferred, compare and format. Nothing here touches the network, the file system or a
// browser.

/** A KB in the ceilings and the table: 1,024 bytes of transfer, as in PERFORMANCE.md. */
export const KB = 1024;

/** One route's label, "/today (noor)" or "/privacy". */
export function label({ route, persona }) {
  return persona ? `${route} (${persona})` : route;
}

/**
 * The ceilings from budgets.json, checked: every entry names a path, a persona or null, and two
 * positive ceilings, and no route and persona appears twice. Throws with what is wrong.
 */
export function readBudgets(json) {
  if (!json || !Array.isArray(json.routes) || json.routes.length === 0) {
    throw new Error("budgets.json needs a non-empty routes list");
  }
  const seen = new Set();
  return json.routes.map((entry, index) => {
    const { route, persona, scriptKB, totalKB } = entry ?? {};
    const where = `budgets.json routes[${index}]`;
    if (typeof route !== "string" || !route.startsWith("/")) {
      throw new Error(`${where}: route must be a path starting with /`);
    }
    if (persona !== null && typeof persona !== "string") {
      throw new Error(`${where}: persona must be a seeded persona's name or null`);
    }
    for (const [name, value] of [
      ["scriptKB", scriptKB],
      ["totalKB", totalKB],
    ]) {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${where}: ${name} must be a positive number`);
      }
    }
    const key = label({ route, persona });
    if (seen.has(key)) throw new Error(`${where}: ${key} is listed twice`);
    seen.add(key);
    return { route, persona, scriptKB, totalKB };
  });
}

/**
 * What one load transferred, from its finished requests: `type` is the DevTools resource type
 * (`Script`, `Document`, `Font`, ...) and `bytes` the encoded length on the wire, headers
 * included (the `transferSize` Lighthouse reports). Failed requests are not passed in.
 */
export function tally(requests) {
  let scriptBytes = 0;
  let scriptCount = 0;
  let totalBytes = 0;
  for (const { type, bytes } of requests) {
    const size = Number(bytes) || 0;
    totalBytes += size;
    if (type === "Script") {
      scriptBytes += size;
      scriptCount += 1;
    }
  }
  return { scriptBytes, scriptCount, totalBytes, requestCount: requests.length };
}

/** "196.7 KB": one decimal, like the PERFORMANCE.md tables. */
export function kb(bytes) {
  return `${(bytes / KB).toFixed(1)} KB`;
}

/**
 * The failures of one measured route against its ceilings: a line per ceiling it is over,
 * naming the route, the number and the ceiling. Empty when the route is within both.
 */
export function overCeilings(budget, measured) {
  const failures = [];
  if (measured.scriptBytes > budget.scriptKB * KB) {
    failures.push(
      `${label(budget)}: compressed script transfer ${kb(measured.scriptBytes)} (${measured.scriptBytes} bytes) is over its ceiling of ${budget.scriptKB} KB`,
    );
  }
  if (measured.totalBytes > budget.totalKB * KB) {
    failures.push(
      `${label(budget)}: total transfer ${kb(measured.totalBytes)} (${measured.totalBytes} bytes) is over its ceiling of ${budget.totalKB} KB`,
    );
  }
  return failures;
}

/** The Markdown table of every measured route, with its ceilings and a verdict. */
export function formatBytesTable(rows) {
  const lines = [
    "| Route | Script transfer | Ceiling | Total transfer | Ceiling | Requests | Verdict |",
    "| ----- | --------------- | ------- | -------------- | ------- | -------- | ------- |",
  ];
  for (const { budget, measured } of rows) {
    const verdict = overCeilings(budget, measured).length ? "over" : "within";
    lines.push(
      `| ${label(budget)} | ${kb(measured.scriptBytes)} in ${measured.scriptCount} files | ${budget.scriptKB} KB | ${kb(measured.totalBytes)} | ${budget.totalKB} KB | ${measured.requestCount} | ${verdict} |`,
    );
  }
  return lines.join("\n");
}
