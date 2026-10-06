import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import openapiTS, { astToString, COMMENT_HEADER } from "openapi-typescript";
import { format, resolveConfig } from "prettier";

/**
 * Writes src/schema.d.ts from openapi/v1.json (architecture 4.3). The file is
 * printed by openapi-typescript and then formatted with the repository's
 * Prettier config, so the committed file passes `pnpm format:check` and a
 * regeneration is byte-stable. `--check` renders into a temporary file and
 * compares it with the committed one, failing on any drift.
 */
const source = new URL("../../../openapi/v1.json", import.meta.url);
const destination = new URL("../src/schema.d.ts", import.meta.url);

async function render(): Promise<string> {
  const document: unknown = JSON.parse(await readFile(source, "utf8"));
  const ast = await openapiTS(document as Parameters<typeof openapiTS>[0]);
  const printed = COMMENT_HEADER + astToString(ast);
  const config = (await resolveConfig(destination.pathname)) ?? {};
  return format(printed, { ...config, filepath: destination.pathname });
}

const rendered = await render();

if (process.argv.includes("--check")) {
  const directory = await mkdtemp(path.join(tmpdir(), "tidefern-client-"));
  try {
    const candidate = path.join(directory, "schema.d.ts");
    await writeFile(candidate, rendered);
    const fresh = await readFile(candidate, "utf8");
    const current = await readFile(destination, "utf8").catch(() => "");
    if (current !== fresh) {
      console.error(
        "packages/api-client/src/schema.d.ts is stale. Run pnpm client:generate and review the diff.",
      );
      process.exit(1);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log("client:check passed");
} else {
  await writeFile(destination, rendered);
  console.log(`wrote ${destination.pathname}`);
}
