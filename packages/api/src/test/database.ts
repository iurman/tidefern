import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { applyMigrations, schema } from "@tidefern/db";

/**
 * One in-memory PGlite with the committed journal applied through the same
 * `applyMigrations` the build uses, as the db package's own harness does.
 * PGlite holds a single exclusive connection: one per test file.
 */
export async function createApiTestDatabase() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await applyMigrations(db, migrate);
  return {
    db,
    client,
    close: () => client.close(),
  };
}

export type ApiTestDatabase = Awaited<ReturnType<typeof createApiTestDatabase>>;

/**
 * Stand-ins for the three read policies task B8 adds (`0007_row_level_security`),
 * installed only while the journal carries no policy on these tables. The
 * actor load runs inside `withActor`, so without a policy the app role
 * reads zero rows from `profiles`, `child_guardians` and `grants`; these
 * let an actor read her own profile, her own guardianships and the grants
 * she holds, which is the least B8's policies must allow. Once B8 is on
 * the journal this finds its policies and does nothing, and the real
 * policies are what the tests exercise; delete it then.
 */
export async function installInterimActorReadPolicies(db: ApiTestDatabase["db"]): Promise<void> {
  const existing = await db.execute(
    sql`select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename in ('profiles', 'child_guardians', 'grants')`,
  );
  if (existing.rows.length > 0) return;
  const actor = sql.raw("current_setting('app.actor_id', true)::uuid");
  await db.execute(
    sql`create policy interim_profiles_self on profiles for select using (user_id = ${actor})`,
  );
  await db.execute(
    sql`create policy interim_child_guardians_self on child_guardians for select using (user_id = ${actor})`,
  );
  await db.execute(
    sql`create policy interim_grants_held on grants for select using (grantee_id = ${actor})`,
  );
}
