import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { applyMigrations, schema } from "@tidefern/db";

/**
 * One in-memory PGlite with the committed journal applied through the same
 * runner production uses, for the jobs suites. PGlite holds a single
 * connection: create one per test file in `beforeAll` and close it in
 * `afterAll`. The migration runner is reached only here, from a test, so
 * the API's runtime import graph stays clear of it.
 */
export async function createJobsTestDatabase() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await applyMigrations(db, migrate);
  return { db, close: () => client.close() };
}

export type JobsTestDatabase = Awaited<ReturnType<typeof createJobsTestDatabase>>;
