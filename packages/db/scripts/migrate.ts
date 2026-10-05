import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { applyMigrations } from "../src/migrate";

// Migrations need the direct string: Neon's pooler runs in transaction
// mode and the migrator takes a session lock.
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED is not set; it must be the direct (non-pooler) URL.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });
const db = drizzle({ client: pool });

try {
  await applyMigrations(db, migrate);
  console.log("migrations applied");
} finally {
  await pool.end();
}
