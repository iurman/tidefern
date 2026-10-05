import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

/**
 * The stylesheet rules that prose alone cannot hold (architecture 13.6 and
 * docs/design/COMPONENTS.md): no `transition: all` anywhere, no focus outline
 * removed in a component module, and no raw color in a component module,
 * because every color is a semantic token. globals.css and tokens.css are
 * the lead's files and may define the tokens themselves.
 */

const root = new URL("../apps/web/src/", import.meta.url).pathname;

async function cssFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await cssFiles(path)));
    else if (entry.name.endsWith(".css")) files.push(path);
  }
  return files;
}

const rules = [
  {
    name: "transition: all is forbidden; name the properties",
    pattern: /transition(?:-property)?\s*:\s*all\b/,
    appliesTo: () => true,
  },
  {
    name: "a module never removes the focus outline",
    pattern: /outline\s*:\s*(?:none|0)\b/,
    appliesTo: (file) => file.endsWith(".module.css"),
  },
  {
    name: "a module uses semantic tokens, never a raw color",
    pattern: /(?:#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|color-mix)\()/i,
    appliesTo: (file) => file.endsWith(".module.css"),
  },
];

const failures = [];
for (const file of await cssFiles(root)) {
  const lines = (await readFile(file, "utf8")).split("\n");
  lines.forEach((line, index) => {
    const code = line.replace(/\/\*.*?\*\//g, "");
    for (const rule of rules) {
      if (rule.appliesTo(file) && rule.pattern.test(code)) {
        failures.push(`${relative(process.cwd(), file)}:${index + 1}: ${rule.name}`);
      }
    }
  });
}

if (failures.length) {
  console.error(failures.join("\n"));
  console.error(`css:check failed with ${failures.length} finding(s)`);
  process.exit(1);
}
console.log("css:check passed");
