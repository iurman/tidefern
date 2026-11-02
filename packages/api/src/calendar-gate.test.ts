import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The gate behind the calendar clock (task E11). Core's `todayIn(zone, now)`
 * falls back to `new Date()` when `now` is left out, which is the real
 * clock: a call written that way in this package would decide a calendar
 * day that `TIDEFERN_FAKE_NOW` cannot freeze, and CI's seeded assertions
 * would start drifting again. So every call here names its instant: a
 * calendar decision passes the calendar clock's (`clock.today()` does), an
 * audit day or a stored time the real one (`auditDay()`, a job's
 * `run_after`). The check reads the syntax tree, so a comment or a string
 * that mentions the function is not a call.
 */
const SOURCE = fileURLToPath(new URL(".", import.meta.url));

/** The package's own modules: no tests and no test fixtures. */
function modules(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === "test" ? [] : modules(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [path] : [];
  });
}

interface Call {
  at: string;
  arguments: number;
}

function todayInCalls(path: string): Call[] {
  const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const calls: Call[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "todayIn"
    ) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
      calls.push({ at: `${relative(SOURCE, path)}:${line + 1}`, arguments: node.arguments.length });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return calls;
}

describe("the calendar gate", () => {
  it("finds no call to todayIn that leaves its instant to the real clock", () => {
    const calls = modules(SOURCE).flatMap(todayInCalls);
    // The scan reaches the calls that exist: the clock, the audit day and the reminders.
    expect(calls.map((call) => call.at.split(":")[0])).toEqual(
      expect.arrayContaining(["clock.ts", "middleware/audit.ts", "jobs/reminders.ts"]),
    );
    expect(calls.filter((call) => call.arguments < 2)).toEqual([]);
  });
});
