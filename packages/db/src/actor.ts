import { sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";

import { db as productionDb } from "./client";
import type * as schema from "./schema/index";

type Schema = typeof schema;

/** The transaction handed to route code, with the full schema attached. */
export type Transaction = PgTransaction<
  PgQueryResultHKT,
  Schema,
  ExtractTablesWithRelations<Schema>
>;

/**
 * The slice of a drizzle database the helpers need. The node-postgres
 * instance in production and the PGlite instance in tests both fit it.
 */
export interface ActorDatabase {
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isActorId(value: string): boolean {
  return UUID.test(value);
}

/**
 * Runs `fn` in one transaction as the actor. The transaction carries
 * `app.actor_id` for the policies and drops to the app role so RLS applies,
 * whichever role the connection string belongs to (PGlite's default is a
 * superuser; Neon's integrations inject a BYPASSRLS console role). Both
 * reset with the transaction, which is what Neon's transaction-mode pooler
 * requires.
 */
export async function withActor<T>(
  actorId: string,
  fn: (tx: Transaction) => Promise<T>,
  database: ActorDatabase = productionDb,
): Promise<T> {
  if (!isActorId(actorId)) {
    throw new TypeError("withActor needs a UUID actor id");
  }
  return database.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.actor_id', ${actorId}, true)`);
    await tx.execute(sql`set local role tidefern_app`);
    return fn(tx);
  });
}

/**
 * Runs `fn` in one transaction with `app.system` on and the connection's own
 * role kept, for seeds, sweeps and backfills. The B8 policy helpers honour
 * `app.system` only when current_user is not the app role, so an app
 * connection can never claim system context this way.
 */
export async function withSystem<T>(
  fn: (tx: Transaction) => Promise<T>,
  database: ActorDatabase = productionDb,
): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.system', 'on', true)`);
    return fn(tx);
  });
}
