import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { applyMigrations, schema } from "@tidefern/db";

/**
 * One in-memory PGlite with the committed journal applied through the same
 * runner production uses: the app role, forced row level security and the
 * policy helpers all exist, so a test can act as `tidefern_app` the way
 * `DATABASE_URL` does outside PGlite. The schema-only database in
 * `./database.ts` has none of that and suits the handler tests only. PGlite
 * holds a single connection: one per test file.
 */
export async function createMigratedAuthTestDatabase() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await applyMigrations(db, migrate);
  return {
    db,
    client,
    close: () => client.close(),
  };
}
