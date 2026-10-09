// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Keeps Zod out of the browser bundle (task J2b, docs/design/PERFORMANCE.md).
 * The root entry of `@tidefern/schemas` builds every schema at import time,
 * so one value import from it in a client module ships Zod and all the
 * schemas, about 100 KB compressed, on that route. Client code reads
 * constants and labels from `@tidefern/schemas/constants` and may import
 * types from the root with `import type`, which leaves nothing at runtime.
 *
 * The check walks the module graph from every `"use client"` file through
 * the app's own imports (relative and `@/`), because a helper a client
 * component imports ships with it whether or not it says "use client".
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const ZOD_BEARING = new Set(["@tidefern/schemas", "zod"]);

/** Every import of a Zod-bearing entry in a source that would survive compilation. */
function zodImports(source: string, fileName = "module.tsx"): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      // Only a declaration-level `import type` is certain to be erased; `import { type X }`
      // can compile to a bare `import "..."` that still evaluates the module.
      if (ZOD_BEARING.has(spec) && !node.importClause?.isTypeOnly) found.push(node.getText());
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (ZOD_BEARING.has(node.moduleSpecifier.text) && !node.isTypeOnly) {
        found.push(node.getText());
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      ZOD_BEARING.has(node.arguments[0].text)
    ) {
      found.push(node.getText());
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The app files a source imports, resolved like the bundler does for relative and `@/` paths. */
function localImports(source: string, from: string): string[] {
  const file = ts.createSourceFile(from, source, ts.ScriptTarget.Latest, true);
  const specs: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const typeOnly = ts.isImportDeclaration(node)
        ? node.importClause?.isTypeOnly === true
        : node.isTypeOnly;
      if (!typeOnly) specs.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specs.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  const resolved: string[] = [];
  for (const spec of specs) {
    let base: string | null = null;
    if (spec.startsWith("./") || spec.startsWith("../")) base = resolve(dirname(from), spec);
    else if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
    if (base === null) continue;
    const hit = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]
      .map((suffix) => base + suffix)
      .find((candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate));
    if (hit) resolved.push(hit);
  }
  return resolved;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

function isClientModule(source: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(source);
}

describe("the Zod import check", () => {
  it("flags value, mixed, bare and dynamic imports of the root entry and zod", () => {
    expect(zodImports(`import { TERMS_VERSION } from "@tidefern/schemas";`)).toHaveLength(1);
    expect(zodImports(`import { type Stage } from "@tidefern/schemas";`)).toHaveLength(1);
    expect(zodImports(`import "@tidefern/schemas";`)).toHaveLength(1);
    expect(zodImports(`export { FLOW_LABELS } from "@tidefern/schemas";`)).toHaveLength(1);
    expect(zodImports(`const m = await import("@tidefern/schemas");`)).toHaveLength(1);
    expect(zodImports(`import * as z from "zod";`)).toHaveLength(1);
  });

  it("allows type-only imports and the constants entry", () => {
    expect(zodImports(`import type { Stage } from "@tidefern/schemas";`)).toEqual([]);
    expect(zodImports(`export type { Stage } from "@tidefern/schemas";`)).toEqual([]);
    expect(zodImports(`import { TERMS_VERSION } from "@tidefern/schemas/constants";`)).toEqual([]);
  });

  it("recognises the client directive after a leading comment", () => {
    expect(isClientModule(`"use client";\nexport {};`)).toBe(true);
    expect(isClientModule(`// note\n'use client';\n`)).toBe(true);
    expect(isClientModule(`export const x = "use client";`)).toBe(false);
  });
});

describe("client modules", () => {
  it("reach no Zod-bearing entry through any app import", () => {
    const files = sourceFiles(SRC);
    const clientRoots = files.filter((file) => isClientModule(readFileSync(file, "utf8")));
    // A sanity floor: the walk found the app's client components at all.
    expect(clientRoots.length).toBeGreaterThan(50);

    const via = new Map<string, string>();
    const queue = [...clientRoots];
    for (const root of clientRoots) via.set(root, root);
    const offences: string[] = [];
    while (queue.length > 0) {
      const file = queue.shift() as string;
      const source = readFileSync(file, "utf8");
      for (const statement of zodImports(source, file)) {
        offences.push(
          `${relative(SRC, file)} (reached from ${relative(SRC, via.get(file) as string)}): ${statement}`,
        );
      }
      for (const next of localImports(source, file)) {
        if (via.has(next)) continue;
        via.set(next, via.get(file) as string);
        queue.push(next);
      }
    }
    expect(offences).toEqual([]);
  });
});
