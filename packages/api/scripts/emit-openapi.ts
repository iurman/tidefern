import { readFile, writeFile } from "node:fs/promises";
import { createApp } from "../src/app";

const destination = new URL("../../../openapi/v1.json", import.meta.url);
const app = createApp();
const document = app.getOpenAPI31Document({
  openapi: "3.1.0",
  info: {
    title: "Tidefern API",
    version: "0.1.0",
    description:
      "Versioned REST contract for every Tidefern client. Health data travels only in request and response bodies, never in paths or query strings.",
  },
  servers: [{ url: "/", description: "Same origin as the web app" }],
});
const json = `${JSON.stringify(document, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(destination, "utf8").catch(() => "");
  if (current !== json) {
    console.error("openapi/v1.json is stale. Run pnpm openapi:generate and review the diff.");
    process.exit(1);
  }
  console.log("openapi:check passed");
} else {
  await writeFile(destination, json);
  console.log(`wrote ${destination.pathname}`);
}
