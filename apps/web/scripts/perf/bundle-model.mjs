// Pure helpers for scripts/perf/bundle-summary.mjs: which webpack entry points a route loads
// first, which package a module path belongs to, and the leaf modules of an analyzer group tree.

const groupOf = {
  "/": ["app/(public)/layout", "app/(public)/page"],
  "/privacy": ["app/(public)/layout", "app/(public)/privacy/page"],
  "/sign-in": [
    "app/(public)/layout",
    "app/(public)/(auth)/layout",
    "app/(public)/(auth)/sign-in/page",
  ],
  "/design": ["app/(public)/layout", "app/(public)/design/layout", "app/(public)/design/page"],
  "/today": ["app/(app)/layout", "app/(app)/today/page"],
  "/calendar": ["app/(app)/layout", "app/(app)/calendar/page"],
  "/family": ["app/(app)/layout", "app/(app)/family/page"],
  "/sharing": ["app/(app)/layout", "app/(app)/sharing/page"],
  "/settings": ["app/(app)/layout", "app/(app)/settings/page"],
};

/** Entry points whose initial chunks a first load of the route fetches. */
export function routeEntrypoints(route) {
  const own = groupOf[route];
  if (!own) throw new Error(`no entry points known for ${route}`);
  return ["main", "main-app", "app/layout", ...own];
}

/**
 * The package a module path belongs to: the npm package name for node_modules paths (the
 * pnpm store layout included), "@tidefern/<name>" for workspace packages, "apps/web src" for
 * the app's own code. A concatenated module reports the path of its inner module.
 */
export function packageOf(modulePath) {
  const inner = modulePath.split("(concatenated)/").pop();
  const nodeModules = inner.lastIndexOf("node_modules/");
  if (nodeModules >= 0) {
    const rest = inner.slice(nodeModules + "node_modules/".length).split("/");
    return rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
  }
  const workspace = inner.match(/packages\/([^/]+)\//);
  if (workspace) return `@tidefern/${workspace[1]}`;
  if (inner.includes("src/")) return "apps/web src";
  return "other";
}

/** Flattens an analyzer group tree to its leaf modules ({ path, statSize }). */
export function collectLeaves(groups) {
  const leaves = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (Array.isArray(node.groups) && node.groups.length) walk(node.groups);
      else leaves.push({ path: node.path ?? node.label ?? "", statSize: node.statSize ?? 0 });
    }
  };
  walk(groups);
  return leaves;
}
