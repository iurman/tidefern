import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { applyMigrations, schema } from "@tidefern/db";

/**
 * One in-memory PGlite with the committed journal applied through the same
 * runner production uses, so `subject_keys` has the shape and the row level
 * security the migrations give it and `tidefern_app` exists for `withActor`.
 * PGlite holds a single exclusive connection: one per test file.
 */
export async function createKeyTestDatabase() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await applyMigrations(db, migrate);
  return {
    db,
    client,
    close: () => client.close(),
  };
}
