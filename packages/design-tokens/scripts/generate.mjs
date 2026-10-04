import { readFile, writeFile } from "node:fs/promises";
import { tokenStylesheet } from "../stylesheet.mjs";

const tokens = JSON.parse(await readFile(new URL("../tokens.json", import.meta.url), "utf8"));
const css = tokenStylesheet(tokens);
const destination = new URL("../../../apps/web/src/app/tokens.css", import.meta.url);

if (process.argv.includes("--check")) {
  const current = await readFile(destination, "utf8").catch(() => "");
  if (current !== css) {
    console.error("Design tokens are out of sync. Run pnpm tokens:generate and commit the result.");
    process.exit(1);
  }
  console.log("tokens:check passed");
} else {
  await writeFile(destination, css);
  console.log(`wrote ${destination.pathname}`);
}
