import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index";

// One pool per module instance. Fluid compute keeps the process warm across
// invocations, so this is shared; nothing connects until the first query.
// max 2 follows Neon's serverless pooling guide; the -pooler endpoint
// multiplexes the rest. idleTimeoutMillis 5000 follows Vercel's guidance.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 5000,
});

// Lets Vercel close idle clients before the instance suspends.
attachDatabasePool(pool);

export const db = drizzle({ client: pool, schema });

// The job runner's owner-role pool, which the web host builds only when
// DATABASE_URL_UNPOOLED is set; it lives here so route code never reaches it.
export { ownerDatabase } from "./owner";
