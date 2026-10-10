import { configDefaults, defineConfig } from "vitest/config";

// PGlite boots a WebAssembly Postgres per suite. On a two-core CI runner with
// the other workspace suites running alongside, that boot can pass Vitest's
// 5 s default, so the limits are raised; a hung query still fails, later.
// The pooled integration suite needs a real Postgres behind PgBouncer, so the
// unit run leaves it out and `test:integration` runs it on its own config.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "src/**/*.integration.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
