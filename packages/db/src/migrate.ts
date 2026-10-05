import { fileURLToPath } from "node:url";

import type { MigrationConfig } from "drizzle-orm/migrator";

/**
 * Where the committed journal lives and which table records what was
 * applied. Production (`scripts/migrate.ts`, node-postgres) and the PGlite
 * harness share this so a test proves the same files the build applies.
 */
export const migrationConfig: MigrationConfig = {
  migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  migrationsTable: "__drizzle_migrations",
  migrationsSchema: "drizzle",
};

/**
 * Each drizzle driver ships its own `migrate` (node-postgres, pglite), so the
 * caller passes the one that matches its database; everything else is shared.
 *
 * Task B12 adds the destructive-statement refusal here: scan each pending
 * file for DROP, RENAME, ALTER COLUMN ... TYPE and TRUNCATE and refuse to
 * apply it unless MIGRATE_DESTRUCTIVE=1.
 */
export async function applyMigrations<TDatabase>(
  db: TDatabase,
  migrate: (db: TDatabase, config: MigrationConfig) => Promise<void>,
): Promise<void> {
  await migrate(db, migrationConfig);
}
