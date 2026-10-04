import { copyFile, mkdir, readdir, readFile } from "node:fs/promises";

// Canonical brand vectors live with the design tokens so every client shares them.
const source = new URL("../../../packages/design-tokens/brand/", import.meta.url);
const target = new URL("../public/brand/", import.meta.url);
const check = process.argv.includes("--check");

await mkdir(target, { recursive: true });
const files = (await readdir(source)).filter((name) => name.endsWith(".svg"));
let stale = 0;
for (const name of files) {
  const from = new URL(name, source);
  const to = new URL(name, target);
  if (check) {
    const expected = await readFile(from, "utf8");
    const actual = await readFile(to, "utf8").catch(() => "");
    if (expected !== actual) {
      console.error(`public/brand/${name} differs from packages/design-tokens/brand/${name}`);
      stale += 1;
    }
  } else {
    await copyFile(from, to);
  }
}
if (check && stale > 0) {
  console.error("Run pnpm --filter web brand:sync and commit the copies.");
  process.exit(1);
}
console.log(
  check ? `brand:check passed (${files.length} files)` : `synced ${files.length} brand files`,
);
