import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` never connects, so an unset URL is fine there.
// Applying migrations goes through `scripts/migrate.ts`, which refuses to
// start without DATABASE_URL_UNPOOLED (the direct, non-pooler string).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? "",
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
  entities: {
    // drizzle-kit manages tidefern_app and leaves Neon's own roles alone.
    roles: { provider: "neon" },
  },
  strict: true,
  verbose: true,
});
