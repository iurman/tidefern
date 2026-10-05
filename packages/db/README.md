# @tidefern/db

Drizzle schema, migrations, the pooled client and the two helpers every
database access goes through. Imported by `packages/api` (and later
`packages/auth`) only; it never imports Next.js or React.

## Environment variables

| Variable                | Used by                                      | Value                                                   |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`          | `src/client.ts` (the app)                    | The pooled Neon string (host contains `-pooler`)        |
| `DATABASE_URL_UNPOOLED` | `scripts/migrate.ts`, `drizzle.config.ts`    | The owner role's direct string; migrations only         |
| `MIGRATE_DESTRUCTIVE`   | the owner-triggered migration workflow (B12) | `1` lets the runner apply a contract migration (DROP, RENAME, ALTER COLUMN ... TYPE, TRUNCATE) |

## Commands

From the repository root:

```sh
pnpm db:generate   # drizzle-kit generate: writes SQL and journal from src/schema
pnpm db:migrate    # applies the committed journal to DATABASE_URL_UNPOOLED
pnpm db:seed       # synthetic data; arrives with task B9
```

A hand-written migration (grants, functions, anything drizzle-kit cannot
express) starts with `pnpm --filter @tidefern/db exec drizzle-kit generate --custom --name <name>`,
then the SQL goes into the file it created. Commit the SQL together with
`drizzle/meta/_journal.json` and the snapshot exactly as drizzle-kit wrote
them; never edit the journal by hand and never run `drizzle-kit up`.

The Vercel build command runs `pnpm -w db:migrate` before `next build`, so
every environment migrates itself. Migrations are expand then contract: a
migration must run correctly under the previous deployment's code. The
runner prints every `RAISE NOTICE` a migration emits as a `migration
notice` line, so a non-fatal problem (the first migration raises one when
the `GRANT ... WITH SET TRUE` fails) shows in the build log instead of
surfacing later as a runtime error from `withActor`.

### Contract migrations and `MIGRATE_DESTRUCTIVE`

Before it applies anything, `applyMigrations` reads the journal and the
`created_at` of the newest row in `drizzle.__drizzle_migrations` (a database
with no such table has nothing applied), and scans every pending SQL file
for `DROP`, `RENAME`, `ALTER COLUMN ... TYPE` and `TRUNCATE` as keywords,
case insensitive, after stripping `--` and block comments (nested ones
too), string literals (`''` and the backslash escapes of `E''`) and quoted
identifiers; a dollar-quoted body such as a `DO` block is one token that is
cleaned the same way and then scanned like any other statement, so a drop
inside it counts and an apostrophe inside it hides nothing after it.
Any `DROP` counts, including `DROP NOT NULL` and `DROP DEFAULT`. When a
pending file matches and `MIGRATE_DESTRUCTIVE` is not exactly `1`, the
runner throws `DestructiveMigrationError`, naming the file and the
statement kind, and applies nothing, so a Vercel build can never run a
contract step by accident. Applied files are never rescanned, so a contract
migration that the owner applied once does not block later builds. The
only place that sets the variable is `.github/workflows/migrate-production.yml`:
the owner dispatches it by hand with the journal tag of the contract
migration and the Neon restore point they noted first, GitHub asks the
required reviewer of the `production-migrations` environment to approve,
and the job applies every pending file against that environment's
`DATABASE_URL_UNPOOLED` secret. Creating the environment, its reviewer and
its secret is an owner step in `docs/LAUNCH_RUNBOOK.md`; ordinary CI never
holds the credential. Never set the variable on Vercel or locally against
a shared branch; `src/migrate.test.ts` proves the refusal on PGlite.

## The role model

The first migration creates `tidefern_app` by SQL: `NOLOGIN NOBYPASSRLS
NOINHERIT`, so it never joins Neon's `neon_superuser` and cannot bypass
row level security. It grants that role `USAGE` on `public`, `SELECT`,
`INSERT`, `UPDATE`, `DELETE` on every table, `USAGE` on every sequence, and
the matching default privileges, so tables added by later migrations need
no new grant. It also grants `tidefern_app` to the migrating role `WITH SET
TRUE`; on PGlite that is the superuser, on Neon the owner role.

`withActor(actorId, fn)` opens a transaction, sets `app.actor_id` for that
transaction with a bound parameter, runs `SET LOCAL ROLE tidefern_app`
unconditionally, and runs `fn(tx)`. Whichever role the connection string
carries, the queries inside run as a role RLS applies to, and both the role
and the setting reset when the transaction ends, which is what Neon's
transaction-mode pooler needs. The actor id must be a UUID; anything else
is rejected before the transaction opens.

`withSystem(fn)` opens a transaction, sets `app.system` to `on`, and runs
`fn(tx)` as the connection's own role. It is the only owner-role path, for
seeds, sweeps and backfills. The policy helpers (task B8) honour
`app.system` only when `current_user` is not `tidefern_app`, so an app
connection can never claim system context.

Both helpers take the database as their last argument, defaulting to the
production client, so tests pass the PGlite instance.

## Schema

`src/schema/index.ts` is what drizzle-kit reads. It re-exports the Better
Auth tables from `src/auth-schema.ts` (generated by the Better Auth CLI in
task C1; `user.id` and every other id there is a `uuid` with a
`gen_random_uuid()` default) and the hand-written tables, one file per
area of architecture record 7.4. Migration `0001_identity_and_profiles`
created the auth tables and the first two of those:

- `profiles` (`src/schema/profiles.ts`): one row per user, `user_id` is a
  `uuid` primary key referencing `user.id` with `ON DELETE CASCADE`.
  `time_zone` is an IANA name the API validates with core's
  `isKnownTimeZone`; `stage`, `units` and `notification_detail` are enums;
  `week_start` is a `smallint` checked to 1 to 7 (Intl convention, 1 is
  Monday); `age_attested_at` is the sign-up attestation and no date of
  birth is stored. It carries the sync columns of 7.3: `created_at`,
  `updated_at`, `version` (default 1) and a content-free `deleted_at`.
- `subject_keys` (`src/schema/keys.ts`): one wrapped DEK per subject.
  `subject_id` is a `uuid` with no foreign key, because it is a user id or
  a child id; `kind` says which. `wrapped_dek` is `bytea` through a
  `customType`, since drizzle-orm 0.45.3 has no bytea column, and
  `kek_provider` and `kek_version` name the wrapping key. No logical dump
  may include this table (architecture record 9.2, item 5).

Closed vocabularies are Postgres enums (`src/schema/enums.ts`), not text
columns with check constraints, and every B task uses the same rule.
Growing an enum is `ALTER TYPE ... ADD VALUE`, an additive statement the
build runner applies on its own; replacing a check constraint starts with
a `DROP`, which the runner refuses outside the owner-triggered workflow.
The enum values repeat the Zod enums in `packages/schemas` on purpose
(this package does not depend on schemas); `src/schema.test.ts` pins them.

Both tables are created with `.enableRLS()`. Until the B8 migration adds
`FORCE ROW LEVEL SECURITY` and the policies, the app role inside
`withActor` holds the grants from `0000` (the default privileges reach
tables created later) but sees zero rows and cannot insert, because an
RLS-enabled table with no policy denies everything to a role that does
not bypass RLS. `src/schema.test.ts` asserts exactly that as the baseline.
The Better Auth tables stay outside RLS (architecture record 7.2).

## What the package exports

- `@tidefern/db`: `withActor`, `withSystem`, `isActorId`, the `schema`
  namespace, `applyMigrations` and `migrationConfig`, plus the `Transaction`
  and `ActorDatabase` types. Never the raw `db` or `pool`.
- `@tidefern/db/client`: the raw `db` and `pool`. Only `withActor` and
  `withSystem` inside this package and the Better Auth adapter (task C1)
  may import it.
- `@tidefern/db/schema`: the tables, for drizzle-kit and the auth adapter.

### Keeping route code out of the raw client

`packages/config/eslint/library.js` exports `dbClientRestriction`, a
`no-restricted-imports` path entry for `@tidefern/db/client`. Task E1 adds
it to the api package like this:

```js
import { dbClientRestriction, libraryConfig, libraryRules } from "@tidefern/config/eslint/library";

const [, options] = libraryRules["no-restricted-imports"];

export default [
  ...libraryConfig(),
  {
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [...options.paths, dbClientRestriction], patterns: options.patterns },
      ],
    },
  },
];
```

## Tests

`src/test/harness.ts` boots one in-memory PGlite 0.5.8 (Postgres 18 engine)
and applies the committed journal through `applyMigrations`, the same
function `scripts/migrate.ts` uses. PGlite holds a single exclusive
connection, so call `createTestDatabase()` once per test file in
`beforeAll` and `close()` it in `afterAll`:

```ts
import { createTestDatabase } from "./test/harness";

let harness: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  harness = await createTestDatabase();
});
afterAll(() => harness.close());
```

PGlite's default role is a superuser that bypasses RLS, so a policy test
only proves anything inside `withActor`, which drops to `tidefern_app`.
`pnpm --filter @tidefern/db test` runs the suite; `pnpm check` at the root
runs it with everything else.
