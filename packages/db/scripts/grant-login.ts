import { Client, escapeIdentifier, escapeLiteral } from "pg";

// Lets the application role log in on a throwaway database, which is what
// CI's postgres service needs: migration 0000 creates tidefern_app NOLOGIN,
// and on Neon the owner grants LOGIN once by hand in the console
// (architecture record 7.2). Here the owner URL in DATABASE_URL_UNPOOLED
// runs the ALTER ROLE, and the role name and password come from DATABASE_URL
// itself, the URL `next start` is about to use, so the two can never drift
// apart and no second variable carries the password. The script then
// connects as that role to prove the URL works and that it still cannot
// bypass row level security. Production refuses it outright, like
// TIDEFERN_FAKE_NOW and E2E_MAIL_CAPTURE.

const APP_ROLE = "tidefern_app";

if (process.env.VERCEL_ENV === "production") {
  console.error(
    "grant-login is refused on production; the owner grants LOGIN in the Neon console.",
  );
  process.exit(1);
}

const ownerUrl = process.env.DATABASE_URL_UNPOOLED;
if (!ownerUrl) {
  console.error("DATABASE_URL_UNPOOLED is not set; it must be the owner role's direct URL.");
  process.exit(1);
}

const appUrl = process.env.DATABASE_URL;
if (!appUrl) {
  console.error("DATABASE_URL is not set; it must be the URL the app will use as tidefern_app.");
  process.exit(1);
}

let role: string;
let password: string;
try {
  const parsed = new URL(appUrl);
  role = decodeURIComponent(parsed.username);
  password = decodeURIComponent(parsed.password);
} catch {
  console.error("DATABASE_URL is not a URL.");
  process.exit(1);
}

if (role !== APP_ROLE) {
  console.error(`DATABASE_URL must belong to ${APP_ROLE}; it names another role.`);
  process.exit(1);
}
if (!password) {
  console.error("DATABASE_URL carries no password for the app role.");
  process.exit(1);
}

const owner = new Client({ connectionString: ownerUrl });
await owner.connect();
try {
  // ALTER ROLE takes no bound parameters, so both parts are escaped by pg.
  await owner.query(
    `ALTER ROLE ${escapeIdentifier(role)} WITH LOGIN PASSWORD ${escapeLiteral(password)}`,
  );
} finally {
  await owner.end();
}

const app = new Client({ connectionString: appUrl });
await app.connect();
try {
  const { rows } = await app.query<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }>(
    "SELECT rolname, rolbypassrls, rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user",
  );
  const row = rows[0];
  if (!row || row.rolname !== APP_ROLE) {
    console.error(`connected as ${row?.rolname ?? "nobody"}, not ${APP_ROLE}`);
    process.exitCode = 1;
  } else if (row.rolbypassrls || row.rolsuper) {
    console.error(
      `${APP_ROLE} can bypass row level security or is a superuser; refusing to continue.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`${APP_ROLE} can log in; rolbypassrls=false rolsuper=false`);
  }
} finally {
  await app.end();
}
