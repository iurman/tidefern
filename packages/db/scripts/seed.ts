import { EnvKeyProvider } from "@tidefern/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../src/schema/index";
import { SeedConfigurationError, SeedRoleError, resolveSeedNow, seed } from "../src/seed/index";

// The seed runs through withSystem() on DATABASE_URL, so the connection
// must belong to a role that can act as the system (the owner role, or
// Postgres itself in CI); the app role is refused before anything is
// written. "Today" comes from TIDEFERN_FAKE_NOW outside production and the
// clock otherwise, and the free text is sealed under TIDEFERN_KEK_V1.
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set; the seed needs a connection string.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });
const db = drizzle({ client: pool, schema });

try {
  const now = resolveSeedNow(process.env);
  const report = await seed(db, { now, kek: new EnvKeyProvider() });
  const total = Object.values(report.inserted).reduce((sum, n) => sum + n, 0);
  console.log(`seed: ${total} rows added for ${now.toISOString()}`);
  for (const [table, n] of Object.entries(report.inserted)) {
    console.log(`  ${table}: ${n}`);
  }
} catch (error) {
  // A refusal is a decision, not a crash: print the reason without a stack.
  if (error instanceof SeedRoleError || error instanceof SeedConfigurationError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await pool.end();
}
