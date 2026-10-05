import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { DestructiveMigrationError, applyMigrations } from "../src/migrate";

// Migrations need the direct string: Neon's pooler runs in transaction
// mode and the migrator takes a session lock.
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED is not set; it must be the direct (non-pooler) URL.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });

// Migrations report non-fatal problems with RAISE NOTICE (the first one does
// when the GRANT ... WITH SET TRUE fails). node-postgres only emits them, so
// print each to the build log where it would otherwise go unseen.
pool.on("connect", (client) => {
  client.on("notice", (notice) => {
    console.warn(`migration notice (${notice.severity ?? "NOTICE"}): ${notice.message}`);
  });
});

const db = drizzle({ client: pool });

try {
  await applyMigrations(db, migrate);
  console.log("migrations applied");
} catch (error) {
  // A refusal is a decision, not a crash: print the reason without a stack.
  if (error instanceof DestructiveMigrationError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await pool.end();
}
