import { defineConfig } from "vitest/config";

// The pooled database check of architecture section 15: a real Postgres
// behind PgBouncer in transaction mode, reached through the production client
// in src/client.ts. DATABASE_URL is the app role's pooled URL and
// DATABASE_URL_UNPOOLED the owner's direct URL, as in production; the suite
// fails, never skips, when either is missing. NODE_ENV is production so the
// client runs as it does on Vercel.
export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    env: { NODE_ENV: "production" },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
