import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { applyMigrations } from "../migrate";
import * as schema from "../schema/index";

/**
 * Boots one in-memory PGlite (Postgres 18 engine) and applies the committed
 * journal through the same code path production uses. PGlite holds a single
 * exclusive connection, so create one per test file, never per test.
 */
export async function createTestDatabase() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await applyMigrations(db, migrate);
  return {
    db,
    client,
    close: () => client.close(),
  };
}
