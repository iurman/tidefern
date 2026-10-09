// Pure helpers for scripts/perf/lighthouse.mjs: read the numbers out of a Lighthouse result,
// pick the median run, compare against the budgets in docs/ARCHITECTURE.md section 15 and
// format the table. Nothing here touches the network, the file system or a browser.

/** Budgets from the architecture record (Performance row), all lab proxies. */
export const budgets = {
  totalTransferBytes: 1.5 * 1024 * 1024,
  scriptTransferBytes: 200 * 1024,
  lcpMs: 2500,
  cls: 0.1,
};

const numeric = (lhr, id) => {
  const value = lhr.audits?.[id]?.numericValue;
  return typeof value === "number" ? value : Number.NaN;
};

/** The network records Lighthouse kept for the navigation, or an empty list. */
export function networkRecords(lhr) {
  const items = lhr.audits?.["network-requests"]?.details?.items;
  return Array.isArray(items) ? items : [];
}

/**
 * Compressed bytes of every script the first load fetched: the transfer size Lighthouse
 * recorded for each request of resource type Script in the navigation.
 */
export function scriptTransfer(lhr) {
  let bytes = 0;
  let count = 0;
  for (const record of networkRecords(lhr)) {
    if (record.resourceType !== "Script") continue;
    bytes += Number(record.transferSize) || 0;
    count += 1;
  }
  return { bytes, count };
}

/** The numbers one run contributes to the table. */
export function runMetrics(lhr) {
  const scripts = scriptTransfer(lhr);
  const score = lhr.categories?.performance?.score;
  return {
    score: typeof score === "number" ? Math.round(score * 100) : null,
    lcpMs: numeric(lhr, "largest-contentful-paint"),
    cls: numeric(lhr, "cumulative-layout-shift"),
    tbtMs: numeric(lhr, "total-blocking-time"),
    fcpMs: numeric(lhr, "first-contentful-paint"),
    totalTransferBytes: numeric(lhr, "total-byte-weight"),
    scriptTransferBytes: scripts.bytes,
    scriptCount: scripts.count,
  };
}

/** The conditions a run was measured under, as Lighthouse recorded them. */
export function runConditions(lhr) {
  const settings = lhr.configSettings ?? {};
  return {
    lighthouseVersion: lhr.lighthouseVersion ?? null,
    hostUserAgent: lhr.environment?.hostUserAgent ?? null,
    networkUserAgent: lhr.environment?.networkUserAgent ?? null,
    benchmarkIndex: lhr.environment?.benchmarkIndex ?? null,
    formFactor: settings.formFactor ?? null,
    throttlingMethod: settings.throttlingMethod ?? null,
    throttling: settings.throttling ?? null,
    screenEmulation: settings.screenEmulation ?? null,
  };
}

/**
 * Lighthouse copies --extra-headers into configSettings. The session cookie goes there for
 * signed-in routes, so it is removed before anything is written to disk.
 */
export function redact(lhr) {
  const copy = structuredClone(lhr);
  if (copy.configSettings && copy.configSettings.extraHeaders) {
    copy.configSettings.extraHeaders = "[redacted]";
  }
  return copy;
}

/** True when any of the secret strings appears anywhere in the serialized text. */
export function containsSecret(text, secrets) {
  return secrets.some((secret) => secret.length >= 8 && text.includes(secret));
}

/** Path the run ended on, so a signed-in route that bounced to /sign-in is caught. */
export function finalPath(lhr) {
  const url = lhr.finalDisplayedUrl ?? lhr.finalUrl ?? lhr.mainDocumentUrl;
  if (!url) return null;
  return new URL(url).pathname;
}

/** Budget verdicts for one set of metrics: "met" or "missed" per budget. */
export function verdicts(metrics) {
  const check = (value, limit) =>
    Number.isFinite(value) ? (value <= limit ? "met" : "missed") : "unknown";
  return {
    totalTransfer: check(metrics.totalTransferBytes, budgets.totalTransferBytes),
    scriptTransfer: check(metrics.scriptTransferBytes, budgets.scriptTransferBytes),
    lcp: check(metrics.lcpMs, budgets.lcpMs),
    cls: check(metrics.cls, budgets.cls),
  };
}

export const kb = (bytes) => (Number.isFinite(bytes) ? `${(bytes / 1024).toFixed(1)} KB` : "n/a");
export const seconds = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)} s` : "n/a");
export const ms = (value) => (Number.isFinite(value) ? `${Math.round(value)} ms` : "n/a");
export const shift = (value) => (Number.isFinite(value) ? value.toFixed(3) : "n/a");

const mark = (verdict) => (verdict === "met" ? "" : verdict === "missed" ? " (over)" : " (?)");

/** A Markdown table, one row per route, from the median run of each. */
export function formatTable(rows) {
  const header = [
    "| Route | Persona | Score | LCP | CLS | TBT | Total transfer | Script transfer (compressed) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const lines = rows.map(({ route, persona, metrics }) => {
    const v = verdicts(metrics);
    return `| ${route} | ${persona ?? "signed out"} | ${metrics.score ?? "n/a"} | ${seconds(metrics.lcpMs)}${mark(v.lcp)} | ${shift(metrics.cls)}${mark(v.cls)} | ${ms(metrics.tbtMs)} | ${kb(metrics.totalTransferBytes)}${mark(v.totalTransfer)} | ${kb(metrics.scriptTransferBytes)} in ${metrics.scriptCount} files${mark(v.scriptTransfer)} |`;
  });
  return [...header, ...lines].join("\n");
}

/** One paragraph describing the conditions, from the first run's recorded settings. */
export function formatConditions(conditions, machine) {
  const t = conditions.throttling ?? {};
  const screen = conditions.screenEmulation ?? {};
  return [
    `Lighthouse ${conditions.lighthouseVersion}; browser ${conditions.hostUserAgent}.`,
    `Form factor ${conditions.formFactor}, screen ${screen.width}x${screen.height} at ${screen.deviceScaleFactor}x; emulated agent ${conditions.networkUserAgent}.`,
    `Throttling method ${conditions.throttlingMethod}: RTT ${t.rttMs} ms, throughput ${t.throughputKbps} Kbps, request latency ${t.requestLatencyMs} ms, download ${t.downloadThroughputKbps} Kbps, upload ${t.uploadThroughputKbps} Kbps, CPU slowdown ${t.cpuSlowdownMultiplier}x.`,
    `Machine: ${machine.cpu} (${machine.cores} threads), ${machine.memoryGb} GB, ${machine.os}, Node ${machine.node}; Lighthouse benchmark index ${conditions.benchmarkIndex}.`,
  ].join("\n");
}
