// `pnpm jobs:run`: the manual drain and sweep of architecture 10.1 against
// DATABASE_URL_UNPOOLED (the owner role; DATABASE_URL only as a fallback).
// The runner itself is TypeScript inside the api package
// (src/jobs/run.ts) so it shares the handler registry with the hosts; this
// file only starts it with that package's tsx, from any working directory.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync("pnpm", ["--filter", "@tidefern/api", "exec", "tsx", "src/jobs/run.ts"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
