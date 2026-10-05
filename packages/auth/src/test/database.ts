import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";

import * as schema from "@tidefern/db/schema";

/**
 * One in-memory PGlite with the generated auth tables created straight from
 * the schema module, so the handler tests run without a migration (task B2
 * writes the real one) and without a network. drizzle-kit's API diffs an
 * empty snapshot against the schema and hands back the CREATE statements.
 * PGlite holds a single exclusive connection: one per test file.
 */
export async function createAuthTestDatabase() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
  return {
    db,
    client,
    close: () => client.close(),
  };
}
