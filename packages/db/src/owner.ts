import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index";

/**
 * The app pool's idle timeout in ./client. `attachDatabasePool` keeps one
 * idle timer for every pool in the process and restarts it from whichever
 * pool released a client last, so both pools use the same value and the
 * wait it buys is right for either.
 */
const IDLE_TIMEOUT_MS = 5000;

/**
 * The job runner's connection (architecture 7.2 and 10.1): a pool on the
 * owner role's direct string, `DATABASE_URL_UNPOOLED`, for the work that runs
 * under `withSystem` across every person's rows: the sweep, the reminder
 * step and the closure job. The web host builds it only when that variable
 * is set and hands it to the API as `jobs.db`. It sits behind
 * `@tidefern/db/client` with the app pool, so route code, which the API's
 * lint rule keeps off that path, never reaches it.
 *
 * One connection. The runner's work is serial (one scheduled run a day on
 * Hobby, an inline drain after a closure request), and the direct endpoint
 * has no pooler in front of it, so a larger pool in every warm instance
 * would spend the compute's connection limit on idle owner sessions.
 * Vercel's advice against a pool of one is about request traffic sharing an
 * instance, which the app pool serves. A second drain in the same instance
 * waits for the first. Nothing connects until the first query.
 *
 * pg emits `error` on the pool when an idle client fails (the compute
 * restarted, the network dropped); with no listener that event would throw
 * and end the process. The listener logs the error's name and driver code,
 * never its message, and the pool opens a fresh client on the next query.
 */
export function ownerDatabase(connectionString: string) {
  if (!connectionString) {
    throw new TypeError(
      "The job runner needs the owner role's direct string in DATABASE_URL_UNPOOLED.",
    );
  }
  const pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
  });
  pool.on("error", (error) => {
    const code = (error as { code?: unknown }).code;
    console.error("owner_pool_error", {
      name: error.name,
      ...(typeof code === "string" ? { code } : {}),
    });
  });
  // Lets Vercel close the idle client before the instance suspends.
  attachDatabasePool(pool);
  return drizzle({ client: pool, schema });
}
