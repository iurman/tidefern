// Summarizes the webpack bundle analyzer's client report (task J2, docs/design/PERFORMANCE.md).
//
// Usage: pnpm --filter web perf:analyze
//   (an ANALYZE=true webpack build into .next/analyze-webpack, then this script), or
//   node scripts/perf/bundle-summary.mjs [path/to/client.json]
//
// For each key route it lists the chunks loaded on first paint (the chunks webpack marks
// initial for the route's entry points: the framework, the root layout, the group layout and
// the page) with their gzip sizes, then the packages that make up those chunks, by source size
// before minification. This is the webpack build: the production build uses Turbopack, so the
// chunk names and exact sizes differ; the composition is what this report is for.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routeEntrypoints, packageOf, collectLeaves } from "./bundle-model.mjs";
import { kb } from "./summary.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const file =
  process.argv[2] ?? path.resolve(here, "../../.next/analyze-webpack/analyze/client.json");
const chunks = JSON.parse(await readFile(file, "utf8"));

const routes = [
  "/",
  "/privacy",
  "/sign-in",
  "/design",
  "/today",
  "/calendar",
  "/family",
  "/sharing",
  "/settings",
];
for (const route of routes) {
  const entries = routeEntrypoints(route);
  const initial = chunks.filter((chunk) =>
    Object.keys(chunk.isInitialByEntrypoint ?? {}).some((entry) => entries.includes(entry)),
  );
  const gzip = initial.reduce((sum, chunk) => sum + (chunk.gzipSize ?? 0), 0);
  console.log(`\n${route}: ${initial.length} initial chunks, ${kb(gzip)} gzip (webpack build)`);
  for (const chunk of [...initial].sort((a, b) => b.gzipSize - a.gzipSize).slice(0, 6)) {
    console.log(`  ${kb(chunk.gzipSize).padStart(9)}  ${chunk.label}`);
  }
  const byPackage = new Map();
  let total = 0;
  for (const chunk of initial) {
    for (const leaf of collectLeaves(chunk.groups ?? [])) {
      const name = packageOf(leaf.path);
      byPackage.set(name, (byPackage.get(name) ?? 0) + leaf.statSize);
      total += leaf.statSize;
    }
  }
  const top = [...byPackage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log("  by package (source size before minification):");
  for (const [name, size] of top) {
    console.log(
      `  ${kb(size).padStart(9)}  ${((size / total) * 100).toFixed(1).padStart(5)}%  ${name}`,
    );
  }
}
