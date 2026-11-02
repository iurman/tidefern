// Run with: pnpm --filter web perf:test
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  KB,
  formatBytesTable,
  kb,
  label,
  overCeilings,
  readBudgets,
  tally,
} from "./bytes-model.mjs";

const budget = { route: "/calendar", persona: "noor", scriptKB: 231, totalKB: 560 };

test("the committed budgets.json reads, one entry per route and persona", async () => {
  const json = JSON.parse(await readFile(new URL("./budgets.json", import.meta.url), "utf8"));
  const budgets = readBudgets(json);
  assert.equal(budgets.length, 10);
  assert.deepEqual(budgets.map(label), [
    "/",
    "/privacy",
    "/sign-in",
    "/design",
    "/today (noor)",
    "/today (mira)",
    "/calendar (noor)",
    "/family (pia)",
    "/sharing (noor)",
    "/settings (noor)",
  ]);
  // No script ceiling is above PERFORMANCE.md's ratchets, and the rest sit at the 200 KB budget or under.
  for (const entry of budgets) assert.ok(entry.scriptKB <= 231, label(entry));
});

test("readBudgets refuses a malformed file and says where", () => {
  assert.throws(() => readBudgets({}), /non-empty routes list/);
  assert.throws(
    () => readBudgets({ routes: [{ route: "today", persona: null, scriptKB: 1, totalKB: 1 }] }),
    /routes\[0\]: route must be a path/,
  );
  assert.throws(
    () => readBudgets({ routes: [{ route: "/", persona: 3, scriptKB: 1, totalKB: 1 }] }),
    /persona must be/,
  );
  assert.throws(
    () => readBudgets({ routes: [{ route: "/", persona: null, scriptKB: 0, totalKB: 1 }] }),
    /scriptKB must be a positive number/,
  );
  assert.throws(
    () => readBudgets({ routes: [{ route: "/", persona: null, scriptKB: 1, totalKB: "9" }] }),
    /totalKB must be a positive number/,
  );
  const twice = { route: "/today", persona: "noor", scriptKB: 1, totalKB: 1 };
  assert.throws(() => readBudgets({ routes: [twice, twice] }), /\/today \(noor\) is listed twice/);
});

test("tally adds scripts apart and everything together", () => {
  const measured = tally([
    { type: "Document", bytes: 12_000 },
    { type: "Script", bytes: 50_000 },
    { type: "Script", bytes: 25_000 },
    { type: "Font", bytes: 80_000 },
    { type: "Fetch", bytes: undefined },
  ]);
  assert.deepEqual(measured, {
    scriptBytes: 75_000,
    scriptCount: 2,
    totalBytes: 167_000,
    requestCount: 5,
  });
});

test("a route at its ceiling passes and one byte over fails with the route, the number and the ceiling", () => {
  const at = { scriptBytes: 231 * KB, scriptCount: 16, totalBytes: 560 * KB, requestCount: 30 };
  assert.deepEqual(overCeilings(budget, at), []);
  const over = { ...at, scriptBytes: 231 * KB + 1, totalBytes: 600 * KB };
  assert.deepEqual(overCeilings(budget, over), [
    `/calendar (noor): compressed script transfer 231.0 KB (${231 * KB + 1} bytes) is over its ceiling of 231 KB`,
    "/calendar (noor): total transfer 600.0 KB (614400 bytes) is over its ceiling of 560 KB",
  ]);
});

test("kb and the table read like PERFORMANCE.md", () => {
  assert.equal(kb(201_421), "196.7 KB");
  const table = formatBytesTable([
    {
      budget,
      measured: { scriptBytes: 224_768, scriptCount: 16, totalBytes: 545_280, requestCount: 31 },
    },
    {
      budget: { route: "/", persona: null, scriptKB: 173, totalKB: 450 },
      measured: { scriptBytes: 200_000, scriptCount: 10, totalBytes: 400_000, requestCount: 20 },
    },
  ]);
  const lines = table.split("\n");
  assert.equal(lines.length, 4);
  assert.equal(
    lines[2],
    "| /calendar (noor) | 219.5 KB in 16 files | 231 KB | 532.5 KB | 560 KB | 31 | within |",
  );
  assert.equal(lines[3], "| / | 195.3 KB in 10 files | 173 KB | 390.6 KB | 450 KB | 20 | over |");
});
