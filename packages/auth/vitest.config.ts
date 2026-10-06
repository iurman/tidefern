import { defineConfig } from "vitest/config";

// Suites here boot PGlite, a WebAssembly Postgres, per file. On a two-core CI
// runner with the other workspace suites running alongside, that boot can pass
// Vitest's defaults (5 s per test, 10 s per hook), so the limits are raised;
// a hung query still fails, later.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 },
});
